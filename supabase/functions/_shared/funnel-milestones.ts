// ============================================================================
// SE-SUP1-8 (#10) — os marcos do funil: a forma do que get_funnel_milestones /
// _funnel_milestones_core devolvem e o texto que deles sai.
//
// Um só módulo para três leitores — o relatório de WhatsApp (report-render.ts),
// a página pública (src/lib/reportSections.ts) e o widget do dashboard — para
// que nenhum deles invente a própria ordem, o próprio rótulo ou a própria regra
// de "série começa em".
//
// POR QUE "SÉRIE COMEÇA EM" E NÃO ZERO
//
// No-show só passou a existir com o registro manual (esta onda): não há no-show
// no passado. Um gráfico que mostra 0 em setembro diz "ninguém faltou", o que é
// falso — ninguém REGISTROU. Então cada marco carrega a data do primeiro evento
// já gravado (`since`) e, antes dela, o valor é "sem dado", não zero.
// ============================================================================

export type MilestoneKey =
  | "qualified"
  | "proposal_sent"
  | "meeting_scheduled"
  | "meeting_done"
  | "no_show"
  | "won";

/** Ordem do relatório (seção 3) e das colunas do widget. */
export const MILESTONES: { key: MilestoneKey; label: string; short: string }[] = [
  { key: "qualified", label: "Qualificados", short: "Qualif." },
  { key: "proposal_sent", label: "Propostas enviadas", short: "Prop." },
  { key: "meeting_scheduled", label: "Reuniões agendadas", short: "Agend." },
  { key: "meeting_done", label: "Reuniões realizadas", short: "Realiz." },
  { key: "no_show", label: "No-show", short: "No-show" },
  { key: "won", label: "Fechamentos", short: "Fech." },
];

export type MilestoneCounts = Record<MilestoneKey, number>;

export interface MilestoneSeriesPoint extends MilestoneCounts {
  /** Início do balde, dia local "YYYY-MM-DD". */
  bucket: string;
  /** Início do balde seguinte (instante, exclusivo); null em resposta antiga. */
  bucket_end: string | null;
}

export interface MilestoneGroupRow extends MilestoneCounts {
  id: string | null;
  name: string;
}

export interface FunnelMilestones {
  granularity: "day" | "week" | "month";
  totals: MilestoneCounts;
  series: MilestoneSeriesPoint[];
  by_seller: MilestoneGroupRow[];
  by_pipeline: MilestoneGroupRow[];
  /** Primeiro evento já gravado de cada marco no escopo; null = nunca houve. */
  since: Record<MilestoneKey, string | null>;
}

const zero = (): MilestoneCounts => ({
  qualified: 0,
  proposal_sent: 0,
  meeting_scheduled: 0,
  meeting_done: 0,
  no_show: 0,
  won: 0,
});

const countsOf = (x: Record<string, unknown> | null | undefined): MilestoneCounts => {
  const out = zero();
  for (const m of MILESTONES) out[m.key] = Number(x?.[m.key]) || 0;
  return out;
};

const rowsOf = (raw: unknown, idKey: string, nameKey: string, fallback: string): MilestoneGroupRow[] =>
  (Array.isArray(raw) ? raw : []).map((r: Record<string, unknown>) => ({
    id: (r?.[idKey] as string | null) ?? null,
    name: String(r?.[nameKey] ?? "").trim() || fallback,
    ...countsOf(r),
  }));

/** Resposta do RPC → forma segura. Nulo/ausente vira zero explícito, nunca erro. */
export function normalizeMilestones(raw: unknown): FunnelMilestones {
  const r = (raw ?? {}) as Record<string, unknown>;
  const g = r.granularity;
  const since = (r.since ?? {}) as Record<string, unknown>;
  return {
    granularity: g === "week" || g === "month" ? g : "day",
    totals: countsOf(r.totals as Record<string, unknown>),
    series: (Array.isArray(r.series) ? r.series : []).map((p: Record<string, unknown>) => ({
      bucket: String(p?.bucket ?? "").slice(0, 10),
      bucket_end: typeof p?.bucket_end === "string" ? (p.bucket_end as string) : null,
      ...countsOf(p),
    })),
    by_seller: rowsOf(r.by_seller, "seller_id", "seller_name", "Não atribuído"),
    by_pipeline: rowsOf(r.by_pipeline, "pipeline_id", "pipeline_name", "Pipeline removido"),
    since: Object.fromEntries(
      MILESTONES.map((m) => [m.key, typeof since[m.key] === "string" ? (since[m.key] as string) : null]),
    ) as Record<MilestoneKey, string | null>,
  };
}

/** dd/MM/aaaa no fuso dado (o dia do cliente, não o do servidor). */
export function formatDay(iso: string, tz = "America/Sao_Paulo"): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: tz })
      .format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * A nota de história de um marco para uma janela que começa em `from`:
 *   - nunca houve evento           → "série ainda sem registros"
 *   - o primeiro é depois de from  → "série começa em dd/MM/aaaa"
 *   - já existia antes da janela   → null (o zero é zero de verdade)
 */
export function seriesNote(since: string | null | undefined, from: string, tz?: string): string | null {
  if (!since) return "série ainda sem registros";
  return new Date(since).getTime() > new Date(from).getTime() ? `série começa em ${formatDay(since, tz)}` : null;
}

/**
 * Um balde do gráfico tem dado para o marco? Falso quando o balde inteiro é
 * anterior ao primeiro evento do marco — o widget mostra "—", não 0.
 * `bucketEnd` é exclusivo (início do balde seguinte).
 */
export function bucketHasHistory(since: string | null | undefined, bucketEnd: string | null): boolean {
  if (!since) return false;
  if (!bucketEnd) return true;
  return new Date(since).getTime() < new Date(bucketEnd).getTime();
}

/** "Qualif. 1 · Prop. 0 · Agend. 2 · Realiz. 1 · No-show 0 · Fech. 0" — uma linha por vendedor. */
export function compactCounts(c: MilestoneCounts): string {
  return MILESTONES.map((m) => `${m.short} ${new Intl.NumberFormat("pt-BR").format(c[m.key] || 0)}`).join(" · ");
}

/** Só quem teve algum marco na janela entra na lista do relatório. */
export const hasAnyMilestone = (c: MilestoneCounts): boolean => MILESTONES.some((m) => (c[m.key] || 0) > 0);
