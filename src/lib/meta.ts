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

export interface MetaStatus {
  configured: boolean;
  graph_version: string;
  integration: MetaIntegrationRow | null;
  assets: MetaAsset[];
}

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
