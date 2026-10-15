import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { renderReportText, type ReportSnapshot } from "./report-render.ts";

// Intl põe espaço não separável entre "R$" e o número; o golden usa espaço comum.
const norm = (s: string) => s.replace(/ /g, " ");

const BASE = {
  frequency: "daily",
  timezone: "America/Sao_Paulo",
  scheduleName: "Relatório diário",
  link: "https://app.exemplo.com/relatorio/abc",
};

// 14/10 em Brasília: [03:00Z, 03:00Z do dia seguinte).
const PERIOD = { from: "2026-10-14T03:00:00Z", to: "2026-10-15T03:00:00Z" };

const HEADINGS = [
  "*1. Resumo do dia*",
  "*2. Meta x realizado*",
  "*3. Marcos do funil*",
  "*4. Touchpoints por vendedor*",
  "*5. Destaques*",
];

Deno.test("snapshot totalmente vazio: mesmas seções, zeros explícitos", () => {
  const text = norm(
    renderReportText({ ...BASE, snapshot: { equipe_name: "Solo", period: PERIOD } }),
  );
  assertEquals(
    text,
    [
      "*Relatório diário* · 14/10",
      "_Solo · Todos os pipelines_",
      "",
      "*1. Resumo do dia*",
      "• Novos leads: 0",
      "• Ganhos: 0 · R$ 0",
      "• Perdidos: 0",
      "• Taxa de ganho: —",
      "• Pipeline aberto: R$ 0 (0)",
      "",
      "*2. Meta x realizado*",
      "• Fechamentos: 0 · sem meta diária definida",
      "• Receita: R$ 0 · sem meta diária definida",
      "",
      "*3. Marcos do funil*",
      "• Qualificados: 0",
      "• Propostas enviadas: 0",
      "• Reuniões agendadas: 0",
      "• Reuniões realizadas: 0",
      "• No-show: 0",
      "• Fechamentos: 0",
      "",
      "*4. Touchpoints por vendedor*",
      "• Total: 0 touchpoints",
      "• Nenhum touchpoint registrado por vendedor",
      "",
      "*5. Destaques*",
      "• Maior ganho: nenhum negócio ganho no período",
      "• Maior oportunidade aberta: nenhuma oportunidade aberta",
      "• Principal motivo de perda: nenhuma perda no período",
      "",
      "Ver relatório completo: https://app.exemplo.com/relatorio/abc",
    ].join("\n"),
  );
});

const POPULATED: ReportSnapshot = {
  equipe_name: "Solo",
  period: PERIOD,
  pipeline: { id: "p1", name: "Energia Solar" },
  overview: {
    new_leads: 12,
    deals_won: 1,
    won_value: 18000,
    deals_lost: 2,
    win_rate: 33.3,
    open_value: 250000,
    open_count: 9,
    qualified: 4,
    proposals_sent: 3,
    meetings_scheduled: 5,
    meetings_done: 3,
    no_shows: 1,
    touchpoints: 99, // o total do bloco 4 manda
  },
  goals: {
    window_business_days: 1,
    month_business_days: 20,
    pipelines: [
      {
        period: "month",
        goal_deals: 40,
        goal_revenue: 400000,
        daily_targets: { touchpoints: 50, meetings_done: 4 },
      },
    ],
  },
  touchpoints_by_seller: {
    total: 41,
    rows: [
      { seller_id: "u1", seller_name: "Ana", touchpoints: 30 },
      { seller_id: "u2", seller_name: "Bruno", touchpoints: 10 },
      { seller_id: null, seller_name: null, touchpoints: 1 },
      { seller_id: "u3", seller_name: "Caio", touchpoints: 0 },
    ],
  },
  top_won: [{ lead_name: "Maria Silva", value: 18000, responsible_name: "Ana" }],
  top_opportunities: [{ lead_name: "Casa Verde", value: 90000, days_in_stage: 20 }],
  loss_reasons: [{ reason: "Preço", count: 2, value: 5000 }],
};

Deno.test("snapshot preenchido: números, metas, gap e destaques", () => {
  const text = norm(renderReportText({ ...BASE, snapshot: POPULATED }));
  assertEquals(
    text,
    [
      "*Relatório diário* · 14/10",
      "_Solo · Energia Solar_",
      "",
      "*1. Resumo do dia*",
      "• Novos leads: 12",
      "• Ganhos: 1 · R$ 18.000",
      "• Perdidos: 2",
      "• Taxa de ganho: 33,3%",
      "• Pipeline aberto: R$ 250.000 (9)",
      "",
      "*2. Meta x realizado*",
      "• Fechamentos: 1 de 2 · gap: 1",
      "• Receita: R$ 18.000 de R$ 20.000 · gap: R$ 2.000",
      "• Touchpoints: 41 de 50 · gap: 9",
      "• Reuniões realizadas: 3 de 4 · gap: 1",
      "",
      "*3. Marcos do funil*",
      "• Qualificados: 4",
      "• Propostas enviadas: 3",
      "• Reuniões agendadas: 5",
      "• Reuniões realizadas: 3",
      "• No-show: 1",
      "• Fechamentos: 1",
      "",
      "*4. Touchpoints por vendedor*",
      "• Total: 41 touchpoints",
      "   – Ana: 30",
      "   – Bruno: 10",
      "   – Não atribuído: 1",
      "",
      "*5. Destaques*",
      "• Maior ganho: Maria Silva — R$ 18.000 (Ana)",
      "• Maior oportunidade aberta: Casa Verde — R$ 90.000 ⚠️ 20d parada",
      "• Principal motivo de perda: Preço (2 de 2)",
      "",
      "Ver relatório completo: https://app.exemplo.com/relatorio/abc",
    ].join("\n"),
  );
});

Deno.test("meta batida com folga: gap 0, nunca negativo", () => {
  const text = norm(
    renderReportText({
      ...BASE,
      snapshot: {
        ...POPULATED,
        overview: { ...POPULATED.overview, deals_won: 5, won_value: 50000 },
        goals: { window_business_days: 1, month_business_days: 20, pipelines: [{ goal_deals: 40 }] },
      },
    }),
  );
  assertEquals(text.includes("• Fechamentos: 5 de 2 · gap: 0"), true);
});

Deno.test("as cinco seções existem, na mesma ordem, vazio ou cheio", () => {
  for (const snapshot of [{ period: PERIOD }, POPULATED, {}]) {
    const text = renderReportText({ ...BASE, snapshot });
    const found = text.split("\n").filter((l) => /^\*\d\. /.test(l));
    assertEquals(found, HEADINGS);
  }
});

Deno.test("semanal e mensal mudam o rótulo, não a estrutura", () => {
  for (const [frequency, label] of [["weekly", "*1. Resumo da semana*"], ["monthly", "*1. Resumo do mês*"]]) {
    const text = renderReportText({ ...BASE, frequency, snapshot: { period: PERIOD } });
    assertEquals(text.includes(label), true);
    assertEquals(
      text.split("\n").filter((l) => /^\*\d\. /.test(l)).length,
      5,
    );
  }
});

Deno.test("um touchpoint no singular", () => {
  const text = renderReportText({
    ...BASE,
    snapshot: { touchpoints_by_seller: { total: 1, rows: [{ seller_id: "u", seller_name: "Ana", touchpoints: 1 }] } },
  });
  assertEquals(text.includes("• Total: 1 touchpoint\n"), true);
});

Deno.test("`sections` do agendamento antigo é ignorado", () => {
  const a = renderReportText({ ...BASE, snapshot: { period: PERIOD, sections: [] } });
  const b = renderReportText({ ...BASE, snapshot: { period: PERIOD, sections: ["kpi_new_leads"] } });
  assertEquals(a, b);
});
