// ============================================================================
// Sprint 9 · T13 — turning a report snapshot into a WhatsApp message.
// SE-SUP1-5 (#15) — agora com TEMPLATE FIXO.
//
// WHAT THIS IS OPTIMISED FOR
//
// A phone screen, read in ten seconds, probably before 9am, probably while
// walking. That rules out a table (WhatsApp has no monospace alignment worth
// relying on) and decimal places on counts.
//
// WHY THE TEMPLATE IS FIXED (it used to drop empty lines)
//
// A report that omits what did not happen cannot be compared with yesterday's:
// the reader has to notice an ABSENCE, and a client who saw "touchpoints" on
// Monday and nothing on Tuesday does not know whether the day was empty or the
// section broke. So the same sections come out, in the same order, every time,
// and an empty one says so in numbers ("0 touchpoints"). The client picks the
// RECORTES (pipeline, channel, seller) — never which sections exist. The
// `sections` list in the snapshot is kept for old rows and ignored here.
//
// The link at the end is the escape hatch for everything left out.
// ============================================================================

import { gapOf, resolveDailyTargets, type GoalsInput } from "./report-targets.ts";

export interface ReportSnapshot {
  equipe_name?: string;
  period?: { from: string; to: string };
  sections?: string[];
  overview?: Record<string, number | null>;
  loss_reasons?: { reason: string; count: number; value: number }[];
  top_opportunities?: {
    lead_name: string;
    value: number;
    days_in_stage: number;
    responsible_name?: string | null;
  }[];
  /** Maiores negócios ganhos NA janela (destaque positivo do dia). */
  top_won?: { lead_name: string; value: number; responsible_name?: string | null }[];
  /** Pipeline do relatório; ausente/null = todos. */
  pipeline?: { id: string; name: string } | null;
  touchpoints_by_seller?: {
    total?: number;
    rows?: { seller_id: string | null; seller_name: string | null; touchpoints: number }[];
  };
  goals?: GoalsInput;
}

const brl = (v: number | null | undefined): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(v) || 0);

const int = (v: number | null | undefined): string =>
  new Intl.NumberFormat("pt-BR").format(Number(v) || 0);

const num1 = (v: number): string =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v);

const pct = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : `${String(v).replace(".", ",")}%`;

/** "1 touchpoint" / "0 touchpoints". */
const plural = (v: number, one: string, many: string): string =>
  `${int(v)} ${Number(v) === 1 ? one : many}`;

export const FREQUENCY_LABEL: Record<string, string> = {
  daily: "Relatório diário",
  weekly: "Relatório semanal",
  monthly: "Relatório mensal",
};

const SCOPE_LABEL: Record<string, string> = {
  daily: "Resumo do dia",
  weekly: "Resumo da semana",
  monthly: "Resumo do mês",
};

/** dd/MM, in the schedule's timezone rather than the server's. */
function shortDate(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Human label for the window.
 *
 * A daily report covers exactly one day, so it says that day rather than
 * "01/09 a 02/09", which reads like a two-day range and is the kind of small
 * wrongness that makes a client re-check every other number.
 */
function periodLabel(
  from: string,
  to: string,
  frequency: string,
  tz: string,
): string {
  if (frequency === "daily") return shortDate(from, tz);
  // The window is half-open [from, to): the last day INCLUDED is the day before
  // `to`. Printing `to` itself would claim a day the numbers do not cover.
  const lastIncluded = new Date(new Date(to).getTime() - 1);
  return `${shortDate(from, tz)} a ${shortDate(lastIncluded.toISOString(), tz)}`;
}

export interface RenderArgs {
  snapshot: ReportSnapshot;
  frequency: string;
  timezone: string;
  scheduleName?: string;
  /** Absolute URL of the full report page, or null when no public base is set. */
  link: string | null;
}

export function renderReportText({
  snapshot,
  frequency,
  timezone,
  scheduleName,
  link,
}: RenderArgs): string {
  const o = snapshot.overview ?? {};
  const n = (k: string): number => Number(o[k]) || 0;
  const lines: string[] = [];

  const title = scheduleName?.trim() || FREQUENCY_LABEL[frequency] || "Relatório comercial";
  const period = snapshot.period
    ? periodLabel(snapshot.period.from, snapshot.period.to, frequency, timezone)
    : "";

  lines.push(`*${title}*${period ? ` · ${period}` : ""}`);
  lines.push(
    `_${[snapshot.equipe_name, snapshot.pipeline?.name ?? "Todos os pipelines"].filter(Boolean).join(" · ")}_`,
  );
  lines.push("");

  // --- 1. resumo ---------------------------------------------------------
  lines.push(`*1. ${SCOPE_LABEL[frequency] ?? "Resumo"}*`);
  lines.push(`• Novos leads: ${int(n("new_leads"))}`);
  lines.push(`• Ganhos: ${int(n("deals_won"))} · ${brl(n("won_value"))}`);
  lines.push(`• Perdidos: ${int(n("deals_lost"))}`);
  lines.push(`• Taxa de ganho: ${pct(o.win_rate)}`);
  lines.push(`• Pipeline aberto: ${brl(n("open_value"))} (${int(n("open_count"))})`);
  lines.push("");

  // --- 2. meta x realizado ----------------------------------------------
  const targets = resolveDailyTargets(snapshot.goals);
  const actual = {
    touchpoints: Number(snapshot.touchpoints_by_seller?.total ?? o.touchpoints) || 0,
    qualified: n("qualified"),
    proposals_sent: n("proposals_sent"),
    meetings_scheduled: n("meetings_scheduled"),
    meetings_done: n("meetings_done"),
    deals_won: n("deals_won"),
  };
  const scale = frequency === "daily" ? "diária" : frequency === "weekly" ? "da semana" : "do mês";
  lines.push("*2. Meta x realizado*");
  // Fechamentos e receita sempre aparecem; os demais marcos só entram aqui se o
  // gestor definiu meta — senão seriam cinco linhas "sem meta", ruído que o
  // bloco 3 já cobre com os números.
  const deals = targets.window.deals_won;
  lines.push(
    deals === undefined
      ? `• Fechamentos: ${int(actual.deals_won)} · sem meta ${scale} definida`
      : `• Fechamentos: ${int(actual.deals_won)} de ${num1(deals)} · gap: ${num1(gapOf(deals, actual.deals_won))}`,
  );
  const rev = targets.window.revenue;
  lines.push(
    rev === undefined
      ? `• Receita: ${brl(n("won_value"))} · sem meta ${scale} definida`
      : `• Receita: ${brl(n("won_value"))} de ${brl(rev)} · gap: ${brl(gapOf(rev, n("won_value")))}`,
  );
  const extra: [string, keyof typeof actual][] = [
    ["Touchpoints", "touchpoints"],
    ["Qualificados", "qualified"],
    ["Propostas", "proposals_sent"],
    ["Reuniões agendadas", "meetings_scheduled"],
    ["Reuniões realizadas", "meetings_done"],
  ];
  for (const [label, key] of extra) {
    const t = targets.window[key];
    if (t !== undefined) {
      lines.push(`• ${label}: ${int(actual[key])} de ${num1(t)} · gap: ${num1(gapOf(t, actual[key]))}`);
    }
  }
  lines.push("");

  // --- 3. marcos do funil ------------------------------------------------
  lines.push("*3. Marcos do funil*");
  lines.push(`• Qualificados: ${int(actual.qualified)}`);
  lines.push(`• Propostas enviadas: ${int(actual.proposals_sent)}`);
  lines.push(`• Reuniões agendadas: ${int(actual.meetings_scheduled)}`);
  lines.push(`• Reuniões realizadas: ${int(actual.meetings_done)}`);
  lines.push(`• No-show: ${int(n("no_shows"))}`);
  lines.push(`• Fechamentos: ${int(actual.deals_won)}`);
  lines.push("");

  // --- 4. touchpoints por vendedor --------------------------------------
  const sellers = (snapshot.touchpoints_by_seller?.rows ?? []).filter((r) => Number(r.touchpoints) > 0);
  lines.push("*4. Touchpoints por vendedor*");
  lines.push(`• Total: ${plural(actual.touchpoints, "touchpoint", "touchpoints")}`);
  if (sellers.length === 0) {
    lines.push("• Nenhum touchpoint registrado por vendedor");
  } else {
    for (const r of sellers) {
      lines.push(`   – ${r.seller_name?.trim() || "Não atribuído"}: ${int(r.touchpoints)}`);
    }
  }
  lines.push("");

  // --- 5. destaques ------------------------------------------------------
  lines.push("*5. Destaques*");
  const won = snapshot.top_won?.[0];
  lines.push(
    won
      ? `• Maior ganho: ${won.lead_name} — ${brl(won.value)}${won.responsible_name ? ` (${won.responsible_name})` : ""}`
      : "• Maior ganho: nenhum negócio ganho no período",
  );
  const open = snapshot.top_opportunities?.[0];
  lines.push(
    open
      ? `• Maior oportunidade aberta: ${open.lead_name} — ${brl(open.value)}${open.days_in_stage >= 14 ? ` ⚠️ ${open.days_in_stage}d parada` : ""}`
      : "• Maior oportunidade aberta: nenhuma oportunidade aberta",
  );
  const loss = snapshot.loss_reasons?.[0];
  lines.push(
    loss
      ? `• Principal motivo de perda: ${loss.reason} (${int(loss.count)} de ${int(n("deals_lost"))})`
      : "• Principal motivo de perda: nenhuma perda no período",
  );
  lines.push("");

  if (link) lines.push(`Ver relatório completo: ${link}`);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
