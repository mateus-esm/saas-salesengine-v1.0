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
      "• Touchpoints: 0 · sem meta",
      "• Qualificados: 0 · sem meta",
      "• Propostas: 0 · sem meta",
      "• Reuniões agendadas: 0 · sem meta",
      "• Reuniões realizadas: 0 · sem meta",
      "• No-show: 0 · sem meta",
      "• Fechamentos: 0 · sem meta",
      "• Receita: R$ 0 · sem meta",
      "",
      "*3. Marcos do funil*",
      "• Qualificados: 0",
      "• Propostas enviadas: 0",
      "• Reuniões agendadas: 0",
      "• Reuniões realizadas: 0",
      "• No-show: 0",
      "• Fechamentos: 0",
      "• Por vendedor: nenhum marco no período",
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
  funnel_milestones: {
    by_seller: [
      { seller_id: "u1", seller_name: "Ana", qualified: 3, proposal_sent: 2, meeting_scheduled: 4, meeting_done: 2, no_show: 1, won: 1 },
      { seller_id: null, seller_name: null, qualified: 1, proposal_sent: 1, meeting_scheduled: 1, meeting_done: 1, no_show: 0, won: 0 },
      { seller_id: "u3", seller_name: "Caio", qualified: 0, proposal_sent: 0, meeting_scheduled: 0, meeting_done: 0, no_show: 0, won: 0 },
    ],
    // O primeiro no-show registrado é DENTRO da janela: a série começa nele.
    since: { qualified: "2026-08-01T12:00:00Z", no_show: "2026-10-14T15:00:00Z" },
  },
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
      "• Touchpoints: 41 de 50 · gap: 9",
      "• Qualificados: 4 · sem meta",
      "• Propostas: 3 · sem meta",
      "• Reuniões agendadas: 5 · sem meta",
      "• Reuniões realizadas: 3 de 4 · gap: 1",
      "• No-show: 1 · sem meta",
      "• Fechamentos: 1 de 2 · gap: 1",
      "• Receita: R$ 18.000 de R$ 20.000 · gap: R$ 2.000",
      "",
      "*3. Marcos do funil*",
      "• Qualificados: 4",
      "• Propostas enviadas: 3",
      "• Reuniões agendadas: 5",
      "• Reuniões realizadas: 3",
      "• No-show: 1 · série começa em 14/10/2026",
      "• Fechamentos: 1",
      "• Por vendedor:",
      "   – Ana: Qualif. 3 · Prop. 2 · Agend. 4 · Realiz. 2 · No-show 1 · Fech. 1",
      "   – Não atribuído: Qualif. 1 · Prop. 1 · Agend. 1 · Realiz. 1 · No-show 0 · Fech. 0",
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

Deno.test("janela sem dia útil: 'dia sem meta', nunca 'de 0'", () => {
  const text = norm(
    renderReportText({
      ...BASE,
      snapshot: { period: PERIOD, goals: { window_business_days: 0, month_business_days: 20, pipelines: [{ goal_deals: 40 }] } },
    }),
  );
  assertEquals(text.includes("• Fechamentos: 0 · dia sem meta"), true);
  assertEquals(text.includes(" de 0"), false);
});

Deno.test("seção 2 tem sempre as mesmas oito linhas, vazio ou cheio", () => {
  for (const snapshot of [{ period: PERIOD }, POPULATED]) {
    const text = renderReportText({ ...BASE, snapshot });
    const block = text.split("\n*2. Meta x realizado*\n")[1].split("\n\n")[0].split("\n");
    assertEquals(block.map((l) => l.split(":")[0]), [
      "• Touchpoints", "• Qualificados", "• Propostas", "• Reuniões agendadas",
      "• Reuniões realizadas", "• No-show", "• Fechamentos", "• Receita",
    ]);
  }
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

Deno.test("seção 3: no-show nunca registrado diz que a série não tem dado", () => {
  const text = renderReportText({
    ...BASE,
    snapshot: { period: PERIOD, funnel_milestones: { by_seller: [], since: { no_show: null } } },
  });
  assertEquals(text.includes("• No-show: 0 · série ainda sem registros\n"), true);
  assertEquals(text.includes("• Por vendedor: nenhum marco no período\n"), true);
});

Deno.test("seção 3: no-show com histórico anterior à janela é zero de verdade", () => {
  const text = renderReportText({
    ...BASE,
    snapshot: { period: PERIOD, funnel_milestones: { since: { no_show: "2026-09-01T12:00:00Z" } } },
  });
  assertEquals(text.includes("• No-show: 0\n"), true);
});

Deno.test("seção 3 tem sempre as mesmas sete linhas-título, vazio ou cheio", () => {
  for (const snapshot of [{ period: PERIOD }, POPULATED, {}]) {
    const text = renderReportText({ ...BASE, snapshot });
    const block = text.split("\n*3. Marcos do funil*\n")[1].split("\n\n")[0].split("\n")
      .filter((l) => l.startsWith("•"));
    assertEquals(block.map((l) => l.split(":")[0]), [
      "• Qualificados", "• Propostas enviadas", "• Reuniões agendadas", "• Reuniões realizadas",
      "• No-show", "• Fechamentos", "• Por vendedor",
    ]);
  }
});
