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
  const streetQuery = firstPart.trim()
    .replace(/^av\.?\s+/i, "Avenida ")
    .replace(/^r\.?\s+/i, "Rua ")
    .replace(/^rod\.?\s+/i, "Rodovia ")
    .replace(/^al\.?\s+/i, "Alameda ")
    .replace(/^tv\.?\s+/i, "Travessa ")
    .replace(/^dep\.?\s+/i, "Deputado ")
    .replace(/^sen\.?\s+/i, "Senador ")
    .replace(/^des\.?\s+/i, "Desembargador ")
    .replace(/^dr\.?\s+/i, "Doutor ")
    .replace(/^dra\.?\s+/i, "Doutora ");
  const street = normalize(streetQuery);
  const number = address.match(/,\s*(\d{1,6}[a-z]?)(?:\s|$|-)/i)?.[1]?.toLowerCase() || null;
  const district = address.split("-").slice(1).join("-").trim();
  return { street, streetQuery, number, district };
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

function pickGoogle(
  results: Array<Record<string, unknown>>,
  store: StoreRow,
): GeoPoint | null {
  const { street, number } = addressParts(store.address);
  const candidates = results.map((result) => {
    const components = Array.isArray(result.address_components)
      ? result.address_components as Array<{ long_name?: string; short_name?: string; types?: string[] }>
      : [];
    const component = (type: string, short = false) => {
      const found = components.find((item) => item.types?.includes(type));
      return String(short ? found?.short_name || "" : found?.long_name || "");
    };
    const formatted = String(result.formatted_address || "");
    const route = normalize(component("route"));
    const streetMatches = (route.length > 3 && (route.includes(street) || street.includes(route)))
      || normalize(formatted).includes(street);
    const resultNumber = normalize(component("street_number"));
    const numberConflict = Boolean(number && resultNumber && number !== resultNumber);
    const numberMatches = Boolean(number && resultNumber && number === resultNumber);
    const city = component("locality") || component("postal_town")
      || component("administrative_area_level_2") || "";
    const state = component("administrative_area_level_1", true)
      || component("administrative_area_level_1") || "";
    const country = component("country", true) || component("country");
    const locationOk = locationMatches(store, city, state, country, formatted);
    const geometry = (result.geometry || {}) as Record<string, unknown>;
    const location = (geometry.location || {}) as Record<string, unknown>;
    const latitude = Number(location.lat);
    const longitude = Number(location.lng);
    const valid = isValidPoint(latitude, longitude) && streetMatches && !numberConflict && locationOk;
    const locationType = String(geometry.location_type || "");
    return {
      latitude,
      longitude,
      valid,
      score: (streetMatches ? 6 : 0) + (locationOk ? 4 : 0) + (numberMatches ? 8 : 0)
        + (locationType === "ROOFTOP" ? 3 : locationType === "RANGE_INTERPOLATED" ? 2 : 0),
      precision: numberMatches && locationType === "ROOFTOP" ? "address" as const : "street" as const,
    };
  }).filter((candidate) => candidate.valid).sort((a, b) => b.score - a.score);

  const chosen = candidates[0];
  return chosen ? {
    latitude: chosen.latitude,
    longitude: chosen.longitude,
    precision: chosen.precision,
    source: "Google Maps Geocoding API",
  } : null;
}

async function geocodeWithGoogle(store: StoreRow, apiKey: string): Promise<GeoPoint | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  const state = STATE_NAMES[normalize(store.state)] || store.state;
  url.searchParams.set("address", [store.address, store.city, state, "Brasil"].filter(Boolean).join(", "));
  url.searchParams.set("components", "country:BR");
  url.searchParams.set("region", "br");
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url, {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("Google Geocoding HTTP " + response.status);
  const payload = await response.json();
  if (payload.status === "ZERO_RESULTS") return null;
  if (payload.status !== "OK") {
    throw new Error("Google Geocoding: " + String(payload.status || "resposta inválida")
      + (payload.error_message ? " — " + String(payload.error_message) : ""));
  }
  return pickGoogle(Array.isArray(payload.results) ? payload.results : [], store);
}

async function fetchPhotonFeatures(url: URL, label: string) {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "ZORVI-Map/2.2 (geocodificacao de estabelecimentos)",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 180);
    throw new Error(label + " HTTP " + response.status + (detail ? ": " + detail : ""));
  }
  const payload = await response.json();
  return Array.isArray(payload.features) ? payload.features : [];
}

async function geocodeStore(store: StoreRow): Promise<GeoPoint | null> {
  const { streetQuery, number, district } = addressParts(store.address);
  const state = STATE_NAMES[normalize(store.state)] || store.state;
  const query = [store.address, store.city, state, "Brasil"].filter(Boolean).join(", ");
  const errors: string[] = [];

  // Google Maps is optional and runs only when its key is stored securely in Supabase.
  const googleKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (googleKey) {
    try {
      const googlePoint = await geocodeWithGoogle(store, googleKey);
      if (googlePoint) return googlePoint;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      errors.push("Google Maps: " + reason);
      console.warn("[geocode-stores] Google Maps não localizou o endereço; tentando OpenStreetMap.", {
        storeName: store.name,
        reason,
      });
    }
  }

  // Structured search is more precise for addresses that already include street and number.
  const structuredUrl = new URL("https://photon.komoot.io/structured");
  structuredUrl.searchParams.set("street", streetQuery);
  if (number) structuredUrl.searchParams.set("housenumber", number);
  if (district) structuredUrl.searchParams.set("district", district);
  structuredUrl.searchParams.set("city", store.city);
  structuredUrl.searchParams.set("state", state);
  structuredUrl.searchParams.set("countrycode", "br");
  structuredUrl.searchParams.set("limit", "8");
  structuredUrl.searchParams.set("lang", "pt");

  try {
    await wait(1100);
    const features = await fetchPhotonFeatures(structuredUrl, "Photon /structured");
    const point = pickPhoton(features, store);
    if (point) return point;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    errors.push(reason);
    console.warn("[geocode-stores] Photon estruturado falhou; tentando busca textual.", {
      storeName: store.name,
      reason,
    });
  }

  // Photon forward search uses /api (without a trailing slash); /api/ returned HTTP 400.
  const textUrl = new URL("https://photon.komoot.io/api");
  textUrl.searchParams.set("q", query);
  textUrl.searchParams.set("countrycode", "br");
  textUrl.searchParams.set("limit", "8");
  textUrl.searchParams.set("lang", "pt");

  try {
    await wait(1100);
    const features = await fetchPhotonFeatures(textUrl, "Photon /api");
    const point = pickPhoton(features, store);
    if (point) return point;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    errors.push(reason);
    console.warn("[geocode-stores] Photon textual falhou.", {
      storeName: store.name,
      reason,
    });
  }

  if (errors.length) throw new Error(errors.join("; "));
  return null;
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
