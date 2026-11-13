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
// Sprint 15b · T4 — a Reciclo (ciclo) target opens the RecycleDialog instead:
// reason + return rule. Confirming runs the move (run(null)) and, only AFTER the
// move resolved, schedules the follow-up (crm_schedule_followup records the deal's
// current stage as the one to leave, so the order matters). Cancel moves nothing.
//
// `run` is the caller's own save (the Kanban's optimistic mutation, the table's
// bulk RPC, a form's update): the reason arrives inside it, so stage and reason
// are written in the same call, never "move now, ask later".

import { useCallback, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { LossReasonDialog } from "@/components/crm/LossReasonDialog";
import { RecycleDialog } from "@/components/crm/RecycleDialog";
import { useScheduleFollowup } from "@/hooks/useFollowups";
import { lossReasonsOf, planStageMove } from "@/lib/board";
import { followupErrorMessage, type FollowupFormValue } from "@/lib/followups";
import { recycleReasonsOf, recycleScheduleInput, type RecycleScheduleInput, type RecycleStageDefaults } from "@/lib/recycle";

export interface MoveRequest {
  fromStageId: string;
  toStageId: string;
  /** Shown in the dialog ("<name> foi movido para uma etapa de perda"). */
  leadName?: string;
  /** Bulk move: number of deals; the dialog says the reason applies to all of them. */
  count?: number;
  /**
   * Saves the move. `lostReason` is set only when the target is a lost stage that needed one.
   * Sprint 15b: may return a Promise that settles once the server committed the move; a
   * Reciclo move schedules its follow-up only after that, and a rejection means "not moved".
   */
  run: (lostReason: string | null) => void | Promise<unknown>;
  /** Sprint 15b · T4 — the deals being moved, to schedule their Reciclo follow-up. */
  opportunityIds?: string[];
  /** Sprint 15b · T4 — the deal's owner (default responsible in the Reciclo dialog). */
  ownerId?: string | null;
  /** The user dismissed the reason dialog: nothing was saved. For callers awaiting the move (a grid cell). */
  onCancel?: () => void;
}

export type MovePlan = "noop" | "direct" | "ask" | "ask-recycle";

interface Options {
  stages: ({ id: string; stage_type?: string; name?: string } & RecycleStageDefaults)[];
  pipeline: { loss_reasons?: unknown; recycle_reasons?: unknown } | null | undefined;
}

/** A caller's save may be async; a rejection is already reported by the caller's own mutation. */
function runSafely(run: () => void | Promise<unknown>) {
  const result = run();
  if (result && typeof (result as Promise<unknown>).catch === "function") (result as Promise<unknown>).catch(() => {});
}

export function useMoveToStage({ stages, pipeline }: Options) {
  const [pending, setPending] = useState<MoveRequest | null>(null);
  // Mirror of `pending` readable from stable callbacks (no stale closure).
  const pendingRef = useRef<MoveRequest | null>(null);
  const schedule = useScheduleFollowup({ quiet: true });

  /** Returns what happened: nothing to do, saved straight away, or waiting for the dialog. */
  const requestMove = useCallback(
    (req: MoveRequest): MovePlan => {
      const plan = planStageMove(stages, pipeline, req.fromStageId, req.toStageId);
      if (plan === "direct") runSafely(() => req.run(null));
      else if (plan === "ask" || plan === "ask-recycle") {
        // Only one dialog at a time: the request it replaces is cancelled,
        // so a caller awaiting it (a grid cell) is never left hanging.
        pendingRef.current?.onCancel?.();
        pendingRef.current = req;
        setPending(req);
      }
      return plan;
    },
    [stages, pipeline],
  );

  const cancel = useCallback(() => {
    const req = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    req?.onCancel?.();
  }, []);

  const confirm = useCallback((reason: string) => {
    const req = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (req) runSafely(() => req.run(reason));
  }, []);

  /** Schedules the Reciclo follow-up of each deal; failures are reported with a retry. */
  const scheduleAll = useCallback(
    async (ids: string[], build: (retry: boolean) => RecycleScheduleInput, retry = false): Promise<void> => {
      // Built per attempt: on a retry the chosen date may already be in the past.
      const input = build(retry);
      const failed: string[] = [];
      let lastError: unknown = null;
      for (const opportunityId of ids) {
        try {
          await schedule.mutateAsync({ opportunityId, ...input });
        } catch (e) {
          failed.push(opportunityId);
          lastError = e;
        }
      }
      if (failed.length === 0) {
        toast.success(ids.length > 1 ? "Negócios movidos para o Reciclo" : "Movido para o Reciclo");
        return;
      }
      const why = followupErrorMessage(lastError);
      const message =
        failed.length > 1
          ? `${failed.length} negócios movidos, mas o follow-up não foi agendado: ${why}`
          : `Negócio movido, mas o follow-up não foi agendado: ${why}`;
      toast.error(message, { action: { label: "Tentar de novo", onClick: () => void scheduleAll(failed, build, true) } });
    },
    [schedule],
  );

  /**
   * Reciclo confirmed: the move completes FIRST, then one follow-up per deal. If the
   * move fails nothing is scheduled; if only the scheduling fails the deal stays moved.
   */
  const confirmRecycle = useCallback(
    async (value: FollowupFormValue, hasLine: boolean): Promise<void> => {
      const req = pendingRef.current;
      pendingRef.current = null;
      setPending(null);
      if (!req) return;
      let ids = req.opportunityIds ?? [];
      try {
        await Promise.resolve(req.run(null));
      } catch (e) {
        // A bulk move can commit partially: schedule for the deals that did move.
        const failedIds = (e as { failedIds?: string[] } | null)?.failedIds;
        if (!Array.isArray(failedIds)) return;
        ids = ids.filter((id) => !failedIds.includes(id));
      }
      if (ids.length === 0) return;
      await scheduleAll(ids, (retry) => {
        const input = recycleScheduleInput(value, hasLine);
        // Retry after the due time passed: the RPC wants a future date, so keep the rest and use now + 1 min.
        if (retry && Date.parse(input.dueAt) <= Date.now() + 30_000) {
          return { ...input, dueAt: new Date(Date.now() + 60_000).toISOString() };
        }
        return input;
      });
    },
    [scheduleAll],
  );

  const target = pending ? stages.find((s) => s.id === pending.toStageId) : undefined;
  const asksRecycle = !!pending && target?.stage_type === "ciclo";

  // Render once per screen that moves deals.
  const lossDialog: ReactNode = (
    <>
      <LossReasonDialog
        open={!!pending && !asksRecycle}
        onCancel={cancel}
        reasons={lossReasonsOf(pipeline)}
        leadName={pending?.leadName}
        count={pending?.count}
        onConfirm={confirm}
      />
      {asksRecycle && pending && (
        <RecycleDialog
          open
          onCancel={cancel}
          onConfirm={(value, hasLine) => void confirmRecycle(value, hasLine)}
          stage={target}
          stages={stages.map((s) => ({ id: s.id, name: s.name ?? "", stage_type: s.stage_type }))}
          targetStageId={pending.toStageId}
          reasons={recycleReasonsOf(pipeline)}
          leadName={pending.leadName}
          count={pending.count}
          ownerId={pending.ownerId ?? null}
        />
      )}
    </>
  );

  return { requestMove, lossDialog, pendingMove: pending, cancelMove: cancel, confirmMove: confirm, confirmRecycle };
}
