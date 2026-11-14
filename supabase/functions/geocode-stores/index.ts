import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type StoreRow = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
  geocode_attempted_at: string | null;
};

type GeoPoint = {
  latitude: number;
  longitude: number;
  precision: "address" | "street";
  source: string;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const STATE_NAMES: Record<string, string> = {
  ac: "acre", al: "alagoas", ap: "amapa", am: "amazonas", ba: "bahia",
  ce: "ceara", df: "distrito federal", es: "espirito santo", go: "goias",
  ma: "maranhao", mt: "mato grosso", ms: "mato grosso do sul", mg: "minas gerais",
  pa: "para", pb: "paraiba", pr: "parana", pe: "pernambuco", pi: "piaui",
  rj: "rio de janeiro", rn: "rio grande do norte", rs: "rio grande do sul",
  ro: "rondonia", rr: "roraima", sc: "santa catarina", sp: "sao paulo",
  se: "sergipe", to: "tocantins",
};

function getAdminKey(): string | null {
  const keysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keysJson) {
    try {
      const keys = JSON.parse(keysJson) as Record<string, string>;
      const key = keys.default || Object.values(keys).find((value) => typeof value === "string");
      if (key) return key;
    } catch (error) {
      console.error("[geocode-stores] Não foi possível interpretar SUPABASE_SECRET_KEYS.", error);
    }
  }
  return Deno.env.get("SUPABASE_SECRET_KEY")
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    || null;
}

function normalize(value: string): string {
  const expansions: Record<string, string> = {
    av: "avenida",
    ave: "avenida",
    dep: "deputado",
    sen: "senador",
    des: "desembargador",
    r: "rua",
    dr: "doutor",
    dra: "doutora",
    al: "alameda",
    tv: "travessa",
    rod: "rodovia",
  };
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => expansions[part] || part)
    .join(" ")
    .trim();
}

function normalizeState(value: string): string {
  const normalized = normalize(value);
  return STATE_NAMES[normalized] || normalized;
}

function addressParts(address: string) {
  const firstPart = address.split(",")[0] || address;
  const street = normalize(firstPart);
  const number = address.match(/,\s*(\d{1,6}[a-z]?)(?:\s|$|-)/i)?.[1]?.toLowerCase() || null;
  return { street, number };
}

function locationMatches(
  store: StoreRow,
  cityValue: string,
  stateValue: string,
  countryValue: string,
  displayValue: string,
): boolean {
  const city = normalize(store.city);
  const cityContext = normalize([cityValue, displayValue].filter(Boolean).join(" "));
  const cityMatches = Boolean(city) && cityContext.includes(city);

  const state = normalizeState(store.state);
  const resultState = normalizeState(stateValue);
  const stateContext = normalizeState(displayValue);
  const stateMatches = !resultState || resultState.includes(state) || state.includes(resultState)
    || stateContext.includes(state);

  const country = normalize(countryValue);
  const countryMatches = !country || country === "brasil" || country === "brazil";

  return cityMatches && stateMatches && countryMatches;
}

function isValidPoint(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

function pickNominatim(
  results: Array<Record<string, unknown>>,
  store: StoreRow,
): GeoPoint | null {
  const { street, number } = addressParts(store.address);
  const candidates = results.map((result) => {
    const address = (result.address || {}) as Record<string, unknown>;
    const display = String(result.display_name || "");
    const resultStreet = normalize(String(
      address.road || address.pedestrian || address.residential || address.footway
      || address.path || address.cycleway || "",
    ));
    const normalizedDisplay = normalize(display);
    const streetMatches = (resultStreet.length > 3
      && (resultStreet.includes(street) || street.includes(resultStreet)))
      || normalizedDisplay.includes(street);
    const resultNumber = normalize(String(address.house_number || ""));
    const numberConflict = Boolean(number && resultNumber && number !== resultNumber);
    const numberMatches = Boolean(number && resultNumber && number === resultNumber);
    const locationOk = locationMatches(
      store,
      String(address.city || address.municipality || address.town || address.village || address.county || ""),
      String(address.state || ""),
      String(address.country || ""),
      display,
    );
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    const valid = isValidPoint(latitude, longitude);
    return {
      latitude,
      longitude,
      valid: valid && streetMatches && !numberConflict && locationOk,
      score: (streetMatches ? 6 : 0) + (locationOk ? 4 : 0) + (numberMatches ? 8 : 0),
      precision: numberMatches ? "address" as const : "street" as const,
    };
  }).filter((candidate) => candidate.valid).sort((a, b) => b.score - a.score);

  const chosen = candidates[0];
  return chosen ? {
    latitude: chosen.latitude,
    longitude: chosen.longitude,
    precision: chosen.precision,
    source: "Nominatim / OpenStreetMap",
  } : null;
}

function pickPhoton(
  features: Array<{ geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> }>,
  store: StoreRow,
): GeoPoint | null {
  const { street, number } = addressParts(store.address);
  const candidates = features.map((feature) => {
    const properties = feature.properties || {};
    const display = String(properties.label || properties.name || "");
    const resultStreet = normalize(String(properties.street || properties.name || ""));
    const normalizedDisplay = normalize(display);
    const streetMatches = (resultStreet.length > 3
      && (resultStreet.includes(street) || street.includes(resultStreet)))
      || normalizedDisplay.includes(street);
    const resultNumber = normalize(String(properties.housenumber || ""));
    const numberConflict = Boolean(number && resultNumber && number !== resultNumber);
    const numberMatches = Boolean(number && resultNumber && number === resultNumber);
    const locationOk = locationMatches(
      store,
      String(properties.city || properties.locality || properties.municipality || properties.county || ""),
      String(properties.state || ""),
      String(properties.country || ""),
      display + " " + String(properties.city || "") + " " + String(properties.state || ""),
    );
    const coordinates = feature.geometry?.coordinates;
    const validCoordinates = Array.isArray(coordinates) && coordinates.length >= 2
      && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1]);
    const longitude = validCoordinates ? Number(coordinates![0]) : Number.NaN;
    const latitude = validCoordinates ? Number(coordinates![1]) : Number.NaN;
    const valid = validCoordinates && isValidPoint(latitude, longitude)
      && streetMatches && !numberConflict && locationOk;
    return {
      latitude,
      longitude,
      valid,
      score: (streetMatches ? 6 : 0) + (locationOk ? 4 : 0) + (numberMatches ? 8 : 0),
      precision: numberMatches ? "address" as const : "street" as const,
    };
  }).filter((candidate) => candidate.valid).sort((a, b) => b.score - a.score);

  const chosen = candidates[0];
  return chosen ? {
    latitude: chosen.latitude,
    longitude: chosen.longitude,
    precision: chosen.precision,
    source: "Photon / OpenStreetMap",
  } : null;
}

async function geocodeStore(store: StoreRow): Promise<GeoPoint | null> {
  const query = [store.address, store.city, store.state, "Brasil"].filter(Boolean).join(", ");
  const nominatimUrl = new URL("https://nominatim.openstreetmap.org/search");
  nominatimUrl.searchParams.set("format", "jsonv2");
  nominatimUrl.searchParams.set("q", query);
  nominatimUrl.searchParams.set("countrycodes", "br");
  nominatimUrl.searchParams.set("addressdetails", "1");
  nominatimUrl.searchParams.set("limit", "8");
  nominatimUrl.searchParams.set("accept-language", "pt-BR");

  // Nominatim's public service asks clients to stay at or below one request per second.
  await wait(1100);
  const nominatimResponse = await fetch(nominatimUrl, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "ZORVI/1.0 (https://github.com/joaosystemss/startup-em-movimento)",
      "Referer": "https://github.com/joaosystemss/startup-em-movimento",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!nominatimResponse.ok) {
    throw new Error("Nominatim respondeu HTTP " + nominatimResponse.status);
  }
  const nominatimPayload = await nominatimResponse.json();
  const nominatimPoint = pickNominatim(
    Array.isArray(nominatimPayload) ? nominatimPayload : [],
    store,
  );
  if (nominatimPoint) return nominatimPoint;

  // Photon is a second no-key OpenStreetMap geocoder when Nominatim has no street match.
  const photonUrl = new URL("https://photon.komoot.io/api/");
  photonUrl.searchParams.set("q", query);
  photonUrl.searchParams.set("limit", "8");
  photonUrl.searchParams.set("lang", "pt");
  const photonResponse = await fetch(photonUrl, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "ZORVI-Map/2.0 (geocodificacao de estabelecimentos)",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!photonResponse.ok) {
    throw new Error("Photon respondeu HTTP " + photonResponse.status);
  }
  const photonPayload = await photonResponse.json();
  return pickPhoton(photonPayload.features || [], store);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const adminKey = getAdminKey();
  if (!supabaseUrl || !adminKey) {
    console.error("[geocode-stores] SUPABASE_URL ou chave administrativa ausente.");
    return json({ error: "Configuração segura do Supabase não encontrada." }, 500);
  }

  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "");
  if (!accessToken || accessToken === authorization) {
    return json({ error: "Faça login para atualizar as localizações." }, 401);
  }

  const admin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
  if (authError || !authData.user) {
    console.warn("[geocode-stores] Chamada sem usuário autenticado.", authError?.message);
    return json({ error: "Sua sessão expirou. Entre novamente para localizar as lojas." }, 401);
  }

  const requestBody = await request.json().catch(() => ({}));
  const allowedCategories = ["Farmácia", "Mercado", "Restaurante", "Lojas", "Outros"];
  const category = typeof requestBody.category === "string"
    && allowedCategories.includes(requestBody.category)
    ? requestBody.category
    : null;

  const { data: catalogStores, error: queryError } = await admin
    .from("stores")
    .select("id,name,address,city,state,category,latitude,longitude,geocode_attempted_at,created_at")
    .order("created_at", { ascending: true })
    .limit(500);

  if (queryError) {
    console.error("[geocode-stores] Falha ao consultar public.stores.", {
      code: queryError.code,
      message: queryError.message,
      details: queryError.details,
      hint: queryError.hint,
    });
    return json({
      error: "Não foi possível consultar os estabelecimentos.",
      code: queryError.code || "STORE_QUERY_FAILED",
      details: queryError.message,
    }, 500);
  }

  const matchingStores = (catalogStores || []) as StoreRow[];
  const unresolvedStores = matchingStores.filter((store) =>
    (!category || store.category === category)
    && (store.latitude === null || store.longitude === null)
    && Boolean(store.address && store.city && store.state)
  );
  const retryBefore = Date.now() - 10 * 60 * 1000;
  const eligibleStores = unresolvedStores.filter((store) =>
    !store.geocode_attempted_at || new Date(store.geocode_attempted_at).getTime() < retryBefore
  );
  const batch = eligibleStores.slice(0, 5);

  if (batch.length === 0) {
    return json({
      processed: 0,
      updated: 0,
      notLocated: [],
      failed: [],
      remaining: 0,
      unresolved: unresolvedStores.length,
      message: unresolvedStores.length
        ? "Os endereços restantes aguardam uma nova tentativa de localização."
        : "Todos os estabelecimentos já possuem coordenadas ou não têm endereço suficiente.",
    });
  }

  let updated = 0;
  const notLocated: string[] = [];
  const failed: string[] = [];

  for (const store of batch) {
    try {
      const point = await geocodeStore(store);
      const now = new Date().toISOString();
      if (!point) {
        const { error: attemptError } = await admin.from("stores")
          .update({ geocode_attempted_at: now })
          .eq("id", store.id);
        if (attemptError) throw attemptError;
        notLocated.push(store.name);
        continue;
      }

      const { error: updateError } = await admin.from("stores").update({
        latitude: point.latitude,
        longitude: point.longitude,
        coordinate_precision: point.precision,
        coordinate_source: point.source,
        geocoded_at: now,
        geocode_attempted_at: now,
      }).eq("id", store.id);
      if (updateError) throw updateError;
      updated += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error("[geocode-stores] Falha ao localizar estabelecimento.", {
        storeId: store.id,
        storeName: store.name,
        reason,
      });
      const { error: attemptError } = await admin.from("stores")
        .update({ geocode_attempted_at: new Date().toISOString() })
        .eq("id", store.id);
      if (attemptError) console.error("[geocode-stores] Não foi possível registrar a tentativa.", attemptError);
      failed.push(store.name);
    }
  }

  const remaining = Math.max(0, eligibleStores.length - batch.length);
  const unresolved = Math.max(0, unresolvedStores.length - updated);
  console.info("[geocode-stores] Lote concluído.", {
    userId: authData.user.id,
    processed: batch.length,
    updated,
    notLocated: notLocated.length,
    failed: failed.length,
    remaining,
    unresolved,
  });

  return json({
    processed: batch.length,
    updated,
    notLocated,
    failed,
    remaining,
    unresolved,
    message: updated
      ? updated + " localização(ões) confirmada(s) e adicionada(s) ao mapa."
      : "Nenhuma coordenada confiável foi confirmada nesta rodada.",
  });
});
