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
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PERIOD_LABELS, periodRange, type CustomDays, type PeriodPreset } from "@/lib/dashboardPeriod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DashboardFilterOptions, DashboardFilters } from "@/types/dashboard";
import { cn } from "@/lib/utils";

// O cálculo do período vive em lib/dashboardPeriod (puro, testado); reexportado
// aqui para quem já importava da barra.
export { PERIOD_LABELS, periodRange };
export type { PeriodPreset };

interface Props {
  preset: PeriodPreset;
  onPresetChange: (p: PeriodPreset) => void;
  /** Dias escolhidos no "Personalizado" (um dia, ou início e fim inclusivos). */
  custom?: CustomDays | null;
  onCustomChange?: (days: CustomDays) => void;
  filters: DashboardFilters;
  onFiltersChange: (f: DashboardFilters) => void;
  options?: DashboardFilterOptions;
}

export function DashboardFilterBar({
  preset,
  onPresetChange,
  custom,
  onCustomChange,
  filters,
  onFiltersChange,
  options,
}: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [calOpen, setCalOpen] = useState(false);

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
      <Select
        value={preset}
        onValueChange={(v) => {
          onPresetChange(v as PeriodPreset);
          // Escolher "Personalizado" abre o calendário na hora: um preset sem
          // dias escolhidos seria só "hoje" disfarçado.
          if (v === "custom") setCalOpen(true);
        }}
      >
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

      {preset === "custom" && onCustomChange && (
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
              {customLabel(custom)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              locale={ptBR}
              numberOfMonths={1}
              selected={custom ? ({ from: custom.from, to: custom.to ?? custom.from } as DateRange) : undefined}
              onSelect={(range) => {
                if (!range?.from) return;
                // Um clique só = um dia; o segundo clique fecha o intervalo.
                onCustomChange({ from: range.from, to: range.to });
                if (range.to && range.to.getTime() !== range.from.getTime()) setCalOpen(false);
              }}
              initialFocus
            />
            <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              Clique em um dia, ou em dois para um intervalo.
            </div>
          </PopoverContent>
        </Popover>
      )}

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

function customLabel(custom?: CustomDays | null): string {
  if (!custom) return "Escolher dias";
  const f = (d: Date) => format(d, "dd/MM/yyyy", { locale: ptBR });
  return custom.to && f(custom.to) !== f(custom.from) ? `${f(custom.from)} – ${f(custom.to)}` : f(custom.from);
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
