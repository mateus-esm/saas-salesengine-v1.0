// Sprint 11 · Onda 2 · T17 — one filter bar for the deals (Kanban and Leads table).
//
// Always visible: search, Responsável (the deal's owner, or "Sem responsável")
// and Criado em. Everything else is added from "+ Filtro": stage, status,
// origin, tags, value, next contact and every declared field of the pipeline,
// with the operators its type accepts. Active filters show as removable chips.
// The bar only builds a CrmFilters object — the server filters.

import { useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ORIGIN_CATEGORY_OPTIONS } from "@/config/originTaxonomy";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import type { SetFilterOptions } from "@/hooks/useUrlFilters";
import type { CrmFilters, NextContactBucket } from "@/types/crmFilters";
import type { CustomFieldSchema, OpportunityStatus } from "@/types/pipelines";

import {
  AddFilterMenu,
  ChecklistEditor,
  ChipsRow,
  CustomFieldEditor,
  DateRangeFilter,
  MultiSelectFilter,
  NumberRangeEditor,
  RadioEditor,
  SearchBox,
  TagsEditor,
  type FilterEntry,
} from "./controls";
import { FilterSheet } from "./FilterSheet";
import {
  NEXT_CONTACT_LABELS,
  STATUS_LABELS,
  countDealFilters,
  dealFilterChips,
  ownerLabels,
  removeDealChip,
} from "./model";

interface DealFilterBarProps {
  filters: CrmFilters;
  onChange: (next: CrmFilters, opts?: SetFilterOptions) => void;
  stages: { id: string; name: string }[];
  /** The pipeline's declared fields (not deleted). */
  fields: CustomFieldSchema[];
  /** "1.261 negócios" / "12 encontrados" — shown at the end of the bar. */
  resultLabel?: ReactNode;
}

export function DealFilterBar({ filters, onChange, stages, fields, resultLabel }: DealFilterBarProps) {
  const isMobile = useIsMobile();
  const { members, nameOf } = useMemberDirectory();
  // The search box fires 300 ms after the last keystroke; read the filters then.
  const latest = useRef(filters);
  latest.current = filters;

  const set = (patch: Partial<CrmFilters>) => onChange({ ...latest.current, ...patch });
  const memberOptions = members.map((m) => ({ value: m.id, label: m.name }));
  const ownerOptions = [{ value: "none", label: "Sem responsável" }, ...memberOptions];

  const entries: FilterEntry[] = [
    {
      id: "stage",
      label: "Etapa",
      editor: (close) => (
        <ChecklistEditor
          options={stages.map((s) => ({ value: s.id, label: s.name }))}
          initial={filters.stage_ids ?? []}
          onApply={(v) => {
            set({ stage_ids: v.length ? v : undefined });
            close();
          }}
        />
      ),
    },
    {
      id: "status",
      label: "Status",
      editor: (close) => (
        <ChecklistEditor
          options={(Object.keys(STATUS_LABELS) as OpportunityStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          initial={filters.statuses ?? []}
          onApply={(v) => {
            set({ statuses: v.length ? (v as OpportunityStatus[]) : undefined });
            close();
          }}
        />
      ),
    },
    {
      id: "origin",
      label: "Origem",
      editor: (close) => (
        <ChecklistEditor
          options={ORIGIN_CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          initial={filters.origin_categories ?? []}
          onApply={(v) => {
            set({ origin_categories: v.length ? v : undefined });
            close();
          }}
        />
      ),
    },
    {
      id: "tags",
      label: "Etiquetas",
      editor: (close) => (
        <TagsEditor
          initial={filters.tags ?? []}
          onApply={(v) => {
            set({ tags: v.length ? v : undefined });
            close();
          }}
        />
      ),
    },
    {
      id: "value",
      label: "Valor",
      editor: (close) => (
        <NumberRangeEditor
          prefix="R$ "
          initialFrom={filters.value_min}
          initialTo={filters.value_max}
          onApply={(from, to) => {
            set({ value_min: from, value_max: to });
            close();
          }}
        />
      ),
    },
    {
      id: "next",
      label: "Próximo contato",
      editor: (close) => (
        <RadioEditor
          options={(Object.keys(NEXT_CONTACT_LABELS) as NextContactBucket[]).map((b) => ({ value: b, label: NEXT_CONTACT_LABELS[b] }))}
          initial={filters.next_contact}
          onApply={(v) => {
            set({ next_contact: v as NextContactBucket });
            close();
          }}
        />
      ),
    },
    ...fields.map<FilterEntry>((field) => ({
      id: `cf:${field.field_id}`,
      label: field.label,
      group: "Campos do pipeline",
      editor: (close) => (
        <CustomFieldEditor
          field={field}
          members={memberOptions}
          initial={filters.custom?.find((c) => c.field_id === field.field_id)}
          onApply={(cf) => {
            set({ custom: [...(latest.current.custom ?? []).filter((c) => c.field_id !== field.field_id), cf] });
            close();
          }}
        />
      ),
    })),
  ];

  const chips = dealFilterChips(filters, { stages, fields, nameOf });
  const count = countDealFilters(filters);
  const owners = filters.owner_ids ?? [];

  const controls = (
    <>
      <MultiSelectFilter
        label="Responsável"
        options={ownerOptions}
        selected={owners}
        onChange={(v) => set({ owner_ids: v.length ? v : undefined })}
        summary={owners.length ? `Responsável: ${ownerLabels(owners, nameOf).join(", ")}` : undefined}
      />
      <DateRangeFilter
        label="Criado em"
        from={filters.created_from}
        to={filters.created_to}
        onChange={(from, to) => set({ created_from: from, created_to: to })}
      />
      <AddFilterMenu entries={entries} />
      <ChipsRow chips={chips} onRemove={(id) => onChange(removeDealChip(latest.current, id))} />
      {count > 0 && (
        <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => onChange({})}>
          Limpar
        </Button>
      )}
    </>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchBox
        value={filters.search ?? ""}
        onChange={(q) => onChange({ ...latest.current, search: q.trim() ? q : undefined }, { replace: true })}
        className="w-full sm:w-64"
      />
      {isMobile ? (
        <FilterSheet count={count - (filters.search?.trim() ? 1 : 0)}>{controls}</FilterSheet>
      ) : (
        controls
      )}
      {resultLabel && <span className="ml-auto text-xs tabular-nums text-muted-foreground">{resultLabel}</span>}
    </div>
  );
}
