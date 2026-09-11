import { describe, it, expect } from "vitest";
import { pickInitialStage } from "../mobileBoard";
import type { BoardStageSummary } from "@/types/board";
import type { PipelineStageV2 } from "@/types/pipelines";

describe("pickInitialStage", () => {
  const stages = [
    {
      id: "s-1",
      equipe_id: "eq-1",
      pipeline_id: "p-1",
      name: "Contato Inicial",
      color: "#3b82f6",
      position: 0,
      stage_type: "open",
      max_idle_hours: null,
      created_at: "2026-09-01T00:00:00Z",
    },
    {
      id: "s-2",
      equipe_id: "eq-1",
      pipeline_id: "p-1",
      name: "Reunião Agendada",
      color: "#eab308",
      position: 1,
      stage_type: "open",
      max_idle_hours: null,
      created_at: "2026-09-01T00:00:00Z",
    },
    {
      id: "s-3",
      equipe_id: "eq-1",
      pipeline_id: "p-1",
      name: "Proposta Enviada",
      color: "#22c55e",
      position: 2,
      stage_type: "won",
      max_idle_hours: null,
      created_at: "2026-09-01T00:00:00Z",
    },
  ] as unknown as PipelineStageV2[];

  it("returns the first stage with count > 0", () => {
    const summary: BoardStageSummary[] = [
      { stage_id: "s-1", count: 0, value_sum: 0 },
      { stage_id: "s-2", count: 5, value_sum: 50000 },
      { stage_id: "s-3", count: 2, value_sum: 20000 },
    ];
    expect(pickInitialStage(summary, stages)).toBe("s-2");
  });

  it("returns the first stage when all summary counts are 0", () => {
    const summary: BoardStageSummary[] = [
      { stage_id: "s-1", count: 0, value_sum: 0 },
      { stage_id: "s-2", count: 0, value_sum: 0 },
    ];
    expect(pickInitialStage(summary, stages)).toBe("s-1");
  });

  it("returns the first stage when summary is empty or undefined", () => {
    expect(pickInitialStage([], stages)).toBe("s-1");
    expect(pickInitialStage(undefined, stages)).toBe("s-1");
  });

  it("returns empty string when stages is empty", () => {
    expect(pickInitialStage([], [])).toBe("");
  });
});
