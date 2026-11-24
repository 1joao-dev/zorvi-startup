import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Activity, ArrowLeft, BookOpen, Bot, CheckCircle2, ClipboardList, LayoutDashboard, Loader2, RefreshCw, ShieldCheck, XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AuthScreen } from "@/components/AuthScreen";
import {
  fmtDate, invokeMarketing, isApprovalPending, isKnowledgeApproved, isKnowledgePending, loadMarketingData, pick, text, validateBrief,
  type Brief, type MhqData, type MhqErrors, type Priority, type Row,
} from "@/lib/marketing-hq";

type Tab = "overview" | "tasks" | "agents" | "approvals" | "knowledge" | "activity";
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "overview", label: "Visão geral", icon: <LayoutDashboard size={17} /> },
  { id: "tasks", label: "Tarefas", icon: <ClipboardList size={17} /> },
  { id: "approvals", label: "Aprovações", icon: <ShieldCheck size={17} /> },
  { id: "knowledge", label: "Conhecimento", icon: <BookOpen size={17} /> },
  { id: "agents", label: "Agentes", icon: <Bot size={17} /> },
  { id: "activity", label: "Atividade", icon: <Activity size={17} /> },
];
const CHANNELS = ["Instagram", "TikTok", "WhatsApp", "E-mail", "Site", "Google", "Facebook", "LinkedIn"];
const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho", queued: "Na fila", pending: "Pendente", running: "Em execução", in_progress: "Em execução",
  revision: "Em revisão", waiting_approval: "Aguardando aprovação", approved: "Aprovado", rejected: "Rejeitado",
  changes_requested: "Alterações pedidas", cancelled: "Cancelado", canceled: "Cancelado", failed: "Falhou", error: "Erro",
  completed: "Concluído", done: "Concluído", archived: "Arquivado", expired: "Expirado", revoked: "Revogado", idle: "Ocioso", skipped: "Ignorado",
};
const TERMINAL = ["cancelled", "canceled", "failed", "approved", "rejected", "completed", "done"];

function Status({ value }: { value: string }) {
  const v = value.toLowerCase();
  return <span className={`mhq-status mhq-status--${v.replace(/[^a-z_]/g, "") || "unknown"}`}>{STATUS_LABEL[v] ?? (value || "—")}</span>;
}
function Content({ value }: { value: unknown }) {
  if (value === undefined || value === null || value === "") return <p className="mhq-muted">Sem conteúdo.</p>;
  if (typeof value === "string") return <div className="mhq-content">{value}</div>;
  return <pre className="mhq-content mhq-pre">{JSON.stringify(value, null, 2)}</pre>;
}
function Empty({ children }: { children: ReactNode }) { return <div className="mhq-empty">{children}</div>; }
function TableError({ msg }: { msg?: string | undefined }) {
  return msg ? <p className="mhq-alert" role="alert">Não foi possível ler estes dados: {msg}</p> : null;
}

export function MarketingHQ() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    if (!supabase) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div className="mhq mhq-center"><Loader2 className="mhq-spin" aria-hidden /> <span>Carregando…</span></div>;
  if (!session) return <div className="zorvi-app"><AuthScreen /></div>;
  return <Dashboard />;
}

function Dashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<MhqData | null>(null);
  const [errors, setErrors] = useState<MhqErrors>({});
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await loadMarketingData();
    setData(r.data); setErrors(r.errors); setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const run = useCallback(async (body: Record<string, unknown>, okMsg: string) => {
    setFlash(null);
    const r = await invokeMarketing(body);
    setFlash(r.ok ? { kind: "ok", msg: okMsg } : { kind: "err", msg: r.error });
    await refresh();
    return r;
  }, [refresh]);

  const pendingApprovals = data?.approvals.filter(isApprovalPending).length ?? 0;
  const pendingKnowledge = data?.knowledge.filter(isKnowledgePending).length ?? 0;

  return (
    <div className="mhq">
      <header className="mhq-header">
        <a href="/" className="mhq-back" aria-label="Voltar para a ZORVI"><ArrowLeft size={18} /></a>
        <img src="/zorvi-mark.webp" alt="" className="mhq-logo" />
        <div className="mhq-title"><p className="mhq-eyebrow">ZORVI</p><h1>Marketing HQ</h1></div>
        <button className="mhq-btn mhq-btn--ghost" onClick={() => void refresh()} disabled={loading} aria-label="Atualizar dados">
          <RefreshCw size={16} className={loading ? "mhq-spin" : ""} /> <span className="mhq-hide-sm">Atualizar</span>
        </button>
      </header>
      <nav className="mhq-tabs" aria-label="Seções do Marketing HQ">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "is-active" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => { setTab(t.id); setSelectedTask(null); }}>
            {t.icon}<span>{t.label}</span>
            {t.id === "approvals" && pendingApprovals > 0 && <em>{pendingApprovals}</em>}
            {t.id === "knowledge" && pendingKnowledge > 0 && <em>{pendingKnowledge}</em>}
          </button>
        ))}
      </nav>
      <main className="mhq-main">
        <p className="mhq-notice"><ShieldCheck size={15} /> Ambiente interno: nada é publicado, enviado ou anunciado daqui. Aprovar só aceita a entrega interna.</p>
        {flash && <p className={flash.kind === "ok" ? "mhq-success" : "mhq-alert"} role={flash.kind === "ok" ? "status" : "alert"}>{flash.msg}</p>}
        {!data ? <div className="mhq-center"><Loader2 className="mhq-spin" aria-hidden /> Carregando seus dados…</div> : (
          <>
            {tab === "overview" && <Overview data={data} errors={errors} run={run} openTask={(id) => { setSelectedTask(id); setTab("tasks"); }} />}
            {tab === "tasks" && (selectedTask
              ? <TaskDetail id={selectedTask} data={data} run={run} back={() => setSelectedTask(null)} />
              : <TaskBoard data={data} errors={errors} open={setSelectedTask} />)}
            {tab === "approvals" && <Approvals data={data} errors={errors} run={run} openTask={(id) => { setSelectedTask(id); setTab("tasks"); }} />}
            {tab === "knowledge" && <Knowledge data={data} errors={errors} run={run} />}
            {tab === "agents" && <Agents data={data} errors={errors} />}
            {tab === "activity" && <ActivityLog rows={data.activity} error={errors.activity} />}
          </>
        )}
      </main>
    </div>
  );
}

type Run = (body: Record<string, unknown>, okMsg: string) => Promise<{ ok: boolean }>;

function Overview({ data, errors, run, openTask }: { data: MhqData; errors: MhqErrors; run: Run; openTask: (id: string) => void }) {
  const count = (s: string[]) => data.tasks.filter((t) => s.includes(text(t, "status").toLowerCase())).length;
  const stats = [
    { label: "Tarefas", value: data.tasks.length },
    { label: "Em execução", value: count(["queued", "running", "in_progress", "revision", "pending"]) },
    { label: "Aguardando aprovação", value: count(["waiting_approval"]) },
    { label: "Conhecimento pendente", value: data.knowledge.filter(isKnowledgePending).length },
  ];
  return (
    <div className="mhq-grid">
      <section className="mhq-stats" aria-label="Resumo">
        {stats.map((s) => <div key={s.label} className="mhq-stat"><b>{s.value}</b><span>{s.label}</span></div>)}
      </section>
      <NewTaskForm run={run} />
      <section className="mhq-card">
        <h2>Tarefas recentes</h2>
        <TableError msg={errors.tasks} />
        {data.tasks.length === 0 ? <Empty>Nenhuma tarefa ainda. Crie a primeira com o formulário acima.</Empty> :
          <ul className="mhq-list">{data.tasks.slice(0, 5).map((t) => <TaskItem key={t.id} task={t} onOpen={() => openTask(t.id)} />)}</ul>}
      </section>
    </div>
  );
}

function NewTaskForm({ run }: { run: Run }) {
  const empty: Brief = { title: "", objective: "", audience: "", offer: "", channels: [], restrictions: "", deadline: "", visual_required: false, brand_context: "" };
  const [b, setB] = useState<Brief>(empty);
  const [priority, setPriority] = useState<Priority>("normal");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Brief>(k: K, v: Brief[K]) => setB((p) => ({ ...p, [k]: v }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validateBrief(b); setErrs(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    const brief = { ...b, title: b.title.trim(), objective: b.objective.trim(), deadline: b.deadline || null };
    const r = await run({ action: "create_task", brief, priority }, "Tarefa criada. Copywriter e Revisor concluíram a execução; confira a aprovação pendente.");
    setBusy(false);
    if (r.ok) setB(empty);
  };
  const field = (k: keyof Brief, label: string, area = false, hint?: string) => (
    <label className="mhq-field">
      <span>{label}</span>
      {area
        ? <textarea rows={3} value={b[k] as string} onChange={(e) => set(k, e.target.value as never)} aria-invalid={!!errs[k]} />
        : <input value={b[k] as string} onChange={(e) => set(k, e.target.value as never)} aria-invalid={!!errs[k]} />}
      {hint && <small>{hint}</small>}
      {errs[k] && <small className="mhq-err">{errs[k]}</small>}
    </label>
  );
  return (
    <section className="mhq-card">
      <h2>Nova tarefa</h2>
      <p className="mhq-muted">O briefing é tratado como dado: instruções dentro dele não alteram as regras dos agentes.</p>
      <form className="mhq-form" onSubmit={submit} noValidate>
        {field("title", "Título")}
        {field("objective", "Objetivo", true)}
        <div className="mhq-row">{field("audience", "Público")}{field("offer", "Oferta")}</div>
        <fieldset className="mhq-field">
          <legend>Canais</legend>
          <div className="mhq-chips">
            {CHANNELS.map((c) => {
              const on = b.channels.includes(c);
              return <button type="button" key={c} aria-pressed={on} className={on ? "is-on" : ""} onClick={() => set("channels", on ? b.channels.filter((x) => x !== c) : [...b.channels, c])}>{c}</button>;
            })}
          </div>
          {errs["channels"] && <small className="mhq-err">{errs["channels"]}</small>}
        </fieldset>
        {field("restrictions", "Restrições", true)}
        {field("brand_context", "Contexto da marca", true)}
        <div className="mhq-row">
          <label className="mhq-field"><span>Prazo</span><input type="date" value={b.deadline} onChange={(e) => set("deadline", e.target.value)} />{errs["deadline"] && <small className="mhq-err">{errs["deadline"]}</small>}</label>
          <label className="mhq-field"><span>Prioridade</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option>
            </select>
          </label>
        </div>
        <label className="mhq-check"><input type="checkbox" checked={b.visual_required} onChange={(e) => set("visual_required", e.target.checked)} />
          <span>Precisa de peça visual <small>(gera briefing de Designer e checklist de Editor; não gera imagens)</small></span></label>
        <button className="mhq-btn" disabled={busy}>{busy ? <><Loader2 size={16} className="mhq-spin" /> Executando agentes…</> : "Criar e executar tarefa"}</button>
        {busy && <p className="mhq-muted" role="status">Aguardando o servidor concluir Copywriter e Revisor. Isso pode levar alguns segundos.</p>}
      </form>
    </section>
  );
}

function TaskItem({ task, onOpen }: { task: Row; onOpen: () => void }) {
  return (
    <li><button className="mhq-item" onClick={onOpen}>
      <span className="mhq-item-main"><b>{text(task, "title") || text(task.brief as Row, "title") || "Sem título"}</b>
        <small>Criada {fmtDate(pick(task, "created_at"))} · Atualizada {fmtDate(pick(task, "updated_at"))}</small></span>
      <Status value={text(task, "status")} />
    </button></li>
  );
}

function TaskBoard({ data, errors, open }: { data: MhqData; errors: MhqErrors; open: (id: string) => void }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const statuses = useMemo(() => [...new Set(data.tasks.map((t) => text(t, "status")).filter(Boolean))], [data.tasks]);
  const rows = data.tasks.filter((t) => (filter === "all" || text(t, "status") === filter) && (!q || JSON.stringify(t).toLowerCase().includes(q.toLowerCase())));
  return (
    <section className="mhq-card">
      <h2>Quadro de tarefas</h2>
      <div className="mhq-filters">
        <label className="mhq-field"><span>Buscar</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título ou conteúdo" /></label>
        <label className="mhq-field"><span>Status</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Todos</option>{statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
          </select></label>
      </div>
      <TableError msg={errors.tasks} />
      {rows.length === 0 ? <Empty>{data.tasks.length ? "Nenhuma tarefa com esses filtros." : "Nenhuma tarefa ainda. Crie uma em Visão geral."}</Empty> :
        <ul className="mhq-list">{rows.map((t) => <TaskItem key={t.id} task={t} onOpen={() => open(t.id)} />)}</ul>}
    </section>
  );
}

function TaskDetail({ id, data, run, back }: { id: string; data: MhqData; run: Run; back: () => void }) {
  const task = data.tasks.find((t) => t.id === id);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  if (!task) return <Empty>Tarefa não encontrada. <button className="mhq-link" onClick={back}>Voltar</button></Empty>;
  const status = text(task, "status").toLowerCase();
  const steps = data.steps.filter((s) => text(s, "task_id") === id)
    .sort((a, b) => Number(pick(a, "position", "sequence", "step_order", "order") ?? 0) - Number(pick(b, "position", "sequence", "step_order", "order") ?? 0) || String(pick(a, "created_at")).localeCompare(String(pick(b, "created_at"))));
  const creatives = data.creatives.filter((c) => text(c, "task_id") === id).sort((a, b) => Number(pick(b, "version") ?? 0) - Number(pick(a, "version") ?? 0));
  const approvals = data.approvals.filter((a) => text(a, "task_id") === id);
  const err = text(task, "error_message", "error", "last_error");
  const brief = pick(task, "brief_json", "brief");
  return (
    <div className="mhq-grid">
      <button className="mhq-link" onClick={back}><ArrowLeft size={15} /> Voltar ao quadro</button>
      <section className="mhq-card">
        <div className="mhq-head"><h2>{text(task, "title") || text(brief as Row, "title") || "Tarefa"}</h2><Status value={status} /></div>
        <p className="mhq-muted">Prioridade: {text(task, "priority") || "—"} · Criada {fmtDate(pick(task, "created_at"))} · Atualizada {fmtDate(pick(task, "updated_at"))}</p>
        {err && <p className="mhq-alert" role="alert">Erro: {err}</p>}
        {!TERMINAL.includes(status) && (
          <button className="mhq-btn mhq-btn--danger" disabled={busy} onClick={async () => {
            if (!window.confirm("Cancelar esta tarefa? As próximas etapas não serão executadas.")) return;
            setBusy(true); await run({ action: "control_task", task_id: id, command: "cancel" }, "Tarefa cancelada."); setBusy(false);
          }}><XCircle size={16} /> Cancelar tarefa</button>
        )}
        <details className="mhq-details"><summary>Briefing</summary><Content value={brief} /></details>
      </section>
      <section className="mhq-card">
        <h2>Etapas</h2>
        {steps.length === 0 ? <Empty>Nenhuma etapa registrada.</Empty> : (
          <ol className="mhq-steps">{steps.map((s, i) => (
            <li key={s.id}>
              <span className="mhq-step-n">{i + 1}</span>
              <div><b>{text(s, "step_key", "agent_role", "agent_key", "agent", "role", "name", "step") || "Etapa"}</b>
                <small>Início {fmtDate(pick(s, "started_at", "created_at"))} · Fim {fmtDate(pick(s, "completed_at", "finished_at"))}{pick(s, "attempt", "attempts") !== undefined ? ` · Tentativa ${text(s, "attempt", "attempts")}` : ""}</small>
                {text(s, "error_message", "error") && <small className="mhq-err">{text(s, "error_message", "error")}</small>}
              </div>
              <Status value={text(s, "status")} />
            </li>))}
          </ol>)}
      </section>
      <section className="mhq-card">
        <h2>Versões do criativo</h2>
        <p className="mhq-muted">Cada versão é imutável. Qualquer alteração cria uma nova versão e invalida aprovações anteriores.</p>
        {creatives.length === 0 ? <Empty>Nenhuma versão gerada.</Empty> : creatives.map((c) => (
          <article key={c.id} className="mhq-version">
            <div className="mhq-head"><b>v{text(c, "version") || "?"} · {text(c, "kind", "type", "stage", "agent_role") || "criativo"}</b><small>{fmtDate(pick(c, "created_at"))}</small></div>
            <Hash value={text(c, "content_hash", "hash")} />
            <Content value={pick(c, "content_json", "content", "body", "final_package", "payload")} />
          </article>))}
      </section>
      {approvals.length > 0 && <section className="mhq-card"><h2>Aprovações</h2>{approvals.map((a) => <ApprovalCard key={a.id} a={a} data={data} run={run} />)}</section>}
      <section className="mhq-card">
        <h2>Feedback</h2>
        <p className="mhq-muted">O feedback é registrado como dado bruto. Ele nunca vira conhecimento automaticamente.</p>
        <form className="mhq-form" onSubmit={async (e) => {
          e.preventDefault();
          if (!comment.trim()) return;
          const r = await run({ action: "feedback", task_id: id, rating, comment: comment.trim() }, "Feedback registrado.");
          if (r.ok) setComment("");
        }}>
          <label className="mhq-field"><span>Nota (1–5)</span><select value={rating} onChange={(e) => setRating(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
          <label className="mhq-field"><span>Comentário</span><textarea rows={2} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} required /></label>
          <button className="mhq-btn mhq-btn--ghost">Enviar feedback</button>
        </form>
        <ul className="mhq-list">{data.feedback.filter((f) => text(f, "task_id") === id).map((f) => (
          <li key={f.id} className="mhq-plain"><b>{text(f, "rating")}/5</b> {text(f, "comment")} <small>{fmtDate(pick(f, "created_at"))}</small></li>))}</ul>
      </section>
    </div>
  );
}

function Hash({ value }: { value: string }) {
  return value ? <p className="mhq-hash" title={value}>hash: <code>{value.slice(0, 16)}…</code></p> : null;
}

function ApprovalCard({ a, data, run, openTask }: { a: Row; data: MhqData; run: Run; openTask?: (id: string) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const creativeId = text(a, "creative_id");
  const creative = data.creatives.find((c) => c.id === creativeId);
  const task = data.tasks.find((t) => t.id === text(a, "task_id"));
  const pending = isApprovalPending(a);
  const decide = async (decision: "approved" | "rejected" | "changes_requested") => {
    if ((decision !== "approved") && !note.trim()) { window.alert("Explique o motivo na nota."); return; }
    setBusy(true);
    await run({ action: "approval_decision", approval_id: a.id, decision, note: note.trim() }, decision === "approved" ? "Entrega interna aprovada. Nada foi publicado." : "Decisão registrada.");
    setBusy(false);
  };
  return (
    <article className="mhq-version">
      <div className="mhq-head">
        <b>{text(task, "title") || "Tarefa"} · v{text(a, "version", "creative_version") || text(creative, "version") || "?"}</b>
        <Status value={text(a, "status")} />
      </div>
      <Hash value={text(a, "content_hash") || text(creative, "content_hash", "hash")} />
      {creative && text(a, "content_hash") && text(creative, "content_hash") && text(a, "content_hash") !== text(creative, "content_hash") &&
        <p className="mhq-alert">O conteúdo não corresponde ao hash aprovado. Esta aprovação não é válida.</p>}
      <p className="mhq-muted">Solicitada {fmtDate(pick(a, "requested_at", "created_at"))}{pick(a, "decided_at") ? ` · Decidida ${fmtDate(pick(a, "decided_at"))}` : ""}</p>
      <details className="mhq-details" open={pending}><summary>Pacote final exato</summary><Content value={pick(creative, "content_json", "content", "body", "final_package", "payload") ?? pick(a, "action_payload", "package", "snapshot")} /></details>
      {text(a, "decision_note", "note") && <p className="mhq-muted">Nota: {text(a, "note", "decision_note")}</p>}
      {openTask && task && <button className="mhq-link" onClick={() => openTask(task.id)}>Ver tarefa completa</button>}
      {pending && (
        <div className="mhq-form">
          <p className="mhq-warn"><ShieldCheck size={15} /> Aprovar apenas aceita esta entrega interna. Não publica, não envia mensagens e não cria campanhas.</p>
          <label className="mhq-field"><span>Nota (obrigatória para rejeitar ou pedir alterações)</span><textarea rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="mhq-actions">
            <button className="mhq-btn" disabled={busy} onClick={() => decide("approved")}><CheckCircle2 size={16} /> Aprovar entrega</button>
            <button className="mhq-btn mhq-btn--ghost" disabled={busy} onClick={() => decide("changes_requested")}>Pedir alterações</button>
            <button className="mhq-btn mhq-btn--danger" disabled={busy} onClick={() => decide("rejected")}>Rejeitar</button>
          </div>
        </div>
      )}
    </article>
  );
}

function Approvals({ data, errors, run, openTask }: { data: MhqData; errors: MhqErrors; run: Run; openTask: (id: string) => void }) {
  const pending = data.approvals.filter(isApprovalPending);
  const past = data.approvals.filter((a) => !isApprovalPending(a));
  return (
    <div className="mhq-grid">
      <section className="mhq-card"><h2>Pendentes</h2><TableError msg={errors.approvals} />
        {pending.length === 0 ? <Empty>Nenhuma entrega aguardando sua aprovação.</Empty> : pending.map((a) => <ApprovalCard key={a.id} a={a} data={data} run={run} openTask={openTask} />)}</section>
      <section className="mhq-card"><h2>Histórico</h2>
        {past.length === 0 ? <Empty>Sem decisões anteriores.</Empty> : past.map((a) => <ApprovalCard key={a.id} a={a} data={data} run={run} openTask={openTask} />)}</section>
    </div>
  );
}

function Knowledge({ data, errors, run }: { data: MhqData; errors: MhqErrors; run: Run }) {
  const [form, setForm] = useState({ title: "", content: "", scope: "global", kind: "guideline" });
  const [busy, setBusy] = useState(false);
  const pending = data.knowledge.filter(isKnowledgePending);
  const approved = data.knowledge.filter(isKnowledgeApproved);
  const other = data.knowledge.filter((k) => !isKnowledgePending(k) && !isKnowledgeApproved(k));
  return (
    <div className="mhq-grid">
      <section className="mhq-card">
        <h2>Propor conhecimento</h2>
        <p className="mhq-muted">Toda proposta começa como rascunho. Só entra na memória dos agentes depois da sua aprovação explícita.</p>
        <form className="mhq-form" onSubmit={async (e) => {
          e.preventDefault();
          if (form.title.trim().length < 3 || form.content.trim().length < 10) { window.alert("Título (3+) e conteúdo (10+ caracteres) são obrigatórios."); return; }
          setBusy(true);
          const r = await run({ action: "propose_knowledge", title: form.title.trim(), content: form.content.trim(), scope: form.scope, kind: form.kind }, "Proposta criada como rascunho.");
          setBusy(false);
          if (r.ok) setForm({ ...form, title: "", content: "" });
        }}>
          <label className="mhq-field"><span>Título</span><input maxLength={140} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label className="mhq-field"><span>Conteúdo</span><textarea rows={3} maxLength={4000} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></label>
          <div className="mhq-row">
            <label className="mhq-field"><span>Escopo</span><select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}><option value="global">Todos os agentes</option><option value="agent">Agente específico</option><option value="task">Somente tarefa</option></select></label>
            <label className="mhq-field"><span>Tipo</span><select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="guideline">Diretriz</option><option value="brand_voice">Voz da marca</option><option value="audience">Público</option><option value="offer">Oferta</option><option value="example_pattern">Padrão de exemplo</option><option value="restriction">Restrição</option></select></label>
          </div>
          <button className="mhq-btn" disabled={busy}>Enviar como rascunho</button>
        </form>
      </section>
      <section className="mhq-card"><h2>Pendentes de decisão ({pending.length})</h2><TableError msg={errors.knowledge} />
        {pending.length === 0 ? <Empty>Nenhum candidato pendente.</Empty> : pending.map((k) => <KnowledgeCandidate key={k.id} k={k} run={run} />)}</section>
      <section className="mhq-card"><h2>Aprovado — usado pelos agentes ({approved.length})</h2>
        {approved.length === 0 ? <Empty>Nenhum conhecimento aprovado ainda.</Empty> : approved.map((k) => (
          <article key={k.id} className="mhq-version">
            <div className="mhq-head"><b>{text(k, "title")}</b><Status value="approved" /></div>
            <p className="mhq-muted">{text(k, "scope")} · {text(k, "kind")} · {fmtDate(pick(k, "approved_at", "decided_at", "updated_at"))}</p>
            <Content value={pick(k, "content")} />
            <button className="mhq-btn mhq-btn--ghost" onClick={() => run({ action: "decide_knowledge", knowledge_id: k.id, decision: "archived", note: "Arquivado pelo dono" }, "Conhecimento arquivado.")}>Arquivar</button>
          </article>))}</section>
      {other.length > 0 && <section className="mhq-card"><h2>Rejeitados e arquivados</h2><p className="mhq-muted">Nunca são usados pelos agentes.</p>
        <ul className="mhq-list">{other.map((k) => <li key={k.id} className="mhq-plain"><b>{text(k, "title")}</b> <Status value={text(k, "status")} /></li>)}</ul></section>}
    </div>
  );
}

function KnowledgeCandidate({ k, run }: { k: Row; run: Run }) {
  const original = text(k, "content");
  const [content, setContent] = useState(original);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const decide = async (decision: "approved" | "rejected" | "archived") => {
    setBusy(true);
    const body: Record<string, unknown> = { action: "decide_knowledge", knowledge_id: k.id, decision, note: note.trim() };
    if (decision === "approved" && content.trim() !== original.trim()) body["content"] = content.trim();
    await run(body, decision === "approved" ? "Conhecimento aprovado." : "Decisão registrada.");
    setBusy(false);
  };
  return (
    <article className="mhq-version">
      <div className="mhq-head"><b>{text(k, "title")}</b><Status value={text(k, "status")} /></div>
      <p className="mhq-muted">{text(k, "scope")} · {text(k, "kind")} · origem: {text(k, "source", "origin") || "—"} · {fmtDate(pick(k, "created_at"))}</p>
      <label className="mhq-field"><span>Conteúdo (edite antes de aprovar, se quiser)</span><textarea rows={4} maxLength={4000} value={content} onChange={(e) => setContent(e.target.value)} /></label>
      <label className="mhq-field"><span>Nota</span><input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="mhq-actions">
        <button className="mhq-btn" disabled={busy} onClick={() => decide("approved")}>{content.trim() !== original.trim() ? "Editar e aprovar" : "Aprovar"}</button>
        <button className="mhq-btn mhq-btn--danger" disabled={busy} onClick={() => decide("rejected")}>Rejeitar</button>
        <button className="mhq-btn mhq-btn--ghost" disabled={busy} onClick={() => decide("archived")}>Arquivar</button>
      </div>
    </article>
  );
}

function Agents({ data, errors }: { data: MhqData; errors: MhqErrors }) {
  return (
    <section className="mhq-card">
      <h2>Agentes</h2>
      <p className="mhq-muted">Estados lidos do banco. Designer e Editor são etapas internas configuráveis, sem integrações externas.</p>
      <TableError msg={errors.agents} />
      {data.agents.length === 0 ? <Empty>Os agentes aparecem aqui após a primeira tarefa.</Empty> : (
        <div className="mhq-agents">{data.agents.map((a) => {
          const role = text(a, "role", "key", "agent_key");
          const runs = data.steps.filter((s) => [text(s, "agent_role"), text(s, "agent_key"), text(s, "agent"), text(s, "agent_id")].includes(role) || text(s, "agent_id") === a.id);
          const last = runs.sort((x, y) => String(pick(y, "created_at")).localeCompare(String(pick(x, "created_at"))))[0];
          return (
            <article key={a.id} className="mhq-agent">
              <div className="mhq-head"><b>{text(a, "name", "display_name") || role || "Agente"}</b><Status value={text(a, "status") || (pick(a, "enabled") === false ? "disabled" : "idle")} /></div>
              <p className="mhq-muted">{role}{pick(a, "enabled") === false ? " · desativado" : ""}</p>
              <p className="mhq-muted">Execuções registradas: {runs.length}</p>
              <p className="mhq-muted">Última: {last ? `${STATUS_LABEL[text(last, "status")] ?? text(last, "status")} · ${fmtDate(pick(last, "completed_at", "started_at", "created_at"))}` : "nenhuma"}</p>
            </article>);
        })}</div>)}
    </section>
  );
}

function ActivityLog({ rows, error }: { rows: Row[]; error?: string | undefined }) {
  return (
    <section className="mhq-card">
      <h2>Auditoria</h2><TableError msg={error} />
      {rows.length === 0 ? <Empty>Nenhuma atividade registrada.</Empty> : (
        <ul className="mhq-list">{rows.slice(0, 200).map((r) => (
          <li key={r.id} className="mhq-plain mhq-log">
            <time>{fmtDate(pick(r, "created_at"))}</time>
            <b>{text(r, "event_type", "action", "event", "type") || "evento"}</b>
            <span className="mhq-muted">{text(r, "actor", "actor_type", "agent_role")}</span>
            {pick(r, "metadata_json", "details", "metadata") !== undefined && <details><summary>Detalhes</summary><Content value={pick(r, "details", "metadata")} /></details>}
          </li>))}</ul>)}
    </section>
  );
}
