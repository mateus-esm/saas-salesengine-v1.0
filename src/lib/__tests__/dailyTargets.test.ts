import { describe, expect, it } from "vitest";
import { parseDailyTargets, serializeDailyTargets } from "@/lib/dailyTargets";

describe("parseDailyTargets", () => {
  it("lê números e texto; lixo e ausência viram vazio", () => {
    expect(parseDailyTargets({ touchpoints: 30, revenue: "1500,5", deals_won: "x", extra: 1 })).toEqual({
      touchpoints: "30",
      revenue: "1500.5",
    });
    expect(parseDailyTargets(null)).toEqual({});
    expect(parseDailyTargets("abc")).toEqual({});
  });
});

describe("serializeDailyTargets", () => {
  it("campo vazio apaga a chave (deriva), 0 explícito fica", () => {
    expect(serializeDailyTargets({ touchpoints: "30", deals_won: "", revenue: "0" })).toEqual({
      touchpoints: 30,
      revenue: 0,
    });
  });

  it("nada preenchido: undefined, para a chave sair do config", () => {
    expect(serializeDailyTargets({ touchpoints: "  ", qualified: "" }, { touchpoints: 10 })).toBeUndefined();
    expect(serializeDailyTargets(undefined)).toBeUndefined();
  });

  it("preserva chaves desconhecidas já gravadas e aceita vírgula", () => {
    expect(serializeDailyTargets({ meetings_done: "2,5" }, { custom_x: 9, meetings_done: 1 })).toEqual({
      custom_x: 9,
      meetings_done: 2.5,
    });
  });

  it("ida e volta", () => {
    const stored = serializeDailyTargets({ touchpoints: "40", qualified: "3" });
    expect(parseDailyTargets(stored)).toEqual({ touchpoints: "40", qualified: "3" });
  });
});
