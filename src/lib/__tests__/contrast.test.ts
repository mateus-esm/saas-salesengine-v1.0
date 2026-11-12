import { describe, it, expect } from "vitest";
import { contrastRatio, pickForeground } from "../contrast";

describe("contrast", () => {
  it("white on black is 21", () => {
    expect(contrastRatio("0 0% 100%", "0 0% 0%")).toBeCloseTo(21, 1);
  });
  it("same color is 1", () => {
    expect(contrastRatio("0 0% 100%", "0 0% 100%")).toBe(1);
  });
  it("Solo orange gets dark text", () => {
    expect(pickForeground("28 100% 50%")).toBe("0 0% 0%");
  });
  it("dark blue gets white text", () => {
    expect(pickForeground("221 83% 40%")).toBe("0 0% 100%");
  });
  it("picked foreground is always the higher of the two", () => {
    for (let h = 0; h < 360; h += 15)
      for (const s of [0, 30, 60, 100])
        for (let l = 0; l <= 100; l += 5) {
          const bg = `${h} ${s}% ${l}%`;
          const fg = pickForeground(bg);
          const other = fg === "0 0% 100%" ? "0 0% 0%" : "0 0% 100%";
          expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(contrastRatio(bg, other));
        }
  });
  it("every HSL color reaches 4.5:1 with white or pure black", () => {
    // White and pure black tie at luminance ~0.18, where both give ~4.58:1.
    let worst = Infinity;
    for (let h = 0; h < 360; h += 5)
      for (let s = 0; s <= 100; s += 10)
        for (let l = 0; l <= 100; l += 1) {
          const bg = `${h} ${s}% ${l}%`;
          worst = Math.min(worst, contrastRatio(bg, pickForeground(bg)));
        }
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });
});
