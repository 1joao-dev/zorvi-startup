import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) throw new Error("Missing Supabase server environment variables.");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

type Provider = {
  id: "atacadao" | "pague_menos"; label: string; base: string; domain: string;
  postalCode: string; category: "Mercado" | "Farmácia"; sellerId: string; sellerName: string;
  storeName: string; priceMode: "regular" | "current"; terms: string[];
};
type Candidate = {
  provider: Provider; sourceProductId: string; barcode: string; name: string;
  brand: string | null; unit: string | null; subcategory: string | null;
  imageUrl: string | null; sourceUrl: string; price: number; priceNote: string;
};

const providers: Provider[] = [
  {
    id: "atacadao", label: "Atacadão", base: "https://secure.atacadao.com.br",
    domain: "secure.atacadao.com.br", postalCode: "64045840", category: "Mercado",
    sellerId: "1", sellerName: "ATACADAO SA", storeName: "Atacadão Online — Teresina (CEP 64045-840)",
    priceMode: "regular",
    terms: ["arroz", "feijão", "leite", "café", "macarrão", "óleo de soja", "açúcar", "ovos", "detergente", "papel higiênico"],
  },
  {
    id: "pague_menos", label: "Farmácias Pague Menos", base: "https://www.paguemenos.com.br",
    domain: "www.paguemenos.com.br", postalCode: "64049570", category: "Farmácia",
    sellerId: "1", sellerName: "Farmácias Pague Menos",
    storeName: "Pague Menos Online — Teresina (CEP 64049-570)", priceMode: "current",
    terms: ["paracetamol", "dipirona", "ibuprofeno", "protetor solar", "shampoo", "desodorante", "sabonete", "creme dental", "fralda", "absorvente"],
  },
];

const normalize = (v: unknown) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const numeric = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function unitFrom(name: string) {
  return name.match(/\b\d+(?:[.,]\d+)?\s?(?:kg|g|mg|mcg|ml|l|un|unid|unidades?|comprimidos?|c[aá]psulas?|tabletes?|sach[eê]s?)\b/i)?.[0] || null;
}
function safeUrl(value: unknown, provider: Provider) {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value, provider.base);
    return u.protocol === "https:" && (u.hostname === provider.domain || u.hostname.endsWith("." + provider.domain)) ? u.toString() : null;
  } catch { return null; }
}
async function authorised(request: Request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (token.length < 32) return false;
  const { data, error } = await admin.rpc("verify_catalog_import_token", { candidate: token });
  if (error) console.error("[retail-catalog-sync] Token check failed:", error.message);
  return !error && data === true;
}
async function regionFor(provider: Provider) {
  const u = new URL(provider.base + "/api/checkout/pub/regions");
  u.searchParams.set("country", "BRA"); u.searchParams.set("postalCode", provider.postalCode);
  const response = await fetch(u, { headers: { Accept: "application/json", "User-Agent": "ZORVI/1.0" }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("Região indisponível (HTTP " + response.status + ")");
  const payload = await response.json();
  const row = Array.isArray(payload) ? payload[0] : null;
  const regionId = String(row?.id || row?.regionId || "");
  if (!regionId) throw new Error("O site não retornou região para o CEP " + provider.postalCode);
  const sellers = Array.isArray(row?.sellers) ? row.sellers : [];
  const names = sellers.map((s: Record<string, unknown>) => String(s.name || s.id || "").trim())
    .filter((name: string) => name && (provider.id !== "atacadao" || normalize(name).includes("teresina")));
  return { regionId, sellers: names, sellerCount: sellers.length };
}
async function search(provider: Provider, regionId: string, term: string) {
  const u = new URL(provider.base + "/api/intelligent-search/v1/product-search");
  u.searchParams.set("query", term); u.searchParams.set("regionId", regionId);
  u.searchParams.set("country", "BRA"); u.searchParams.set("zip-code", provider.postalCode);
  u.searchParams.set("sc", "1"); u.searchParams.set("count", "50"); u.searchParams.set("page", "1");
  const response = await fetch(u, { headers: { Accept: "application/json", "User-Agent": "ZORVI/1.0" }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("Busca '" + term + "' retornou HTTP " + response.status);
  const payload = await response.json() as { products?: Array<Record<string, unknown>> };
  const products = Array.isArray(payload.products) ? payload.products : [];
  const candidates: Candidate[] = [];
  let skipped = 0;
  for (const p of products) {
    const items = Array.isArray(p.items) ? p.items as Array<Record<string, unknown>> : [];
    const item = items[0];
    if (!p.productId || !item?.itemId) { skipped++; continue; }
    const barcode = String(item.ean || "").replace(/\D/g, "");
    if (!/^\d{8,14}$/.test(barcode)) { skipped++; continue; }
    const sellerRows = Array.isArray(item.sellers) ? item.sellers as Array<Record<string, unknown>> : [];
    const seller = sellerRows.find((s) => String(s.sellerId || "") === provider.sellerId && normalize(s.sellerName) === normalize(provider.sellerName));
    const offer = seller?.commertialOffer as Record<string, unknown> | undefined;
    if (!offer) { skipped++; continue; }
    const current = numeric(offer.Price), list = numeric(offer.ListPrice), quantity = numeric(offer.AvailableQuantity);
    if (current === null || current <= 0 || (quantity !== null && quantity <= 0)) { skipped++; continue; }
    const price = provider.priceMode === "regular" && list !== null && list > 0 ? list : current;
    const sourceUrl = safeUrl(p.link, provider);
    if (!sourceUrl) { skipped++; continue; }
    const name = String(item.name || p.productName || "").trim();
    if (!name) { skipped++; continue; }
    const categories = Array.isArray(p.categories) ? p.categories as string[] : [];
    const imageRows = Array.isArray(item.images) ? item.images as Array<Record<string, unknown>> : [];
    const promoIgnored = provider.priceMode === "regular" && list !== null && current < list - 0.009;
    candidates.push({
      provider,
      sourceProductId: String(p.productId) + ":" + String(item.itemId),
      barcode, name, brand: String(p.brand || "").trim() || null, unit: unitFrom(name),
      subcategory: categories[0] ? String(categories[0]).split("/").filter(Boolean).slice(-1)[0] || null : null,
      imageUrl: typeof imageRows[0]?.imageUrl === "string" ? String(imageRows[0].imageUrl) : null,
      sourceUrl, price: Math.round(price * 100) / 100,
      priceNote: provider.id === "atacadao"
        ? (promoIgnored ? "Preço regular de tabela; descontos promocionais ou por quantidade não incluídos." : "Preço regular publicado no catálogo online.")
        : (list !== null && current < list - 0.009 ? "Preço promocional exibido no site; condições da oferta podem variar." : "Preço atual exibido no site oficial."),
    });
  }
  return { candidates, found: products.length, skipped };
}
async function batches<T>(values: string[], load: (part: string[]) => Promise<T[]>) {
  const unique = [...new Set(values.filter(Boolean))]; const out: T[] = [];
  for (let i = 0; i < unique.length; i += 100) out.push(...await load(unique.slice(i, i + 100)));
  return out;
}
async function fetchCatalog(provider: Provider) {
  const region = await regionFor(provider);
  const byBarcode = new Map<string, Candidate>();
  let found = 0, skipped = 0;
  const terms: Array<Record<string, unknown>> = [];
  for (const term of provider.terms) {
    try {
      const result = await search(provider, region.regionId, term);
      found += result.found; skipped += result.skipped;
      for (const c of result.candidates) if (!byBarcode.has(c.barcode)) byBarcode.set(c.barcode, c);
      terms.push({ term, found: result.found, eligible: result.candidates.length, skipped: result.skipped });
    } catch (error) {
      skipped++; terms.push({ term, found: 0, eligible: 0, error: error instanceof Error ? error.message : String(error) });
    }
    await pause(120);
  }
  return { provider, regionId: region.regionId, sellers: region.sellers, sellerCount: region.sellerCount, found, skipped, terms, candidates: [...byBarcode.values()] };
}
async function persistCatalog(catalog: Awaited<ReturnType<typeof fetchCatalog>>, preview: boolean) {
  const provider = catalog.provider;
  const storeResult = await admin.from("stores").select("id").eq("name", provider.storeName).eq("city", "Teresina").eq("state", "PI").maybeSingle();
  if (storeResult.error) throw new Error("Falha ao localizar canal online: " + storeResult.error.message);
  if (!preview && !storeResult.data?.id) throw new Error("Canal online ainda não cadastrado: " + provider.storeName);
  const storeId = storeResult.data?.id || null;

  const barcodes = catalog.candidates.map((c) => c.barcode);
  const sourceIds = catalog.candidates.map((c) => c.sourceProductId);
  const byBarcodeRows = await batches(barcodes, async (part) => {
    const { data, error } = await admin.from("products").select("id,barcode,category,is_active,source_provider,source_product_id").in("barcode", part);
    if (error) throw new Error("Falha ao consultar produtos: " + error.message);
    return data || [];
  });
  const bySourceRows = await batches(sourceIds, async (part) => {
    const { data, error } = await admin.from("products").select("id,barcode,category,is_active,source_provider,source_product_id").eq("source_provider", provider.id).in("source_product_id", part);
    if (error) throw new Error("Falha ao consultar identidade de catálogo: " + error.message);
    return data || [];
  });
  const byBarcode = new Map(byBarcodeRows.filter((p) => p.barcode).map((p) => [String(p.barcode), p]));
  const bySource = new Map(bySourceRows.filter((p) => p.source_product_id).map((p) => [String(p.source_product_id), p]));
  const newProducts = catalog.candidates.filter((c) => !byBarcode.has(c.barcode) && !bySource.has(c.sourceProductId)).map((c) => ({
    name: c.name, normalized_name: normalize([c.name, c.brand, c.unit].filter(Boolean).join(" ")),
    brand: c.brand, variant: null, barcode: c.barcode, category: provider.category, unit: c.unit,
    subcategory: c.subcategory, source_provider: provider.id, source_product_id: c.sourceProductId,
    source_url: c.sourceUrl, image_url: c.imageUrl,
    description: "Produto do catálogo oficial " + provider.label + ". Oferta online regionalizada para Teresina/PI; não confirma estoque em filial física.",
    country_code: "BR", source_updated_at: new Date().toISOString(), is_active: true,
  }));

  if (preview) {
    return {
      provider: provider.id, city: "Teresina", state: "PI", postalCode: provider.postalCode,
      regionId: catalog.regionId, regionalSellers: catalog.sellers, sellerCount: catalog.sellerCount,
      searchTerms: catalog.terms, productsFound: catalog.found, eligibleUniqueProducts: catalog.candidates.length,
      newProductsToCreate: newProducts.length,
      priceOffersReady: catalog.candidates.filter((c) => {
        const p = byBarcode.get(c.barcode) || bySource.get(c.sourceProductId);
        return !p || (p.barcode === c.barcode && p.category === provider.category && p.is_active === true);
      }).length,
      samples: catalog.candidates.slice(0, 8).map((c) => ({ name: c.name, brand: c.brand, barcode: c.barcode, price: c.price, priceNote: c.priceNote, sourceUrl: c.sourceUrl })),
    };
  }

  for (let i = 0; i < newProducts.length; i += 100) {
    const { error } = await admin.from("products").upsert(newProducts.slice(i, i + 100), { onConflict: "source_provider,source_product_id", ignoreDuplicates: true });
    if (error) throw new Error("Falha ao salvar produtos do " + provider.label + ": " + error.message);
  }
  const refreshed = await batches(barcodes, async (part) => {
    const { data, error } = await admin.from("products").select("id,barcode,category,is_active,source_provider,source_product_id").in("barcode", part);
    if (error) throw new Error("Falha ao recuperar produtos importados: " + error.message);
    return data || [];
  });
  const finalByBarcode = new Map(refreshed.filter((p) => p.barcode).map((p) => [String(p.barcode), p]));
  const aliasRows: Array<Record<string, unknown>> = [];
  for (const candidate of catalog.candidates) {
    const product = finalByBarcode.get(candidate.barcode) || byBarcode.get(candidate.barcode) || bySource.get(candidate.sourceProductId);
    if (!product || product.barcode !== candidate.barcode || product.category !== provider.category || product.is_active !== true) continue;
    aliasRows.push({
      product_id: product.id,
      alias: candidate.name,
      normalized_alias: normalize(candidate.name),
      source_provider: provider.id,
    });
  }
  if (aliasRows.length) {
    const { error } = await admin.from("product_aliases").upsert(aliasRows, {
      onConflict: "product_id,normalized_alias",
      ignoreDuplicates: true,
    });
    if (error) throw new Error("Falha ao salvar nomes alternativos do " + provider.label + ": " + error.message);
  }

  const regionLabel = provider.id === "atacadao" && catalog.sellers.length
    ? "Região atendida: " + catalog.sellers.join(", ") + "."
    : "Região consultada pelo CEP " + provider.postalCode + ".";
  const now = new Date().toISOString();
  const priceRows: Array<Record<string, unknown>> = [];
  for (const c of catalog.candidates) {
    const p = finalByBarcode.get(c.barcode) || byBarcode.get(c.barcode) || bySource.get(c.sourceProductId);
    if (!p || p.barcode !== c.barcode || p.category !== provider.category || p.is_active !== true || !storeId) continue;
    priceRows.push({
      store_id: storeId, product_id: p.id, price: c.price, currency: "BRL", price_type: "official_site",
      source_url: c.sourceUrl,
      source_label: provider.label + " · " + regionLabel + " " + c.priceNote + " Coleta automática ZORVI; preço online, sem filial física específica; estoque não confirmado.",
      observed_at: now, availability_status: "unknown", verification_status: "verified",
      confidence_score: 0.95, submitted_by: null,
    });
  }
  const urls = [...new Set(priceRows.map((r) => String(r.source_url)))];
  const existing = await batches(urls, async (part) => {
    const { data, error } = await admin.from("price_observations").select("source_url,price")
      .eq("store_id", storeId).in("source_url", part)
      .gte("observed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if (error) throw new Error("Falha ao conferir duplicatas: " + error.message);
    return data || [];
  });
  const seen = new Set(existing.map((r) => String(r.source_url) + "|" + Number(r.price).toFixed(2)));
  const toInsert = priceRows.filter((r) => {
    const k = String(r.source_url) + "|" + Number(r.price).toFixed(2);
    if (seen.has(k)) return false; seen.add(k); return true;
  });
  for (let i = 0; i < toInsert.length; i += 100) {
    const { error } = await admin.from("price_observations").insert(toInsert.slice(i, i + 100));
    if (error) throw new Error("Falha ao salvar preços do " + provider.label + ": " + error.message);
  }
  return {
    provider: provider.id, city: "Teresina", state: "PI", postalCode: provider.postalCode,
    regionId: catalog.regionId, regionalSellers: catalog.sellers, sellerCount: catalog.sellerCount,
    searchTerms: catalog.terms, productsFound: catalog.found, eligibleUniqueProducts: catalog.candidates.length,
    newProductsCreated: newProducts.length, pricesInserted: toInsert.length,
    duplicatePricesSkipped: priceRows.length - toInsert.length,
  };
}


Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!await authorised(request)) return json({ error: "Unauthorized" }, 401);
  const body = await request.json().catch(() => ({}));
  const source = String(body?.source || "all");
  const action = String(body?.action || "sync");
  if (!["all", "atacadao", "pague_menos"].includes(source)) return json({ error: "Fonte inválida." }, 400);
  if (!["sync", "preview"].includes(action)) return json({ error: "Ação inválida." }, 400);
  const selected = providers.filter((p) => source === "all" || p.id === source);
  const startedAt = new Date().toISOString();
  const results = [];
  const errors: Array<{ provider: string; error: string }> = [];
  for (const provider of selected) {
    try { results.push(await persistCatalog(await fetchCatalog(provider), action === "preview")); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ provider: provider.id, error: message });
      console.error("[retail-catalog-sync] " + provider.id + ":", message);
    }
  }
  return json({
    success: errors.length === 0, action, city: "Teresina", state: "PI", startedAt,
    finishedAt: new Date().toISOString(), results, errors,
    note: "Ofertas online regionalizadas; não atribuídas a filiais físicas. Estoque em loja não confirmado.",
  }, errors.length ? 207 : 200);
});
