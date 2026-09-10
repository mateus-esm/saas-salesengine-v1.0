import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDebouncer } from "../debounce";

describe("createDebouncer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs once after the burst goes quiet", () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, 1000);
    d.call();
    vi.advanceTimersByTime(500);
    d.call();
    vi.advanceTimersByTime(500);
    d.call();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("still fires under a constant stream, at most once per maxWait", () => {
    // Realtime can deliver a change every few hundred ms for minutes. A plain
    // trailing debounce would never fire; the board would never refresh.
    const fn = vi.fn();
    const d = createDebouncer(fn, 1000, { maxWait: 3000 });
    // A call every 300 ms from t=0 to t=7.2 s. The burst that starts at 0 is
    // forced out by the call at 3.0 s; the next burst starts at 3.3 s and is
    // forced out at 6.3 s. The last call (7.2 s) is still pending at 7.5 s.
    for (let i = 0; i < 25; i++) {
      d.call();
      vi.advanceTimersByTime(300);
    }
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("cancel drops the pending call", () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, 1000);
    d.call();
    d.cancel();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });
});
