import { describe, it, expect } from "vitest";
import {
  buildRevenuePlan,
  formatInt,
  formatRate,
  type PlanStageRow,
} from "../revenuePlan";

const stage = (over: Partial<PlanStageRow> & { stage_id: string }): PlanStageRow => ({
  stage_name: `Etapa ${over.stage_id}`,
  stage_position: 1,
  stage_type: "open",
  funnel_event: null,
  max_idle_hours: null,
  historical_rate: null,
  entered_count: 0,
  advanced_count: 0,
  avg_days_in_stage: null,
  ...over,
});

/** Quatro etapas de passagem, todas com a mesma taxa. */
const fourStages = (rate: number | null): PlanStageRow[] => [
  stage({ stage_id: "s1", stage_name: "Qualificado", stage_position: 1, historical_rate: rate }),
  stage({ stage_id: "s2", stage_name: "Reunião", stage_position: 2, historical_rate: rate }),
  stage({ stage_id: "s3", stage_name: "Proposta", stage_position: 3, historical_rate: rate }),
  stage({ stage_id: "s4", stage_name: "Negociação", stage_position: 4, historical_rate: rate }),
];

describe("buildRevenuePlan — a cadeia do funil", () => {
  it("deriva as entradas no topo do produto das taxas, não da última etapa", () => {
    // 0.5^4 = 0.0625; 10 / 0.0625 = 160 leads no topo.
    const plan = buildRevenuePlan({ rows: fourStages(0.5), goalDeals: 10 });
    expect(plan.cumulative_rate).toBeCloseTo(0.0625);
    expect(plan.required_inbound).toBe(160);
  });

  it("cada etapa responde quantos negócios precisam chegar nela", () => {
    const plan = buildRevenuePlan({ rows: fourStages(0.5), goalDeals: 10 });
    expect(plan.stages.map((s) => s.required_entries)).toEqual([160, 80, 40, 20]);
  });

  it("ignora as etapas terminais (Ganho/Perdido) e a de reciclo", () => {
    const plan = buildRevenuePlan({
      rows: [
        ...fourStages(0.5),
        stage({ stage_id: "w", stage_name: "Ganho", stage_position: 5, stage_type: "won" }),
        stage({ stage_id: "l", stage_name: "Perdido", stage_position: 6, stage_type: "lost" }),
        stage({ stage_id: "c", stage_name: "Reciclo", stage_position: 7, stage_type: "ciclo" }),
      ],
      goalDeals: 10,
    });
    expect(plan.stages).toHaveLength(4);
    expect(plan.skipped.map((s) => s.stage_name)).toEqual(["Ganho", "Perdido", "Reciclo"]);
    // Sem a exclusão, a taxa de Perdido (a última por position) entraria no lugar
    // da conversão do funil — era o bug do preview antigo.
    expect(plan.required_inbound).toBe(160);
  });

  it("a meta digitada vence o histórico", () => {
    const plan = buildRevenuePlan({
      rows: fourStages(0.5),
      goalDeals: 10,
      overrides: { s2: 1 },
    });
    expect(plan.cumulative_rate).toBeCloseTo(0.125);
    expect(plan.required_inbound).toBe(80);
    expect(plan.stages[1].manual).toBe(true);
    expect(plan.stages[1].rate).toBe(1);
    expect(plan.stages[0].manual).toBe(false);
  });

  it("taxa acima de 1 é limitada a 100%", () => {
    const plan = buildRevenuePlan({ rows: fourStages(0.5), goalDeals: 10, overrides: { s1: 1.4 } });
    expect(plan.stages[0].rate).toBe(1);
  });

  it("etapa sem taxa sai do produto e é nomeada, sem zerar a cadeia", () => {
    const plan = buildRevenuePlan({
      rows: [
        stage({ stage_id: "s1", stage_name: "Qualificado", stage_position: 1, historical_rate: 0.5 }),
        stage({ stage_id: "s2", stage_name: "Sem histórico", stage_position: 2, historical_rate: null }),
        stage({ stage_id: "s3", stage_name: "Proposta", stage_position: 3, historical_rate: 0.5 }),
      ],
      goalDeals: 10,
    });
    expect(plan.stages_without_rate).toEqual(["Sem histórico"]);
    expect(plan.cumulative_rate).toBeCloseTo(0.25);
    expect(plan.required_inbound).toBe(40);
    // A etapa sem taxa continua na lista, tratada como passagem neutra: a
    // exigência dela é a da etapa seguinte (assumir 100% é a única hipótese que
    // não infla a conta).
    expect(plan.stages[1].required_entries).toBe(20);
    expect(plan.stages[1].rate).toBe(0);
    // E `usable=false` é o que impede a linha da tela de escrever "passagem 0%"
    // numa etapa que o cálculo tratou como 100%.
    expect(plan.stages[1].usable).toBe(false);
    expect(plan.stages[0].usable).toBe(true);
  });

  it("a etapa anterior nunca exige menos entradas que a seguinte", () => {
    // tail_k = tail_{k+1} * r_k com r_k em [0,1] ⇒ tail_k <= tail_{k+1} ⇒
    // ceil(g/tail_k) >= ceil(g/tail_{k+1}). Não existe vetor de taxas em [0,1]
    // que inverta a ordem — por isso a cadeia é sempre monotônica.
    const orderings = [
      [0.5, 1, 0.2],
      [0, 0.5, 0.5],
      [0.5, 0, 0.5],
      [0.1, 0.9, 0.33],
    ];
    for (const rates of orderings) {
      const plan = buildRevenuePlan({
        rows: rates.map((r, i) =>
          stage({
            stage_id: `s${i + 1}`,
            stage_position: i + 1,
            historical_rate: r,
          }),
        ),
        goalDeals: 10,
      });
      const req = plan.stages.map((s) => s.required_entries ?? 0);
      for (let i = 0; i < req.length - 1; i += 1) {
        expect(req[i]).toBeGreaterThanOrEqual(req[i + 1]);
      }
    }
  });

  it("a taxa do topo da cadeia é a mesma do funil inteiro", () => {
    // tail_0 percorre exatamente as mesmas taxas que `cumulative`, então os dois
    // não podem divergir — exigir menos no topo que a conversão geral seria
    // aritmética impossível.
    const plan = buildRevenuePlan({
      rows: [
        stage({ stage_id: "s1", stage_position: 1, historical_rate: 0.5 }),
        stage({ stage_id: "s2", stage_position: 2, historical_rate: null }),
        stage({ stage_id: "s3", stage_position: 3, historical_rate: 0.5 }),
      ],
      goalDeals: 10,
    });
    expect(plan.stages[0].required_entries).toBe(plan.required_inbound);
    expect(plan.required_inbound).toBe(40);
  });

  it("reuniões necessárias vêm da etapa declarada como meeting_done", () => {
    const rows = fourStages(0.5);
    rows[1] = { ...rows[1], stage_name: "Reunião feita", funnel_event: "meeting_done" };
    const plan = buildRevenuePlan({ rows, goalDeals: 10 });
    expect(plan.meeting_stage?.stage.stage_name).toBe("Reunião feita");
    expect(plan.required_meetings).toBe(80);
  });

  it("sem etapa mapeada como meeting_done, não inventa reuniões", () => {
    const plan = buildRevenuePlan({ rows: fourStages(0.5), goalDeals: 10 });
    expect(plan.meeting_stage).toBeNull();
    expect(plan.required_meetings).toBeNull();
  });

  it("soma o tempo médio real das etapas — o lead time observado", () => {
    const rows = fourStages(0.5);
    rows[0].avg_days_in_stage = 2;
    rows[1].avg_days_in_stage = 3.5;
    rows[3].avg_days_in_stage = 1;
    const plan = buildRevenuePlan({ rows, goalDeals: 10 });
    expect(plan.observed_lead_time_days).toBe(6.5);
  });
});

describe("buildRevenuePlan — metas vazias e lead time alvo", () => {
  it("sem meta de negócios, não há cadeia", () => {
    const plan = buildRevenuePlan({ rows: fourStages(0.5), goalDeals: 0 });
    expect(plan.required_inbound).toBeNull();
    expect(plan.cumulative_rate).toBeNull();
    expect(plan.stages.every((s) => s.required_entries === null)).toBe(true);
  });

  it("sem nenhum histórico, não há conversão para mostrar", () => {
    const plan = buildRevenuePlan({ rows: fourStages(null), goalDeals: 10 });
    expect(plan.required_inbound).toBeNull();
    expect(plan.stages_without_rate).toHaveLength(4);
  });

  it("divide o lead time alvo por igual entre as etapas de passagem", () => {
    const plan = buildRevenuePlan({
      rows: fourStages(0.5),
      goalDeals: 10,
      targetLeadTimeDays: 30,
    });
    expect(plan.stage_budget_days).toBe(7.5);
  });

  it("sem lead time alvo, não há orçamento por etapa", () => {
    const plan = buildRevenuePlan({ rows: fourStages(0.5), goalDeals: 10 });
    expect(plan.stage_budget_days).toBeNull();
  });
});

describe("formatRate", () => {
  it("mostra a conversão do funil com casas suficientes para não virar 0%", () => {
    expect(formatRate(0.0625)).toBe("6,25%");
    expect(formatRate(0.5)).toBe("50%");
    expect(formatRate(1)).toBe("100%");
  });
});

describe("formatadores com campo ausente", () => {
  // O RPC devolve jsonb: um campo que não veio chega como undefined. Não pode
  // derrubar a tela por causa de um traço.
  it("trata null e undefined como ausente", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(undefined)).toBe("—");
    expect(formatInt(null)).toBe("—");
    expect(formatInt(undefined)).toBe("—");
  });
});
