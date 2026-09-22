// SE-COPILOT-002 — the Onda 6 payload that `crm_copilot_apply` writes (nested
// `action` + the sentence already written for a person) must read as that
// sentence, not as "manual". The legacy flat payloads stay untouched.

import { describe, expect, it } from "vitest";

import { formatCopilotActivity } from "../copilotActivity";

const onda6 = {
  run_id: "r1",
  index: 0,
  action: { type: "move_stage", stage_id: "s2" },
  label: "Ganho",
  expected: { stage_id: "s1" },
  why: "risky",
  model: "gpt-x",
};

describe("formatCopilotActivity", () => {
  it("reads the nested Onda 6 action as the stored sentence", () => {
    const activity = formatCopilotActivity(onda6, { leadName: "Ana" });

    expect(activity.verb).toBe("move_stage");
    expect(activity.title).toBe("Ganho");
    expect(activity.field).toBe("Etapa");
    expect(activity.result).toBe("Ganho");
  });

  it("falls back to the verb's own name when the row carries no label", () => {
    const activity = formatCopilotActivity({ action: { type: "add_tag" } });

    expect(activity.verb).toBe("add_tag");
    expect(activity.title).toBe("Adicionar etiqueta");
  });

  it("keeps the legacy flat payloads exactly as they were", () => {
    const activity = formatCopilotActivity(
      { verb: "move_stage", stage_name: "Proposta" },
      { leadName: "Ana" },
    );

    expect(activity.verb).toBe("move_stage");
    expect(activity.title).toBe("Mover Ana para Proposta");
    expect(activity.field).toBe("Etapa");
  });
});
