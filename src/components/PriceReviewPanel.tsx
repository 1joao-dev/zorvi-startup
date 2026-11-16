import { useState } from "react";
import { Check, ChevronDown, ChevronUp, ExternalLink, LockKeyhole, RefreshCw, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type PriceReviewItem = {
  id: string;
  price: number | string;
  currency: string;
  price_type: string;
  source_url: string | null;
  source_label: string | null;
  observed_at: string;
  availability_status: "available" | "unavailable" | "unknown";
  products: {
    name: string;
    brand: string | null;
    variant: string | null;
    unit: string | null;
    category: string;
  } | null;
  stores: {
    name: string;
    category: string;
    address: string;
    city: string;
    state: string;
    verification_status: string;
  } | null;
};

type ReviewAction = "approve" | "reject";

function formatReviewPrice(value: number | string, currencyCode: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Valor inválido";
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currencyCode || "BRL",
    }).format(amount);
  } catch {
    return "R$ " + amount.toFixed(2).replace(".", ",");
  }
}

function formatReviewDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não informada" : date.toLocaleString("pt-BR");
}

function priceTypeLabel(value: string) {
  if (value === "official_site") return "Preço publicado no site oficial";
  if (value === "community_report") return "Relato da comunidade";
  if (value === "in_store") return "Preço informado em loja";
  if (value === "estimated") return "Estimativa";
  return "Tipo de preço não identificado";
}

function availabilityLabel(value: PriceReviewItem["availability_status"]) {
  if (value === "available") return "Disponibilidade indicada pela fonte";
  if (value === "unavailable") return "Sem estoque informado";
  return "Estoque não confirmado";
}

function safeSourceUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function PriceReviewPanel() {
  const [open, setOpen] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [items, setItems] = useState<PriceReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const invokeReview = async (body: { action: "list_pending" | ReviewAction; price_id?: string }) => {
    if (!supabase) throw new Error("Supabase não está configurado.");
    const { data, error: invokeError } = await supabase.functions.invoke("price-review", {
      body,
      headers: { "x-zorvi-admin-token": adminToken.trim() },
    });
    if (invokeError) {
      let message = invokeError.message || "Não foi possível acessar a moderação de preços.";
      const context = (invokeError as unknown as { context?: Response }).context;
      if (context && typeof context.clone === "function") {
        const payload = await context.clone().json().catch(() => null) as { error?: string } | null;
        if (payload?.error) message = payload.error;
      }
      throw new Error(message);
    }
    if (data?.error) throw new Error(String(data.error));
    return data;
  };

  const loadPending = async () => {
    if (adminToken.trim().length < 32) {
      setError("Informe o token administrativo configurado para a importação do catálogo.");
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const data = await invokeReview({ action: "list_pending" });
      setItems(Array.isArray(data?.items) ? data.items as PriceReviewItem[] : []);
      setAuthorized(true);
    } catch (cause) {
      setAuthorized(false);
      setItems([]);
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os preços pendentes.");
    } finally {
      setLoading(false);
    }
  };

  const reviewPrice = async (priceId: string, action: ReviewAction) => {
    setBusyId(priceId);
    setError("");
    setNotice("");
    try {
      await invokeReview({ action, price_id: priceId });
      setItems((current) => current.filter((item) => item.id !== priceId));
      setNotice(action === "approve"
        ? "Preço aprovado. Ele poderá aparecer nas comparações se estiver dentro dos últimos 30 dias."
        : "Preço rejeitado e mantido fora das comparações.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível revisar este preço.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="price-review-panel">
      <button
        type="button"
        className="price-review-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="price-review-icon"><ShieldCheck size={18} /></span>
        <span className="price-review-title">
          <b>Moderação de preços</b>
          <small>Confira as fontes antes de liberar comparações</small>
        </span>
        <span className="price-review-count">{authorized ? items.length + " pendentes" : "Admin"}</span>
        {open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
      </button>

      {open && (
        <div className="price-review-body">
          <p className="price-review-intro">
            Use o mesmo token administrativo da importação do catálogo. Ele é validado no servidor e não fica salvo no navegador.
            Confira produto, apresentação, loja e fonte antes de aprovar.
          </p>
          <form
            className="price-review-token-row"
            onSubmit={(event) => { event.preventDefault(); void loadPending(); }}
          >
            <label className="profile-form-label">
              Token administrativo
              <input
                type="password"
                value={adminToken}
                autoComplete="off"
                spellCheck={false}
                placeholder="Cole o token de importação"
                onChange={(event) => {
                  setAdminToken(event.target.value);
                  setAuthorized(false);
                  setItems([]);
                  setError("");
                  setNotice("");
                }}
              />
            </label>
            <button type="submit" className="primary-button" disabled={loading || busyId !== null || !adminToken.trim()}>
              {loading ? "Validando..." : authorized ? "Atualizar" : "Acessar"}
              <RefreshCw size={15} />
            </button>
          </form>

          {error && <p className="price-review-error">{error}</p>}
          {notice && <p className="price-review-notice">{notice}</p>}

          {authorized && (
            items.length > 0 ? (
              <div className="price-review-list">
                {items.map((item) => {
                  const sourceUrl = safeSourceUrl(item.source_url);
                  const productDetails = [item.products?.brand, item.products?.variant, item.products?.unit].filter(Boolean).join(" · ");
                  const storeAddress = [item.stores?.address, item.stores?.city, item.stores?.state].filter(Boolean).join(", ");
                  return (
                    <article className="price-review-card" key={item.id}>
                      <div className="price-review-card-head">
                        <div>
                          <b>{item.products?.name || "Produto sem nome"}</b>
                          {productDetails && <small>{productDetails}</small>}
                        </div>
                        <strong>{formatReviewPrice(item.price, item.currency)}</strong>
                      </div>
                      <div className="price-review-meta">
                        <div>
                          <small>Estabelecimento</small>
                          <b>{item.stores?.name || "Estabelecimento não identificado"}</b>
                          <span>{storeAddress || "Endereço não informado"}</span>
                          <span>{item.stores?.verification_status === "verified" ? "Estabelecimento verificado" : "Estabelecimento precisa de revisão"}</span>
                        </div>
                        <div>
                          <small>Fonte do preço</small>
                          <b>{priceTypeLabel(item.price_type)}</b>
                          <span>{item.source_label || "Fonte não informada"}</span>
                          {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer">Abrir fonte original <ExternalLink size={12} /></a>}
                        </div>
                        <div>
                          <small>Observação</small>
                          <b>{formatReviewDate(item.observed_at)}</b>
                          <span>{availabilityLabel(item.availability_status)}</span>
                        </div>
                      </div>
                      <div className="price-review-actions">
                        <button
                          type="button"
                          className="price-review-approve"
                          disabled={busyId !== null || loading}
                          onClick={() => void reviewPrice(item.id, "approve")}
                        >
                          <Check size={15} /> Aprovar e liberar
                        </button>
                        <button
                          type="button"
                          className="price-review-reject"
                          disabled={busyId !== null || loading}
                          onClick={() => void reviewPrice(item.id, "reject")}
                        >
                          <X size={15} /> Rejeitar
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="price-review-empty">Nenhum preço pendente de revisão no momento.</div>
            )
          )}
        </div>
      )}
    </section>
  );
}
