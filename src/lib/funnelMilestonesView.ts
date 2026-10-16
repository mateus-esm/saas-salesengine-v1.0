// SE-SUP1-8 (#10) — a aritmética de exibição do widget "Marcos do funil", fora
// do componente para ser testada. A forma dos dados e a regra de "série começa
// em" são do módulo compartilhado com o relatório (_shared/funnel-milestones).

import {
  MILESTONES,
  bucketHasHistory,
  seriesNote,
  type FunnelMilestones,
  type MilestoneKey,
  type MilestoneSeriesPoint,
} from "../../supabase/functions/_shared/funnel-milestones";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Rótulo do balde a partir do dia local "YYYY-MM-DD" (sem passar por Date: sem fuso). */
export function bucketLabel(bucket: string, granularity: FunnelMilestones["granularity"]): string {
  const [y, m, d] = bucket.split("-");
  if (!y || !m || !d) return bucket;
  if (granularity === "month") return `${MONTHS[Number(m) - 1] ?? m}/${y.slice(2)}`;
  if (granularity === "week") return `sem. ${d}/${m}`;
  return `${d}/${m}`;
}

/**
 * O que a célula mostra: o número, ou "—" quando o balde inteiro é anterior ao
 * primeiro evento já gravado daquele marco (o no-show antes do registro manual).
 */
export function cellValue(p: MilestoneSeriesPoint, key: MilestoneKey, since: FunnelMilestones["since"]): string {
  const n = p[key] || 0;
  if (n > 0) return String(n);
  return bucketHasHistory(since[key], p.bucket_end) ? "0" : "—";
}

/** As notas de rodapé: um marco cuja série começa dentro (ou depois) da janela. */
export function historyNotes(data: FunnelMilestones, from: Date): { key: MilestoneKey; text: string }[] {
  return MILESTONES.flatMap((m) => {
    const note = seriesNote(data.since[m.key], from.toISOString());
    return note ? [{ key: m.key, text: `${m.label}: ${note}` }] : [];
  });
}

/** Janelas longas pedem baldes maiores: 90 pontos diários são ruído. */
export function defaultGranularity(from: Date, to: Date): FunnelMilestones["granularity"] {
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  if (days > 120) return "month";
  if (days > 35) return "week";
  return "day";
}
