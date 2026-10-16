import { describe, it, expect } from "vitest";
import {
  webhookOrigin,
  sampleEventPayload,
  logStatus,
  filterWebhookLogs,
  isFailedDelivery,
  type StageLink,
  lossReasonMissing,
} from "@/lib/webhookCatalog";
import type { WebhookConfig, WebhookLog } from "@/types/webhook";

const cfg = (over: Partial<WebhookConfig>): WebhookConfig => ({
  id: "w1", equipe_id: "e", name: "n", url: "u", trigger_event: "lead_created",
  active: true, headers: {}, payload_template: {}, created_at: "", ...over,
});
const log = (over: Partial<WebhookLog>): WebhookLog => ({
  id: "l", equipe_id: "e", webhook_config_id: "w1", direction: "outbound", event_type: "lead_created",
  payload: {}, response_status: 200, response_body: null, error_message: null, request_id: null,
  created_at: "2026-10-10T12:00:00Z", ...over,
});

describe("webhookOrigin", () => {
  const stages: StageLink[] = [
    { id: "s1", name: "Fechado ganho", pipeline_name: "Vendas", webhook_triggers: [{ event: "on_stage_entered", webhook_id: "w1" }] },
  ];
  it("liga pela lista de gatilhos da etapa", () => {
    expect(webhookOrigin(cfg({ trigger_event: "stage_entered:w1" }), stages)).toEqual({
      kind: "stage", label: "Etapa Fechado ganho → ao entrar",
    });
  });
  it("convenção textual sem etapa encontrada degrada sem quebrar", () => {
    expect(webhookOrigin(cfg({ trigger_event: "stage_entered:w9" }), [])).toEqual({
      kind: "stage", label: "Etapa (não encontrada) → ao entrar",
    });
  });
  it("etapa achada só por webhook_triggers também conta", () => {
    expect(webhookOrigin(cfg({ trigger_event: "lead_created" }), stages).kind).toBe("stage");
  });
  it("botão e evento comum", () => {
    expect(webhookOrigin(cfg({ trigger_event: "artifact_action:a1", name: "Botão X" }), [])).toEqual({
      kind: "button", label: "Botão Botão X → ao clicar",
    });
    expect(webhookOrigin(cfg({ trigger_event: "lead_created" }), [])).toEqual({ kind: "event", label: "Novo lead (adicionado ao Pipeline)" });
  });
  it("sem stages (coluna ausente) não quebra", () => {
    expect(webhookOrigin(cfg({}), undefined).kind).toBe("event");
  });
});

describe("sampleEventPayload", () => {
  it("etapa/botão têm o formato do negócio ganho", () => {
    const p = sampleEventPayload("stage_entered:w1") as Record<string, any>;
    expect(p.event).toBe("deal_won");
    expect(p.data.pipeline).toBeTruthy();
    expect(p.data.campos).toBeTruthy();
    expect(Array.isArray(p.data.itens)).toBe(true);
    expect(Array.isArray(p.data.artefatos)).toBe(true);
  });
  it("lead_created traz lead e opportunity", () => {
    const p = sampleEventPayload("lead_created") as Record<string, any>;
    expect(p.lead.name).toBeTruthy();
    expect(p.opportunity.pipeline_id).toBeTruthy();
  });
});

describe("lossReasonMissing", () => {
  const lost: StageLink = { id: "s", name: "Perdida", stage_type: "lost", loss_reasons: ["Preço"] };
  it("exige motivo só em etapa de perda com lista", () => {
    expect(lossReasonMissing(lost, "")).toBe(true);
    expect(lossReasonMissing(lost, "Preço")).toBe(false);
    expect(lossReasonMissing({ ...lost, loss_reasons: [] }, "")).toBe(false);
    expect(lossReasonMissing({ ...lost, stage_type: "open" }, "")).toBe(false);
    expect(lossReasonMissing(undefined, "")).toBe(false);
  });
});

describe("logs", () => {
  it("status", () => {
    expect(logStatus(log({}))).toBe("success");
    expect(logStatus(log({ response_status: 500 }))).toBe("error");
    expect(logStatus(log({ response_status: null, error_message: "x" }))).toBe("error");
    expect(logStatus(log({ response_status: null, response_body: "Queued by pg_net" }))).toBe("pending");
  });
  it("falha reenviável: só saída com erro", () => {
    expect(isFailedDelivery(log({ response_status: 500 }))).toBe(true);
    expect(isFailedDelivery(log({}))).toBe(false);
    expect(isFailedDelivery(log({ direction: "inbound", response_status: 500 }))).toBe(false);
  });
  it("filtros por status, evento e data", () => {
    const logs = [
      log({ id: "a" }),
      log({ id: "b", response_status: 500, event_type: "stage_entered:w1", created_at: "2026-10-12T12:00:00Z" }),
    ];
    expect(filterWebhookLogs(logs, { status: "error" }).map((l) => l.id)).toEqual(["b"]);
    expect(filterWebhookLogs(logs, { event: "stage_entered:w1" }).map((l) => l.id)).toEqual(["b"]);
    expect(filterWebhookLogs(logs, { from: "2026-10-11", to: "2026-10-12" }).map((l) => l.id)).toEqual(["b"]);
    expect(filterWebhookLogs(logs, { to: "2026-10-10" }).map((l) => l.id)).toEqual(["a"]);
    expect(filterWebhookLogs(logs, {}).length).toBe(2);
  });
});
