import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server environment variables.");
const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return json({ error: "Sessão não encontrada." }, 401);

  const { data: authData, error: authError } = await service.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Sessão inválida ou expirada." }, 401);

  const { data: adminRow, error: adminError } = await service
    .from("zorvi_admins")
    .select("user_id")
    .eq("user_id", authData.user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (adminError) return json({ error: "Não foi possível validar o acesso administrativo." }, 500);
  if (!adminRow) return json({ error: "Acesso restrito à administração do ZORVI." }, 403);

  const [storesResult, totalPricesResult, totalProductsResult, runsResult] = await Promise.all([
    service.from("stores")
      .select("id,name,category,city,state")
      .eq("coordinate_source", "online_catalog")
      .order("name", { ascending: true }),
    service.from("price_observations")
      .select("id", { count: "exact", head: true })
      .eq("verification_status", "verified"),
    service.from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    service.from("retail_catalog_sync_runs")
      .select("id,started_at,finished_at,status,trigger_source,requested_source,summary,error_message")
      .order("started_at", { ascending: false })
      .limit(12),
  ]);

  const firstError = [storesResult, totalPricesResult, totalProductsResult, runsResult].find((result) => result.error)?.error;
  if (firstError) return json({ error: firstError.message }, 500);

  const stores = storesResult.data || [];
  const observationResults = await Promise.all(stores.map((store) =>
    service.from("price_observations")
      .select("product_id,observed_at", { count: "exact" })
      .eq("store_id", store.id)
      .eq("verification_status", "verified")
      .order("observed_at", { ascending: false })
      .limit(1000)
  ));

  const observationError = observationResults.find((result) => result.error)?.error;
  if (observationError) return json({ error: observationError.message }, 500);

  const now = Date.now();
  const integrations = stores.map((store, index) => {
    const result = observationResults[index];
    const rows = result.data || [];
    const uniqueProducts = new Set(rows.map((row) => row.product_id));
    const latest = rows[0]?.observed_at || null;
    const updatedLast24h = rows.filter((row) => now - new Date(row.observed_at).getTime() <= 24 * 60 * 60 * 1000).length;
    return {
      id: store.id,
      name: store.name,
      category: store.category,
      city: store.city,
      state: store.state,
      verifiedPrices: result.count || 0,
      products: uniqueProducts.size,
      updatedLast24h,
      lastObservedAt: latest,
    };
  });

  const recentRuns = runsResult.data || [];
  return json({
    generatedAt: new Date().toISOString(),
    scheduleLabel: "Todos os dias às 06:30 · horário de Teresina",
    totals: {
      activeProducts: totalProductsResult.count || 0,
      verifiedPrices: totalPricesResult.count || 0,
      onlineChannels: stores.length,
    },
    lastSyncAt: recentRuns[0]?.finished_at || recentRuns[0]?.started_at || null,
    integrations,
    recentRuns,
  });
});
