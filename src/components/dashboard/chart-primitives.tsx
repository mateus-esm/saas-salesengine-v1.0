/**
 * Sprint 9 — the pieces every chart in the BI area is built from.
 *
 * Centralised so the whole area reads as one system: same tooltip, same empty
 * state, same number formatting, same recessive grid. A dashboard where each
 * widget was styled on its own is the thing that makes a product feel assembled
 * rather than designed.
 */
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ChartTheme } from "@/config/chartTheme";

/** Which validated palette to draw with. `resolvedTheme` accounts for "system". */
export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? "dark" : "light";
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export const formatBRL = (v: number | null | undefined): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(v) || 0);

/** Compact money for axis ticks, where "R$ 1.250.000" would collide with itself. */
export const formatBRLCompact = (v: number): string => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}k`;
  return `R$ ${n.toFixed(0)}`;
};

export const formatInt = (v: number | null | undefined): string =>
  new Intl.NumberFormat("pt-BR").format(Number(v) || 0);

/**
 * A rate that has no denominator renders as an em dash, never as "0%".
 *
 * The RPCs return null on purpose in that case: "0% de comparecimento" and
 * "ninguém marcou reunião ainda" are different facts, and printing the first
 * when the second is true tells a client their team failed at something it
 * never attempted.
 */
export const formatRate = (v: number | null | undefined, suffix = "%"): string =>
  v === null || v === undefined ? "—" : `${Number(v).toFixed(1).replace(".", ",")}${suffix}`;

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

export const AXIS_TICK = { fontSize: 11, fill: "hsl(var(--muted-foreground))" } as const;

/** Recessive grid: present enough to read a value against, quiet enough to ignore. */
export const GRID_PROPS = {
  stroke: "hsl(var(--border))",
  strokeDasharray: "3 3",
  vertical: false,
} as const;

interface ChartCardProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ChartCard({ title, description, action, children, className }: ChartCardProps) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-sm font-semibold tracking-tight">{title}</CardTitle>
          {description && (
            <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
          )}
        </div>
        {action}
      </CardHeader>
      <CardContent className="flex-1 pt-0">{children}</CardContent>
    </Card>
  );
}

/**
 * The tooltip every chart uses.
 *
 * An HTML chart is interactive by nature; shipping one without hover means the
 * only way to read an exact value is to squint at a gridline.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter = formatInt,
}: {
  active?: boolean;
  // recharts' payload type is loose by design; each entry is one series at one x.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string;
  valueFormatter?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md">
      {label && (
        <div className="mb-1.5 text-xs font-medium text-popover-foreground">{label}</div>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: entry.color ?? entry.fill }}
            />
            {/* Text stays in ink tokens; the swatch beside it carries identity. */}
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-medium tabular-nums text-popover-foreground">
              {valueFormatter(Number(entry.value) || 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The state that distinguishes "nothing happened" from "nobody configured this".
 *
 * Those two produce an identical-looking zero, and confusing them is how a
 * client decides the product is broken. When the funnel map is empty this
 * carries a call to action instead of a chart.
 */
export function EmptyChart({
  message,
  action,
  icon,
}: {
  message: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3 px-6 text-center">
      {icon && <div className="text-muted-foreground/60">{icon}</div>}
      <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
