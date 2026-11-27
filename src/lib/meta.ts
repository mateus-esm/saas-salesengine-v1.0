// Sprint 17 — Integração nativa com o Meta: tipos e regras puras da tela.

export interface MetaAsset {
  id: string;
  asset_type: "page" | "ad_account" | "dataset";
  external_id: string;
  name: string | null;
  status: "available" | "active" | "error" | "disconnected";
  subscribed_at: string | null;
  last_event_at: string | null;
  last_error: string | null;
}

export interface MetaIntegrationRow {
  id: string;
  provider: "meta";
  status: "connected" | "error" | "disconnected";
  settings: {
    business_id?: string | null;
    business_name?: string | null;
    fb_user_name?: string | null;
    granted_scopes?: string[];
    discovery_warnings?: string[];
    capi_enabled?: boolean;
  };
  last_sync_error: string | null;
  updated_at: string | null;
}

export interface MetaQueue {
  queued: number;
  done: number;
  error: number;
  dead: number;
  last_lead_at: string | null;
  recent_errors: { leadgen_id: string; status: string; error: string | null; received_at: string; attempts: number }[];
}

export interface MetaStatus {
  configured: boolean;
  graph_version: string;
  integration: MetaIntegrationRow | null;
  assets: MetaAsset[];
  queue?: MetaQueue;
}

export interface MetaForm {
  id: string;
  name: string;
  meta_form_id: string;
  meta_page_id: string | null;
  pipeline_id: string | null;
  active: boolean;
  leads: number;
  last_lead_at: string | null;
}

export interface CapiMapping {
  stage_id: string;
  event_name: string;
  active: boolean;
}

export interface CapiRecent {
  id: string;
  event_name: string;
  status: "queued" | "processing" | "sent" | "error" | "skipped" | "dead";
  skip_reason: string | null;
  match_key: string | null;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
  test_event_code: string | null;
  response: { events_received: number | null; fbtrace_id: string | null } | null;
}

export interface CapiConfig {
  dataset_id: string | null;
  capi_enabled: boolean;
  lead_event_source: string;
  pipelines: { id: string; name: string }[];
  stages: { id: string; name: string; pipeline_id: string; position: number }[];
  mappings: CapiMapping[];
  recent: CapiRecent[];
}

/** Nome de evento sugerido para uma etapa (a regra do banco: [A-Za-z0-9_]{1,50}). */
export function suggestEventName(stageName: string): string {
  const s = stageName
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50)
    .replace(/_+$/g, "");
  return s || "etapa";
}

export const isValidEventName = (s: string) => /^[A-Za-z0-9_]{1,50}$/.test(s);

export type MetaQueueHealth = "idle" | "ok" | "working" | "attention";

export function metaQueueHealth(q: MetaQueue | undefined): MetaQueueHealth {
  if (!q) return "idle";
  if (q.dead > 0 || q.error > 0) return "attention";
  if (q.queued > 0) return "working";
  return "ok";
}

const SKIP_LABEL: Record<string, string> = {
  no_match_key: "Sem chave para casar o lead (sem formulário, clique ou contato)",
  too_old: "Mais de 7 dias ou antes do lead (o Meta recusaria)",
  capi_off: "API de Conversões desligada",
  no_dataset: "Sem Pixel/Dataset escolhido",
  whatsapp_requires_waba: "Lead de WhatsApp: exige a API oficial do WhatsApp Business",
};

export const capiSkipLabel = (r: string | null | undefined) => (r ? SKIP_LABEL[r] ?? r : "");

export type MetaConnectionState = "loading" | "unconfigured" | "disconnected" | "reconnect" | "connected";

export function metaConnectionState(s: MetaStatus | undefined): MetaConnectionState {
  if (!s) return "loading";
  if (!s.configured) return "unconfigured";
  const st = s.integration?.status;
  if (!st || st === "disconnected") return "disconnected";
  return st === "error" ? "reconnect" : "connected";
}

export function metaAssetSummary(assets: MetaAsset[]) {
  const pages = assets.filter((a) => a.asset_type === "page");
  return {
    pages: pages.length,
    activePages: pages.filter((a) => a.status === "active").length,
    adAccounts: assets.filter((a) => a.asset_type === "ad_account").length,
    datasets: assets.filter((a) => a.asset_type === "dataset").length,
    errors: assets.filter((a) => a.status === "error").length,
  };
}

/** O que o Meta devolveu no redirecionamento do diálogo OAuth. */
export function metaCallbackParams(search: string): { kind: "code"; code: string; state: string } | { kind: "error"; message: string } {
  const p = new URLSearchParams(search);
  if (p.get("error")) {
    return {
      kind: "error",
      message: p.get("error_reason") === "user_denied" || p.get("error") === "access_denied"
        ? "A conexão foi cancelada no Meta."
        : `O Meta recusou a conexão: ${p.get("error_description") ?? p.get("error")}`,
    };
  }
  const code = p.get("code");
  const state = p.get("state");
  if (!code || !state) return { kind: "error", message: "O retorno do Meta veio incompleto. Tente conectar de novo." };
  return { kind: "code", code, state };
}

/**
 * O Meta volta sempre para o endereço único (rev.). Se o state traz outro domínio de nicho
 * (`<nonce>.<host>`), devolve a URL para repassar o navegador para lá — onde está a sessão
 * certa. Só repassa para https em `*.soloventures.com.br`; senão null (conecta aqui mesmo).
 */
export function metaForwardUrl(search: string, currentHost: string): string | null {
  const p = new URLSearchParams(search);
  const state = p.get("state") ?? "";
  const dot = state.indexOf(".");
  if (dot < 0) return null;
  const host = state.slice(dot + 1).toLowerCase();
  if (!/^([a-z0-9-]+\.)*soloventures\.com\.br$/.test(host)) return null;
  if (host === currentHost.toLowerCase()) return null;
  return `https://${host}/integracoes/meta/callback?${p.toString()}`;
}
