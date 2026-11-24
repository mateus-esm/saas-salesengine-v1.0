import { describe, expect, it } from "vitest";

import { metaAssetSummary, metaConnectionState, metaCallbackParams, type MetaAsset, type MetaStatus } from "../meta";

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
