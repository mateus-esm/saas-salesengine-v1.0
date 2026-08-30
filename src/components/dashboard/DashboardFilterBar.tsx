/**
 * Sprint 9 — the filters, in one row above the charts.
 *
 * Period, pipeline, responsible and channel narrow EVERY widget on the page at
 * once. A dashboard where each card has its own little date picker is a
 * dashboard whose numbers cannot be compared to each other.
 *
 * The responsible filter is simply absent for a plain seat — not disabled.
 * The RPCs have already narrowed their data to them, so offering a control that
 * cannot change anything would just look broken.
 */
import { useState } from "react";
import { Calendar as CalendarIcon, Check, ChevronDown, RotateCcw } from "lucide-react";
import { endOfDay, endOfMonth, startOfDay, startOfMonth, subDays, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DashboardFilterOptions, DashboardFilters } from "@/types/dashboard";
import { cn } from "@/lib/utils";

export type PeriodPreset = "today" | "7d" | "30d" | "month" | "last_month" | "90d";

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  month: "Este mês",
  last_month: "Mês passado",
  "90d": "Últimos 90 dias",
};

/**
 * Ranges are half-open [from, to): the RPCs filter `>= from and < to`.
 * Using `<= endOfDay` instead would double-count anything landing exactly on
 * the boundary microsecond when two adjacent periods are compared.
 */
export function periodRange(preset: PeriodPreset, now = new Date()): { from: Date; to: Date } {
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "7d":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "30d":
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case "month":
      return { from: startOfMonth(now), to: endOfDay(now) };
    case "last_month": {
      const prev = subMonths(now, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case "90d":
    default:
      return { from: startOfDay(subDays(now, 89)), to: endOfDay(now) };
  }
}

interface Props {
  preset: PeriodPreset;
  onPresetChange: (p: PeriodPreset) => void;
  filters: DashboardFilters;
  onFiltersChange: (f: DashboardFilters) => void;
  options?: DashboardFilterOptions;
}

export function DashboardFilterBar({
  preset,
  onPresetChange,
  filters,
  onFiltersChange,
  options,
}: Props) {
  const [open, setOpen] = useState<string | null>(null);

  const toggle = (key: "pipelineIds" | "responsibleIds" | "channels", id: string) => {
    const current = filters[key] ?? [];
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    onFiltersChange({ ...filters, [key]: next });
  };

  const activeCount =
    (filters.pipelineIds?.length ?? 0) +
    (filters.responsibleIds?.length ?? 0) +
    (filters.channels?.length ?? 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onValueChange={(v) => onPresetChange(v as PeriodPreset)}>
        <SelectTrigger className="h-8 w-[168px] text-xs">
          <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((p) => (
            <SelectItem key={p} value={p} className="text-xs">
              {PERIOD_LABELS[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <MultiFilter
        label="Pipeline"
        items={options?.pipelines?.map((p) => ({ id: p.id, name: p.name })) ?? []}
        selected={filters.pipelineIds ?? []}
        onToggle={(id) => toggle("pipelineIds", id)}
        open={open === "pipeline"}
        onOpenChange={(o) => setOpen(o ? "pipeline" : null)}
      />

      {/* Absent, not disabled, for a plain seat. */}
      {options?.can_see_team && (
        <MultiFilter
          label="Responsável"
          items={options.responsibles.map((r) => ({ id: r.id, name: r.name || "Sem nome" }))}
          selected={filters.responsibleIds ?? []}
          onToggle={(id) => toggle("responsibleIds", id)}
          open={open === "responsible"}
          onOpenChange={(o) => setOpen(o ? "responsible" : null)}
        />
      )}

      <MultiFilter
        label="Canal"
        items={(options?.channels ?? []).map((c) => ({ id: c, name: c }))}
        selected={filters.channels ?? []}
        onToggle={(id) => toggle("channels", id)}
        open={open === "channel"}
        onOpenChange={(o) => setOpen(o ? "channel" : null)}
      />

      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
          onClick={() =>
            onFiltersChange({ ...filters, pipelineIds: [], responsibleIds: [], channels: [] })
          }
        >
          <RotateCcw className="h-3 w-3" />
          Limpar ({activeCount})
        </Button>
      )}
    </div>
  );
}

function MultiFilter({
  label,
  items,
  selected,
  onToggle,
  open,
  onOpenChange,
}: {
  label: string;
  items: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  if (!items.length) return null;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 gap-1.5 text-xs", selected.length > 0 && "border-primary/40")}
        >
          {label}
          {selected.length > 0 && (
            <span className="rounded bg-primary/10 px-1 text-[10px] font-semibold text-primary">
              {selected.length}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
        <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-wider">
          {label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((item) => (
          <DropdownMenuCheckboxItem
            key={item.id}
            checked={selected.includes(item.id)}
            onCheckedChange={() => onToggle(item.id)}
            onSelect={(e) => e.preventDefault()}
            className="text-xs"
          >
            <span className="truncate">{item.name}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
