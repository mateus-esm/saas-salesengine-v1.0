// SE-COPILOT-002 — the pipeline's `ai_decisions` rows, in the words the shared
// approval queue reads: what, where, how sure, why it waits, in what state.

import { describe, expect, it } from "vitest";

import {
  actionableDecisions,
  decisionToQueueItem,
  summarizeResolveOutcomes,
} from "../copilotApprovals";
import type { AiDecision } from "@/hooks/useCopilotApprovals";

const decision = (over: Partial<AiDecision> = {}): AiDecision => ({
  id: "d1",
  equipe_id: "e1",
  pipeline_id: "p1",
  lead_id: "l1",
  opportunity_id: "o1",
  agent_role: "copilot",
  status: "pending_approval",
  output_action: { action: { type: "move_stage" }, label: "Moveu para Ganho", why: "risky" },
  input_summary: "Cliente confirmou por WhatsApp",
  confidence_score: 0.62,
  created_at: "2026-09-14T13:00:00.000Z",
  lead: { id: "l1", name: "Ana Souza", phone: "5511999998888" },
  ...over,
});

describe("the pipeline's approval queue", () => {
  it("names the action, the deal, the confidence, the reason and the state", () => {
    const item = decisionToQueueItem(decision());

    expect(item.label).toBe("Moveu para Ganho");
    expect(item.contact).toBe("Ana Souza");
    expect(item.confidence).toBe(0.62);
    expect(item.why).toBe("risky");
    expect(item.reason).toBe("Cliente confirmou por WhatsApp");
    expect(item.status).toBe("pending_approval");
    expect(item.at).toBe("2026-09-14T13:00:00.000Z");
    expect(item.pipeline_id).toBe("p1");
  });

  it("falls back to the verb's own sentence on a legacy payload, with no lead", () => {
    const item = decisionToQueueItem(
      decision({
        output_action: { verb: "add_note", args: { content: "Ligou de novo" } },
        lead: null,
      }),
    );

    expect(item.label).toBe("Adicionar nota");
    expect(item.why).toBeNull();
    expect(item.contact).toBeNull();
  });

  it("leaves the intent-only guard rows out of the queue", () => {
    const guard = decision({ id: "guard", output_action: { intent_detected: true } });
    const real = decision({ id: "real" });

    expect(actionableDecisions([guard, real]).map((d) => d.id)).toEqual(["real"]);
    expect(actionableDecisions(undefined)).toEqual([]);
  });

  it("folds N parallel answers into one summary — a throw is one error, not the batch", () => {
    const outcomes: PromiseSettledResult<unknown>[] = [
      { status: "fulfilled", value: {} },
      { status: "fulfilled", value: {} },
      { status: "rejected", reason: new Error("500") },
    ];

    expect(summarizeResolveOutcomes(outcomes)).toEqual({
      total: 3,
      ok: 2,
      stale: 0,
      notPending: 0,
      failed: 1,
    });
  });
});
