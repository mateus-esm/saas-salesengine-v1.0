import { describe, expect, it } from "vitest";
import { emptySequenceDraft, reindexSteps, sequenceToDraft } from "./outreach-config";

describe("rascunho da configuração de outreach", () => {
  it("nasce desligado e sem porta implícita", () => {
    const draft = emptySequenceDraft();
    expect(draft.active).toBe(false);
    expect(draft.trigger_entry_ids).toEqual([]);
    expect(draft.steps).toHaveLength(1);
  });

  it("reindexa mensagens depois de remover uma etapa", () => {
    const steps = reindexSteps([
      { position: 0, offset_minutes: 0, message_template: "um" },
      { position: 2, offset_minutes: 120, message_template: "três" },
    ]);
    expect(steps.map((step) => step.position)).toEqual([0, 1]);
  });

  it("converte resposta da API sem inventar regra de disparo", () => {
    const draft = sequenceToDraft({
      id: "S1",
      name: "Entrada",
      active: true,
      trigger_entry_ids: ["E1"],
      steps: [{ offset_minutes: 0, message_template: "Oi" }],
    });
    expect(draft.trigger_event).toBe("lead_intake");
    expect(draft.trigger_entry_ids).toEqual(["E1"]);
    expect(draft.steps[0].message_template).toBe("Oi");
  });
});
