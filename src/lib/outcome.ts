// Sprint 11 · Onda 3 · T28 — the stage decides the outcome (the database rule,
// mirrored so a form never shows a stage and a status that disagree).
//
// The truth lives in fn_opportunity_outcome (migration 20260912000100): entering
// a won/lost stage closes the deal; leaving it reopens; writing the status moves
// the deal to the first stage of that type — or stands, when the pipeline has none.

export type Outcome = "open" | "won" | "lost";

export interface StageLike {
  id: string;
  stage_type: string;
  position: number;
}

const firstOfType = (stages: StageLike[], type: string) =>
  [...stages].filter((s) => s.stage_type === type).sort((a, b) => a.position - b.position)[0];

/** The status a deal takes in this stage (given the status it has now). */
export function statusForStage(stages: StageLike[], stageId: string, current: Outcome): Outcome {
  const type = stages.find((s) => s.id === stageId)?.stage_type;
  if (type === "won" || type === "lost") return type;
  if (current !== "open" && firstOfType(stages, current)) return "open";
  return current;
}

/** The stage a deal goes to when its outcome is set to `status`. */
export function stageForStatus(stages: StageLike[], stageId: string, status: Outcome): string {
  const type = stages.find((s) => s.id === stageId)?.stage_type;
  if (status === "won" || status === "lost") {
    if (type === status) return stageId;
    return firstOfType(stages, status)?.id ?? stageId;
  }
  if (type === "won" || type === "lost") return firstOfType(stages, "open")?.id ?? stageId;
  return stageId;
}
