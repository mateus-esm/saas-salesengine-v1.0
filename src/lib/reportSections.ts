// SE-SUP1-5 (fix) — as cinco seções FIXAS do relatório, para a página pública.
//
// Espelha o texto de WhatsApp (supabase/functions/_shared/report-render.ts): as
// mesmas seções, na mesma ordem, com zero explícito. A aritmética de metas NÃO é
// copiada: vem do mesmo módulo puro que o servidor usa, para a página e a
// mensagem não divergirem. Tolerante a snapshots antigos (sem goals,
// touchpoints_by_seller, top_won...): o que falta vira zero / "sem meta".

import { gapOf, resolveDailyTargets, type GoalsInput } from "../../supabase/functions/_shared/report-targets";

export interface FixedSnapshot {
  overview?: Record<string, number | null>;
  loss_reasons?: { reason: string; count: number; value: number }[];
  top_opportunities?: {
    lead_name: string;
    value: number;
    days_in_stage: number;
    responsible_name?: string | null;
    stage_name?: string | null;
  }[];
  top_won?: { lead_name: string; value: number; responsible_name?: string | null }[];
  touchpoints_by_seller?: {
    total?: number;
    rows?: { seller_id: string | null; seller_name: string | null; touchpoints: number }[];
  };
  goals?: GoalsInput;
}

export interface Line {
  label: string;
  value: string;
}

export interface FixedSections {
  summary: Line[];
  goals: Line[];
  milestones: Line[];
  touchpoints: { total: number; rows: { name: string; touchpoints: number }[] };
  highlights: Line[];
}

export const SECTION_TITLES = {
  summary: { daily: "Resumo do dia", weekly: "Resumo da semana", monthly: "Resumo do mês" } as Record<string, string>,
  goals: "Meta x realizado",
  milestones: "Marcos do funil",
  touchpoints: "Touchpoints por vendedor",
  highlights: "Destaques",
} as const;

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const int = (v: number) => new Intl.NumberFormat("pt-BR").format(v);
const num1 = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v);
const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${String(v).replace(".", ",")}%`;

export function buildFixedSections(snapshot: FixedSnapshot | null | undefined): FixedSections {
  const s = snapshot ?? {};
  const o = s.overview ?? {};
  const n = (k: string) => Number(o[k]) || 0;
  const tpTotal = Number(s.touchpoints_by_seller?.total ?? o.touchpoints) || 0;
  const targets = resolveDailyTargets(s.goals);
  const noBusinessDay = s.goals?.window_business_days === 0;

  const goalLine = (
    label: string,
    got: number,
    shown: string,
    target: number | undefined,
    fmt: (v: number) => string,
  ): Line => {
    if (noBusinessDay) return { label, value: `${shown} · dia sem meta` };
    if (target === undefined) return { label, value: `${shown} · sem meta` };
    return { label, value: `${shown} de ${fmt(target)} · gap: ${fmt(gapOf(target, got))}` };
  };

  const w = targets.window;
  const goals: Line[] = [
    goalLine("Touchpoints", tpTotal, int(tpTotal), w.touchpoints, num1),
    goalLine("Qualificados", n("qualified"), int(n("qualified")), w.qualified, num1),
    goalLine("Propostas", n("proposals_sent"), int(n("proposals_sent")), w.proposals_sent, num1),
    goalLine("Reuniões agendadas", n("meetings_scheduled"), int(n("meetings_scheduled")), w.meetings_scheduled, num1),
    goalLine("Reuniões realizadas", n("meetings_done"), int(n("meetings_done")), w.meetings_done, num1),
    { label: "No-show", value: `${int(n("no_shows"))} · sem meta` },
    goalLine("Fechamentos", n("deals_won"), int(n("deals_won")), w.deals_won, num1),
    goalLine("Receita", n("won_value"), brl(n("won_value")), w.revenue, brl),
  ];

  const won = s.top_won?.[0];
  const open = s.top_opportunities?.[0];
  const loss = s.loss_reasons?.[0];

  return {
    summary: [
      { label: "Novos leads", value: int(n("new_leads")) },
      { label: "Ganhos", value: `${int(n("deals_won"))} · ${brl(n("won_value"))}` },
      { label: "Perdidos", value: int(n("deals_lost")) },
      { label: "Taxa de ganho", value: pct(o.win_rate) },
      { label: "Pipeline aberto", value: `${brl(n("open_value"))} (${int(n("open_count"))})` },
    ],
    goals,
    milestones: [
      { label: "Qualificados", value: int(n("qualified")) },
      { label: "Propostas enviadas", value: int(n("proposals_sent")) },
      { label: "Reuniões agendadas", value: int(n("meetings_scheduled")) },
      { label: "Reuniões realizadas", value: int(n("meetings_done")) },
      { label: "No-show", value: int(n("no_shows")) },
      { label: "Fechamentos", value: int(n("deals_won")) },
    ],
    touchpoints: {
      total: tpTotal,
      rows: (s.touchpoints_by_seller?.rows ?? [])
        .filter((r) => Number(r.touchpoints) > 0)
        .map((r) => ({ name: r.seller_name?.trim() || "Não atribuído", touchpoints: Number(r.touchpoints) })),
    },
    highlights: [
      {
        label: "Maior ganho",
        value: won
          ? `${won.lead_name} — ${brl(won.value)}${won.responsible_name ? ` (${won.responsible_name})` : ""}`
          : "nenhum negócio ganho no período",
      },
      {
        label: "Maior oportunidade aberta",
        value: open
          ? `${open.lead_name} — ${brl(open.value)}${open.days_in_stage >= 14 ? ` · parada há ${open.days_in_stage} dias` : ""}`
          : "nenhuma oportunidade aberta",
      },
      {
        label: "Principal motivo de perda",
        value: loss ? `${loss.reason} (${int(loss.count)} de ${int(n("deals_lost"))})` : "nenhuma perda no período",
      },
    ],
  };
}
