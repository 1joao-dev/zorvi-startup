import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CITY = "Teresina";
const STATE = "PI";
const SOURCE_LABEL = "OpenStreetMap contributors · ODbL";
const ENDPOINTS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const KNOWN_BRANDS: Record<string, string[]> = {
  "Farmácia": [
    "Drogaria Globo","Pague Menos","Drogasil","Droga Raia","Extrafarma","Drogal",
    "Pop Farma","Farmácia Roval","Farmafórmula","Pharmapele","DrogaVET",
  ],
  "Mercado": [
    "Atacadão","Assaí","Mix Atacarejo","Mix Mateus","Mateus","Carvalho Super",
    "Carvalho Supermercados","Pão de Açúcar","Mercadão","Ferreira Supermercados",
    "Minha Quitandinha",
  ],
  "Restaurante": [
    "Coco Bambu","McDonald's","McDonalds","Burger King","Bob's","Subway","Giraffas",
    "Pizza Hut","Spoleto","Camarão & Cia","Favorito Comidas Típicas","Fogo Campeiro",
    "La Brasa Burger","China in Box","Divino Fogão","Croasonho","Oakberry",
    "Kopenhagen","Milky Moo","Mr. Cheney","Mr. Shake","Griletto","Gendai",
    "Ital'in House","Companhia do Churrasco","Cheirin Bão","Casa do Pão de Queijo",
    "Deltaexpresso","Go Coffee","Grão Espresso","Johnny Joy","Açaí Concept",
    "La Bolaria","Hermanito",
  ],
  "Lojas": [
    "Cacau Show","Óticas Diniz","Óticas Carol","Hering","Aramis","Arezzo","Democrata",
    "Di Santinni","Levi's","Lupo","Morana","Natura","Mahogany","Imaginarium",
    "Petland","Petz","World Tennis","Track & Field","Schutz","Osklen","Reserva",
    "Puket","Milon","Bibi","Anacapri","Constance","Mundo Verde","Centauro",
    "Riachuelo","Renner","C&A","Americanas","Magazine Luiza","Casas Bahia",
    "Lojas Avenida","Le Biscuit","Realme","Phone Store","Kings Sneakers",
    "Livraria Nobel","Mercadão dos Óculos","Sergio's","HOPE","Morena Rosa",
    "Lez a Lez","LIVE!","Dress To","Ophicina","Sonho dos Pés","Container Baby & Kids",
    "Anjos Colchões e Sofás","Conserta Smart","Muniz Auto Center",
  ],
  "Outros": [
    "Coife Odonto","Dentebras","OdontoCompany","Oral Sin","OrthoDontic","Sorridents",
    "Sorrifácil","Sabin","Bioanálise","Med Imagem","Unimed","Neoclínica",
    "Hospital São Marcos","Hospital Primavera","Hospital Unimed","Hospital Santa Maria",
    "Hospital de Olhos","Teresina Shopping","Shopping Rio Poty","Riverside Shopping",
    "Shopping da Cidade","Selfit","SkyFit","Smart Fit","Engenharia do Corpo",
    "Maple Bear","Wizard","Cultura Inglesa","Yázigi","Grau Técnico",
    "Instituto Embelleze","Instituto Mix","Instituto Trata","Instituto Visão Solidária",
    "Lavanderia 60 Minutos","5àsec","Lavô","Lavateria","Lavblue","Jadlog","RE/MAX",
    "Mestre da Obra","Truly Nolen","Royal Face","Espaçolaser","Depyl Action",
    "Sobrancelhas Design","Studio Velocity","VOLL Pilates","Petland","Petz",
    "Banco do Brasil","Caixa Econômica Federal","Bradesco","Santander","Itaú",
    "Banco do Nordeste","Shell","Ipiranga","Petrobras","Acuidar","Botoclinic",
    "Face Doctor","Emagrecentro","Turquesa Beleza","Visão Total","Wise Up",
    "Prepara IA","LocarX","LocExpress",
  ],
};

function isKnownEstablishment(row: {
  name: string;
  brand_name: string | null;
  category: string;
  osm_tags?: Record<string, string>;
}): boolean {
  const allowed = KNOWN_BRANDS[row.category] || [];
  const candidates = [
    row.name,
    row.brand_name,
    row.osm_tags?.brand,
    row.osm_tags?.operator,
    row.osm_tags?.network,
  ].map(normalize).filter(Boolean);

  return allowed.some((brand) => {
    const term = normalize(brand);
    if (term.length < 3) return false;
    return candidates.some((candidate) =>
      candidate === term || candidate.includes(term)
    );
  });
}


const KNOWN_BRAND_PATTERN = [...new Set(Object.values(KNOWN_BRANDS).flat())]
  .map((brand) => brand.replace(/\./g, "\\." ))
  .join("|");

const OVERPASS_QUERY = [
  '[out:json][timeout:45];',
  'area["name"="Teresina"]["boundary"="administrative"]["admin_level"~"^(7|8)$"]->.city;',
  '(',
  'nwr["name"~"(?i)(' + KNOWN_BRAND_PATTERN + ')"](area.city);',
  'nwr["brand"~"(?i)(' + KNOWN_BRAND_PATTERN + ')"](area.city);',
  'nwr["operator"~"(?i)(' + KNOWN_BRAND_PATTERN + ')"](area.city);',
  ');',
  'out center tags qt;',
].join("\\n");

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type StoreRow = {
  id: string;
  name: string;
  brand_name: string | null;
  category: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  coordinate_source: string | null;
  osm_type: string | null;
  osm_id: number | null;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const clean = (value: unknown, max = 180): string | null => {
  const result = String(value ?? "").trim();
  return result ? result.slice(0, max) : null;
};

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const slugify = (value: string) => normalize(value).replace(/\s+/g, "-").slice(0, 80);

function getAdminKey(): string | null {
  const keysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keysJson) {
    try {
      const keys = JSON.parse(keysJson) as Record<string, string>;
      const key = keys.default || Object.values(keys).find((value) => typeof value === "string");
      if (key) return key;
    } catch (error) {
      console.error("[osm-store-discovery] Não foi possível interpretar SUPABASE_SECRET_KEYS.", error);
    }
  }
  return Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || null;
}

async function authorized(request: Request, admin: ReturnType<typeof createClient>): Promise<boolean> {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token || token === authorization || token.length < 32) return false;
  const { data, error } = await admin.rpc("verify_catalog_import_token", { candidate: token });
  if (error) {
    console.error("[osm-store-discovery] Falha ao validar token de importação.", error.message);
    return false;
  }
  return data === true;
}

async function fetchOverpass(): Promise<{ elements: OsmElement[]; endpoint: string }> {
  const errors: string[] = [];
  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "Accept": "*/*",
          "User-Agent": "ZORVI/1.0 (Teresina establishment directory; https://github.com/joaosystemss/startup-em-movimento)",
        },
        body: "data=" + encodeURIComponent(OVERPASS_QUERY),
        signal: AbortSignal.timeout(50000),
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 220);
        errors.push(endpoint + " HTTP " + response.status + (detail ? ": " + detail : ""));
        if (![406, 429, 500, 502, 503, 504].includes(response.status)) break;
        await new Promise((resolve) => setTimeout(resolve, 2500));
        continue;
      }
      const payload = await response.json() as { elements?: OsmElement[]; remark?: string };
      if (payload.remark) throw new Error(payload.remark.slice(0, 300));
      const elements = Array.isArray(payload.elements) ? payload.elements : [];
      if (!elements.length) {
        errors.push(endpoint + " não retornou POIs; confira a relação administrativa de Teresina no OpenStreetMap.");
        continue;
      }
      return { elements, endpoint };
    } catch (error) {
      errors.push(endpoint + ": " + (error instanceof Error ? error.message : String(error)));
    }
  }
  throw new Error("Não foi possível consultar o OpenStreetMap. " + errors.join(" | "));
}

function getCategory(tags: Record<string, string>): string | null {
  const shop = normalize(tags.shop);
  const amenity = normalize(tags.amenity);
  const healthcare = normalize(tags.healthcare);
  if (shop === "mall") return "Outros";
  if (amenity === "pharmacy" || healthcare === "pharmacy" || shop === "chemist") return "Farmácia";
  if (["supermarket","convenience","grocery","greengrocer","wholesale","butcher","bakery","deli","food","beverages","frozen food","seafood","confectionery","alcohol","farm"].includes(shop)
    || amenity === "marketplace") return "Mercado";
  if (["restaurant","cafe","fast food","food court","bar","pub","ice cream","biergarten"].includes(amenity)) return "Restaurante";
  if (shop && !["vacant","no","closed"].includes(shop)) return "Lojas";
  if (tags.office || tags.craft || tags.healthcare || amenity || tags.tourism || tags.leisure) return "Outros";
  return null;
}

function validWebsite(value: unknown): string | null {
  const raw = clean(value, 500);
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function toStore(element: OsmElement, now: string) {
  const tags = element.tags || {};
  const name = clean(tags.name || tags.brand || tags.operator);
  const category = getCategory(tags);
  const latitude = Number(element.lat ?? element.center?.lat);
  const longitude = Number(element.lon ?? element.center?.lon);
  if (!name || !category || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const street = clean(tags["addr:street"] || tags["addr:place"], 180);
  const number = clean(tags["addr:housenumber"], 30);
  const neighborhood = clean(tags["addr:suburb"] || tags["addr:neighbourhood"] || tags["addr:quarter"], 100);
  const postalCode = clean(tags["addr:postcode"], 20);
  const streetLine = street ? [street, number].filter(Boolean).join(", ") : null;
  const address = streetLine
    ? [streetLine, neighborhood, CITY + " - " + STATE].filter(Boolean).join(" - ")
    : neighborhood
      ? "Bairro " + neighborhood + ", " + CITY + " - " + STATE
      : "Endereço não informado, " + CITY + " - " + STATE;

  const brand = clean(tags.brand || tags.operator, 120);
  const website = validWebsite(tags.website || tags["contact:website"] || tags.url);
  const allowedTags: Record<string, string> = {};
  for (const key of [
    "name","brand","operator","shop","amenity","office","craft","healthcare","tourism","leisure",
    "addr:street","addr:housenumber","addr:suburb","addr:neighbourhood","addr:postcode","website","network",
  ]) {
    if (tags[key]) allowedTags[key] = String(tags[key]).slice(0, 180);
  }

  return {
    osm_type: element.type,
    osm_id: Number(element.id),
    name,
    category,
    address,
    city: CITY,
    state: STATE,
    postal_code: postalCode,
    latitude,
    longitude,
    website_url: website,
    brand_name: brand,
    brand_slug: brand ? slugify(brand) : null,
    verification_status: "verified",
    source_url: "https://www.openstreetmap.org/" + element.type + "/" + element.id,
    source_label: SOURCE_LABEL,
    coordinate_precision: "poi",
    coordinate_source: "OpenStreetMap",
    geocoded_at: now,
    osm_last_seen_at: now,
    osm_tags: allowedTags,
    map_visibility: true,
  };
}

function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function namesMatch(existing: StoreRow, incoming: ReturnType<typeof toStore>): boolean {
  if (!incoming) return false;
  const oldNames = [existing.name, existing.brand_name].map(normalize).filter((v) => v.length >= 4);
  const newNames = [incoming.name, incoming.brand_name].map(normalize).filter((v) => v.length >= 4);
  return oldNames.some((oldName) => newNames.some((newName) =>
    oldName === newName || oldName.includes(newName) || newName.includes(oldName)
  ));
}

function addressMatch(oldAddress: string, newAddress: string): boolean {
  const oldValue = normalize(oldAddress);
  const newValue = normalize(newAddress);
  return oldValue.length > 8 && newValue.length > 8
    && (oldValue.includes(newValue) || newValue.includes(oldValue));
}

async function loadExisting(admin: ReturnType<typeof createClient>): Promise<StoreRow[]> {
  const all: StoreRow[] = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const { data, error } = await admin.from("stores")
      .select("id,name,brand_name,category,address,latitude,longitude,coordinate_source,osm_type,osm_id")
      .eq("city", CITY).eq("state", STATE)
      .order("id", { ascending: true })
      .range(offset, offset + 499);
    if (error) throw new Error("Falha ao consultar lojas já cadastradas: " + error.message);
    const page = (data || []) as StoreRow[];
    all.push(...page);
    if (page.length < 500) break;
  }
  return all;
}

async function main(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const adminKey = getAdminKey();
  if (!supabaseUrl || !adminKey) return json({ error: "Configuração segura do Supabase não encontrada." }, 500);

  const admin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (!await authorized(request, admin)) return json({ error: "Token administrativo inválido." }, 401);

  const body = await request.json().catch(() => ({}));
  const action = body?.action === "sync" ? "sync" : "preview";
  const now = new Date().toISOString();

  try {
    const { elements, endpoint } = await fetchOverpass();
    const namedCandidates = elements
      .map((element) => toStore(element, now))
      .filter((row): row is NonNullable<ReturnType<typeof toStore>> => row !== null);
    const mapped = namedCandidates.filter(isKnownEstablishment);
    const unique = new Map<string, typeof mapped[number]>();
    for (const row of mapped) unique.set(row.osm_type + ":" + row.osm_id, row);
    const rows = [...unique.values()];
    const byCategory = rows.reduce((acc, row) => {
      acc[row.category] = (acc[row.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    if (action === "preview") {
      return json({
        action,
        city: CITY,
        state: STATE,
        endpoint,
        rawElements: elements.length,
        namedCandidates: namedCandidates.length,
        excludedUnrecognized: namedCandidates.length - rows.length,
        namedEstablishments: rows.length,
        byCategory,
        sample: rows.slice(0, 18).map((row) => ({
          name: row.name, category: row.category, address: row.address,
          latitude: row.latitude, longitude: row.longitude, source_url: row.source_url,
        })),
        attribution: "© OpenStreetMap contributors · ODbL",
        message: "Prévia apenas; nenhum estabelecimento foi gravado.",
      });
    }

    const existing = await loadExisting(admin);
    const byOsmId = new Map(existing.filter((row) => row.osm_type && row.osm_id)
      .map((row) => [row.osm_type + ":" + row.osm_id, row]));
    const linkedExistingIds = new Set<string>();
    const toInsert: typeof rows = [];
    let linked = 0;
    let skipped = 0;
    let enrichedCoordinates = 0;

    for (const row of rows) {
      const key = row.osm_type + ":" + row.osm_id;
      const alreadyLinked = byOsmId.get(key);
      if (alreadyLinked) {
        const patch: Record<string, unknown> = {
          osm_last_seen_at: now,
          osm_tags: row.osm_tags,
          map_visibility: true,
        };
        if ((alreadyLinked.latitude === null || alreadyLinked.longitude === null)
          && alreadyLinked.coordinate_source !== "online_catalog") {
          patch.latitude = row.latitude;
          patch.longitude = row.longitude;
          patch.coordinate_precision = "poi";
          patch.coordinate_source = "OpenStreetMap";
          patch.geocoded_at = now;
          enrichedCoordinates += 1;
        }
        const { error } = await admin.from("stores").update(patch).eq("id", alreadyLinked.id);
        if (error) throw new Error("Falha ao atualizar POI OSM " + key + ": " + error.message);
        linkedExistingIds.add(alreadyLinked.id);
        linked += 1;
        continue;
      }

      const match = existing.find((candidate) => {
        if (linkedExistingIds.has(candidate.id) || candidate.coordinate_source === "online_catalog") return false;
        if (!namesMatch(candidate, row)) return false;
        if (candidate.latitude !== null && candidate.longitude !== null) {
          const distance = distanceMeters(candidate.latitude, candidate.longitude, row.latitude, row.longitude);
          return distance <= 70 || (distance <= 140 && addressMatch(candidate.address, row.address));
        }
        return addressMatch(candidate.address, row.address);
      });

      if (match) {
        const patch: Record<string, unknown> = {
          osm_type: row.osm_type,
          osm_id: row.osm_id,
          osm_last_seen_at: now,
          osm_tags: row.osm_tags,
          map_visibility: true,
        };
        if ((match.latitude === null || match.longitude === null) && match.coordinate_source !== "online_catalog") {
          patch.latitude = row.latitude;
          patch.longitude = row.longitude;
          patch.coordinate_precision = "poi";
          patch.coordinate_source = "OpenStreetMap";
          patch.geocoded_at = now;
          enrichedCoordinates += 1;
        }
        const { error } = await admin.from("stores").update(patch).eq("id", match.id);
        if (error) throw new Error("Falha ao vincular estabelecimento existente: " + error.message);
        linkedExistingIds.add(match.id);
        byOsmId.set(key, { ...match, osm_type: row.osm_type, osm_id: row.osm_id });
        linked += 1;
      } else {
        toInsert.push(row);
      }
    }

    let inserted = 0;
    let failed = 0;
    const errors: string[] = [];
    for (let offset = 0; offset < toInsert.length; offset += 150) {
      const batch = toInsert.slice(offset, offset + 150);
      const { data, error } = await admin.from("stores").upsert(batch, {
        onConflict: "osm_type,osm_id",
        ignoreDuplicates: false,
      }).select("id");
      if (error) {
        for (const row of batch) {
          const { error: rowError } = await admin.from("stores").upsert(row, {
            onConflict: "osm_type,osm_id",
            ignoreDuplicates: false,
          });
          if (rowError) {
            failed += 1;
            if (errors.length < 12) errors.push(row.name + ": " + rowError.message);
          } else inserted += 1;
        }
      } else {
        inserted += (data || []).length;
      }
    }

    return json({
      action,
      city: CITY,
      state: STATE,
      endpoint,
      rawElements: elements.length,
      discovered: rows.length,
      byCategory,
      inserted,
      linked,
      enrichedCoordinates,
      skipped,
      failed,
      errors,
      totalInDatabaseBeforeImport: existing.length,
      attribution: "© OpenStreetMap contributors · ODbL",
      message: "Importação concluída. Os registros existentes e suas coordenadas confiáveis foram preservados.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[osm-store-discovery] Falha na descoberta/importação.", message);
    return json({ error: message, city: CITY, state: STATE }, 502);
  }
}

Deno.serve(main);
