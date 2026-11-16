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

async function probe(provider: Provider) {
  const url = new URL(provider.searchUrl);
  url.searchParams.set("ft", "arroz");
  url.searchParams.set("_from", "0");
  url.searchParams.set("_to", "4");

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
    const first = products[0] && typeof products[0] === "object"
      ? products[0] as Record<string, unknown>
      : null;
    const items = Array.isArray(first?.items) ? first.items as Array<Record<string, unknown>> : [];
    const firstItem = items[0] || null;
    const sellers = Array.isArray(firstItem?.sellers) ? firstItem.sellers as Array<Record<string, unknown>> : [];
    const offer = sellers[0]?.commertialOffer && typeof sellers[0].commertialOffer === "object"
      ? sellers[0].commertialOffer as Record<string, unknown>
      : null;

    return {
      provider: provider.id,
      label: provider.label,
      status: response.status,
      ok: response.ok,
      contentType,
      elapsedMs: Date.now() - startedAt,
      productCount: products.length,
      sample: first ? {
        productId: first.productId ?? null,
        productName: first.productName ?? null,
        brand: first.brand ?? null,
        link: first.link ?? null,
        itemId: firstItem?.itemId ?? null,
        ean: firstItem?.ean ?? null,
        itemName: firstItem?.name ?? null,
        price: offer?.Price ?? null,
        listPrice: offer?.ListPrice ?? null,
        availableQuantity: offer?.AvailableQuantity ?? null,
        sellerId: sellers[0]?.sellerId ?? null,
        sellerName: sellers[0]?.sellerName ?? null,
        sellerDefault: sellers[0]?.sellerDefault ?? null,
        itemReferenceId: firstItem?.referenceId ?? null,
        productCategories: first.categories ?? null,
      } : null,
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

  const results = await Promise.all(providers.map(probe));
  const atacadaoStorePages = providers.some((provider) => provider.id === "atacadao")
    ? await probeAtacadaoStorePages()
    : [];
  return json({
    success: true,
    mode: "read_only_probe",
    checkedAt: new Date().toISOString(),
    results,
    atacadaoStorePages,
    note: "This diagnostic request does not create or change products, prices, stores or approvals.",
  });
});
