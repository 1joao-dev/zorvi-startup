import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no terminal. Nunca coloque a chave no frontend ou no Git.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SEARCHES = [
  "arroz",
  "feijao",
  "leite",
  "cafe",
  "macarrao",
  "biscoito",
  "refrigerante",
  "oleo de soja",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

async function importSearch(term) {
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("search_terms", term);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "80");
  url.searchParams.set("fields", "code,product_name,brands,quantity,categories_tags,countries_tags,image_front_url,last_modified_t");
  url.searchParams.set("tagtype_0", "countries");
  url.searchParams.set("tag_contains_0", "contains");
  url.searchParams.set("tag_0", "en:brazil");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "ZORVI/1.0 (+https://github.com/joaosystemss/startup-em-movimento)",
      "Accept": "application/json",
    },
  });
  if (!response.ok) throw new Error("Open Food Facts respondeu HTTP " + response.status + " para: " + term);

  const payload = await response.json();
  const products = [...new Map((payload.products || [])
    .filter((item) => item.code && item.product_name?.trim())
    .filter((item) => !item.countries_tags?.length || item.countries_tags.some((tag) => normalize(tag).includes("brazil")))
    .map((item) => [item.code, item])).values()].slice(0, 80);

  if (!products.length) {
    console.log("Sem resultados brasileiros para:", term);
    return 0;
  }

  const barcodes = products.map((item) => item.code);
  const { data: existing, error: existingError } = await supabase
    .from("products")
    .select("barcode,source_provider")
    .in("barcode", barcodes);
  if (existingError) throw existingError;

  const protectedBarcodes = new Set(
    (existing || [])
      .filter((item) => item.source_provider !== "open_food_facts")
      .map((item) => item.barcode),
  );

  const rows = products
    .filter((item) => !protectedBarcodes.has(item.code))
    .map((item) => {
      const name = item.product_name.trim().slice(0, 180);
      const brand = item.brands?.trim().slice(0, 120) || null;
      const quantity = item.quantity?.trim().slice(0, 80) || null;
      return {
        name,
        normalized_name: normalize([name, brand, quantity].filter(Boolean).join(" ")),
        brand,
        variant: quantity,
        unit: quantity,
        barcode: item.code,
        category: "Mercado",
        subcategory: item.categories_tags?.[0]?.replace(/^[a-z]{2}:/, "").slice(0, 100) || "Alimentos",
        source_provider: "open_food_facts",
        source_product_id: item.code,
        source_url: "https://world.openfoodfacts.org/product/" + encodeURIComponent(item.code),
        image_url: item.image_front_url?.startsWith("https://") ? item.image_front_url : null,
        description: "Metadados públicos do Open Food Facts. Não confirmam preço, disponibilidade ou estoque em lojas.",
        country_code: "BR",
        source_updated_at: item.last_modified_t ? new Date(item.last_modified_t * 1000).toISOString() : null,
        is_active: true,
      };
    });

  if (!rows.length) {
    console.log("Os produtos de", term, "já estavam no catálogo ou protegidos por cadastro manual.");
    return 0;
  }

  const { data: saved, error } = await supabase
    .from("products")
    .upsert(rows, { onConflict: "source_provider,source_product_id" })
    .select("id,name,brand,variant,unit");
  if (error) throw error;

  const aliasMap = new Map();
  for (const product of saved || []) {
    for (const alias of [product.name, product.brand, product.variant, [product.brand, product.name].filter(Boolean).join(" ")]) {
      const normalizedAlias = normalize(alias);
      if (normalizedAlias) aliasMap.set(product.id + ":" + normalizedAlias, {
        product_id: product.id,
        alias: alias.slice(0, 160),
        normalized_alias: normalizedAlias,
        source_provider: "open_food_facts",
      });
    }
  }

  const aliases = [...aliasMap.values()];
  if (aliases.length) {
    const { error: aliasError } = await supabase
      .from("product_aliases")
      .upsert(aliases, { onConflict: "product_id,normalized_alias", ignoreDuplicates: true });
    if (aliasError) throw aliasError;
  }

  console.log("Importados", saved?.length || 0, "produtos para a busca:", term);
  return saved?.length || 0;
}

let total = 0;
for (let index = 0; index < SEARCHES.length; index += 1) {
  total += await importSearch(SEARCHES[index]);
  if (index < SEARCHES.length - 1) {
    // Open Food Facts limits search requests. Keep this below 10 requests per minute.
    await sleep(7000);
  }
}
console.log("Sincronização Open Food Facts concluída. Novos/atualizados:", total);
