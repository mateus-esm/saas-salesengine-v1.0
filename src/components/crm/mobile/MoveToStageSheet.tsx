import type { PipelineStageV2 } from "@/types/pipelines";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface MoveToStageSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: PipelineStageV2[];
  currentStageId: string;
  onMove: (targetStageId: string) => void;
  title?: string;
}

export function MoveToStageSheet({
  open,
  onOpenChange,
  stages,
  currentStageId,
  onMove,
  title = "Mover para etapa",
}: MoveToStageSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-4">
        <DialogHeader className="pb-2 border-b">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5 pt-2 max-h-[60vh] overflow-y-auto">
          {stages.map((stage) => {
            const isCurrent = stage.id === currentStageId;
            return (
              <Button
                key={stage.id}
                variant={isCurrent ? "secondary" : "outline"}
                className="w-full justify-start text-left text-sm h-11"
                disabled={isCurrent}
                onClick={() => {
                  onMove(stage.id);
                  onOpenChange(false);
                }}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0 mr-2 border"
                  style={{ backgroundColor: stage.color || "#3b82f6" }}
                />
                <span className="truncate flex-1">{stage.name}</span>
                {isCurrent && (
                  <span className="text-xs text-muted-foreground font-normal ml-2">
                    (Etapa atual)
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
