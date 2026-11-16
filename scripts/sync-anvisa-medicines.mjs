import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no terminal. Nunca coloque a chave no frontend ou no Git.");
  process.exit(1);
}

const SOURCE_URL = "https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const normalize = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

function parseCsvRows(text, delimiter) {
  const rows = [];
  let row = [];
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
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  return rows;
}

function parseDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function findColumn(headers, candidates) {
  const normalized = new Set(candidates.map(normalize));
  return headers.findIndex((header) => normalized.has(normalize(header)));
}

async function flushBatch(batch) {
  if (!batch.length) return 0;
  const { data: saved, error } = await supabase
    .from("products")
    .upsert(batch, { onConflict: "source_provider,source_product_id" })
    .select("id,name,brand,variant,source_product_id");
  if (error) throw error;

  const aliasMap = new Map();
  for (const product of saved || []) {
    const candidates = [
      product.name,
      product.brand,
      product.variant,
      [product.name, product.variant].filter(Boolean).join(" "),
    ];
    for (const alias of candidates) {
      if (!alias) continue;
      const normalizedAlias = normalize(alias);
      if (normalizedAlias) aliasMap.set(product.id + ":" + normalizedAlias, {
        product_id: product.id,
        alias: alias.slice(0, 160),
        normalized_alias: normalizedAlias,
        source_provider: "anvisa",
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
  return saved?.length || 0;
}

console.log("Baixando a base oficial de medicamentos da ANVISA...");
const response = await fetch(SOURCE_URL, { headers: { "User-Agent": "ZORVI catalog importer/1.0" } });
if (!response.ok) throw new Error("ANVISA respondeu HTTP " + response.status);
const bytes = new Uint8Array(await response.arrayBuffer());

let csv;
try {
  csv = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
} catch {
  csv = new TextDecoder("windows-1252").decode(bytes);
}

const firstLine = csv.slice(0, csv.indexOf("\n") >= 0 ? csv.indexOf("\n") : 5000);
const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : ",";
const iterator = parseCsvRows(csv, delimiter)[Symbol.iterator]();
const first = iterator.next();
if (first.done) throw new Error("O arquivo da ANVISA veio vazio.");

const headers = first.value.map((header) => header.replace(/^\uFEFF/, "").trim());
const nameIndex = findColumn(headers, ["Nome Produto", "NOME_PRODUTO", "NO_PRODUTO", "Nome do Produto"]);
const activeIndex = findColumn(headers, ["Princípio Ativo", "PRINCIPIO_ATIVO", "NO_PRINCIPIO_ATIVO", "DS_PRINCIPIO_ATIVO"]);
const registrationIndex = findColumn(headers, ["Número Registro Produto", "Número de Registro do Produto", "NUMERO_REGISTRO_PRODUTO", "NUMERO_REGISTRO", "Registro"]);
const companyIndex = findColumn(headers, ["Empresa Detentora Registro", "EMPRESA_DETENTORA_REGISTRO", "DETENTORA_REGISTRO", "Razão Social", "RAZAO_SOCIAL", "Nome Empresa", "NOME_EMPRESA"]);
const categoryIndex = findColumn(headers, ["Categoria Regulatória", "CATEGORIA_REGULATORIA"]);
const therapeuticIndex = findColumn(headers, ["Classe Terapêutica", "CLASSE_TERAPEUTICA"]);
const expiryIndex = findColumn(headers, ["Data Vencimento Registro", "Data de Vencimento do Registro", "DATA_VENCIMENTO_REGISTRO"]);

if (nameIndex < 0) {
  throw new Error("Não reconheci a coluna do nome do medicamento. Cabeçalhos recebidos: " + headers.join(" | "));
}

const today = new Date();
let batch = [];
let total = 0;
let processed = 0;

for (const columns of iterator) {
  const get = (index) => index >= 0 ? String(columns[index] || "").trim() : "";
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
    source_url: SOURCE_URL,
    description: [
      registration ? "Registro ANVISA: " + registration : "",
      active ? "Princípio ativo: " + active : "",
      regulatoryCategory ? "Categoria regulatória: " + regulatoryCategory : "",
      therapeuticClass ? "Classe terapêutica: " + therapeuticClass : "",
    ].filter(Boolean).join(" · ").slice(0, 800),
    country_code: "BR",
    source_updated_at: new Date().toISOString(),
    is_active: !expiry || expiry >= today,
  });

  if (batch.length >= 400) {
    total += await flushBatch(batch);
    processed += batch.length;
    batch = [];
    console.log("Registros processados:", processed);
  }
}

if (batch.length) {
  total += await flushBatch(batch);
  processed += batch.length;
}

console.log("Importação ANVISA concluída. Linhas processadas:", processed, "produtos inseridos/atualizados:", total);
