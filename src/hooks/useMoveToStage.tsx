// Sprint Suporte 1 · #12 — the single entry point for moving a deal to a stage.
//
// Every screen used to call its own mutation, and only the Kanban drag asked why
// a deal was lost (and let you skip it): 528 of Solo's 533 lost deals had no
// reason. Now every move goes through requestMove():
//
//   * target is not a lost stage (or the pipeline has no reasons) → run(null) at once;
//   * target is a lost stage → the mandatory LossReasonDialog opens, and run(reason)
//     fires only when a reason is confirmed. Cancel = run never fires = nothing moves.
//
// `run` is the caller's own save (the Kanban's optimistic mutation, the table's
// bulk RPC, a form's update): the reason arrives inside it, so stage and reason
// are written in the same call, never "move now, ask later".

import { useCallback, useState, type ReactNode } from "react";

import { LossReasonDialog } from "@/components/crm/LossReasonDialog";
import { lossReasonsOf, planStageMove } from "@/lib/board";

export interface MoveRequest {
  fromStageId: string;
  toStageId: string;
  /** Shown in the dialog ("<name> foi movido para uma etapa de perda"). */
  leadName?: string;
  /** Bulk move: number of deals; the dialog says the reason applies to all of them. */
  count?: number;
  /** Saves the move. `lostReason` is set only when the target is a lost stage that needed one. */
  run: (lostReason: string | null) => void;
  /** The user dismissed the reason dialog: nothing was saved. For callers awaiting the move (a grid cell). */
  onCancel?: () => void;
}

interface Options {
  stages: { id: string; stage_type?: string }[];
  pipeline: { loss_reasons?: unknown } | null | undefined;
}

export function useMoveToStage({ stages, pipeline }: Options) {
  const [pending, setPending] = useState<MoveRequest | null>(null);

  /** Returns what happened: nothing to do, saved straight away, or waiting for the reason. */
  const requestMove = useCallback(
    (req: MoveRequest): "noop" | "direct" | "ask" => {
      const plan = planStageMove(stages, pipeline, req.fromStageId, req.toStageId);
      if (plan === "direct") req.run(null);
      else if (plan === "ask") setPending(req);
      return plan;
    },
    [stages, pipeline],
  );

  const cancel = useCallback(() => {
    pending?.onCancel?.();
    setPending(null);
  }, [pending]);

  const confirm = useCallback(
    (reason: string) => {
      const req = pending;
      setPending(null);
      req?.run(reason);
    },
    [pending],
  );

  // Render once per screen that moves deals.
  const lossDialog: ReactNode = (
    <LossReasonDialog
      open={!!pending}
      onCancel={cancel}
      reasons={lossReasonsOf(pipeline)}
      leadName={pending?.leadName}
      count={pending?.count}
      onConfirm={confirm}
    />
  );

  return { requestMove, lossDialog, pendingMove: pending, cancelMove: cancel, confirmMove: confirm };
}
