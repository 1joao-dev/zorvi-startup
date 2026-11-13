import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9 ]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

function addressParts(address: string) {
  const firstPart = address.split(",")[0] || address;
  const street = firstPart.replace(/^(avenida|av\.?|rua|r\.?|alameda|al\.?|travessa|tv\.?)\s*/i, "").trim();
  const remainder = address.slice(firstPart.length + 1);
  const number = remainder.match(/\b\d{1,5}\b/)?.[0] || null;
  return { street, number };
}

function pickFeature(features: Array<{ geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> }>, address: string) {
  const { street, number } = addressParts(address);
  const targetStreet = normalize(street);
  const candidates = features.map((feature) => {
    const properties = feature.properties || {};
    const resultStreet = normalize(String(properties.street || properties.name || ""));
    const city = normalize(String(properties.city || properties.county || ""));
    const country = normalize(String(properties.country || ""));
    const resultNumber = String(properties.housenumber || "");
    const streetMatches = resultStreet.length > 2 && (resultStreet.includes(targetStreet) || targetStreet.includes(resultStreet));
    const cityMatches = city === "teresina";
    const countryMatches = country === "brasil" || country === "brazil";
    const numberMatches = !number || resultNumber === number;
    const coordinates = feature.geometry?.coordinates;
    const validCoordinates = Array.isArray(coordinates)
      && coordinates.length >= 2
      && Number.isFinite(coordinates[0])
      && Number.isFinite(coordinates[1])
      && Math.abs(coordinates[0] as number) <= 180
      && Math.abs(coordinates[1] as number) <= 90;
    return {
      feature,
      score: (streetMatches ? 4 : 0) + (cityMatches ? 3 : 0) + (countryMatches ? 1 : 0) + (numberMatches && number ? 5 : 0),
      matches: streetMatches && cityMatches && countryMatches && validCoordinates && numberMatches,
      streetOnly: streetMatches && cityMatches && countryMatches && validCoordinates && !numberMatches && !resultNumber,
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
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Configuração segura do Supabase não encontrada." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const requestBody = await request.json().catch(() => ({}));
  const allowedCategories = ["Farmácia", "Mercado", "Restaurante", "Lojas", "Outros"];
  const category = allowedCategories.includes(requestBody.category) ? requestBody.category : null;

  const retryBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  let storeQuery = admin.from("stores").select("id,name,address,city,state")
    .eq("city", "Teresina").eq("state", "PI")
    .is("latitude", null).is("longitude", null)
    .or(`geocode_attempted_at.is.null,geocode_attempted_at.lt.${retryBefore}`);
  if (category) storeQuery = storeQuery.eq("category", category);
  const { data: stores, error } = await storeQuery.limit(5);

  if (error) {
    return new Response(JSON.stringify({ error: "Não foi possível consultar os estabelecimentos." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let updated = 0;
  const notLocated: string[] = [];
  const failed: string[] = [];

  for (let index = 0; index < (stores || []).length; index += 1) {
    const store = stores![index];
    if (index > 0) await wait(1100);
    try {
      const url = new URL("https://photon.komoot.io/api/");
      url.searchParams.set("q", `${store.address}, ${store.city}, ${store.state}, Brasil`);
      url.searchParams.set("limit", "5");
      url.searchParams.set("lang", "pt");
      url.searchParams.set("lat", "-5.0892");
      url.searchParams.set("lon", "-42.8016");

      const response = await fetch(url, {
        headers: { "Accept": "application/json", "User-Agent": "ZORVI-Map/1.0" },
      });
      if (!response.ok) throw new Error(`Geocoder respondeu ${response.status}`);
      const payload = await response.json();
      const point = pickFeature(payload.features || [], store.address);
      if (!point) {
        await admin.from("stores").update({ geocode_attempted_at: new Date().toISOString() }).eq("id", store.id).is("latitude", null).is("longitude", null);
        notLocated.push(store.name);
        continue;
      }

      const { error: updateError } = await admin.from("stores").update({
        latitude: point.latitude,
        longitude: point.longitude,
        coordinate_precision: point.precision,
        coordinate_source: "Photon / OpenStreetMap",
        geocoded_at: new Date().toISOString(),
        geocode_attempted_at: new Date().toISOString(),
      }).eq("id", store.id).is("latitude", null).is("longitude", null);

      if (updateError) throw updateError;
      updated += 1;
    } catch {
      await admin.from("stores").update({ geocode_attempted_at: new Date().toISOString() }).eq("id", store.id).is("latitude", null).is("longitude", null);
      failed.push(store.name);
    }
  }

  let remainingQuery = admin.from("stores").select("id", { count: "exact", head: true })
    .eq("city", "Teresina").eq("state", "PI")
    .is("latitude", null).is("longitude", null)
    .or(`geocode_attempted_at.is.null,geocode_attempted_at.lt.${retryBefore}`);
  let unresolvedQuery = admin.from("stores").select("id", { count: "exact", head: true })
    .eq("city", "Teresina").eq("state", "PI")
    .is("latitude", null).is("longitude", null);
  if (category) {
    remainingQuery = remainingQuery.eq("category", category);
    unresolvedQuery = unresolvedQuery.eq("category", category);
  }
  const [{ count: remaining }, { count: unresolved }] = await Promise.all([remainingQuery, unresolvedQuery]);

  return new Response(JSON.stringify({
    processed: stores?.length || 0,
    updated,
    notLocated,
    failed,
    remaining: remaining || 0,
    unresolved: unresolved || 0,
    message: updated
      ? `${updated} localização(ões) adicionada(s) ao mapa.`
      : "Nenhuma nova coordenada foi confirmada nesta rodada.",
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
