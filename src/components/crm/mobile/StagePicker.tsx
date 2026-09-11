import type { PipelineStageV2 } from "@/types/pipelines";
import type { BoardStageSummary } from "@/types/board";
import { cn } from "@/lib/utils";

interface StagePickerProps {
  stages: PipelineStageV2[];
  summary: BoardStageSummary[];
  activeStageId: string;
  onSelectStage: (stageId: string) => void;
}

export function StagePicker({
  stages,
  summary,
  activeStageId,
  onSelectStage,
}: StagePickerProps) {
  const summaryMap = new Map(summary.map((s) => [s.stage_id, s.count]));

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 px-3 no-scrollbar select-none">
      {stages.map((stage) => {
        const count = summaryMap.get(stage.id) ?? 0;
        const isActive = stage.id === activeStageId;

        return (
          <button
            key={stage.id}
            type="button"
            onClick={() => onSelectStage(stage.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors border",
              isActive
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-muted/60 text-muted-foreground border-border/60 hover:bg-muted hover:text-foreground",
            )}
          >
            <span className="truncate max-w-[140px]">{stage.name}</span>
            <span
              className={cn(
                "px-1.5 py-0.2 text-[10px] rounded-full font-mono font-bold",
                isActive
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-background/80 text-foreground/70 border border-border/40",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
