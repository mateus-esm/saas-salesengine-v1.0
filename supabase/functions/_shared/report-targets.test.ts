import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { gapOf, resolveDailyTargets, toTarget } from "./report-targets.ts";

Deno.test("toTarget aceita número e texto digitado, recusa lixo e negativo", () => {
  assertEquals(toTarget(5), 5);
  assertEquals(toTarget("12,5"), 12.5);
  assertEquals(toTarget(""), null);
  assertEquals(toTarget("abc"), null);
  assertEquals(toTarget(-1), null);
  assertEquals(toTarget(null), null);
});

Deno.test("sem nada configurado não há meta nenhuma", () => {
  const r = resolveDailyTargets({ window_business_days: 1, month_business_days: 22, pipelines: [{}] });
  assertEquals(r.daily, {});
  assertEquals(r.window, {});
  assertEquals(r.derived, []);
});

Deno.test("deriva fechamentos e receita da meta do mês dividida pelos dias úteis", () => {
  const r = resolveDailyTargets({
    window_business_days: 1,
    month_business_days: 22,
    pipelines: [{ period: "month", goal_deals: 44, goal_revenue: 220000 }],
  });
  assertEquals(r.daily.deals_won, 2);
  assertEquals(r.daily.revenue, 10000);
  assertEquals(r.window.deals_won, 2);
  assertEquals(r.derived.sort(), ["deals_won", "revenue"]);
  // Marco sem meta de período não ganha meta inventada.
  assertEquals(r.daily.touchpoints, undefined);
});

Deno.test("trimestre divide pelos dias úteis do trimestre", () => {
  const r = resolveDailyTargets({
    window_business_days: 5,
    month_business_days: 22,
    quarter_business_days: 65,
    pipelines: [{ period: "quarter", goal_deals: 65 }],
  });
  assertEquals(r.daily.deals_won, 1);
  assertEquals(r.window.deals_won, 5);
});

Deno.test("o gestor sobrescreve: daily_targets vence a derivação", () => {
  const r = resolveDailyTargets({
    window_business_days: 1,
    month_business_days: 22,
    pipelines: [
      { goal_deals: 44, daily_targets: { deals_won: 5, touchpoints: "30", meetings_done: 4 } },
    ],
  });
  assertEquals(r.daily.deals_won, 5);
  assertEquals(r.daily.touchpoints, 30);
  assertEquals(r.daily.meetings_done, 4);
  assertEquals(r.derived, []);
});

Deno.test("meta explícita 0 continua 0 e não deriva", () => {
  const r = resolveDailyTargets({
    window_business_days: 1,
    month_business_days: 22,
    pipelines: [{ goal_deals: 44, daily_targets: { deals_won: 0 } }],
  });
  assertEquals(r.daily.deals_won, 0);
});

Deno.test("vários pipelines somam", () => {
  const r = resolveDailyTargets({
    window_business_days: 2,
    month_business_days: 20,
    pipelines: [
      { goal_deals: 20 },
      { daily_targets: { deals_won: 3 } },
    ],
  });
  assertEquals(r.daily.deals_won, 4);
  assertEquals(r.window.deals_won, 8);
});

Deno.test("janela sem dia útil (fim de semana) zera a meta da janela", () => {
  const r = resolveDailyTargets({
    window_business_days: 0,
    month_business_days: 22,
    pipelines: [{ goal_deals: 22 }],
  });
  assertEquals(r.daily.deals_won, 1);
  assertEquals(r.window.deals_won, 0);
});

Deno.test("gapOf nunca é negativo", () => {
  assertEquals(gapOf(3, 1), 2);
  assertEquals(gapOf(3, 5), 0);
  assertEquals(gapOf(undefined, 5), 0);
  assertEquals(gapOf(2.5, 1), 1.5);
});
