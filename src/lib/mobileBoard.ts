import type { BoardStageSummary } from "@/types/board";
import type { PipelineStageV2 } from "@/types/pipelines";

export function pickInitialStage(
  summary: BoardStageSummary[] | undefined,
  stages: PipelineStageV2[] | undefined,
): string {
  if (!stages || stages.length === 0) return "";

  if (summary && summary.length > 0) {
    for (const stage of stages) {
      const entry = summary.find((s) => s.stage_id === stage.id);
      if (entry && entry.count > 0) {
        return stage.id;
      }
    }
  }

  return stages[0]?.id ?? "";
}
