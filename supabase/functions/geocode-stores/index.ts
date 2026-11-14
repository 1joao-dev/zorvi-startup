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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

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
    dep: "deputado",
    sen: "senador",
    des: "desembargador",
    r: "rua",
    dr: "doutor",
    dra: "doutora",
    al: "alameda",
    tv: "travessa",
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

function addressParts(address: string) {
  const firstPart = address.split(",")[0] || address;
  const street = normalize(firstPart);
  const number = address.match(/,\s*(\d{1,5}[a-z]?)(?:\s|$|-)/i)?.[1]?.toLowerCase() || null;
  return { street, number };
}

function pickFeature(
  features: Array<{ geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> }>,
  address: string,
) {
  const { street, number } = addressParts(address);
  const candidates = features.map((feature) => {
    const properties = feature.properties || {};
    const resultStreet = normalize(String(properties.street || properties.name || ""));
    const city = normalize(String(properties.city || properties.locality || properties.county || ""));
    const country = normalize(String(properties.country || ""));
    const state = normalize(String(properties.state || ""));
    const resultNumber = String(properties.housenumber || "").toLowerCase();
    const streetMatches = resultStreet.length > 3
      && (resultStreet.includes(street) || street.includes(resultStreet));
    const cityMatches = city === "teresina" || city.includes("teresina");
    const countryMatches = country === "brasil" || country === "brazil";
    const stateMatches = !state || state === "pi" || state === "piaui";
    const numberMatches = !number || resultNumber === number;
    const coordinates = feature.geometry?.coordinates;
    const validCoordinates = Array.isArray(coordinates)
      && coordinates.length >= 2
      && Number.isFinite(coordinates[0])
      && Number.isFinite(coordinates[1])
      && Math.abs(coordinates[0] as number) <= 180
      && Math.abs(coordinates[1] as number) <= 90;
    const [longitude, latitude] = validCoordinates ? coordinates as [number, number] : [0, 0];
    const insideTeresinaArea = latitude >= -5.30 && latitude <= -4.90
      && longitude >= -43.05 && longitude <= -42.55;
    const matches = streetMatches && cityMatches && countryMatches && stateMatches
      && validCoordinates && insideTeresinaArea && numberMatches;
    const streetOnly = streetMatches && cityMatches && countryMatches && stateMatches
      && validCoordinates && insideTeresinaArea && !resultNumber;
    return {
      feature,
      score: (streetMatches ? 4 : 0) + (cityMatches ? 3 : 0)
        + (countryMatches ? 1 : 0) + (number && resultNumber === number ? 5 : 0),
      matches,
      streetOnly,
    };
  }).filter((candidate) => candidate.matches || candidate.streetOnly)
    .sort((a, b) => b.score - a.score);

  const chosen = candidates[0];
  if (!chosen) return null;
  const coordinates = chosen.feature.geometry!.coordinates!;
  return {
    longitude: coordinates[0] as number,
    latitude: coordinates[1] as number,
    precision: chosen.matches && number ? "address" : "street",
  };
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
    .eq("city", "Teresina")
    .eq("state", "PI")
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
        ? "As lojas restantes aguardam uma nova tentativa de localização."
        : "Todos os estabelecimentos desta categoria já possuem coordenadas.",
    });
  }

  let updated = 0;
  const notLocated: string[] = [];
  const failed: string[] = [];

  for (let index = 0; index < batch.length; index += 1) {
    const store = batch[index];
    if (index > 0) await wait(1100);

    try {
      const url = new URL("https://photon.komoot.io/api/");
      url.searchParams.set("q", `${store.address}, ${store.city}, ${store.state}, Brasil`);
      url.searchParams.set("limit", "8");
      url.searchParams.set("lang", "pt");
      url.searchParams.set("lat", "-5.0892");
      url.searchParams.set("lon", "-42.8016");

      const response = await fetch(url, {
        headers: { "Accept": "application/json", "User-Agent": "ZORVI-Map/1.1 (mapa de estabelecimentos)" },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error(`Geocoder respondeu HTTP ${response.status}`);
      const payload = await response.json();
      const point = pickFeature(payload.features || [], store.address);

      if (!point) {
        const { error: attemptError } = await admin.from("stores")
          .update({ geocode_attempted_at: new Date().toISOString() })
          .eq("id", store.id);
        if (attemptError) throw attemptError;
        notLocated.push(store.name);
        continue;
      }

      const now = new Date().toISOString();
      const { error: updateError } = await admin.from("stores").update({
        latitude: point.latitude,
        longitude: point.longitude,
        coordinate_precision: point.precision,
        coordinate_source: "Photon / OpenStreetMap",
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
      ? `${updated} localização(ões) confirmada(s) e adicionada(s) ao mapa.`
      : "Nenhuma coordenada confiável foi confirmada nesta rodada.",
  });
});
