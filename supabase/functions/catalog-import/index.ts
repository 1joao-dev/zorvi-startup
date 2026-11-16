import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Cidade-piloto inicial do ZORVI. Adicione novas cidades somente na etapa de expansão.
const PILOT_CITY = "Teresina";
const PILOT_STATE = "PI";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase server environment variables.");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const OFF_SEARCHES = [
  "arroz",
  "feijao",
  "leite",
  "cafe",
  "macarrao",
  "biscoito",
  "refrigerante",
  "oleo de soja",
  "acucar",
  "ovos",
  "frango",
  "banana",
  "iogurte",
  "queijo",
  "agua mineral",
  "pao de forma",
];

const OBF_SEARCHES = [
  "shampoo",
  "condicionador",
  "desodorante",
  "sabonete",
  "protetor solar",
  "creme dental",
  "hidratante",
  "absorvente",
];

const OPF_SEARCHES = [
  "fralda",
  "papel higienico",
  "detergente",
  "agua sanitaria",
  "sabao em po",
  "amaciante",
];

const OPEN_FACTS_FIELDS = "code,product_name,brands,quantity,categories_tags,countries_tags,image_front_url,last_modified_t";

const ANVISA_URL = "https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv";

const normalize = (value: unknown) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const clean = (value: unknown, max = 160) => {
  const result = String(value || "").trim();
  return result ? result.slice(0, max) : null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function isAuthorised(request: Request): Promise<boolean> {
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.length < 32) return false;

  const { data, error } = await admin.rpc("verify_catalog_import_token", {
    candidate: token,
  });
  if (error) {
    console.error("[catalog-import] Token verification failed:", error.message);
    return false;
  }
  return data === true;
}

async function saveAliases(
  products: Array<{ id: string; name: string; brand?: string | null; variant?: string | null; aliases?: string[] }>,
  provider: string,
  includeBrand = true,
): Promise<number> {
  const aliases = new Map<string, {
    product_id: string;
    alias: string;
    normalized_alias: string;
    source_provider: string;
  }>();

  for (const product of products) {
    const candidates = [
      product.name,
      ...(includeBrand ? [product.brand] : []),
      product.variant,
      ...(includeBrand ? [[product.brand, product.name].filter(Boolean).join(" ")] : []),
      ...(product.aliases || []),
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const normalized_alias = normalize(candidate);
      if (!normalized_alias) continue;
      aliases.set(product.id + ":" + normalized_alias, {
        product_id: product.id,
        alias: String(candidate).slice(0, 160),
        normalized_alias,
        source_provider: provider,
      });
    }
  }

  const rows = [...aliases.values()];
  if (!rows.length) return 0;

  const { error } = await admin.from("product_aliases").upsert(rows, {
    onConflict: "product_id,normalized_alias",
    ignoreDuplicates: true,
  });
  if (error) throw new Error("Could not save product aliases: " + error.message);
  return rows.length;
}

async function fetchOpenFoodFactsSearch(url: URL, term: string) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "ZORVI/1.0 (+https://github.com/joaosystemss/startup-em-movimento)",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(25000),
    });
    if (response.ok) {
      return await response.json() as {
        products?: Array<{
          code?: string;
          product_name?: string;
          brands?: string;
          quantity?: string;
          categories_tags?: string[];
          countries_tags?: string[];
          image_front_url?: string;
          last_modified_t?: number;
        }>;
      };
    }
    lastStatus = response.status;
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) break;
    await sleep((attempt + 1) * 7000);
  }
  throw new Error("Open Food Facts returned HTTP " + lastStatus + " for " + term + " after retries");
}

async function importOpenFactsProvider(config: {
  provider: string;
  baseUrl: string;
  category: string;
  fallbackSubcategory: string;
  searches: string[];
  termOffset?: number;
  termLimit?: number;
  label: string;
}) {
  let imported = 0;
  let aliasCount = 0;
  const termResults: Array<{ term: string; found: number; imported: number; warning?: string }> = [];
  const start = Math.max(0, Math.floor(Number(config.termOffset) || 0));
  const limit = Math.min(8, Math.max(1, Math.floor(Number(config.termLimit) || 8)));
  const end = Math.min(config.searches.length, start + limit);

  for (let index = start; index < end; index += 1) {
    const term = config.searches[index];
    const url = new URL(config.baseUrl + "/cgi/search.pl");
    url.searchParams.set("search_terms", term);
    url.searchParams.set("search_simple", "1");
    url.searchParams.set("action", "process");
    url.searchParams.set("json", "1");
    url.searchParams.set("page_size", "80");
    url.searchParams.set("fields", OPEN_FACTS_FIELDS);
    url.searchParams.set("tagtype_0", "countries");
    url.searchParams.set("tag_contains_0", "contains");
    url.searchParams.set("tag_0", "en:brazil");

    let payload: Awaited<ReturnType<typeof fetchOpenFoodFactsSearch>>;
    try {
      payload = await fetchOpenFoodFactsSearch(url, term);
    } catch (error) {
      const warning = error instanceof Error ? error.message : String(error);
      console.warn("[catalog-import] Skipping " + config.provider + " term:", term, warning);
      termResults.push({ term, found: 0, imported: 0, warning });
      if (index < end - 1) await sleep(8500);
      continue;
    }

    const externalProducts = [...new Map((payload.products || [])
      .filter((item) => Boolean(item.code && item.product_name?.trim()))
      .filter((item) =>
        !item.countries_tags?.length ||
        item.countries_tags.some((tag) => normalize(tag).includes("brazil"))
      )
      .map((item) => [item.code, item])).values()].slice(0, 80);

    if (!externalProducts.length) {
      termResults.push({ term, found: 0, imported: 0 });
      if (index < end - 1) await sleep(8500);
      continue;
    }

    const barcodes = externalProducts.map((item) => item.code as string);
    const { data: existing, error: existingError } = await admin
      .from("products")
      .select("barcode,source_provider")
      .in("barcode", barcodes);
    if (existingError) throw existingError;

    const protectedBarcodes = new Set(
      (existing || [])
        .filter((item) => item.source_provider !== config.provider)
        .map((item) => item.barcode),
    );

    const rows = externalProducts
      .filter((item) => !protectedBarcodes.has(item.code as string))
      .map((item) => {
        const name = (item.product_name || "").trim().slice(0, 180);
        const brand = clean(item.brands, 120);
        const quantity = clean(item.quantity, 80);
        const code = item.code as string;
        const categoryTags = (item.categories_tags || [])
          .map((tag) => tag.replace(/^[a-z]{2}:/, "").slice(0, 100));
        let category = config.category;
        if (config.provider === "open_products_facts") {
          const taxonomy = normalize(categoryTags.join(" "));
          if (/(cosmetic|beauty|personal care|hygiene|shampoo|deodorant|toothpaste|skin care)/.test(taxonomy)) {
            category = "Farmácia";
          } else if (/(cleaning|household|paper|detergent|laundry|dishwashing)/.test(taxonomy)) {
            category = "Mercado";
          }
        }
        return {
          name,
          normalized_name: normalize([name, brand || "", quantity || ""].join(" ")),
          brand,
          variant: quantity,
          unit: quantity,
          barcode: code,
          category,
          subcategory: categoryTags[0] || config.fallbackSubcategory,
          source_provider: config.provider,
          source_product_id: code,
          source_url: config.baseUrl + "/product/" + encodeURIComponent(code),
          image_url: item.image_front_url?.startsWith("https://") ? item.image_front_url : null,
          description: "Metadados públicos " + config.label + ". Não confirmam preço, disponibilidade ou estoque em lojas.",
          country_code: "BR",
          source_updated_at: item.last_modified_t ? new Date(item.last_modified_t * 1000).toISOString() : null,
          is_active: true,
        };
      })
      .filter((item) => item.name.length > 1);

    let saved: Array<{ id: string; name: string; brand: string | null; variant: string | null }> = [];
    if (rows.length) {
      const { data, error } = await admin.from("products")
        .upsert(rows, { onConflict: "source_provider,source_product_id" })
        .select("id,name,brand,variant");
      if (error) throw new Error(config.label + " product upsert failed: " + error.message);
      saved = data || [];
      imported += saved.length;
      aliasCount += await saveAliases(saved, config.provider);
    }

    termResults.push({ term, found: externalProducts.length, imported: saved.length });
    if (index < end - 1) await sleep(8500);
  }

  return {
    provider: config.provider,
    termOffset: start,
    termLimit: limit,
    nextOffset: end < config.searches.length ? end : null,
    imported,
    aliases: aliasCount,
    searches: termResults,
    failedSearches: termResults.filter((item) => Boolean(item.warning)).length,
  };
}

async function importOpenFoodFacts(termOffset = 0, termLimit = 8) {
  return importOpenFactsProvider({
    provider: "open_food_facts",
    baseUrl: "https://world.openfoodfacts.org",
    category: "Mercado",
    fallbackSubcategory: "Alimentos",
    searches: OFF_SEARCHES,
    termOffset,
    termLimit,
    label: "Open Food Facts",
  });
}

async function importOpenBeautyFacts(termOffset = 0, termLimit = 8) {
  return importOpenFactsProvider({
    provider: "open_beauty_facts",
    baseUrl: "https://world.openbeautyfacts.org",
    category: "Farmácia",
    fallbackSubcategory: "Higiene e beleza",
    searches: OBF_SEARCHES,
    termOffset,
    termLimit,
    label: "Open Beauty Facts",
  });
}

async function importOpenProductsFacts(termOffset = 0, termLimit = 6) {
  return importOpenFactsProvider({
    provider: "open_products_facts",
    baseUrl: "https://world.openproductsfacts.org",
    category: "Lojas",
    fallbackSubcategory: "Produtos diversos",
    searches: OPF_SEARCHES,
    termOffset,
    termLimit,
    label: "Open Products Facts",
  });
}

const CURATED_PRODUCTS = [
  {
    source_product_id: "pharmacy-diaper-size-p",
    name: "Fralda descartável tamanho P pacote",
    category: "Farmácia",
    subcategory: "Higiene e bebê",
    variant: "Pacote tamanho P",
    unit: "Pacote",
    aliases: ["fralda p", "fralda tamanho p", "fralda descartável p", "fralda descartavel p"],
  },
  {
    source_product_id: "pharmacy-diaper-size-g",
    name: "Fralda descartável tamanho G pacote",
    category: "Farmácia",
    subcategory: "Higiene e bebê",
    variant: "Pacote tamanho G",
    unit: "Pacote",
    aliases: ["fralda g", "fralda tamanho g", "fralda descartável g", "fralda descartavel g"],
  },
  {
    source_product_id: "pharmacy-diaper-size-xg",
    name: "Fralda descartável tamanho XG pacote",
    category: "Farmácia",
    subcategory: "Higiene e bebê",
    variant: "Pacote tamanho XG",
    unit: "Pacote",
    aliases: ["fralda xg", "fralda tamanho xg", "fralda extra grande", "fralda descartável xg"],
  },
  {
    source_product_id: "pharmacy-diaper-size-xxg",
    name: "Fralda descartável tamanho XXG pacote",
    category: "Farmácia",
    subcategory: "Higiene e bebê",
    variant: "Pacote tamanho XXG",
    unit: "Pacote",
    aliases: ["fralda xxg", "fralda tamanho xxg", "fralda extra extra grande"],
  },
  {
    source_product_id: "pharmacy-toothpaste-90g",
    name: "Creme dental 90 g",
    category: "Farmácia",
    subcategory: "Higiene bucal",
    variant: "Tubo de 90 g",
    unit: "90 g",
    aliases: ["pasta de dente", "creme dental", "pasta dental 90g", "pasta de dente 90g"],
  },
  {
    source_product_id: "pharmacy-dental-floss-50m",
    name: "Fio dental 50 m",
    category: "Farmácia",
    subcategory: "Higiene bucal",
    variant: "Embalagem de 50 metros",
    unit: "50 m",
    aliases: ["fio dental", "fio dental 50 metros"],
  },
  {
    source_product_id: "pharmacy-baby-shampoo-200ml",
    name: "Shampoo infantil 200 ml",
    category: "Farmácia",
    subcategory: "Higiene e bebê",
    variant: "Frasco de 200 ml",
    unit: "200 ml",
    aliases: ["shampoo de bebê", "shampoo infantil", "xampu infantil"],
  },
  {
    source_product_id: "pharmacy-liquid-soap-250ml",
    name: "Sabonete líquido 250 ml",
    category: "Farmácia",
    subcategory: "Higiene pessoal",
    variant: "Frasco de 250 ml",
    unit: "250 ml",
    aliases: ["sabonete liquido", "sabonete líquido 250 ml"],
  },
  {
    source_product_id: "market-beans-fradinho-1kg",
    name: "Feijão fradinho 1 kg",
    category: "Mercado",
    subcategory: "Mercearia",
    variant: "Pacote de 1 kg",
    unit: "1 kg",
    aliases: ["feijao fradinho", "feijão fradinho", "feijao de corda", "feijão de corda"],
  },
  {
    source_product_id: "market-rice-parboiled-1kg",
    name: "Arroz parboilizado 1 kg",
    category: "Mercado",
    subcategory: "Mercearia",
    variant: "Pacote de 1 kg",
    unit: "1 kg",
    aliases: ["arroz parboilizado", "arroz parbolizado 1kg"],
  },
  {
    source_product_id: "market-milk-lactose-free-1l",
    name: "Leite zero lactose 1 L",
    category: "Mercado",
    subcategory: "Laticínios",
    variant: "Caixa de 1 litro",
    unit: "1 L",
    aliases: ["leite sem lactose", "leite zero lactose", "leite lacfree"],
  },
  {
    source_product_id: "market-olive-oil-500ml",
    name: "Azeite de oliva 500 ml",
    category: "Mercado",
    subcategory: "Mercearia",
    variant: "Garrafa de 500 ml",
    unit: "500 ml",
    aliases: ["azeite", "azeite de oliva", "azeite extra virgem"],
  },
  {
    source_product_id: "market-bread-french-kg",
    name: "Pão francês por kg",
    category: "Mercado",
    subcategory: "Padaria",
    variant: "Preço por quilograma",
    unit: "kg",
    aliases: ["pao frances", "pão francês", "pao de sal", "pão de sal"],
  },
  {
    source_product_id: "market-macaxeira-kg",
    name: "Macaxeira por kg",
    category: "Mercado",
    subcategory: "Hortifruti",
    variant: "Preço por quilograma",
    unit: "kg",
    aliases: ["macaxeira", "mandioca", "aipim"],
  },
  {
    source_product_id: "market-corn-oil-900ml",
    name: "Óleo de milho 900 ml",
    category: "Mercado",
    subcategory: "Mercearia",
    variant: "Garrafa de 900 ml",
    unit: "900 ml",
    aliases: ["oleo de milho", "óleo de milho"],
  },
  {
    source_product_id: "market-mayonnaise-500g",
    name: "Maionese 500 g",
    category: "Mercado",
    subcategory: "Mercearia",
    variant: "Pote de 500 g",
    unit: "500 g",
    aliases: ["maionese", "maionese 500g"],
  },
];

async function importZorviCurated() {
  const now = new Date().toISOString();
  const rows = CURATED_PRODUCTS.map((item) => ({
    name: item.name,
    normalized_name: normalize([item.name, item.variant].filter(Boolean).join(" ")),
    brand: null,
    variant: item.variant,
    unit: item.unit,
    barcode: null,
    category: item.category,
    subcategory: item.subcategory,
    source_provider: "zorvi_curated",
    source_product_id: item.source_product_id,
    source_url: null,
    image_url: null,
    description: "Produto de referência para busca e comparação. O cadastro não confirma disponibilidade, preço ou estoque em qualquer loja.",
    country_code: "BR",
    source_updated_at: now,
    is_active: true,
  }));
  const { data, error } = await admin.from("products")
    .upsert(rows, { onConflict: "source_provider,source_product_id" })
    .select("id,name,brand,variant,source_product_id");
  if (error) throw new Error("Curated product upsert failed: " + error.message);
  const aliasesBySourceId = new Map(CURATED_PRODUCTS.map((item) => [item.source_product_id, item.aliases]));
  const saved = (data || []).map((item) => ({
    ...item,
    aliases: aliasesBySourceId.get(item.source_product_id) || [],
  }));
  const aliases = await saveAliases(saved, "zorvi_curated");
  return { imported: saved.length, aliases, provider: "zorvi_curated" };
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const arc = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

function normalizeStoreName(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchOpenPricesStore(location: {
  osm_name?: string | null;
  osm_display_name?: string | null;
  osm_address_city?: string | null;
  osm_address_country_code?: string | null;
  osm_lat?: number | null;
  osm_lon?: number | null;
}, stores: Array<{
  id: string;
  name: string;
  brand_name: string | null;
  address: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
}>) {
  const locationText = normalizeStoreName([location.osm_name, location.osm_display_name].filter(Boolean).join(" "));
  const locationCity = normalizeStoreName(location.osm_address_city || "");
  const country = normalizeStoreName(location.osm_address_country_code || "");
  if (!locationText || location.osm_lat === null || location.osm_lat === undefined || location.osm_lon === null || location.osm_lon === undefined
    || !Number.isFinite(Number(location.osm_lat)) || !Number.isFinite(Number(location.osm_lon))) return null;
  if (country && country !== "br" && !country.includes("brazil")) return null;

  const candidates = stores.map((store) => {
    if (normalizeStoreName(store.city) !== locationCity) return null;
    if (store.latitude === null || store.longitude === null) return null;
    const brand = store.brand_name || store.name.split(" - ")[0].split(" — ")[0];
    const brandTokens = normalizeStoreName(brand).split(/\s+/)
      .filter((token) => token.length >= 3 && !["super", "supermercado", "farmacia", "farmacias", "drogaria", "mercado", "atacarejo", "loja"].includes(token));
    if (!brandTokens.length || !brandTokens.every((token) => locationText.includes(token))) return null;

    const distance = distanceKm(
      Number(location.osm_lat),
      Number(location.osm_lon),
      store.latitude,
      store.longitude,
    );
    const storeNumber = String(store.address).match(/\b\d+[a-z]?\b/i)?.[0]?.toLowerCase() || "";
    const locationNumber = String(location.osm_display_name || "").match(/\b\d+[a-z]?\b/i)?.[0]?.toLowerCase() || "";
    const numberMatch = Boolean(storeNumber && locationNumber && storeNumber === locationNumber);
    if (!numberMatch && distance > 0.18) return null;
    return { store, distance, numberMatch };
  }).filter((item): item is { store: typeof stores[number]; distance: number; numberMatch: boolean } => Boolean(item));

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.store || null;
}

async function importOpenPrices() {
  const { data: stores, error: storeError } = await admin.from("stores")
    .select("id,name,brand_name,address,city,state,latitude,longitude")
    .eq("verification_status", "verified")
    .eq("city", PILOT_CITY)
    .eq("state", PILOT_STATE)
    .limit(1000);
  if (storeError) throw new Error("Could not load stores for Open Prices matching: " + storeError.message);

  const storeRows = stores || [];
  const regions = new Map<string, typeof storeRows>();
  storeRows.filter((store) => store.latitude !== null && store.longitude !== null).forEach((store) => {
    const key = normalizeStoreName(store.city) + "|" + normalizeStoreName(store.state);
    const current = regions.get(key) || [];
    current.push(store);
    regions.set(key, current);
  });

  const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let found = 0;
  let imported = 0;
  let unmatchedStores = 0;
  let unmatchedProducts = 0;
  let skippedWithoutEvidence = 0;
  const regionResults: Array<Record<string, unknown>> = [];

  for (const regionStores of regions.values()) {
    if (!regionStores.length) continue;
    const city = regionStores[0].city;
    const state = regionStores[0].state;
    const lat = regionStores.reduce((sum, store) => sum + Number(store.latitude), 0) / regionStores.length;
    const lon = regionStores.reduce((sum, store) => sum + Number(store.longitude), 0) / regionStores.length;
    const url = new URL("https://prices.openfoodfacts.org/api/v1/prices");
    url.searchParams.set("currency", "BRL");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("radius_km", "20");
    url.searchParams.set("date__gte", cutoffDate);
    url.searchParams.set("duplicate_of__isnull", "true");
    url.searchParams.set("size", "100");
    url.searchParams.set("page", "1");
    url.searchParams.set("type", "PRODUCT");
    url.searchParams.set("kind", "COMMUNITY");
    url.searchParams.set("location__type", "OSM");

    let payload: {
      items?: Array<{
        id: number;
        product_code?: string | null;
        product_name?: string | null;
        price?: number | string | null;
        currency?: string | null;
        date?: string | null;
        duplicate_of?: number | null;
        location?: {
          osm_name?: string | null;
          osm_display_name?: string | null;
          osm_address_city?: string | null;
          osm_address_country_code?: string | null;
          osm_lat?: number | null;
          osm_lon?: number | null;
        } | null;
        proof?: {
          type?: string | null;
          file_path?: string | null;
          draft?: boolean;
        } | null;
      }>;
      total?: number;
      pages?: number;
    };

    const response = await fetch(url, {
      headers: {
        "User-Agent": "ZORVI/1.0 (+https://github.com/joaosystemss/startup-em-movimento)",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      regionResults.push({ city, state, status: response.status, found: 0, imported: 0 });
      continue;
    }
    payload = await response.json() as typeof payload;
    const items = payload.items || [];
    found += items.length;

    const matched = items.map((item) => ({
      item,
      store: item.location ? matchOpenPricesStore(item.location, regionStores) : null,
    }));
    unmatchedStores += matched.filter((entry) => !entry.store).length;
    const eligible = matched.filter((entry) =>
      Boolean(entry.store && entry.item.product_code && entry.item.price && Number(entry.item.price) > 0
        && entry.item.currency === "BRL" && entry.item.date && entry.item.date >= cutoffDate
        && !entry.item.duplicate_of)
    );
    const barcodes = [...new Set(eligible.map((entry) => String(entry.item.product_code)))];
    const productResult = barcodes.length
      ? await admin.from("products").select("id,barcode").in("barcode", barcodes)
      : { data: [], error: null };
    if (productResult.error) throw new Error("Could not match Open Prices products: " + productResult.error.message);
    const productByBarcode = new Map((productResult.data || []).map((product) => [product.barcode, product.id]));

    const rows: Array<Record<string, unknown>> = [];
    for (const entry of eligible) {
      const item = entry.item;
      const productId = productByBarcode.get(String(item.product_code));
      if (!productId) {
        unmatchedProducts += 1;
        continue;
      }
      const proofType = String(item.proof?.type || "");
      const hasEvidence = Boolean(item.proof?.file_path) && item.proof?.draft !== true
        && ["PRICE_TAG", "RECEIPT"].includes(proofType);
      if (!hasEvidence) {
        skippedWithoutEvidence += 1;
        continue;
      }
      rows.push({
        product_id: productId,
        store_id: entry.store!.id,
        price: Number(item.price),
        currency: "BRL",
        price_type: "community_report",
        source_url: "https://prices.openfoodfacts.org/prices/" + item.id,
        source_label: "Open Prices · " + (proofType === "PRICE_TAG" ? "foto da etiqueta" : "recibo") + " · " + item.date + " · evidência anexada · aguardando revisão ZORVI",
        observed_at: new Date(item.date + "T12:00:00.000Z").toISOString(),
        availability_status: "unknown",
        verification_status: "pending",
        confidence_score: proofType === "PRICE_TAG" ? 0.92 : 0.88,
        submitted_by: null,
      });
    }

    const sourceUrls = rows.map((row) => String(row.source_url));
    const existingResult = sourceUrls.length
      ? await admin.from("price_observations").select("source_url").in("source_url", sourceUrls)
      : { data: [], error: null };
    if (existingResult.error) throw new Error("Could not check duplicate Open Prices observations: " + existingResult.error.message);
    const existingUrls = new Set((existingResult.data || []).map((row) => row.source_url));
    const newRows = rows.filter((row) => !existingUrls.has(String(row.source_url)));
    if (newRows.length) {
      const insertResult = await admin.from("price_observations").insert(newRows);
      if (insertResult.error) throw new Error("Open Prices observation import failed: " + insertResult.error.message);
      imported += newRows.length;
    }
    regionResults.push({
      city,
      state,
      found: items.length,
      imported: newRows.length,
      totalAvailable: payload.total || 0,
    });
  }

  return {
    provider: "open_prices",
    windowDays: 30,
    currency: "BRL",
    found,
    imported,
    unmatchedStores,
    unmatchedProducts,
    skippedWithoutEvidence,
    regions: regionResults,
    note: "Only recent BRL community prices with photo evidence and a strict store name/location match are imported as pending. A ZORVI reviewer must approve them before they appear in comparisons; availability remains unknown.",
  };
}

function* parseCsvRows(text: string, delimiter: string): Generator<string[]> {
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) yield row;
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    if (row.some((value) => value.trim())) yield row;
  }
}

function parseDate(value: string): Date | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (br) return new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1])));
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function findColumn(headers: string[], candidates: string[]): number {
  const normalized = new Set(candidates.map(normalize));
  return headers.findIndex((header) => normalized.has(normalize(header)));
}

async function flushAnvisaBatch(batch: Array<Record<string, unknown>>) {
  if (!batch.length) return { products: 0, aliases: 0 };
  const uniqueBatch = [...new Map(batch.map((row) => [row.source_product_id, row])).values()];
  const { data, error } = await admin.from("products")
    .upsert(uniqueBatch, { onConflict: "source_provider,source_product_id" })
    .select("id,name,brand,variant");
  if (error) throw new Error("ANVISA product batch failed: " + error.message);

  const aliases = await saveAliases((data || []) as Array<{
    id: string;
    name: string;
    brand: string | null;
    variant: string | null;
  }>, "anvisa", false);
  return { products: data?.length || 0, aliases };
}

async function importAnvisa(rowOffset = 0, rowLimit = 5000) {
  const response = await fetch(ANVISA_URL, {
    headers: { "User-Agent": "ZORVI catalog importer/1.0", "Accept": "text/csv,*/*" },
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error("ANVISA returned HTTP " + response.status);

  const bytes = new Uint8Array(await response.arrayBuffer());
  let csv: string;
  try {
    csv = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    csv = new TextDecoder("windows-1252").decode(bytes);
  }

  const firstLine = csv.slice(0, csv.indexOf("\n") >= 0 ? csv.indexOf("\n") : 5000);
  const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : ",";
  const iterator = parseCsvRows(csv, delimiter);
  const first = iterator.next();
  if (first.done) throw new Error("ANVISA dataset is empty.");

  const headers = first.value.map((header) => header.replace(/^\uFEFF/, "").trim());
  const nameIndex = findColumn(headers, ["Nome Produto", "NOME_PRODUTO", "NO_PRODUTO", "Nome do Produto"]);
  const activeIndex = findColumn(headers, ["Princípio Ativo", "PRINCIPIO_ATIVO", "NO_PRINCIPIO_ATIVO", "DS_PRINCIPIO_ATIVO"]);
  const registrationIndex = findColumn(headers, ["Número Registro Produto", "Número de Registro do Produto", "NUMERO_REGISTRO_PRODUTO", "NUMERO_REGISTRO", "Registro"]);
  const companyIndex = findColumn(headers, ["Empresa Detentora Registro", "EMPRESA_DETENTORA_REGISTRO", "DETENTORA_REGISTRO", "Razão Social", "RAZAO_SOCIAL", "Nome Empresa", "NOME_EMPRESA"]);
  const categoryIndex = findColumn(headers, ["Categoria Regulatória", "CATEGORIA_REGULATORIA"]);
  const therapeuticIndex = findColumn(headers, ["Classe Terapêutica", "CLASSE_TERAPEUTICA"]);
  const expiryIndex = findColumn(headers, ["Data Vencimento Registro", "Data de Vencimento do Registro", "DATA_VENCIMENTO_REGISTRO"]);

  if (nameIndex < 0) {
    throw new Error("Could not identify the ANVISA product-name column. Headers: " + headers.slice(0, 40).join(" | "));
  }

  const safeOffset = Math.max(0, Math.floor(Number(rowOffset) || 0));
  const safeLimit = Math.min(8000, Math.max(100, Math.floor(Number(rowLimit) || 5000)));
  const today = new Date();
  const now = new Date().toISOString();
  let batch: Array<Record<string, unknown>> = [];
  let productsImported = 0;
  let aliasesImported = 0;
  let rowsProcessed = 0;
  let rowsScanned = 0;
  let rowIndex = 0;
  let hasMore = false;

  const flush = async () => {
    if (!batch.length) return;
    const result = await flushAnvisaBatch(batch);
    productsImported += result.products;
    aliasesImported += result.aliases;
    batch = [];
  };

  while (true) {
    const next = iterator.next();
    if (next.done) break;
    const columns = next.value;
    if (rowIndex < safeOffset) {
      rowIndex += 1;
      continue;
    }
    if (rowIndex >= safeOffset + safeLimit) {
      hasMore = true;
      break;
    }
    rowIndex += 1;
    rowsScanned += 1;
    const get = (index: number) => index >= 0 ? String(columns[index] || "").trim() : "";
    const name = get(nameIndex).slice(0, 180);
    if (!name) continue;

    const active = get(activeIndex).slice(0, 180);
    const registration = get(registrationIndex).slice(0, 100);
    const company = get(companyIndex).slice(0, 140);
    const regulatoryCategory = get(categoryIndex).slice(0, 100);
    const therapeuticClass = get(therapeuticIndex).slice(0, 120);
    const expiry = parseDate(get(expiryIndex));
    const sourceId = registration || normalize([name, active, company].filter(Boolean).join("|"));
    const variant = [
      active ? "Princípio ativo: " + active : "",
      regulatoryCategory ? "Categoria: " + regulatoryCategory : "",
      therapeuticClass ? "Classe: " + therapeuticClass : "",
    ].filter(Boolean).join(" · ").slice(0, 240);

    batch.push({
      name,
      normalized_name: normalize([name, active, company].filter(Boolean).join(" ")),
      brand: company || null,
      variant: variant || null,
      unit: null,
      barcode: null,
      category: "Farmácia",
      subcategory: "Medicamento registrado",
      source_provider: "anvisa",
      source_product_id: sourceId,
      source_url: ANVISA_URL,
      description: [
        registration ? "Registro ANVISA: " + registration : "",
        active ? "Princípio ativo: " + active : "",
        regulatoryCategory ? "Categoria regulatória: " + regulatoryCategory : "",
        therapeuticClass ? "Classe terapêutica: " + therapeuticClass : "",
      ].filter(Boolean).join(" · ").slice(0, 800),
      country_code: "BR",
      source_updated_at: now,
      is_active: !expiry || expiry >= today,
    });

    rowsProcessed += 1;
    if (batch.length >= 700) await flush();
  }

  await flush();
  return {
    rowOffset: safeOffset,
    rowLimit: safeLimit,
    rowsScanned,
    rowsProcessed,
    productsImported,
    aliasesImported,
    hasMore,
    nextOffset: hasMore ? safeOffset + rowsScanned : null,
    fileBytes: bytes.length,
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  if (!await isAuthorised(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const source = String(body?.source || "all");
    if (!["all", "open_food_facts", "open_beauty_facts", "open_products_facts", "open_prices", "zorvi_curated", "anvisa"].includes(source)) {
      return Response.json({ error: "Invalid source. Use all, open_food_facts, open_beauty_facts, open_products_facts, open_prices, zorvi_curated or anvisa." }, { status: 400 });
    }

    const startedAt = new Date().toISOString();
    const results: Record<string, unknown> = {};
    if (source === "all" || source === "zorvi_curated") {
      results.zorvi_curated = await importZorviCurated();
    }
    if (source === "all" || source === "open_food_facts") {
      results.open_food_facts = await importOpenFoodFacts(body?.term_offset, body?.term_limit);
    }
    if (source === "open_beauty_facts") {
      results.open_beauty_facts = await importOpenBeautyFacts(body?.term_offset, body?.term_limit);
    }
    if (source === "open_products_facts") {
      results.open_products_facts = await importOpenProductsFacts(body?.term_offset, body?.term_limit);
    }
    if (source === "open_prices") {
      results.open_prices = await importOpenPrices();
    }
    if (source === "all" || source === "anvisa") {
      results.anvisa = await importAnvisa(body?.row_offset, body?.row_limit);
    }

    return Response.json({
      success: true,
      source,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      results,
      note: source === "open_prices"
        ? "Evidence-backed community price observations may be imported when exact store, product barcode and location matches are found. Availability is never inferred."
        : "Imported product catalog metadata only. Product metadata does not confirm store price, availability or stock.",
    });
  } catch (error) {
    console.error("[catalog-import] Import failed:", error instanceof Error ? error.message : String(error));
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
});
