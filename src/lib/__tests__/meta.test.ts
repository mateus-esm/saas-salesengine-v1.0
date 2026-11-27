import { describe, expect, it } from "vitest";

import {
  capiSkipLabel,
  isValidEventName,
  metaAssetSummary,
  metaCallbackParams,
  metaConnectionState,
  metaQueueHealth,
  suggestEventName,
  type MetaAsset,
  type MetaStatus,
} from "../meta";

const asset = (asset_type: MetaAsset["asset_type"], status: MetaAsset["status"] = "available"): MetaAsset => ({
  id: Math.random().toString(),
  asset_type,
  external_id: "x",
  name: "n",
  status,
  subscribed_at: null,
  last_event_at: null,
  last_error: null,
});

const status = (over: Partial<MetaStatus> = {}): MetaStatus => ({
  configured: true,
  graph_version: "v27.0",
  integration: null,
  assets: [],
  ...over,
});

describe("metaConnectionState", () => {
  it("sem app configurado no Rev", () => expect(metaConnectionState(status({ configured: false }))).toBe("unconfigured"));
  it("sem integração ou desconectada", () => {
    expect(metaConnectionState(status())).toBe("disconnected");
    expect(metaConnectionState(status({ integration: { status: "disconnected" } as MetaStatus["integration"] }))).toBe("disconnected");
  });
  it("erro de token pede reconexão", () =>
    expect(metaConnectionState(status({ integration: { status: "error" } as MetaStatus["integration"] }))).toBe("reconnect"));
  it("conectada", () =>
    expect(metaConnectionState(status({ integration: { status: "connected" } as MetaStatus["integration"] }))).toBe("connected"));
  it("carregando", () => expect(metaConnectionState(undefined)).toBe("loading"));
});

describe("metaAssetSummary", () => {
  it("conta por tipo e as páginas ativas", () => {
    const s = metaAssetSummary([asset("page", "active"), asset("page"), asset("ad_account"), asset("dataset"), asset("page", "error")]);
    expect(s).toEqual({ pages: 3, activePages: 1, adAccounts: 1, datasets: 1, errors: 1 });
  });
});

describe("metaCallbackParams", () => {
  it("código e state", () =>
    expect(metaCallbackParams("?code=abc&state=st")).toEqual({ kind: "code", code: "abc", state: "st" }));
  it("cancelado pelo usuário", () =>
    expect(metaCallbackParams("?error=access_denied&error_reason=user_denied&state=st")).toEqual({
      kind: "error",
      message: "A conexão foi cancelada no Meta.",
    }));
  it("faltando state", () => expect(metaCallbackParams("?code=abc").kind).toBe("error"));
});

describe("Sprint 17 · Fases 2–4 — helpers da tela", () => {
  it("suggestEventName: etapa → snake_case sem acento", () => {
    expect(suggestEventName("Qualificação SQL")).toBe("qualificacao_sql");
    expect(suggestEventName("  Proposta enviada! ")).toBe("proposta_enviada");
    expect(suggestEventName("")).toBe("etapa");
    expect(suggestEventName("a".repeat(80)).length).toBe(50);
  });

  it("isValidEventName segue a regra do banco", () => {
    expect(isValidEventName("qualified_lead")).toBe(true);
    expect(isValidEventName("com espaço")).toBe(false);
    expect(isValidEventName("")).toBe(false);
  });

  it("metaQueueHealth: dead/erro pede atenção, fila vazia está ok", () => {
    expect(metaQueueHealth(undefined)).toBe("idle");
    expect(metaQueueHealth({ queued: 0, done: 3, error: 0, dead: 0, last_lead_at: null, recent_errors: [] })).toBe("ok");
    expect(metaQueueHealth({ queued: 2, done: 3, error: 0, dead: 0, last_lead_at: null, recent_errors: [] })).toBe("working");
    expect(metaQueueHealth({ queued: 0, done: 3, error: 1, dead: 0, last_lead_at: null, recent_errors: [] })).toBe("attention");
    expect(metaQueueHealth({ queued: 0, done: 0, error: 0, dead: 1, last_lead_at: null, recent_errors: [] })).toBe("attention");
  });

  it("capiSkipLabel traduz o motivo", () => {
    expect(capiSkipLabel("whatsapp_requires_waba")).toMatch(/WhatsApp/);
    expect(capiSkipLabel("too_old")).toMatch(/7 dias/);
    expect(capiSkipLabel(null)).toBe("");
  });
});

import { metaForwardUrl } from "../meta";

describe("metaForwardUrl", () => {
  const q = "?code=ABC&state=nonce_-x.solon.soloventures.com.br";
  it("repassa para o nicho que veio no state", () => {
    expect(metaForwardUrl(q, "rev.soloventures.com.br")).toBe(
      "https://solon.soloventures.com.br/integracoes/meta/callback?code=ABC&state=nonce_-x.solon.soloventures.com.br",
    );
  });
  it("não repassa quando já está no domínio certo", () => {
    expect(metaForwardUrl(q, "solon.soloventures.com.br")).toBeNull();
  });
  it("não repassa state sem domínio ou com domínio estranho", () => {
    expect(metaForwardUrl("?code=A&state=nonce", "rev.soloventures.com.br")).toBeNull();
    expect(metaForwardUrl("?code=A&state=n.evil.com", "rev.soloventures.com.br")).toBeNull();
    expect(metaForwardUrl("?code=A&state=n.soloventures.com.br.evil.com", "rev.soloventures.com.br")).toBeNull();
    expect(metaForwardUrl("?code=A&state=n.evil.com/x.soloventures.com.br", "rev.soloventures.com.br")).toBeNull();
  });
  it("repassa também o erro do Meta para o nicho mostrar", () => {
    expect(metaForwardUrl("?error=access_denied&state=n.solon.soloventures.com.br", "rev.soloventures.com.br")).toContain(
      "https://solon.soloventures.com.br/integracoes/meta/callback?error=access_denied",
    );
  });
});
