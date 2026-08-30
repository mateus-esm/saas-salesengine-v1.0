/**
 * Sprint 9 — the funnel.
 *
 * WHY HORIZONTAL BARS AND NOT A FUNNEL SHAPE
 *
 * The classic trapezoid funnel encodes magnitude as the WIDTH of a shape whose
 * height also changes, so the eye reads area — and area exaggerates every drop.
 * A stage at 50% looks like a quarter. Horizontal bars share one baseline and
 * one scale, so the comparison the client actually wants ("how much did we lose
 * between proposta and reunião?") is a length comparison, which people read
 * accurately.
 *
 * Each row carries its conversion from the PREVIOUS stage as a direct label,
 * because that number — not the absolute count — is the one that tells a sales
 * manager where the process leaks.
 */
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { seriesColor } from "@/config/chartTheme";
import {
  AXIS_TICK,
  ChartTooltip,
  EmptyChart,
  formatInt,
  useChartTheme,
} from "./chart-primitives";

export interface FunnelStep {
  key: string;
  label: string;
  value: number;
}

interface FunnelChartProps {
  steps: FunnelStep[];
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
}

export function FunnelChart({ steps, emptyMessage, emptyAction }: FunnelChartProps) {
  const theme = useChartTheme();

  const hasAny = steps.some((s) => s.value > 0);
  if (!hasAny) {
    return (
      <EmptyChart
        message={emptyMessage ?? "Nenhum evento de funil neste período."}
        action={emptyAction}
      />
    );
  }

  // Conversion is measured against the previous NON-ZERO step. Dividing by a
  // zero stage would print Infinity, and dividing by the first stage would
  // silently redefine the metric as "conversion from the top" halfway down.
  const rows = steps.map((step, i) => {
    let prev = 0;
    for (let j = i - 1; j >= 0; j--) {
      if (steps[j].value > 0) {
        prev = steps[j].value;
        break;
      }
    }
    return {
      ...step,
      conversion: i === 0 || prev === 0 ? null : (step.value / prev) * 100,
    };
  });

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 44)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={132}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
            content={<ChartTooltip valueFormatter={formatInt} />}
          />
          <Bar dataKey="value" name="Negócios" radius={[0, 4, 4, 0]} barSize={20} isAnimationActive={false}>
            {rows.map((row, i) => (
              <Cell key={row.key} fill={seriesColor(i, theme)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Value and conversion as direct text under the plot. This is the
          "selective direct labels" rule: the numbers are readable without
          hovering — so the chart survives a screenshot pasted into WhatsApp —
          while the bars stay clean, since a number stamped inside every bar
          competes with the length it is supposed to help you read. */}
      <div className="grid gap-1 text-[11px]">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3 px-1">
            <span className="truncate text-muted-foreground">{row.label}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-medium text-foreground">{formatInt(row.value)}</span>
              {row.conversion !== null && (
                <span className="ml-2 text-muted-foreground">
                  {row.conversion.toFixed(0)}% da etapa anterior
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
