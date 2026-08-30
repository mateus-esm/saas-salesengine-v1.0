/**
 * Sprint 9 — change over time.
 *
 * ONE AXIS, ALWAYS.
 *
 * The obvious thing to build here is "leads and revenue on the same chart",
 * with counts on the left and R$ on the right. Two y-scales let you place any
 * two lines in any relationship you like just by choosing the scales — the
 * crossing points are an artefact of the axes, not of the business — so this
 * component refuses it. Counts and money are two charts, side by side, sharing
 * an x-axis. The comparison stays honest and costs nothing but vertical space.
 */
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { seriesColor } from "@/config/chartTheme";
import type { FunnelSeriesPoint, SeriesGranularity } from "@/types/dashboard";
import {
  AXIS_TICK,
  ChartTooltip,
  EmptyChart,
  GRID_PROPS,
  formatBRLCompact,
  formatBRL,
  formatInt,
  useChartTheme,
} from "./chart-primitives";

const bucketLabel = (iso: string, granularity: SeriesGranularity): string => {
  try {
    const d = parseISO(iso);
    if (granularity === "month") return format(d, "MMM/yy", { locale: ptBR });
    if (granularity === "week") return format(d, "dd/MM", { locale: ptBR });
    return format(d, "dd/MM", { locale: ptBR });
  } catch {
    return iso;
  }
};

/** The four counting series, in fixed palette order so identity is stable. */
const COUNT_SERIES = [
  { key: "new_leads", label: "Novos leads", slot: 0 },
  { key: "proposals_sent", label: "Propostas", slot: 1 },
  { key: "meetings_done", label: "Reuniões", slot: 2 },
  { key: "deals_won", label: "Ganhos", slot: 3 },
] as const;

export function TrendChart({
  data,
  granularity,
}: {
  data: FunnelSeriesPoint[];
  granularity: SeriesGranularity;
}) {
  const theme = useChartTheme();

  if (!data.length) {
    return <EmptyChart message="Sem dados no período selecionado." />;
  }

  const rows = data.map((d) => ({ ...d, label: bucketLabel(d.bucket, granularity) }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
        <Tooltip content={<ChartTooltip valueFormatter={formatInt} />} />
        <Legend
          iconType="plainline"
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
        />
        {COUNT_SERIES.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={seriesColor(s.slot, theme)}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Revenue over time — its own chart, its own axis. See the note at the top of
 * this file for why this is not a second line on the chart above.
 */
export function RevenueTrendChart({
  data,
  granularity,
}: {
  data: FunnelSeriesPoint[];
  granularity: SeriesGranularity;
}) {
  const theme = useChartTheme();

  if (!data.length) {
    return <EmptyChart message="Sem receita registrada no período." />;
  }

  const rows = data.map((d) => ({ ...d, label: bucketLabel(d.bucket, granularity) }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
        <defs>
          <linearGradient id="wonValueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={seriesColor(0, theme)} stopOpacity={0.22} />
            <stop offset="100%" stopColor={seriesColor(0, theme)} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={62}
          tickFormatter={formatBRLCompact}
        />
        <Tooltip content={<ChartTooltip valueFormatter={formatBRL} />} />
        <Area
          type="monotone"
          dataKey="won_value"
          name="Receita ganha"
          stroke={seriesColor(0, theme)}
          strokeWidth={2}
          fill="url(#wonValueFill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
