import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { contrastRatio } from "../contrast";

const css = fs.readFileSync(path.resolve(__dirname, "../../index.css"), "utf8");

function block(selector: RegExp): Record<string, string> {
  const m = css.match(selector);
  if (!m) throw new Error("block not found");
  const out: Record<string, string> = {};
  for (const t of m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) out[t[1]] = t[2].trim();
  return out;
}

const themes: Record<string, Record<string, string>> = {
  light: block(/:root\s*\{([^}]*)\}/),
  dark: block(/\.dark\s*\{([^}]*)\}/),
};

for (const [name, t] of Object.entries(themes)) {
  describe(`${name} tokens`, () => {
    for (const fg of ["foreground", "muted-foreground"])
      for (const bg of ["background", "card", "muted"])
        it(`${fg} on ${bg} >= 4.5`, () => {
          expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
        });
    it("card-foreground on card >= 4.5", () => {
      expect(contrastRatio(t["card-foreground"], t.card)).toBeGreaterThanOrEqual(4.5);
    });
    it("input on card >= 3", () => {
      expect(contrastRatio(t.input, t.card)).toBeGreaterThanOrEqual(3);
    });
    it("ring on card >= 3", () => {
      expect(contrastRatio(t.ring, t.card)).toBeGreaterThanOrEqual(3);
    });
    it("border on card >= 1.35", () => {
      expect(contrastRatio(t.border, t.card)).toBeGreaterThanOrEqual(1.35);
    });
  });
}
