import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Missing Supabase server environment variables.");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Provider = {
  id: string;
  label: string;
  domain: string;
  searchUrl: string;
};

const PROVIDERS: Provider[] = [
  {
    id: "atacadao",
    label: "Atacadão",
    domain: "www.atacadao.com.br",
    searchUrl: "https://www.atacadao.com.br/api/catalog_system/pub/products/search",
  },
  {
    id: "pague_menos",
    label: "Pague Menos",
    domain: "www.paguemenos.com.br",
    searchUrl: "https://www.paguemenos.com.br/api/catalog_system/pub/products/search",
  },
];

async function isAuthorised(request: Request): Promise<boolean> {
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.length < 32) return false;
  const { data, error } = await admin.rpc("verify_catalog_import_token", { candidate: token });
  if (error) {
    console.error("[retail-catalog-sync] Token verification failed:", error.message);
    return false;
  }
  return data === true;
}

async function probe(provider: Provider, term: string) {
  const url = new URL(provider.searchUrl);
  url.searchParams.set("ft", term);
  url.searchParams.set("_from", "0");
  url.searchParams.set("_to", "19");

  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "ZORVI/1.0 (+https://github.com/joaosystemss/startup-em-movimento)",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(20000),
    });
    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();
    let payload: unknown = null;
    try { payload = JSON.parse(body); } catch { /* non-JSON response */ }

    const products = Array.isArray(payload) ? payload : [];
    const samples = products.slice(0, 8).map((raw) => {
      const product = raw as Record<string, unknown>;
      const items = Array.isArray(product.items) ? product.items as Array<Record<string, unknown>> : [];
      const item = items[0] || null;
      const sellers = Array.isArray(item?.sellers) ? item.sellers as Array<Record<string, unknown>> : [];
      const sellerRows = sellers.slice(0, 4).map((seller) => {
        const offer = seller.commertialOffer && typeof seller.commertialOffer === "object"
          ? seller.commertialOffer as Record<string, unknown>
          : null;
        return {
          sellerId: seller.sellerId ?? null,
          sellerName: seller.sellerName ?? null,
          sellerDefault: seller.sellerDefault ?? null,
          price: offer?.Price ?? null,
          listPrice: offer?.ListPrice ?? null,
          availableQuantity: offer?.AvailableQuantity ?? null,
        };
      });
      return {
        productId: product.productId ?? null,
        productName: product.productName ?? null,
        brand: product.brand ?? null,
        link: product.link ?? null,
        itemId: item?.itemId ?? null,
        ean: item?.ean ?? null,
        itemName: item?.name ?? null,
        sellers: sellerRows,
        categories: product.categories ?? null,
      };
    });
    const first = products[0] && typeof products[0] === "object"
      ? products[0] as Record<string, unknown>
      : null;

    return {
      provider: provider.id,
      label: provider.label,
      status: response.status,
      ok: response.ok,
      contentType,
      elapsedMs: Date.now() - startedAt,
      term,
      productCount: products.length,
      samples,
      responsePreview: products.length === 0 ? body.slice(0, 300) : undefined,
    };
  } catch (error) {
    return {
      provider: provider.id,
      label: provider.label,
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}


async function probeAtacadaoStorePages() {
  const pages = [
    { slug: "teresina-bela-vista", store: "Atacadão Bela Vista" },
    { slug: "teresina-ladeira-do-uruguai", store: "Atacadão Ladeira do Uruguai" },
    { slug: "teresina-primavera", store: "Atacadão Primavera" },
  ];
  const results = [];
  for (const entry of pages) {
    const url = "https://www.atacadao.com.br/loja/" + entry.slug;
    const startedAt = Date.now();
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "ZORVI/1.0 (+https://github.com/joaosystemss/startup-em-movimento)",
          "Accept": "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(20000),
      });
      const html = await response.text();
      const priceMatches = [...html.matchAll(/R\\$\\s*[0-9.]+,[0-9]{2}/g)].slice(0, 8).map((match) => match[0]);
      const productNameMatches = [...html.matchAll(/(?:productName|name)\\s*[:=]\\s*["']([^"']{3,100})["']/g)]
        .slice(0, 5).map((match) => match[1]);
      results.push({
        store: entry.store,
        status: response.status,
        ok: response.ok,
        htmlLength: html.length,
        mentionsTeresina: /teresina/i.test(html),
        containsCatalogData: /productName|productId|commertialOffer|Catalogo completo/i.test(html),
        visiblePriceSamples: priceMatches,
        productNameSamples: productNameMatches,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (error) {
      results.push({
        store: entry.store,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startedAt,
      });
    }
  }
  return results;
}


async function probeRegionalization(provider: Provider, postalCode: string, term: string) {
  const base = "https://" + provider.domain;
  const startedAt = Date.now();
  try {
    const sessionResponse = await fetch(base + "/api/sessions", {
      method: "POST",
      headers: {
        "User-Agent": "ZORVI/1.0 (+https://github.com/joaosystemss/startup-em-movimento)",
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        public: {
          country: { value: "BRA" },
          postalCode: { value: postalCode },
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const setCookie = typeof sessionResponse.headers.getSetCookie === "function"
      ? sessionResponse.headers.getSetCookie()
      : [sessionResponse.headers.get("set-cookie") || ""];
    const cookies = setCookie.flatMap((line) => line.split(/, (?=[^;,]+=)/))
      .map((line) => line.split(";")[0].trim())
      .filter(Boolean);
    const cookieHeader = cookies.join("; ");

    const regionUrl = new URL(base + "/api/checkout/pub/regions");
    regionUrl.searchParams.set("country", "BRA");
    regionUrl.searchParams.set("postalCode", postalCode);
    const regionResponse = await fetch(regionUrl, {
      headers: { "User-Agent": "ZORVI/1.0", "Accept": "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    const regionText = await regionResponse.text();
    let regionPayload: unknown = null;
    try { regionPayload = JSON.parse(regionText); } catch { /* no region JSON */ }
    const regionRows = Array.isArray(regionPayload) ? regionPayload as Array<Record<string, unknown>> : [];
    const regionId = regionRows[0]?.id ?? regionRows[0]?.regionId ?? null;
    const sellers = Array.isArray(regionRows[0]?.sellers)
      ? (regionRows[0]!.sellers as Array<Record<string, unknown>>).map((seller) => ({
          id: seller.id ?? null,
          name: seller.name ?? null,
        }))
      : [];

    const v1Url = new URL(base + "/api/intelligent-search/v1/product-search");
    v1Url.searchParams.set("query", term);
    v1Url.searchParams.set("regionId", String(regionId || ""));
    v1Url.searchParams.set("country", "BRA");
    v1Url.searchParams.set("zip-code", postalCode);
    v1Url.searchParams.set("sc", "1");
    v1Url.searchParams.set("count", "5");
    v1Url.searchParams.set("page", "1");
    const v1Response = await fetch(v1Url, {
      headers: { "User-Agent": "ZORVI/1.0", "Accept": "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    const v1Text = await v1Response.text();
    let v1Payload: unknown = null;
    try { v1Payload = JSON.parse(v1Text); } catch { /* no JSON */ }
    const v1Object = v1Payload && typeof v1Payload === "object"
      ? v1Payload as Record<string, unknown>
      : {};
    const v1Products = Array.isArray(v1Object.products)
      ? v1Object.products as Array<Record<string, unknown>>
      : [];
    const v1First = v1Products[0] || null;
    const v1Items = Array.isArray(v1First?.items) ? v1First!.items as Array<Record<string, unknown>> : [];
    const v1Item = v1Items[0] || null;
    const v1Sellers = Array.isArray(v1Item?.sellers) ? v1Item!.sellers as Array<Record<string, unknown>> : [];
    const v1Seller = v1Sellers.find((entry) => entry.sellerDefault === true) || v1Sellers[0] || null;
    const v1Offer = v1Seller?.commertialOffer && typeof v1Seller.commertialOffer === "object"
      ? v1Seller.commertialOffer as Record<string, unknown>
      : null;

    const searchUrl = new URL(provider.searchUrl);
    searchUrl.searchParams.set("ft", term);
    searchUrl.searchParams.set("_from", "0");
    searchUrl.searchParams.set("_to", "4");
    const searchResponse = await fetch(searchUrl, {
      headers: {
        "User-Agent": "ZORVI/1.0",
        "Accept": "application/json",
        ...(cookieHeader ? { "Cookie": cookieHeader } : {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    const searchText = await searchResponse.text();
    let searchPayload: unknown = null;
    try { searchPayload = JSON.parse(searchText); } catch { /* no search JSON */ }
    const products = Array.isArray(searchPayload) ? searchPayload as Array<Record<string, unknown>> : [];
    const first = products[0] || null;
    const item = Array.isArray(first?.items) ? (first!.items as Array<Record<string, unknown>>)[0] : null;
    const sellersForItem = Array.isArray(item?.sellers) ? item!.sellers as Array<Record<string, unknown>> : [];
    const seller = sellersForItem[0] || null;
    const offer = seller?.commertialOffer && typeof seller.commmertialOffer === "object"
      ? seller.commmertialOffer as Record<string, unknown>
      : seller?.commertialOffer && typeof seller.commertialOffer === "object"
        ? seller.commertialOffer as Record<string, unknown>
        : null;

    return {
      provider: provider.id,
      postalCode,
      sessionStatus: sessionResponse.status,
      cookieNames: cookies.map((cookie) => cookie.split("=")[0]),
      regionStatus: regionResponse.status,
      regionId,
      regionSellers: sellers,
      v1Status: v1Response.status,
      v1ProductCount: v1Products.length,
      v1Sample: v1First ? {
        productName: v1First.productName ?? null,
        itemName: v1Item?.name ?? null,
        ean: v1Item?.ean ?? null,
        price: v1Offer?.Price ?? null,
        listPrice: v1Offer?.ListPrice ?? null,
        sellerId: v1Seller?.sellerId ?? null,
        sellerName: v1Seller?.sellerName ?? null,
        availableQuantity: v1Offer?.AvailableQuantity ?? null,
      } : null,
      searchStatus: searchResponse.status,
      sample: first ? {
        productName: first.productName ?? null,
        itemName: item?.name ?? null,
        ean: item?.ean ?? null,
        price: offer?.Price ?? null,
        sellerName: seller?.sellerName ?? null,
        availableQuantity: offer?.AvailableQuantity ?? null,
      } : null,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      provider: provider.id,
      postalCode,
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - startedAt,
    };
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!await isAuthorised(request)) return json({ error: "Unauthorized" }, 401);

  const body = await request.json().catch(() => ({}));
  const requested = String(body?.source || "probe");
  const providers = requested === "probe" || requested === "all"
    ? PROVIDERS
    : PROVIDERS.filter((provider) => provider.id === requested);
  if (!providers.length) return json({ error: "Invalid source. Use probe, all, atacadao or pague_menos." }, 400);

  const terms = body?.term && typeof body.term === "string"
    ? [body.term.trim().slice(0, 80)]
    : requested === "pague_menos" ? ["paracetamol", "dipirona"] : ["arroz", "leite"];
  const results = await Promise.all(providers.map(async (provider) => {
    const termResults = [];
    for (const term of terms) termResults.push(await probe(provider, term));
    return { provider: provider.id, terms: termResults };
  }));
  const atacadaoStorePages = providers.some((provider) => provider.id === "atacadao")
    ? await probeAtacadaoStorePages()
    : [];
  const regionalization = body?.regionalization === true
    ? await Promise.all([
        probeRegionalization(PROVIDERS[0], "64045840", "arroz"),
        probeRegionalization(PROVIDERS[0], "64030005", "arroz"),
        probeRegionalization(PROVIDERS[1], "64049570", "paracetamol"),
      ])
    : [];
  return json({
    success: true,
    mode: "read_only_probe",
    checkedAt: new Date().toISOString(),
    results,
    atacadaoStorePages,
    regionalization,
    note: "This diagnostic request does not create or change products, prices, stores or approvals.",
  });
});
