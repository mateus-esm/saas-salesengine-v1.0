import { describe, expect, it } from "vitest";
import { barPercent, normalizeTouchpoints, sellerLabel } from "@/lib/touchpointsBySeller";

describe("normalizeTouchpoints", () => {
  it("resposta nula vira zero explícito", () => {
    expect(normalizeTouchpoints(null)).toEqual({ total: 0, rows: [] });
    expect(normalizeTouchpoints({})).toEqual({ total: 0, rows: [] });
  });

  it("mantém linhas e total", () => {
    const r = normalizeTouchpoints({
      total: 7,
      rows: [{ seller_id: "a", seller_name: " Ana ", touchpoints: "5" }, { seller_id: null, seller_name: null, touchpoints: 2 }],
    });
    expect(r.total).toBe(7);
    expect(r.rows[0]).toEqual({ seller_id: "a", seller_name: "Ana", touchpoints: 5 });
    expect(sellerLabel(r.rows[1])).toBe("Não atribuído");
  });

  it("total ausente é a soma das linhas", () => {
    expect(normalizeTouchpoints({ rows: [{ touchpoints: 3 }, { touchpoints: 4 }] }).total).toBe(7);
  });
});

describe("barPercent", () => {
  const rows = normalizeTouchpoints({ rows: [{ touchpoints: 10 }, { touchpoints: 5 }] }).rows;
  it("é relativo ao maior", () => {
    expect(barPercent(10, rows)).toBe(100);
    expect(barPercent(5, rows)).toBe(50);
  });
  it("sem dados não divide por zero", () => {
    expect(barPercent(0, [])).toBe(0);
  });
});
