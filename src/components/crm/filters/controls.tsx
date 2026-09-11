// Sprint 11 · Onda 2 · T17 — the pieces of the CRM filter bars.
//
// Each control edits one key of the filter object and hands it back; the bars
// (DealFilterBar, ContactFilterBar) put them together and write the URL. The
// operators offered for a custom field come from the field-type registry, the
// same list the server implements.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, Plus, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dayToIso, isoToDay } from "@/lib/crmFilterParams";
import { getFieldType, parseBrNumber } from "@/lib/fields/registry";
import { cn } from "@/lib/utils";
import type { CustomFieldFilter, CustomFieldFilterOp } from "@/types/crmFilters";
import type { CustomFieldSchema } from "@/types/pipelines";

import {
  DATE_PRESET_LABELS,
  OP_LABELS,
  matchPreset,
  presetRange,
  rangeLabel,
  type DatePreset,
  type FilterChip,
} from "./model";

export interface Option {
  value: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Debounced: the server searches, so every keystroke must not be a request. */
export function SearchBox({
  value,
  onChange,
  placeholder = "Buscar nome, telefone ou e-mail",
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const emitted = useRef(value);
  // A ref, so a parent that re-renders (realtime) cannot keep resetting the timer.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // The URL changed elsewhere (Limpar, back button): follow it.
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    if (text === emitted.current) return;
    const t = setTimeout(() => {
      emitted.current = text;
      onChangeRef.current(text);
    }, 300);
    return () => clearTimeout(t);
  }, [text]);

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="h-9 pl-8 pr-8"
        aria-label="Buscar"
      />
      {text && (
        <button
          type="button"
          onClick={() => setText("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Limpar busca"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-select dropdown (Responsável and friends)
// ---------------------------------------------------------------------------

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  summary,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** What the button says when something is selected (default: "Label · n"). */
  summary?: string;
}) {
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  const active = selected.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-9 max-w-[16rem] gap-1.5", active && "border-primary/50 bg-primary/5")}
        >
          <span className="truncate">{active ? summary ?? `${label} · ${selected.length}` : label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto">
        <DropdownMenuLabel className="text-xs">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={() => toggle(o.value)}
            onSelect={(e) => e.preventDefault()}
          >
            <span className="truncate">{o.label}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {active && (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              className="w-full px-2 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onChange([])}
            >
              Limpar seleção
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// "Criado em"
// ---------------------------------------------------------------------------

export function DateRangeFilter({
  label,
  from,
  to,
  onChange,
}: {
  label: string;
  from?: string;
  to?: string;
  onChange: (from?: string, to?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from ? isoToDay(from) ?? "" : "");
  const [customTo, setCustomTo] = useState(to ? isoToDay(to, true) ?? "" : "");
  const preset = matchPreset(from, to);
  const active = !!(from || to);
  const text = !active ? label : `${label}: ${preset ? DATE_PRESET_LABELS[preset] : rangeLabel(from, to)}`;

  const applyPreset = (p: DatePreset) => {
    const r = presetRange(p);
    onChange(r.from, r.to);
    setOpen(false);
  };

  const applyCustom = () => {
    onChange(customFrom ? dayToIso(customFrom) ?? undefined : undefined, customTo ? dayToIso(customTo, true) ?? undefined : undefined);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setCustomFrom(from ? isoToDay(from) ?? "" : "");
          setCustomTo(to ? isoToDay(to, true) ?? "" : "");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-9 gap-1.5", active && "border-primary/50 bg-primary/5")}>
          <CalendarDays className="h-3.5 w-3.5 opacity-60" />
          <span className="truncate">{text}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2 p-2">
        <div className="grid gap-0.5">
          {(Object.keys(DATE_PRESET_LABELS) as DatePreset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => applyPreset(p)}
              className={cn(
                "flex items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                preset === p && "font-medium text-primary",
              )}
            >
              {DATE_PRESET_LABELS[p]}
              {preset === p && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
        <div className="space-y-1.5 border-t pt-2">
          <p className="px-1 text-xs font-medium text-muted-foreground">Personalizado</p>
          <div className="flex items-center gap-1.5">
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8" aria-label="De" />
            <span className="text-xs text-muted-foreground">a</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8" aria-label="Até" />
          </div>
          <div className="flex justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                onChange(undefined, undefined);
                setOpen(false);
              }}
              disabled={!active}
            >
              Limpar
            </Button>
            <Button type="button" size="sm" className="h-7 text-xs" onClick={applyCustom} disabled={!customFrom && !customTo}>
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// "+ Filtro": pick a filter, then edit it
// ---------------------------------------------------------------------------

export interface FilterEntry {
  id: string;
  label: string;
  /** Section header above the entry, e.g. "Campos do pipeline". */
  group?: string;
  editor: (close: () => void) => ReactNode;
}

export function AddFilterMenu({ entries }: { entries: FilterEntry[] }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const current = entries.find((e) => e.id === active) ?? null;
  const close = () => {
    setOpen(false);
    setActive(null);
  };

  let lastGroup: string | undefined;
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setActive(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground">
          <Plus className="h-3.5 w-3.5" />
          Filtro
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        {current ? (
          <div>
            <div className="flex items-center gap-1 border-b px-2 py-1.5">
              <button
                type="button"
                onClick={() => setActive(null)}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Voltar"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="truncate text-sm font-medium">{current.label}</span>
            </div>
            <div className="p-2">{current.editor(close)}</div>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto p-1">
            {entries.map((e) => {
              const header = e.group && e.group !== lastGroup ? e.group : null;
              lastGroup = e.group;
              return (
                <div key={e.id}>
                  {header && <p className="px-2 pb-0.5 pt-2 text-[11px] font-medium uppercase text-muted-foreground">{header}</p>}
                  <button
                    type="button"
                    onClick={() => setActive(e.id)}
                    className="w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    {e.label}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Editors used inside "+ Filtro"
// ---------------------------------------------------------------------------

function ApplyRow({ onApply, disabled }: { onApply: () => void; disabled?: boolean }) {
  return (
    <div className="flex justify-end border-t pt-2">
      <Button type="button" size="sm" className="h-7 text-xs" onClick={onApply} disabled={disabled}>
        Aplicar
      </Button>
    </div>
  );
}

export function ChecklistEditor({
  options,
  initial,
  onApply,
}: {
  options: Option[];
  initial: string[];
  onApply: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(initial);
  const toggle = (v: string) => setDraft((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v]));
  return (
    <div className="space-y-2">
      <div className="max-h-56 space-y-0.5 overflow-y-auto">
        {options.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">Nenhuma opção.</p>}
        {options.map((o) => {
          const id = `chk-${o.value}`;
          return (
            <label key={o.value} htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted">
              <Checkbox id={id} checked={draft.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
              <span className="truncate">{o.label}</span>
            </label>
          );
        })}
      </div>
      <ApplyRow onApply={() => onApply(draft)} />
    </div>
  );
}

export function RadioEditor({
  options,
  initial,
  onApply,
}: {
  options: Option[];
  initial?: string;
  onApply: (value: string) => void;
}) {
  return (
    <div className="grid gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onApply(o.value)}
          className={cn(
            "flex items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
            initial === o.value && "font-medium text-primary",
          )}
        >
          {o.label}
          {initial === o.value && <Check className="h-3.5 w-3.5" />}
        </button>
      ))}
    </div>
  );
}

export function TagsEditor({ initial, onApply }: { initial: string[]; onApply: (tags: string[]) => void }) {
  const [tags, setTags] = useState<string[]>(initial);
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setText("");
  };
  return (
    <div className="space-y-2">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        placeholder="Etiqueta e Enter"
        className="h-8"
        aria-label="Etiqueta"
      />
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">
              {t}
              <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remover ${t}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <ApplyRow onApply={() => onApply(text.trim() && !tags.includes(text.trim()) ? [...tags, text.trim()] : tags)} />
    </div>
  );
}

export function NumberRangeEditor({
  initialFrom,
  initialTo,
  onApply,
  prefix,
}: {
  initialFrom?: number;
  initialTo?: number;
  onApply: (from?: number, to?: number) => void;
  prefix?: string;
}) {
  const [a, setA] = useState(initialFrom !== undefined ? String(initialFrom).replace(".", ",") : "");
  const [b, setB] = useState(initialTo !== undefined ? String(initialTo).replace(".", ",") : "");
  const from = a.trim() ? parseBrNumber(a) : null;
  const to = b.trim() ? parseBrNumber(b) : null;
  const invalid = (a.trim() !== "" && from === null) || (b.trim() !== "" && to === null);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Input value={a} onChange={(e) => setA(e.target.value)} placeholder={`${prefix ?? ""}mín.`} inputMode="decimal" className="h-8" aria-label="Mínimo" />
        <span className="text-xs text-muted-foreground">a</span>
        <Input value={b} onChange={(e) => setB(e.target.value)} placeholder={`${prefix ?? ""}máx.`} inputMode="decimal" className="h-8" aria-label="Máximo" />
      </div>
      <ApplyRow onApply={() => onApply(from ?? undefined, to ?? undefined)} disabled={invalid || (from === null && to === null)} />
    </div>
  );
}

export function DayRangeEditor({
  initialFrom,
  initialTo,
  onApply,
}: {
  initialFrom?: string;
  initialTo?: string;
  onApply: (from?: string, to?: string) => void;
}) {
  const [a, setA] = useState(initialFrom ? isoToDay(initialFrom) ?? "" : "");
  const [b, setB] = useState(initialTo ? isoToDay(initialTo, true) ?? "" : "");
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Input type="date" value={a} onChange={(e) => setA(e.target.value)} className="h-8" aria-label="De" />
        <span className="text-xs text-muted-foreground">a</span>
        <Input type="date" value={b} onChange={(e) => setB(e.target.value)} className="h-8" aria-label="Até" />
      </div>
      <ApplyRow
        onApply={() => onApply(a ? dayToIso(a) ?? undefined : undefined, b ? dayToIso(b, true) ?? undefined : undefined)}
        disabled={!a && !b}
      />
    </div>
  );
}

/** The editor for a filter on one declared custom field: operator + value. */
export function CustomFieldEditor({
  field,
  initial,
  members,
  onApply,
}: {
  field: CustomFieldSchema;
  initial?: CustomFieldFilter;
  members: Option[];
  onApply: (f: CustomFieldFilter) => void;
}) {
  const spec = getFieldType(field.type);
  const ops = spec.filterOps;
  const [op, setOp] = useState<CustomFieldFilterOp>(initial?.op && ops.includes(initial.op) ? initial.op : ops[0]);
  const options: Option[] =
    spec.type === "user" ? members : (field.options ?? []).map((o) => ({ value: o, label: o }));
  const [text, setText] = useState(initial?.value ?? "");

  const base = { field_id: field.field_id };
  let body: ReactNode = null;
  switch (op) {
    case "any_of":
      body = <ChecklistEditor options={options} initial={initial?.op === "any_of" ? initial.values ?? [] : []} onApply={(values) => onApply({ ...base, op, values })} />;
      break;
    case "contains":
      body = (
        <div className="space-y-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Texto" className="h-8" aria-label="Texto" />
          <ApplyRow onApply={() => onApply({ ...base, op, value: text.trim() })} disabled={!text.trim()} />
        </div>
      );
      break;
    case "between_number":
      body = (
        <NumberRangeEditor
          prefix={spec.type === "currency" ? "R$ " : undefined}
          initialFrom={initial?.op === op && typeof initial.from === "number" ? initial.from : undefined}
          initialTo={initial?.op === op && typeof initial.to === "number" ? initial.to : undefined}
          onApply={(from, to) => onApply({ ...base, op, ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) })}
        />
      );
      break;
    case "between_date":
      body = (
        <DayRangeEditor
          initialFrom={initial?.op === op ? (initial.from as string | undefined) : undefined}
          initialTo={initial?.op === op ? (initial.to as string | undefined) : undefined}
          onApply={(from, to) => onApply({ ...base, op, ...(from ? { from } : {}), ...(to ? { to } : {}) })}
        />
      );
      break;
    default:
      body = <ApplyRow onApply={() => onApply({ ...base, op })} />;
  }

  return (
    <div className="space-y-2">
      <select
        value={op}
        onChange={(e) => setOp(e.target.value as CustomFieldFilterOp)}
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
        aria-label="Condição"
      >
        {ops.map((o) => (
          <option key={o} value={o}>
            {OP_LABELS[o]}
          </option>
        ))}
      </select>
      {body}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

export function ChipsRow({ chips, onRemove }: { chips: FilterChip[]; onRemove: (id: string) => void }) {
  if (!chips.length) return null;
  return (
    <>
      {chips.map((c) => (
        <span
          key={c.id}
          className="inline-flex h-7 max-w-[18rem] items-center gap-1 rounded-full border border-primary/30 bg-primary/5 pl-2.5 pr-1 text-xs"
        >
          <span className="truncate" title={c.label}>
            {c.label}
          </span>
          <button
            type="button"
            onClick={() => onRemove(c.id)}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-primary/10 hover:text-foreground"
            aria-label={`Remover filtro ${c.label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </>
  );
}
