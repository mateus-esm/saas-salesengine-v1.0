import { describe, expect, it } from "vitest";

import { dueAtFromLocal, defaultDue, followupErrorMessage, followupStatusLabel } from "../followups";

describe("dueAtFromLocal", () => {
  it("09:00 em Brasília vira 12:00Z", () => {
    expect(dueAtFromLocal("2026-11-20", "09:00")).toBe("2026-11-20T12:00:00.000Z");
  });
  it("passa da meia-noite UTC quando necessário", () => {
    expect(dueAtFromLocal("2026-11-20", "22:30")).toBe("2026-11-21T01:30:00.000Z");
  });
  it("respeita outro fuso", () => {
    expect(dueAtFromLocal("2026-11-20", "09:00", "UTC")).toBe("2026-11-20T09:00:00.000Z");
  });
});

describe("defaultDue", () => {
  it("soma dias ao dia de Brasília, às 09:00", () => {
    // 2026-11-13 12:00Z = 09:00 em Brasília
    expect(defaultDue(7, new Date("2026-11-13T12:00:00Z"))).toEqual({ date: "2026-11-20", time: "09:00" });
  });
  it("usa o dia de Brasília, não o de UTC", () => {
    // 01:00Z do dia 14 ainda é dia 13 em Brasília
    expect(defaultDue(1, new Date("2026-11-14T01:00:00Z"))).toEqual({ date: "2026-11-14", time: "09:00" });
  });
  it("vira o mês", () => {
    expect(defaultDue(3, new Date("2026-11-29T15:00:00Z")).date).toBe("2026-12-02");
  });
});

describe("followupErrorMessage", () => {
  it("traduz os códigos que a pessoa pode encontrar", () => {
    expect(followupErrorMessage(new Error("no_outreach_line"))).toBe(
      "Configure uma linha de WhatsApp em Outreach para enviar mensagens.",
    );
    expect(followupErrorMessage({ message: "invalid_due_at" })).toBe("Escolha uma data futura.");
    expect(followupErrorMessage({ message: "message_required" })).toBe("Escreva a mensagem.");
    expect(followupErrorMessage({ message: "invalid_owner" })).toMatch(/responsável/);
    expect(followupErrorMessage({ message: "invalid_return_stage" })).toMatch(/etapa/);
  });
  it("cai numa frase genérica para o resto", () => {
    expect(followupErrorMessage({ message: "boom" })).toBe("Não foi possível salvar o follow-up.");
  });
});

describe("followupStatusLabel", () => {
  it("rotula cada estado", () => {
    expect(followupStatusLabel("scheduled")).toBe("Agendado");
    expect(followupStatusLabel("done")).toBe("Feito");
    expect(followupStatusLabel("cancelled")).toBe("Cancelado");
    expect(followupStatusLabel("failed")).toBe("Falhou");
  });
});
