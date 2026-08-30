/**
 * Sprint 9 — "deals lost, motive", in the Vision's words.
 *
 * A ranked list with proportional bars rather than a pie: comparing two slices
 * of a pie means comparing angles, which people do badly, and loss reasons are
 * exactly the case where second place matters as much as first.
 *
 * The reserved "lost" status colour is used throughout — never a categorical
 * hue. Every row here means the same thing, so painting them different colours
 * would imply a distinction that does not exist.
 */
import { CHART_STATUS } from "@/config/chartTheme";
import type { LossReasonRow } from "@/types/dashboard";
import { formatBRL, formatInt, useChartTheme } from "./chart-primitives";

export function LossReasonList({ rows }: { rows: LossReasonRow[] }) {
  const theme = useChartTheme();
  const color = CHART_STATUS.lost[theme];

  const max = Math.max(...rows.map((r) => r.count), 1);
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-2.5">
      {rows.map((row) => {
        const pct = total > 0 ? (row.count / total) * 100 : 0;
        return (
          <div key={row.reason} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-medium text-foreground">{row.reason}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatInt(row.count)} · {formatBRL(row.value)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(row.count / max) * 100}%`, backgroundColor: color }}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                {pct.toFixed(0)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
