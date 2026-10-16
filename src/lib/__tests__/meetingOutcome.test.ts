import { describe, expect, it } from "vitest";
import {
  MEETING_OUTCOMES,
  canRecordOutcome,
  nextOutcome,
  outcomeErrorMessage,
  outcomeLabel,
  outcomeToast,
} from "@/lib/meetingOutcome";

describe("meetingOutcome", () => {
  it("visita técnica e realizada contam como meeting_done; no-show como no_show", () => {
    expect(MEETING_OUTCOMES.map((o) => [o.value, o.marco])).toEqual([
      ["done", "meeting_done"],
      ["no_show", "no_show"],
      ["technical_visit", "meeting_done"],
    ]);
    expect(outcomeLabel("technical_visit")).toBe("Visita técnica");
    expect(outcomeLabel(null)).toBeNull();
  });

  it("botão só em reunião ligada a contato ou negócio", () => {
    expect(canRecordOutcome({ type: "meeting", lead_id: "l" })).toBe(true);
    expect(canRecordOutcome({ type: "meeting", lead_id: null, opportunity_id: "o" })).toBe(true);
    expect(canRecordOutcome({ type: "meeting", lead_id: null })).toBe(false);
    expect(canRecordOutcome({ type: "block", lead_id: "l" })).toBe(false);
  });

  it("clicar no marcado desfaz só na agenda", () => {
    expect(nextOutcome("done", "done", true)).toBeNull();
    expect(nextOutcome("done", "no_show", true)).toBe("no_show");
    expect(nextOutcome("done", "done", false)).toBe("done");
  });

  it("erros do RPC viram texto", () => {
    expect(outcomeErrorMessage({ message: "opportunity_required" })).toMatch(/não tem negócio aberto/);
    expect(outcomeErrorMessage({ message: "forbidden" })).toMatch(/Sem permissão/);
    expect(outcomeErrorMessage(new Error("boom"))).toBe("Não foi possível registrar o desfecho.");
    expect(outcomeErrorMessage({ message: "outcome_conflict: já existe no-show para este negócio neste dia; desfaça antes" }))
      .toMatch(/no-show registrado hoje/);
    expect(outcomeErrorMessage({ message: "outcome_conflict: já existe reunião realizada para este negócio neste dia; desfaça antes" }))
      .toMatch(/reunião realizada registrada hoje/);
  });

  it("toast distingue gravado, já contado e desfeito", () => {
    expect(outcomeToast({ outcome: "no_show" })).toBe("No-show registrado");
    expect(outcomeToast({ outcome: "done", already_recorded: true })).toBe("Realizada: já estava contado hoje");
    expect(outcomeToast({ outcome: null })).toBe("Desfecho desfeito");
  });
});
