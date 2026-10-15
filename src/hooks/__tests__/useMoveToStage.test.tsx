import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

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

  it("ignores a move to the same stage", () => {
    const run = vi.fn();
    const { result } = renderHook(() => useMoveToStage({ stages, pipeline: withReasons }));
    let plan = "";
    act(() => { plan = result.current.requestMove({ fromStageId: "lost", toStageId: "lost", run }); });
    expect(plan).toBe("noop");
    expect(run).not.toHaveBeenCalled();
  });
});
