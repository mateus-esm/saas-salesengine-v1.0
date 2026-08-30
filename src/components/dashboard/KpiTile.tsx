/**
 * Sprint 9 — the stat tile.
 *
 * The founder asked for a top-down structure: "the bigger number and most
 * valuable" first, granularity underneath. This is that first layer.
 *
 * A stat tile is deliberately NOT a chart. One number, read at a glance, with
 * at most one supporting line. Sparklines and mini-donuts inside a KPI tile are
 * decoration — too small to read a value from and big enough to compete with
 * the number that matters.
 */
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiTileProps {
  label: string;
  value: string;
  /** One short line under the number: a rate, a comparison, a count. */
  hint?: string;
  icon?: LucideIcon;
  /** Pulls the eye to the one or two numbers that carry the headline. */
  emphasis?: boolean;
  /** Reserved status accent. Never a categorical series colour. */
  tone?: "default" | "positive" | "negative";
  onClick?: () => void;
}

export function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  emphasis = false,
  tone = "default",
  onClick,
}: KpiTileProps) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-red-600 dark:text-red-400"
        : "text-foreground";

  return (
    <Card
      onClick={onClick}
      className={cn(
        "flex flex-col justify-between gap-2 p-4 transition-colors",
        emphasis && "border-primary/30 bg-primary/[0.03]",
        onClick && "cursor-pointer hover:border-primary/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />}
      </div>

      <div className="min-w-0">
        <div
          className={cn(
            "truncate font-bold tabular-nums tracking-tight",
            emphasis ? "text-3xl" : "text-2xl",
            toneClass,
          )}
        >
          {value}
        </div>
        {hint && (
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</div>
        )}
      </div>
    </Card>
  );
}
