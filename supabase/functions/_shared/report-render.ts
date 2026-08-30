// ============================================================================
// Sprint 9 · T13 — turning a report snapshot into a WhatsApp message.
//
// WHAT THIS IS OPTIMISED FOR
//
// A phone screen, read in ten seconds, probably before 9am, probably while
// walking. That rules out a table (WhatsApp has no monospace alignment worth
// relying on), rules out every metric the client did not ask for, and rules out
// decimal places on counts.
//
// It also rules out sending zeros for things that did not happen. A daily
// report that reads "0 propostas · 0 reuniões · 0 no-show" every Sunday trains
// the client to stop opening it, and then the one Monday it matters they miss
// it too. Empty lines are dropped; when nothing at all happened the message
// says so in one sentence.
//
// The link at the end is the escape hatch for everything left out.
// ============================================================================

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
}

const brl = (v: number | null | undefined): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(v) || 0);

const int = (v: number | null | undefined): string =>
  new Intl.NumberFormat("pt-BR").format(Number(v) || 0);

const pct = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : `${String(v).replace(".", ",")}%`;

export const FREQUENCY_LABEL: Record<string, string> = {
  daily: "Relatório diário",
  weekly: "Relatório semanal",
  monthly: "Relatório mensal",
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
  const sections = new Set(snapshot.sections ?? []);
  const lines: string[] = [];

  const title = scheduleName?.trim() || FREQUENCY_LABEL[frequency] || "Relatório comercial";
  const period = snapshot.period
    ? periodLabel(snapshot.period.from, snapshot.period.to, frequency, timezone)
    : "";

  lines.push(`*${title}*${period ? ` · ${period}` : ""}`);
  if (snapshot.equipe_name) lines.push(`_${snapshot.equipe_name}_`);
  lines.push("");

  // --- the money, first --------------------------------------------------
  const money: string[] = [];
  if (sections.has("kpi_won_value") && Number(o.deals_won) > 0) {
    money.push(`✅ ${int(o.deals_won)} ganhos · ${brl(o.won_value)}`);
  }
  if (sections.has("kpi_win_rate") && o.win_rate !== null && o.win_rate !== undefined) {
    money.push(`📈 Taxa de ganho: ${pct(o.win_rate)}`);
  }
  if (sections.has("kpi_open_value") && Number(o.open_value) > 0) {
    money.push(`💼 Pipeline aberto: ${brl(o.open_value)} (${int(o.open_count)})`);
  }
  if (money.length) lines.push(...money, "");

  // --- the work ----------------------------------------------------------
  const work: string[] = [];
  if (sections.has("kpi_new_leads") && Number(o.new_leads) > 0) {
    work.push(`🆕 ${int(o.new_leads)} novos leads`);
  }
  if (sections.has("kpi_proposals") && Number(o.proposals_sent) > 0) {
    work.push(`📄 ${int(o.proposals_sent)} propostas enviadas`);
  }
  if (sections.has("kpi_meetings") && Number(o.meetings_done) > 0) {
    work.push(`🤝 ${int(o.meetings_done)} reuniões realizadas`);
  }
  if (sections.has("kpi_no_show") && Number(o.no_shows) > 0) {
    work.push(`🚫 ${int(o.no_shows)} no-show`);
  }
  if (sections.has("kpi_touchpoints") && Number(o.touchpoints) > 0) {
    work.push(`💬 ${int(o.touchpoints)} interações`);
  }
  if (work.length) lines.push(...work, "");

  // --- what went wrong ---------------------------------------------------
  if (sections.has("panel_loss_reasons") && snapshot.loss_reasons?.length) {
    lines.push(`❌ *Perdas* (${int(o.deals_lost)})`);
    for (const r of snapshot.loss_reasons.slice(0, 3)) {
      lines.push(`   • ${r.reason}: ${r.count}`);
    }
    lines.push("");
  }

  // --- what to do today --------------------------------------------------
  if (sections.has("panel_top_opportunities") && snapshot.top_opportunities?.length) {
    lines.push("⭐ *Maiores oportunidades abertas*");
    for (const t of snapshot.top_opportunities.slice(0, 3)) {
      const stale = t.days_in_stage >= 14 ? ` ⚠️ ${t.days_in_stage}d parada` : "";
      lines.push(`   • ${t.lead_name} — ${brl(t.value)}${stale}`);
    }
    lines.push("");
  }

  // Nothing happened. Say it once, plainly, instead of five zeros.
  const quiet = money.length === 0 && work.length === 0;
  if (quiet) {
    lines.push("Nenhuma movimentação comercial registrada neste período.");
    lines.push("");
  }

  if (link) lines.push(`Ver relatório completo: ${link}`);

  // Collapse the runs of blank lines the conditional blocks leave behind.
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
