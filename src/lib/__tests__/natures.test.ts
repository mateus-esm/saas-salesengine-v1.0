import { describe, expect, it } from "vitest";

import { missingMilestones, normalizeNatures, stagesForProcess } from "../natures";

describe("normalizeNatures", () => {
  it("empty or broken config reads as today's behaviour: free value, no declared milestones", () => {
    expect(normalizeNatures(null)).toEqual({
      offer: { mode: "free", catalog_item_ids: [] },
      process: { mode: "milestones", milestones: [] },
    });
    expect(normalizeNatures({ offer: { mode: "bogus" }, process: 42 })).toEqual({
      offer: { mode: "free", catalog_item_ids: [] },
      process: { mode: "milestones", milestones: [] },
    });
  });

  it("keeps valid values, drops unknown milestones, orders them the funnel way", () => {
    const n = normalizeNatures({
      offer: { mode: "catalog", catalog_item_ids: ["c1", 7, "c2"] },
      process: { mode: "milestones", milestones: ["proposal_sent", "nope", "qualified"] },
    });
    expect(n.offer).toEqual({ mode: "catalog", catalog_item_ids: ["c1", "c2"] });
    expect(n.process.milestones).toEqual(["qualified", "proposal_sent"]);
  });
});

describe("stagesForProcess — choosing milestones generates the line", () => {
  it("milestones: entry, one stage per milestone (declaring it), won, lost", () => {
    const stages = stagesForProcess({ mode: "milestones", milestones: ["meeting_scheduled", "qualified", "contract_signed"] });
    expect(stages.map((s) => [s.name, s.stage_type, s.funnel_event])).toEqual([
      ["Novo", "open", null],
      ["Qualificado", "open", "qualified"],
      ["Reunião agendada", "open", "meeting_scheduled"],
      ["Contrato assinado", "open", "contract_signed"],
      ["Ganho", "won", null],
      ["Perdido", "lost", null],
    ]);
    expect(stages.map((s) => s.position)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("direct purchase: in, bought, did not buy", () => {
    expect(stagesForProcess({ mode: "direct", milestones: [] }).map((s) => [s.name, s.stage_type])).toEqual([
      ["Novo", "open"],
      ["Comprou", "won"],
      ["Não comprou", "lost"],
    ]);
  });
});

describe("missingMilestones — what an existing line does not declare yet", () => {
  const stages = [
    { funnel_event: null },
    { funnel_event: "qualified" },
    { funnel_event: "proposal_sent" },
  ];

  it("lists the chosen milestones no stage declares, in funnel order", () => {
    expect(missingMilestones(stages, ["contract_sent", "qualified", "meeting_done"])).toEqual(["meeting_done", "contract_sent"]);
  });

  it("nothing missing: empty", () => {
    expect(missingMilestones(stages, ["qualified"])).toEqual([]);
  });
});
