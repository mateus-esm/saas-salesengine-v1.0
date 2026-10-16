import { describe, expect, it } from "vitest";
import { buildFixedSections } from "@/lib/reportSections";

const nbsp = (s: string) => s.replace(/ /g, " ");

describe("buildFixedSections", () => {
  it("snapshot antigo/vazio: todas as seções, zeros explícitos", () => {
    for (const snap of [undefined, null, {}, { overview: { deals_won: 2, won_value: 100 } }]) {
      const s = buildFixedSections(snap as never);
      expect(s.summary).toHaveLength(5);
      expect(s.goals.map((l) => l.label)).toEqual([
        "Touchpoints", "Qualificados", "Propostas", "Reuniões agendadas",
        "Reuniões realizadas", "No-show", "Fechamentos", "Receita",
      ]);
      expect(s.milestones).toHaveLength(6);
      expect(s.highlights).toHaveLength(3);
    }
    const empty = buildFixedSections({});
    expect(empty.touchpoints).toEqual({ total: 0, rows: [] });
    expect(empty.goals[0].value).toBe("0 · sem meta");
    expect(empty.highlights[0].value).toBe("nenhum negócio ganho no período");
  });

  it("meta, gap e touchpoints por vendedor", () => {
    const s = buildFixedSections({
      overview: { deals_won: 1, won_value: 18000, meetings_done: 3 },
      goals: {
        window_business_days: 1,
        month_business_days: 20,
        pipelines: [{ goal_deals: 40, daily_targets: { meetings_done: 4 } }],
      },
      touchpoints_by_seller: {
        total: 4,
        rows: [
          { seller_id: "a", seller_name: "Ana", touchpoints: 3 },
          { seller_id: null, seller_name: null, touchpoints: 1 },
          { seller_id: "c", seller_name: "Caio", touchpoints: 0 },
        ],
      },
    });
    expect(s.goals.find((l) => l.label === "Reuniões realizadas")?.value).toBe("3 de 4 · gap: 1");
    expect(s.goals.find((l) => l.label === "Fechamentos")?.value).toBe("1 de 2 · gap: 1");
    expect(nbsp(s.goals.find((l) => l.label === "Receita")!.value)).toBe("R$ 18.000 · sem meta");
    expect(s.touchpoints).toEqual({
      total: 4,
      rows: [{ name: "Ana", touchpoints: 3 }, { name: "Não atribuído", touchpoints: 1 }],
    });
  });

  it("janela sem dia útil: dia sem meta", () => {
    const s = buildFixedSections({ goals: { window_business_days: 0, pipelines: [{ goal_deals: 10 }] } });
    expect(s.goals[0].value).toBe("0 · dia sem meta");
  });
});
