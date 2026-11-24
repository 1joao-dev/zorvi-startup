import { supabase } from "@/lib/supabase";

/** Rows come from owner-scoped RLS reads; columns are read defensively. */
export type Row = Record<string, unknown> & { id: string };

export const MHQ_TABLES = {
  tasks: "marketing_tasks",
  steps: "marketing_task_steps",
  agents: "marketing_agents",
  creatives: "marketing_creatives",
  approvals: "marketing_approvals",
  knowledge: "marketing_knowledge",
  feedback: "marketing_feedback",
  activity: "marketing_activity_logs",
} as const;

export type MhqData = { -readonly [K in keyof typeof MHQ_TABLES]: Row[] };
export type MhqErrors = Partial<Record<keyof typeof MHQ_TABLES, string>>;

export function pick(row: Row | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}
export function text(row: Row | undefined, ...keys: string[]): string {
  const v = pick(row, ...keys);
  if (v === undefined) return "";
  return typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
}
export function fmtDate(v: unknown): string {
  if (typeof v !== "string") return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
export function byCreatedDesc(a: Row, b: Row) {
  return String(pick(b, "created_at") ?? "").localeCompare(String(pick(a, "created_at") ?? ""));
}

export const KNOWLEDGE_PENDING = ["draft", "pending", "pending_review", "candidate"];
export const isKnowledgePending = (r: Row) => KNOWLEDGE_PENDING.includes(text(r, "status").toLowerCase());
export const isKnowledgeApproved = (r: Row) => text(r, "status").toLowerCase() === "approved";
export const isApprovalPending = (r: Row) => ["pending", "waiting", "requested"].includes(text(r, "status").toLowerCase());

export async function loadMarketingData(): Promise<{ data: MhqData; errors: MhqErrors }> {
  const data = Object.fromEntries(Object.keys(MHQ_TABLES).map((k) => [k, []])) as unknown as MhqData;
  const errors: MhqErrors = {};
  if (!supabase) return { data, errors: { tasks: "Conexão com o banco não configurada." } };
  const client = supabase;
  await Promise.all(
    (Object.keys(MHQ_TABLES) as (keyof typeof MHQ_TABLES)[]).map(async (key) => {
      const { data: rows, error } = await client.from(MHQ_TABLES[key]).select("*").limit(500);
      if (error) errors[key] = error.message;
      else data[key] = ((rows ?? []) as Row[]).sort(byCreatedDesc);
    }),
  );
  return { data, errors };
}

export type Brief = {
  title: string; objective: string; audience: string; offer: string; channels: string[];
  restrictions: string; deadline: string; visual_required: boolean; brand_context: string;
};
export type Priority = "low" | "normal" | "high";

export const BRIEF_LIMITS = { title: 140, field: 2000, channels: 8 };

/** Client-side validation mirrors what the server must also enforce. Returns error messages keyed by field. */
export function validateBrief(b: Brief): Record<string, string> {
  const e: Record<string, string> = {};
  const t = b.title.trim();
  if (t.length < 3) e["title"] = "Informe um título com pelo menos 3 caracteres.";
  else if (t.length > BRIEF_LIMITS.title) e["title"] = `Máximo de ${BRIEF_LIMITS.title} caracteres.`;
  if (b.objective.trim().length < 5) e["objective"] = "Descreva o objetivo com pelo menos 10 caracteres.";
  for (const k of ["objective", "audience", "offer", "restrictions", "brand_context"] as const) {
    if (b[k].length > BRIEF_LIMITS.field) e[k] = `Máximo de ${BRIEF_LIMITS.field} caracteres.`;
  }
  if (b.channels.length === 0) e["channels"] = "Escolha pelo menos um canal.";
  if (b.channels.length > BRIEF_LIMITS.channels) e["channels"] = "Canais demais.";
  if (b.deadline && Number.isNaN(new Date(b.deadline).getTime())) e["deadline"] = "Data inválida.";
  return e;
}

export type ActionResult = { ok: true; data: unknown } | { ok: false; error: string };

/** Calls the authenticated marketing-hq function. The Supabase client attaches the user's JWT. */
export async function invokeMarketing(body: Record<string, unknown>): Promise<ActionResult> {
  if (!supabase) return { ok: false, error: "Conexão com o servidor não configurada." };
  try {
    const { data, error } = await supabase.functions.invoke("marketing-hq", { body });
    if (error) return { ok: false, error: await describeFunctionError(error) };
    if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error)
      return { ok: false, error: String((data as { error: unknown }).error) };
    return { ok: true, data };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Falha inesperada ao contatar o servidor." };
  }
}

export async function describeFunctionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const j = (await ctx.clone().json()) as { error?: unknown; message?: unknown };
      const msg = j.error ?? j.message;
      if (msg) return typeof msg === "string" ? msg : JSON.stringify(msg);
    } catch { /* not json */ }
    if (ctx.status === 401) return "Sessão expirada. Entre novamente.";
    if (ctx.status === 429) return "Limite de uso atingido. Tente novamente em alguns minutos.";
    if (ctx.status >= 500) return "O serviço está indisponível no momento. Tente novamente mais tarde.";
  }
  return error instanceof Error ? error.message : "Não foi possível concluir a ação.";
}
