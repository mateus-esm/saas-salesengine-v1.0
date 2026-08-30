/**
 * Sprint 9 — the widget catalogue.
 *
 * The Vision asks that a client "put more or less data to show". The obvious
 * reading is a free-form builder; this is a catalogue instead, and the
 * difference is deliberate.
 *
 * A catalogue means every widget a client can turn on is one somebody designed:
 * it has a title that says what it measures, it uses the validated palette, it
 * knows what to render when its data is empty, and — critically — the same
 * widget id can be requested by the scheduled WhatsApp report, so the report
 * and the screen can offer the client the same menu. A free-form builder gives
 * up all of that in exchange for combinations nobody has looked at.
 *
 * Adding a widget is adding one entry here plus its case in the renderer.
 */

export type WidgetKind = "kpi" | "panel";

export interface WidgetDef {
  id: string;
  label: string;
  /** Shown in the personalisation sheet so the choice is informed. */
  description: string;
  kind: WidgetKind;
  /** Grouping in the personalisation sheet. */
  group: "Dinheiro" | "Volume" | "Qualidade" | "Análise";
  /** Whether this widget appears for a brand-new team. */
  defaultOn: boolean;
  /** Panels span more width than KPI tiles. */
  span?: 1 | 2;
}

export const WIDGET_CATALOG: WidgetDef[] = [
  // ---- Dinheiro ----------------------------------------------------------
  {
    id: "kpi_won_value",
    label: "Receita ganha",
    description: "Soma dos negócios fechados no período.",
    kind: "kpi",
    group: "Dinheiro",
    defaultOn: true,
  },
  {
    id: "kpi_open_value",
    label: "Pipeline aberto",
    description: "Valor total das oportunidades ainda em aberto, hoje.",
    kind: "kpi",
    group: "Dinheiro",
    defaultOn: true,
  },
  {
    id: "kpi_avg_ticket",
    label: "Ticket médio",
    description: "Receita ganha dividida pelos negócios ganhos.",
    kind: "kpi",
    group: "Dinheiro",
    defaultOn: true,
  },
  {
    id: "kpi_lost_value",
    label: "Valor perdido",
    description: "Soma dos negócios marcados como perdidos no período.",
    kind: "kpi",
    group: "Dinheiro",
    defaultOn: false,
  },

  // ---- Volume ------------------------------------------------------------
  {
    id: "kpi_new_leads",
    label: "Novos leads",
    description: "Contatos criados no período.",
    kind: "kpi",
    group: "Volume",
    defaultOn: true,
  },
  {
    id: "kpi_proposals",
    label: "Propostas enviadas",
    description: "Conta cada envio, mesmo que o negócio já tenha avançado.",
    kind: "kpi",
    group: "Volume",
    defaultOn: true,
  },
  {
    id: "kpi_meetings",
    label: "Reuniões realizadas",
    description: "Com a taxa de comparecimento embaixo.",
    kind: "kpi",
    group: "Volume",
    defaultOn: true,
  },
  {
    id: "kpi_touchpoints",
    label: "Interações",
    description: "Total de contatos registrados, e a média por lead.",
    kind: "kpi",
    group: "Volume",
    defaultOn: false,
  },

  // ---- Qualidade ---------------------------------------------------------
  {
    id: "kpi_win_rate",
    label: "Taxa de ganho",
    description: "Ganhos sobre ganhos mais perdidos.",
    kind: "kpi",
    group: "Qualidade",
    defaultOn: true,
  },
  {
    id: "kpi_no_show",
    label: "No-show",
    description: "Reuniões marcadas em que o lead não apareceu.",
    kind: "kpi",
    group: "Qualidade",
    defaultOn: true,
  },
  {
    id: "kpi_cycle",
    label: "Ciclo de venda",
    description: "Dias médios entre criar a oportunidade e ganhá-la.",
    kind: "kpi",
    group: "Qualidade",
    defaultOn: false,
  },

  // ---- Análise -----------------------------------------------------------
  {
    id: "panel_funnel",
    label: "Funil do período",
    description: "Quantos negócios passaram por cada etapa.",
    kind: "panel",
    group: "Análise",
    defaultOn: true,
  },
  {
    id: "panel_trend",
    label: "Evolução",
    description: "Leads, propostas, reuniões e ganhos ao longo do tempo.",
    kind: "panel",
    group: "Análise",
    defaultOn: true,
  },
  {
    id: "panel_revenue_trend",
    label: "Receita no tempo",
    description: "Quanto entrou, período a período.",
    kind: "panel",
    group: "Análise",
    defaultOn: true,
  },
  {
    id: "panel_loss_reasons",
    label: "Por que perdemos",
    description: "Motivos de perda agregados.",
    kind: "panel",
    group: "Análise",
    defaultOn: true,
  },
  {
    id: "panel_top_opportunities",
    label: "Melhores oportunidades",
    description: "Maiores negócios abertos e há quantos dias estão parados.",
    kind: "panel",
    group: "Análise",
    defaultOn: true,
    span: 2,
  },
  {
    id: "panel_by_channel",
    label: "Por canal de aquisição",
    description: "De onde vieram os leads que fecharam.",
    kind: "panel",
    group: "Análise",
    defaultOn: false,
    span: 2,
  },
  {
    id: "panel_custom_field",
    label: "Seus campos personalizados",
    description: "Receita agrupada por um campo que você mesmo criou no pipeline.",
    kind: "panel",
    group: "Análise",
    defaultOn: false,
    span: 2,
  },
  {
    id: "panel_by_responsible",
    label: "Por responsável",
    description: "Quem trouxe receita no período.",
    kind: "panel",
    group: "Análise",
    defaultOn: false,
    span: 2,
  },
];

export interface WidgetSetting {
  id: string;
  visible: boolean;
}

export const WIDGET_BY_ID = new Map(WIDGET_CATALOG.map((w) => [w.id, w]));

/** The layout a team gets before anyone personalises anything. */
export const defaultLayout = (): WidgetSetting[] =>
  WIDGET_CATALOG.map((w) => ({ id: w.id, visible: w.defaultOn }));

/**
 * Reconcile a stored layout with the catalogue.
 *
 * Stored layouts outlive deploys, so this has to survive both directions of
 * drift: a widget that has since been removed from the catalogue is dropped,
 * and a widget added by a later deploy is appended with its default visibility
 * instead of silently never appearing for anyone who had saved a layout.
 */
export function reconcileLayout(stored: WidgetSetting[] | null | undefined): WidgetSetting[] {
  if (!stored?.length) return defaultLayout();

  const seen = new Set<string>();
  const kept: WidgetSetting[] = [];

  for (const s of stored) {
    if (WIDGET_BY_ID.has(s.id) && !seen.has(s.id)) {
      kept.push({ id: s.id, visible: !!s.visible });
      seen.add(s.id);
    }
  }
  for (const w of WIDGET_CATALOG) {
    if (!seen.has(w.id)) kept.push({ id: w.id, visible: w.defaultOn });
  }
  return kept;
}

export const visibleIds = (layout: WidgetSetting[]): string[] =>
  layout.filter((w) => w.visible).map((w) => w.id);
