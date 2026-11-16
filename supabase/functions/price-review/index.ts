import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-zorvi-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
      console.error("[price-review] Não foi possível interpretar SUPABASE_SECRET_KEYS.", error);
    }
  }
  return Deno.env.get("SUPABASE_SECRET_KEY")
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    || null;
}

type ReviewAction = "approve" | "reject";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const adminKey = getAdminKey();
  if (!supabaseUrl || !adminKey) {
    console.error("[price-review] Configuração segura do Supabase ausente.");
    return json({ error: "Configuração segura do Supabase não encontrada." }, 500);
  }

  const authorization = request.headers.get("Authorization") || "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return json({ error: "Faça login para acessar a moderação de preços." }, 401);

  const admin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(tokenMatch[1]);
  if (authError || !authData.user) {
    return json({ error: "Sua sessão expirou. Entre novamente para continuar." }, 401);
  }

  const adminToken = (request.headers.get("x-zorvi-admin-token") || "").trim();
  if (adminToken.length < 32) return json({ error: "Token administrativo inválido." }, 403);

  const { data: tokenValid, error: tokenError } = await admin.rpc("verify_catalog_import_token", {
    candidate: adminToken,
  });
  if (tokenError) {
    console.error("[price-review] Falha ao validar token administrativo.", tokenError.message);
    return json({ error: "Não foi possível validar o token administrativo." }, 500);
  }
  if (tokenValid !== true) return json({ error: "Token administrativo inválido." }, 403);

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "list_pending");

  if (action === "list_pending") {
    const { data, error } = await admin.from("price_observations")
      .select("id,price,currency,price_type,source_url,source_label,observed_at,availability_status,products!inner(name,brand,variant,unit,category),stores!inner(name,category,address,city,state,verification_status)")
      .eq("verification_status", "pending")
      .order("observed_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error("[price-review] Não foi possível carregar pendências.", error.message);
      return json({ error: "Não foi possível carregar os preços pendentes." }, 500);
    }
    return json({ success: true, items: data || [] });
  }

  if (action !== "approve" && action !== "reject") {
    return json({ error: "Ação inválida. Use list_pending, approve ou reject." }, 400);
  }

  const priceId = typeof body?.price_id === "string" ? body.price_id.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(priceId)) {
    return json({ error: "Identificador de preço inválido." }, 400);
  }

  const { data: pending, error: pendingError } = await admin.from("price_observations")
    .select("id,price_type,source_url,products!inner(is_active),stores!inner(verification_status)")
    .eq("id", priceId)
    .eq("verification_status", "pending")
    .maybeSingle();
  if (pendingError) {
    console.error("[price-review] Não foi possível validar o registro pendente.", pendingError.message);
    return json({ error: "Não foi possível validar este preço." }, 500);
  }
  if (!pending) return json({ error: "Este preço não está mais pendente ou já foi revisado." }, 409);

  if (action === "approve") {
    const product = pending.products as { is_active?: boolean } | null;
    const store = pending.stores as { verification_status?: string } | null;
    if (product?.is_active !== true) {
      return json({ error: "O produto está inativo e não pode ser liberado." }, 422);
    }
    if (store?.verification_status !== "verified") {
      return json({ error: "O estabelecimento ainda não está verificado." }, 422);
    }
    if (pending.price_type === "official_site" && !/^https?:\/\//i.test(String(pending.source_url || ""))) {
      return json({ error: "O preço do site oficial precisa ter uma fonte HTTP ou HTTPS válida." }, 422);
    }
  }

  const nextStatus = action === "approve" ? "verified" : "rejected";
  const { data: updated, error: updateError } = await admin.from("price_observations")
    .update({ verification_status: nextStatus })
    .eq("id", priceId)
    .eq("verification_status", "pending")
    .select("id,verification_status")
    .maybeSingle();
  if (updateError) {
    console.error("[price-review] Falha ao salvar revisão.", updateError.message);
    return json({ error: "Não foi possível salvar a revisão deste preço." }, 500);
  }
  if (!updated) return json({ error: "Este preço já foi revisado por outra sessão." }, 409);

  console.info("[price-review] Revisão concluída.", {
    action,
    priceId,
    reviewerId: authData.user.id,
    verificationStatus: nextStatus,
  });

  return json({ success: true, item: updated });
});
