// Sprint 16 · ajuste 3 — one period for the whole Growth area (URL: ?gp=30d, or
// ?gp=custom&gf=2026-11-01&gt=2026-11-23). Every tab reads the same [from, to).

import { REPORT_PERIOD_LABELS, reportRange, type ReportPeriod } from "@/lib/campaigns";

export type GrowthPeriod = ReportPeriod | "all" | "custom";

export const GROWTH_PERIODS: { value: GrowthPeriod; label: string }[] = [
  ...(Object.keys(REPORT_PERIOD_LABELS) as ReportPeriod[]).map((p) => ({ value: p as GrowthPeriod, label: REPORT_PERIOD_LABELS[p] })),
  { value: "all", label: "Todo o período" },
  { value: "custom", label: "Personalizado" },
];

export interface GrowthRange {
  period: GrowthPeriod;
  /** ISO, inclusive. */
  from: string;
  /** ISO, exclusive. */
  to: string;
  /** Local days (YYYY-MM-DD), inclusive, for date-only things (experiments). */
  fromDay: string;
  toDay: string;
  label: string;
}

const isDay = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const localDay = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const fmt = (day: string) => day.split("-").reverse().join("/");

export function growthRange(period: string | null, from?: string | null, to?: string | null, now: Date = new Date()): GrowthRange {
  const p = (GROWTH_PERIODS.some((x) => x.value === period) ? period : "30d") as GrowthPeriod;
  if (p === "custom" && isDay(from) && isDay(to) && from <= to) {
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    return {
      period: p,
      from: new Date(fy, fm - 1, fd).toISOString(),
      to: new Date(ty, tm - 1, td + 1).toISOString(),
      fromDay: from,
      toDay: to,
      label: `${fmt(from)} – ${fmt(to)}`,
    };
  }
  if (p === "all" || p === "custom") {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    return { period: "all", from: new Date(2000, 0, 1).toISOString(), to: end, fromDay: "2000-01-01", toDay: localDay(now.toISOString()), label: "Todo o período" };
  }
  const r = reportRange(p, now);
  const lastDay = new Date(new Date(r.to).getTime() - 86_400_000).toISOString();
  return { period: p, from: r.from, to: r.to, fromDay: localDay(r.from), toDay: localDay(lastDay), label: REPORT_PERIOD_LABELS[p] };
}

/** An experiment counts in the period when its dates touch it (no dates = always). */
export function overlaps(startsOn: string | null, endsOn: string | null, range: Pick<GrowthRange, "fromDay" | "toDay">): boolean {
  if (startsOn && startsOn > range.toDay) return false;
  if (endsOn && endsOn < range.fromDay) return false;
  return true;
}
