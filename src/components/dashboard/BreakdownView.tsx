/**
 * Sprint 9 — one dimension, cut every way that matters.
 *
 * The same component serves pipeline, responsável and canal, because the
 * question is identical in all three cases: who/what produced the volume, and
 * who/what converted it. Three bespoke screens would drift apart within two
 * sprints.
 *
 * Chart AND table, always. The chart answers "who is ahead" in one glance; the
 * table answers "by how much, exactly" without a hover, and doubles as the
 * accessible view for anyone the colours do not serve.
 */
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { groupTail, seriesColor } from "@/config/chartTheme";
import type { FunnelBreakdownRow } from "@/types/dashboard";
import {
  AXIS_TICK,
  ChartTooltip,
  EmptyChart,
  GRID_PROPS,
  formatBRL,
  formatBRLCompact,
  formatInt,
  formatRate,
  useChartTheme,
} from "./chart-primitives";
import { cn } from "@/lib/utils";

type Metric = "won_value" | "new_opportunities" | "open_value";

const METRIC_LABEL: Record<Metric, string> = {
  won_value: "Receita ganha",
  new_opportunities: "Novas oportunidades",
  open_value: "Pipeline aberto",
};

export function BreakdownView({
  rows,
  metric = "won_value",
  emptyMessage,
}: {
  rows: FunnelBreakdownRow[];
  metric?: Metric;
  emptyMessage?: string;
}) {
  const theme = useChartTheme();

  if (!rows.length) {
    return <EmptyChart message={emptyMessage ?? "Sem dados para esta quebra no período."} />;
  }

  const isMoney = metric !== "new_opportunities";

  // Past eight, the palette stops separating things. Everything beyond folds
  // into one honest "Outros" bucket rather than getting an invented ninth hue.
  const charted = groupTail(
    [...rows].sort((a, b) => Number(b[metric]) - Number(a[metric])),
    8,
    "label",
    ["won_value", "new_opportunities", "open_value", "deals_won", "deals_lost"],
  );

  return (
    <div className="space-y-5">
      <ResponsiveContainer width="100%" height={Math.max(200, charted.length * 34)}>
        <BarChart
          data={charted}
          layout="vertical"
          margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
        >
          <CartesianGrid {...GRID_PROPS} horizontal={false} vertical />
          <XAxis
            type="number"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={isMoney ? formatBRLCompact : formatInt}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={140}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
            content={<ChartTooltip valueFormatter={isMoney ? formatBRL : formatInt} />}
          />
          <Bar
            dataKey={metric}
            name={METRIC_LABEL[metric]}
            radius={[0, 4, 4, 0]}
            barSize={18}
            isAnimationActive={false}
          >
            {charted.map((row, i) => (
              <Cell key={row.label} fill={seriesColor(i, theme)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="-mx-2 overflow-x-auto px-2">
        <table className="w-full min-w-[680px] text-xs">
          <thead>
            <tr className="border-b border-border text-left">
              <Th>&nbsp;</Th>
              <Th className="text-right">Novas</Th>
              <Th className="text-right">Propostas</Th>
              <Th className="text-right">Reuniões</Th>
              <Th className="text-right">Ganhos</Th>
              <Th className="text-right">Perdidos</Th>
              <Th className="text-right">Taxa</Th>
              <Th className="text-right">Receita</Th>
              <Th className="text-right">Aberto</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label} className="border-b border-border/50 last:border-0">
                <Td className="max-w-[170px] truncate font-medium text-foreground">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: seriesColor(i, theme) }}
                    />
                    {r.label}
                  </span>
                </Td>
                <Td className="text-right tabular-nums">{formatInt(r.new_opportunities)}</Td>
                <Td className="text-right tabular-nums">{formatInt(r.proposals_sent)}</Td>
                <Td className="text-right tabular-nums">{formatInt(r.meetings_done)}</Td>
                <Td className="text-right tabular-nums">{formatInt(r.deals_won)}</Td>
                <Td className="text-right tabular-nums">{formatInt(r.deals_lost)}</Td>
                <Td className="text-right tabular-nums text-muted-foreground">
                  {formatRate(r.win_rate)}
                </Td>
                <Td className="text-right font-semibold tabular-nums text-foreground">
                  {formatBRL(r.won_value)}
                </Td>
                <Td className="text-right tabular-nums text-muted-foreground">
                  {formatBRL(r.open_value)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Th = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <th
    className={cn(
      "pb-2 pr-3 text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground",
      className,
    )}
  >
    {children}
  </th>
);

const Td = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <td className={cn("py-2 pr-3", className)}>{children}</td>
);
