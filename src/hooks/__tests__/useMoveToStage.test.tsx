import { beforeEach, describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const schedule = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useFollowups", () => ({
  useScheduleFollowup: () => ({ mutateAsync: schedule }),
  useOutreachLine: () => ({ hasLine: true, label: null, isLoading: false }),
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { useMoveToStage } from "../useMoveToStage";

const stages = [
  { id: "open", stage_type: "open" },
  { id: "won", stage_type: "won" },
  { id: "lost", stage_type: "lost" },
];
const withReasons = { loss_reasons: [{ label: "Preço" }] };

describe("useMoveToStage (Sprint Suporte 1 · #12)", () => {
  it("runs a normal move at once, without a reason", () => {
    const run = vi.fn();
    const { result } = renderHook(() => useMoveToStage({ stages, pipeline: withReasons }));
    act(() => { result.current.requestMove({ fromStageId: "open", toStageId: "won", run }); });
    expect(run).toHaveBeenCalledWith(null);
    expect(result.current.pendingMove).toBeNull();
  });

  it("holds a move to a lost stage until the reason is confirmed, then saves both together", () => {
    const run = vi.fn();
    const { result } = renderHook(() => useMoveToStage({ stages, pipeline: withReasons }));
    act(() => { result.current.requestMove({ fromStageId: "open", toStageId: "lost", leadName: "Ana", run }); });
    expect(run).not.toHaveBeenCalled();
    expect(result.current.pendingMove?.leadName).toBe("Ana");

    act(() => { result.current.confirmMove("Preço"); });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("Preço");
    expect(result.current.pendingMove).toBeNull();
  });

  it("cancelling does not move anything", () => {
    const run = vi.fn();
    const { result } = renderHook(() => useMoveToStage({ stages, pipeline: withReasons }));
    act(() => { result.current.requestMove({ fromStageId: "open", toStageId: "lost", run }); });
    act(() => { result.current.cancelMove(); });
    expect(run).not.toHaveBeenCalled();
    expect(result.current.pendingMove).toBeNull();
  });

  it("does not ask when the pipeline has no loss reasons", () => {
    const run = vi.fn();
    const { result } = renderHook(() => useMoveToStage({ stages, pipeline: { loss_reasons: [] } }));
    act(() => { result.current.requestMove({ fromStageId: "open", toStageId: "lost", run }); });
    expect(run).toHaveBeenCalledWith(null);
  });

  it("a second ask while the dialog is open cancels the first (no promise left hanging)", () => {
    const run1 = vi.fn();
    const cancel1 = vi.fn();
    const run2 = vi.fn();
    const { result } = renderHook(() => useMoveToStage({ stages, pipeline: withReasons }));
    act(() => { result.current.requestMove({ fromStageId: "open", toStageId: "lost", run: run1, onCancel: cancel1 }); });
    act(() => { result.current.requestMove({ fromStageId: "open", toStageId: "lost", leadName: "Bia", run: run2 }); });
    expect(cancel1).toHaveBeenCalledTimes(1);
    expect(result.current.pendingMove?.leadName).toBe("Bia");
    act(() => { result.current.confirmMove("Preço"); });
    expect(run1).not.toHaveBeenCalled();
    expect(run2).toHaveBeenCalledWith("Preço");
  });

  it("ignores a move to the same stage", () => {
    const run = vi.fn();
    const { result } = renderHook(() => useMoveToStage({ stages, pipeline: withReasons }));
    let plan = "";
    act(() => { plan = result.current.requestMove({ fromStageId: "lost", toStageId: "lost", run }); });
    expect(plan).toBe("noop");
    expect(run).not.toHaveBeenCalled();
  });
});

describe("useMoveToStage — Reciclo (Sprint 15b · T4)", () => {
  const ciclo = { id: "ciclo", stage_type: "ciclo", name: "Reciclo", cycle_days: 30 };
  const recycleStages = [...stages, ciclo];
  const form = {
    date: "2026-12-13", time: "09:00", ownerId: null, reason: "Sem verba", notifyOwner: true,
    sendMessage: false, channel: "whatsapp" as const, messageText: "", returnStageId: "open", willReturn: true,
  };

  beforeEach(() => {
    schedule.mockReset();
    schedule.mockResolvedValue({});
  });

  it("holds the move to a ciclo stage; cancel never runs it nor schedules", () => {
    const run = vi.fn();
    const onCancel = vi.fn();
    const { result } = renderHook(() => useMoveToStage({ stages: recycleStages, pipeline: withReasons }));
    let plan: unknown;
    act(() => { plan = result.current.requestMove({ fromStageId: "open", toStageId: "ciclo", opportunityIds: ["o1"], run, onCancel }); });
    expect(plan).toBe("ask-recycle");
    expect(run).not.toHaveBeenCalled();
    act(() => { result.current.cancelMove(); });
    expect(run).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it("confirm runs the move first and schedules only after it resolves", async () => {
    const order: string[] = [];
    let release!: () => void;
    const run = vi.fn(() => new Promise<void>((res) => { release = () => { order.push("moved"); res(); }; }));
    schedule.mockImplementation(async () => { order.push("scheduled"); return {}; });
    const { result } = renderHook(() => useMoveToStage({ stages: recycleStages, pipeline: withReasons }));
    act(() => { result.current.requestMove({ fromStageId: "open", toStageId: "ciclo", opportunityIds: ["o1"], run }); });
    let done!: Promise<void>;
    act(() => { done = result.current.confirmRecycle(form, true); });
    expect(run).toHaveBeenCalledWith(null);
    expect(schedule).not.toHaveBeenCalled();
    await act(async () => { release(); await done; });
    expect(order).toEqual(["moved", "scheduled"]);
    expect(schedule).toHaveBeenCalledWith(expect.objectContaining({ opportunityId: "o1", kind: "recycle", reason: "Sem verba", returnStageId: "open" }));
  });

  it("does not schedule when the move fails", async () => {
    const run = vi.fn(() => Promise.reject(new Error("boom")));
    const { result } = renderHook(() => useMoveToStage({ stages: recycleStages, pipeline: withReasons }));
    act(() => { result.current.requestMove({ fromStageId: "open", toStageId: "ciclo", opportunityIds: ["o1"], run }); });
    await act(async () => { await result.current.confirmRecycle(form, true); });
    expect(schedule).not.toHaveBeenCalled();
  });

  it("bulk: one follow-up per deal", async () => {
    const run = vi.fn();
    const { result } = renderHook(() => useMoveToStage({ stages: recycleStages, pipeline: withReasons }));
    act(() => { result.current.requestMove({ fromStageId: "", toStageId: "ciclo", count: 2, opportunityIds: ["o1", "o2"], run }); });
    await act(async () => { await result.current.confirmRecycle(form, true); });
    expect(schedule.mock.calls.map((c) => c[0].opportunityId)).toEqual(["o1", "o2"]);
  });

  it("'Não' schedules a reason-only follow-up", async () => {
    const run = vi.fn();
    const { result } = renderHook(() => useMoveToStage({ stages: recycleStages, pipeline: withReasons }));
    act(() => { result.current.requestMove({ fromStageId: "open", toStageId: "ciclo", opportunityIds: ["o1"], run }); });
    await act(async () => { await result.current.confirmRecycle({ ...form, willReturn: false }, true); });
    expect(schedule).toHaveBeenCalledWith(expect.objectContaining({ notifyOwner: false, sendMessage: false, returnStageId: null }));
  });

  it("retry after the due time passed sends a future due_at", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-13T12:00:00Z"));
      toastMock.error.mockReset();
      schedule.mockRejectedValueOnce(new Error("boom"));
      const run = vi.fn();
      const { result } = renderHook(() => useMoveToStage({ stages: recycleStages, pipeline: withReasons }));
      act(() => { result.current.requestMove({ fromStageId: "open", toStageId: "ciclo", opportunityIds: ["o1"], run }); });
      // 'Não' (now + 1 min) and a dated rule whose date will have passed by the retry.
      await act(async () => { await result.current.confirmRecycle({ ...form, willReturn: false }, true); });
      const firstDue = Date.parse(schedule.mock.calls[0][0].dueAt);
      expect(firstDue).toBe(Date.parse("2026-11-13T12:01:00Z"));
      vi.setSystemTime(new Date("2026-11-13T12:10:00Z"));
      schedule.mockResolvedValue({});
      const action = toastMock.error.mock.calls[0][1].action;
      await act(async () => { action.onClick(); });
      const retryDue = Date.parse(schedule.mock.calls[1][0].dueAt);
      expect(retryDue).toBeGreaterThan(Date.now());
    } finally {
      vi.useRealTimers();
    }
  });

  it("retry of a dated rule whose date passed uses now + 1 min and keeps the rest", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-12-13T11:59:00Z")); // 08:59 in Brasília, due 09:00
      toastMock.error.mockReset();
      schedule.mockReset();
      schedule.mockRejectedValueOnce(new Error("boom"));
      const run = vi.fn();
      const { result } = renderHook(() => useMoveToStage({ stages: recycleStages, pipeline: withReasons }));
      act(() => { result.current.requestMove({ fromStageId: "open", toStageId: "ciclo", opportunityIds: ["o1"], run }); });
      await act(async () => { await result.current.confirmRecycle(form, true); });
      vi.setSystemTime(new Date("2026-12-13T13:00:00Z"));
      schedule.mockResolvedValue({});
      await act(async () => { toastMock.error.mock.calls[0][1].action.onClick(); });
      const retry = schedule.mock.calls[1][0];
      expect(Date.parse(retry.dueAt)).toBe(Date.parse("2026-12-13T13:01:00Z"));
      expect(retry).toEqual(expect.objectContaining({ reason: "Sem verba", returnStageId: "open", kind: "recycle" }));
    } finally {
      vi.useRealTimers();
    }
  });
});
