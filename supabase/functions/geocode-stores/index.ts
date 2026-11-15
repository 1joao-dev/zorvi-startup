import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type StoreRow = {
  id: string;
  name: string;
  brand_name: string | null;
  address: string;
  city: string;
  state: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
  geocode_attempted_at: string | null;
  google_checked_at: string | null;
};

type GeoPoint = {
  latitude: number;
  longitude: number;
  precision: "address" | "street";
  source: string;
};

type GooglePlaceRecord = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
};

type GoogleVerificationResult = {
  status: "verified" | "needs_review" | "not_found";
  placeId?: string;
  reason?: string;
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


function googleComponent(
  components: Array<{ longText?: string; shortText?: string; types?: string[] }>,
  type: string,
  short = false,
): string {
  const found = components.find((item) => item.types?.includes(type));
  return String(short ? found?.shortText || found?.longText || "" : found?.longText || found?.shortText || "");
}

function googlePlaceScore(place: GooglePlaceRecord, store: StoreRow) {
  const components = Array.isArray(place.addressComponents) ? place.addressComponents : [];
  const displayName = normalize(String(place.displayName?.text || ""));
  const formattedAddress = String(place.formattedAddress || "");
  const normalizedAddress = normalize(formattedAddress);
  const { street, number } = addressParts(store.address);

  const expectedNames = [
    store.brand_name,
    store.name.split(/\s[-–—]\s/)[0],
    store.name.split(",")[0],
  ].filter((value): value is string => Boolean(value)).map(normalize).filter((value) => value.length >= 3);
  const nameMatches = expectedNames.some((expected) =>
    displayName === expected || displayName.includes(expected) || expected.includes(displayName)
  );

  const route = normalize(googleComponent(components, "route"));
  const streetMatches = Boolean(street) && (
    (route.length > 3 && (route.includes(street) || street.includes(route)))
    || normalizedAddress.includes(street)
  );

  const resultNumber = normalize(googleComponent(components, "street_number"))
    || normalize(formattedAddress.match(/(?:^|,\s*)(\d{1,6}[a-z]?)(?:\b|,|\s|-)/i)?.[1] || "");
  const numberConflict = Boolean(number && resultNumber && number !== resultNumber);

  const city = googleComponent(components, "locality")
    || googleComponent(components, "postal_town")
    || googleComponent(components, "administrative_area_level_2")
    || googleComponent(components, "sublocality_level_1");
  const state = googleComponent(components, "administrative_area_level_1", true)
    || googleComponent(components, "administrative_area_level_1");
  const country = googleComponent(components, "country", true)
    || googleComponent(components, "country");

  const cityMatches = normalize(city) === normalize(store.city)
    || normalizedAddress.includes(normalize(store.city));
  const expectedState = normalizeState(store.state);
  const stateMatches = normalizeState(state) === expectedState
    || normalizeState(formattedAddress).includes(expectedState);
  const normalizedCountry = normalize(country);
  const countryMatches = !normalizedCountry
    || normalizedCountry === "br"
    || normalizedCountry === "brasil"
    || normalizedCountry === "brazil";

  const score = (nameMatches ? 35 : 0)
    + (streetMatches ? 35 : 0)
    + (number && !resultNumber ? 10 : number && resultNumber === number ? 20 : 0)
    + (cityMatches ? 5 : 0)
    + (stateMatches ? 3 : 0)
    + (countryMatches ? 2 : 0);

  const valid = nameMatches && streetMatches && cityMatches && stateMatches
    && countryMatches && !numberConflict && Boolean(place.id);

  return {
    valid,
    score,
    placeId: String(place.id || ""),
  };
}
async function searchGooglePlace(store: StoreRow, apiKey: string): Promise<GooglePlaceRecord[]> {
  const state = STATE_NAMES[normalize(store.state)] || store.state;
  const businessName = store.brand_name || store.name.split(/\s[-–—]\s/)[0] || store.name;
  const textQuery = [businessName, store.address, store.city, state, "Brasil"].filter(Boolean).join(", ");
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.addressComponents",
    },
    body: JSON.stringify({
      textQuery,
      languageCode: "pt-BR",
      regionCode: "BR",
      pageSize: 10,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 240);
    throw new Error("Google Places HTTP " + response.status + (detail ? ": " + detail : ""));
  }
  const payload = await response.json() as { places?: GooglePlaceRecord[] };
  return Array.isArray(payload.places) ? payload.places : [];
}

async function verifyStoreWithGoogle(store: StoreRow, apiKey: string): Promise<GoogleVerificationResult> {
  const places = await searchGooglePlace(store, apiKey);
  const candidates = places
    .map((place) => ({ place, match: googlePlaceScore(place, store) }))
    .filter((item) => item.match.valid && item.match.placeId)
    .sort((a, b) => b.match.score - a.match.score);

  if (!candidates.length) {
    return { status: "not_found", reason: "O Google Places não encontrou uma unidade com nome e endereço compatíveis." };
  }

  const best = candidates[0];
  const second = candidates[1];
  if (second && second.match.placeId !== best.match.placeId && best.match.score - second.match.score < 5) {
    return {
      status: "needs_review",
      reason: "Mais de uma unidade corresponde ao nome e endereço; é necessária uma revisão manual.",
    };
  }
  if (best.match.score < 80) {
    return {
      status: "needs_review",
      reason: "A correspondência do Google não atingiu a confiança mínima.",
    };
  }

  // Google Place IDs are exempt from Google's caching restrictions.
  // Coordinates and other Places content are deliberately not persisted or used on the MapLibre map.
  return { status: "verified", placeId: best.match.placeId };
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

  // The ZORVI map uses MapLibre/OpenStreetMap, so its marker coordinates must come from
  // OSM or manual verification. Google Places is used only to save an exempt place ID.
  const structuredUrl = new URL("https://photon.komoot.io/structured");
  structuredUrl.searchParams.set("street", streetQuery);
  if (number) structuredUrl.searchParams.set("housenumber", number);
  if (district) structuredUrl.searchParams.set("district", district);
  structuredUrl.searchParams.set("city", store.city);
  structuredUrl.searchParams.set("state", state);
  structuredUrl.searchParams.set("countrycode", "br");
  structuredUrl.searchParams.set("limit", "8");

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

  const textUrl = new URL("https://photon.komoot.io/api");
  textUrl.searchParams.set("q", query);
  textUrl.searchParams.set("countrycode", "br");
  textUrl.searchParams.set("limit", "8");

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
  const mode = requestBody.mode === "verify" ? "verify" : "missing";
  const googleKey = Deno.env.get("GOOGLE_MAPS_API_KEY");

  if (mode === "verify" && !googleKey) {
    return json({
      error: "A chave GOOGLE_MAPS_API_KEY ainda não foi configurada nos Secrets do Supabase.",
      code: "GOOGLE_MAPS_API_KEY_MISSING",
    }, 503);
  }

  const queryResult = mode === "verify"
    ? await admin.from("stores")
      .select("id,name,brand_name,address,city,state,category,latitude,longitude,geocode_attempted_at,google_checked_at,created_at")
      .eq("verification_status", "verified")
      .order("created_at", { ascending: true })
      .limit(500)
    : await admin.from("stores")
      .select("id,name,brand_name,address,city,state,category,latitude,longitude,geocode_attempted_at,google_checked_at,created_at")
      .order("created_at", { ascending: true })
      .limit(500);
  const { data: catalogStores, error: queryError } = queryResult;

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
    && Boolean(store.address && store.city && store.state)
    && (mode === "verify" || store.latitude === null || store.longitude === null)
  );
  const retryBefore = Date.now() - (mode === "verify" ? 30 * 24 * 60 * 60 * 1000 : 10 * 60 * 1000);
  const eligibleStores = unresolvedStores.filter((store) =>
    mode === "verify"
      ? !store.google_checked_at || new Date(store.google_checked_at).getTime() < retryBefore
      : !store.geocode_attempted_at || new Date(store.geocode_attempted_at).getTime() < retryBefore
  );
  const batch = eligibleStores.slice(0, 5);

  if (batch.length === 0) {
    return json({
      mode,
      processed: 0,
      updated: 0,
      verified: 0,
      reviewRequired: [],
      notFound: [],
      notLocated: [],
      failed: [],
      remaining: 0,
      unresolved: unresolvedStores.length,
      googleConfigured: Boolean(googleKey),
      message: mode === "verify"
        ? "Todos os estabelecimentos elegíveis já foram conferidos recentemente."
        : unresolvedStores.length
          ? "Os endereços restantes aguardam uma nova tentativa de localização."
          : "Todos os estabelecimentos já possuem coordenadas ou não têm endereço suficiente.",
    });
  }

  let updated = 0;
  let verified = 0;
  const reviewRequired: string[] = [];
  const notFound: string[] = [];
  const notLocated: string[] = [];
  const failed: string[] = [];

  for (const store of batch) {
    const now = new Date().toISOString();
    try {
      if (mode === "verify") {
        const result = await verifyStoreWithGoogle(store, googleKey as string);
        if (result.status === "verified" && result.placeId) {
          const { error: updateError } = await admin.from("stores").update({
            google_place_id: result.placeId,
            google_match_status: "verified",
            google_checked_at: now,
            google_verified_at: now,
          }).eq("id", store.id);
          if (updateError) throw updateError;
          updated += 1;
          verified += 1;
        } else {
          const { error: statusError } = await admin.from("stores").update({
            google_match_status: result.status,
            google_checked_at: now,
          }).eq("id", store.id);
          if (statusError) throw statusError;
          if (result.status === "needs_review") reviewRequired.push(store.name);
          else notFound.push(store.name);
          console.info("[geocode-stores] Revisão Google sem alteração das coordenadas atuais.", {
            storeName: store.name,
            status: result.status,
            reason: result.reason,
          });
        }
        continue;
      }

      const point = await geocodeStore(store);
      if (!point) {
        const { error: attemptError } = await admin.from("stores")
          .update({ geocode_attempted_at: now })
          .eq("id", store.id);
        if (attemptError) throw attemptError;
        notLocated.push(store.name);
        continue;
      }

      const updatePayload: Record<string, unknown> = {
        latitude: point.latitude,
        longitude: point.longitude,
        coordinate_precision: point.precision,
        coordinate_source: point.source,
        geocoded_at: now,
        geocode_attempted_at: now,
      };
      const { error: updateError } = await admin.from("stores").update(updatePayload).eq("id", store.id);
      if (updateError) throw updateError;
      updated += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error("[geocode-stores] Falha ao localizar/verificar estabelecimento.", {
        storeId: store.id,
        storeName: store.name,
        mode,
        reason,
      });
      const attemptPayload = mode === "verify"
        ? { google_match_status: "api_error", google_checked_at: now }
        : { geocode_attempted_at: now };
      const { error: attemptError } = await admin.from("stores").update(attemptPayload).eq("id", store.id);
      if (attemptError) console.error("[geocode-stores] Não foi possível registrar a tentativa.", attemptError);
      failed.push(store.name);
    }
  }

  const remaining = Math.max(0, eligibleStores.length - batch.length);
  const unresolved = Math.max(0, unresolvedStores.length - updated);
  console.info("[geocode-stores] Lote concluído.", {
    userId: authData.user.id,
    mode,
    processed: batch.length,
    updated,
    verified,
    reviewRequired: reviewRequired.length,
    notFound: notFound.length,
    notLocated: notLocated.length,
    failed: failed.length,
    remaining,
    unresolved,
  });

  return json({
    mode,
    processed: batch.length,
    updated,
    verified,
    reviewRequired,
    notFound,
    notLocated,
    failed,
    remaining,
    unresolved,
    googleConfigured: Boolean(googleKey),
    message: mode === "verify"
      ? verified + " estabelecimento(s) confirmado(s) pelo Google; "
        + reviewRequired.length + " para revisão; " + notFound.length + " sem correspondência."
      : updated
        ? updated + " localização(ões) confirmada(s) e adicionada(s) ao mapa."
        : "Nenhuma coordenada confiável foi confirmada nesta rodada.",
  });
});
