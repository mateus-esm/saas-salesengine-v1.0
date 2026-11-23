import { CalendarRange } from "lucide-react";

import { GROWTH_PERIODS, type GrowthPeriod, type GrowthRange } from "@/lib/growthPeriod";

const CTRL = "h-8 rounded-md border border-input bg-background px-2 text-sm";

/** Sprint 16 · ajuste 3 — the one period filter of Growth (every tab reads it). */
export function GrowthPeriodBar({
  range,
  selected,
  customFrom,
  customTo,
  onChange,
}: {
  range: GrowthRange;
  /** What the URL asked for (a custom range still being typed stays "custom"). */
  selected: string;
  customFrom: string;
  customTo: string;
  onChange: (period: GrowthPeriod, from?: string, to?: string) => void;
}) {
  const isCustom = selected === "custom";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden />
      <select
        aria-label="Período"
        className={CTRL}
        value={isCustom ? "custom" : range.period}
        onChange={(e) => {
          const v = e.target.value as GrowthPeriod;
          if (v === "custom") onChange("custom", customFrom || range.fromDay, customTo || range.toDay);
          else onChange(v);
        }}
      >
        {GROWTH_PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      {isCustom && (
        <>
          <input
            type="date"
            aria-label="De"
            className={CTRL}
            value={customFrom}
            onChange={(e) => onChange("custom", e.target.value, customTo)}
          />
          <span className="text-xs text-muted-foreground">até</span>
          <input
            type="date"
            aria-label="Até"
            className={CTRL}
            value={customTo}
            onChange={(e) => onChange("custom", customFrom, e.target.value)}
          />
        </>
      )}
      {!isCustom && range.period !== "all" && (
        <span className="text-xs text-muted-foreground">
          {range.fromDay.split("-").reverse().join("/")} – {range.toDay.split("-").reverse().join("/")}
        </span>
      )}
    </div>
  );
}
