import { describe, expect, it } from "vitest";

import {
  durationError,
  durationLabel,
  durationWindow,
  entriesFeedingLine,
  isDay,
  missingMilestones,
  normalizeNatures,
  stagesForProcess,
} from "../natures";

describe("normalizeNatures", () => {
  it("empty or broken config reads as today's behaviour: free value, no declared milestones", () => {
    const today = {
      offer: { mode: "free", catalog_item_ids: [] },
      process: { mode: "milestones", milestones: [] },
      duration: { mode: "continuous", starts_on: null, ends_on: null },
    };
    expect(normalizeNatures(null)).toEqual(today);
    expect(normalizeNatures({ offer: { mode: "bogus" }, process: 42, duration: "sempre" })).toEqual(today);
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

// ---------------------------------------------------------------------------
// Onda 5 · T55 — Duração e Entradas
// ---------------------------------------------------------------------------

describe("duration", () => {
  const campaign = (starts_on: string | null, ends_on: string | null) => ({ mode: "campaign" as const, starts_on, ends_on });

  it("reads a campaign with its days; a day that does not exist reads as none", () => {
    expect(normalizeNatures({ duration: { mode: "campaign", starts_on: "2026-09-01", ends_on: "2026-09-30" } }).duration)
      .toEqual(campaign("2026-09-01", "2026-09-30"));
    expect(normalizeNatures({ duration: { mode: "campaign", starts_on: "2026-02-30", ends_on: 7 } }).duration)
      .toEqual(campaign(null, null));
    expect(isDay("2026-02-28")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("01/09/2026")).toBe(false);
  });

  it("a campaign needs a start and an end, in order (twin of invalid_duration)", () => {
    expect(durationError({ mode: "continuous", starts_on: null, ends_on: null })).toBeNull();
    expect(durationError(campaign("2026-09-01", "2026-09-30"))).toBeNull();
    expect(durationError(campaign("2026-09-01", "2026-09-01"))).toBeNull();
    expect(durationError(campaign("2026-09-01", null))).toMatch(/início e o fim/);
    expect(durationError(campaign("2026-09-10", "2026-09-01"))).toMatch(/antes/);
  });

  it("the window: upcoming, running (day N of M), ended the day after the end", () => {
    const d = campaign("2026-09-01", "2026-09-30");
    expect(durationWindow(d, new Date(2026, 7, 31, 23, 0))).toMatchObject({ state: "upcoming", elapsedDays: 0, totalDays: 30 });
    expect(durationWindow(d, new Date(2026, 8, 1, 8, 0))).toMatchObject({ state: "running", elapsedDays: 1 });
    expect(durationWindow(d, new Date(2026, 8, 30, 23, 59))).toMatchObject({ state: "running", elapsedDays: 30 });
    const ended = durationWindow(d, new Date(2026, 9, 1, 0, 1));
    expect(ended).toMatchObject({ state: "ended", elapsedDays: 30, totalDays: 30 });
    expect(ended?.start).toEqual(new Date(2026, 8, 1));
    expect(ended?.end).toEqual(new Date(2026, 9, 1));
    expect(durationWindow({ mode: "continuous", starts_on: null, ends_on: null })).toBeNull();
  });

  it("says it in words", () => {
    expect(durationLabel({ mode: "continuous", starts_on: null, ends_on: null })).toBe("Contínua");
    expect(durationLabel(campaign("2026-09-01", "2026-09-30"))).toBe("Campanha de 01/09/2026 a 30/09/2026");
  });
});

describe("entriesFeedingLine", () => {
  const entries = [
    { id: "form", kind: "webhook" as const, pipeline_id: "bf" },
    { id: "form-no-line", kind: "webhook" as const, pipeline_id: null },
    { id: "wpp", kind: "whatsapp" as const, pipeline_id: null },
    { id: "agent", kind: "agent" as const, pipeline_id: "bf" },
    { id: "manual", kind: "manual" as const, pipeline_id: null },
    { id: "import", kind: "import" as const, pipeline_id: null },
  ];

  it("a line gets the doors that point at it; the default line also gets the ones that point nowhere", () => {
    expect(entriesFeedingLine(entries, "bf", "padrao").map((e) => e.id)).toEqual(["form", "agent"]);
    expect(entriesFeedingLine(entries, "padrao", "padrao").map((e) => e.id)).toEqual(["form-no-line", "wpp"]);
  });

  it("manual and import pick the line on the spot: never listed", () => {
    expect(entriesFeedingLine(entries, "padrao", "padrao").some((e) => e.kind === "manual" || e.kind === "import")).toBe(false);
  });

  it("no default line: the doors that point nowhere feed no line", () => {
    expect(entriesFeedingLine(entries, "padrao", null).map((e) => e.id)).toEqual([]);
  });
});
