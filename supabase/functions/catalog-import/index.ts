import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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
];

const OFF_URL = "https://world.openfoodfacts.org/cgi/search.pl";
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
  products: Array<{ id: string; name: string; brand?: string | null; variant?: string | null }>,
  provider: string,
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
      product.brand,
      product.variant,
      [product.brand, product.name].filter(Boolean).join(" "),
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

async function importOpenFoodFacts() {
  let imported = 0;
  let aliasCount = 0;
  const termResults: Array<{ term: string; found: number; imported: number }> = [];

  for (let index = 0; index < OFF_SEARCHES.length; index += 1) {
    const term = OFF_SEARCHES[index];
    const url = new URL(OFF_URL);
    url.searchParams.set("search_terms", term);
    url.searchParams.set("search_simple", "1");
    url.searchParams.set("action", "process");
    url.searchParams.set("json", "1");
    url.searchParams.set("page_size", "80");
    url.searchParams.set(
      "fields",
      "code,product_name,brands,quantity,categories_tags,countries_tags,image_front_url,last_modified_t",
    );
    url.searchParams.set("tagtype_0", "countries");
    url.searchParams.set("tag_contains_0", "contains");
    url.searchParams.set("tag_0", "en:brazil");

    const response = await fetch(url, {
      headers: {
        "User-Agent": "ZORVI/1.0 (+https://github.com/joaosystemss/startup-em-movimento)",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      throw new Error("Open Food Facts returned HTTP " + response.status + " for " + term);
    }

    const payload = await response.json() as {
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

    const externalProducts = [...new Map((payload.products || [])
      .filter((item) => Boolean(item.code && item.product_name?.trim()))
      .filter((item) =>
        !item.countries_tags?.length ||
        item.countries_tags.some((tag) => normalize(tag).includes("brazil"))
      )
      .map((item) => [item.code, item])).values()].slice(0, 80);

    if (!externalProducts.length) {
      termResults.push({ term, found: 0, imported: 0 });
      if (index < OFF_SEARCHES.length - 1) await sleep(6500);
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
        .filter((item) => item.source_provider !== "open_food_facts")
        .map((item) => item.barcode),
    );

    const rows = externalProducts
      .filter((item) => !protectedBarcodes.has(item.code as string))
      .map((item) => {
        const name = (item.product_name || "").trim().slice(0, 180);
        const brand = clean(item.brands, 120);
        const quantity = clean(item.quantity, 80);
        const code = item.code as string;
        return {
          name,
          normalized_name: normalize([name, brand, quantity].filter(Boolean).join(" ")),
          brand,
          variant: quantity,
          unit: quantity,
          barcode: code,
          category: "Mercado",
          subcategory: item.categories_tags?.[0]?.replace(/^[a-z]{2}:/, "").slice(0, 100) || "Alimentos",
          source_provider: "open_food_facts",
          source_product_id: code,
          source_url: "https://world.openfoodfacts.org/product/" + encodeURIComponent(code),
          image_url: item.image_front_url?.startsWith("https://") ? item.image_front_url : null,
          description: "Metadados públicos do Open Food Facts. Não confirmam preço, disponibilidade ou estoque em lojas.",
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
      if (error) throw new Error("Open Food Facts product upsert failed: " + error.message);
      saved = data || [];
      imported += saved.length;
      aliasCount += await saveAliases(saved, "open_food_facts");
    }

    termResults.push({ term, found: externalProducts.length, imported: saved.length });
    if (index < OFF_SEARCHES.length - 1) await sleep(6500);
  }

  return { imported, aliases: aliasCount, searches: termResults };
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
  }>, "anvisa");
  return { products: data?.length || 0, aliases };
}

async function importAnvisa() {
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

  const today = new Date();
  const now = new Date().toISOString();
  let batch: Array<Record<string, unknown>> = [];
  let productsImported = 0;
  let aliasesImported = 0;
  let rowsProcessed = 0;

  const flush = async () => {
    if (!batch.length) return;
    const result = await flushAnvisaBatch(batch);
    productsImported += result.products;
    aliasesImported += result.aliases;
    batch = [];
  };

  for (const columns of iterator) {
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
    if (batch.length >= 350) await flush();
  }

  await flush();
  return { rowsProcessed, productsImported, aliasesImported, fileBytes: bytes.length };
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
    if (!["all", "open_food_facts", "anvisa"].includes(source)) {
      return Response.json({ error: "Invalid source. Use all, open_food_facts or anvisa." }, { status: 400 });
    }

    const startedAt = new Date().toISOString();
    const results: Record<string, unknown> = {};
    if (source === "all" || source === "open_food_facts") {
      results.open_food_facts = await importOpenFoodFacts();
    }
    if (source === "all" || source === "anvisa") {
      results.anvisa = await importAnvisa();
    }

    return Response.json({
      success: true,
      source,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      results,
      note: "Imported catalog metadata only. No store prices, availability or stock were created or verified.",
    });
  } catch (error) {
    console.error("[catalog-import] Import failed:", error instanceof Error ? error.message : String(error));
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
});
