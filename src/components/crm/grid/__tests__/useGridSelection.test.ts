import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useGridSelection } from "../useGridSelection";

describe("useGridSelection", () => {
  it("a row that left and came back is not selected again (filter, then clear)", () => {
    const { result, rerender } = renderHook(({ ids }) => useGridSelection(ids), {
      initialProps: { ids: ["a", "b", "c"] },
    });
    act(() => result.current.toggle("b"));
    expect(result.current.count).toBe(1);

    rerender({ ids: ["a", "c"] }); // a filter hides b
    expect(result.current.count).toBe(0);

    rerender({ ids: ["a", "b", "c"] }); // the filter is cleared
    expect(result.current.isSelected("b")).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it("rows added by paging keep the selection", () => {
    const { result, rerender } = renderHook(({ ids }) => useGridSelection(ids), {
      initialProps: { ids: ["a", "b"] },
    });
    act(() => result.current.toggle("a"));
    rerender({ ids: ["a", "b", "c"] });
    expect(result.current.isSelected("a")).toBe(true);
  });
});
