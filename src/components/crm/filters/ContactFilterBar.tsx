// Sprint 11 · Onda 2 · T17 — the filter bar of the contact base.
//
// A contact has no owner of its own (the deal does), so "Responsável" here means
// "has a deal owned by". The relationship (Situação) is derived from the deals.

import { useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ORIGIN_CATEGORY_OPTIONS } from "@/config/originTaxonomy";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import type { SetFilterOptions } from "@/hooks/useUrlFilters";
import type { ContactFilters, ContactRelationship, NextContactBucket } from "@/types/crmFilters";

import {
  AddFilterMenu,
  ChecklistEditor,
  ChipsRow,
  DateRangeFilter,
  MultiSelectFilter,
  RadioEditor,
  SearchBox,
  TagsEditor,
  type FilterEntry,
} from "./controls";
import { FilterSheet } from "./FilterSheet";
import {
  NEXT_CONTACT_LABELS,
  RELATIONSHIP_LABELS,
  contactFilterChips,
  countContactFilters,
  ownerLabels,
  removeContactChip,
} from "./model";

interface ContactFilterBarProps {
  filters: ContactFilters;
  onChange: (next: ContactFilters, opts?: SetFilterOptions) => void;
  pipelines: { id: string; name: string }[];
  resultLabel?: ReactNode;
}

export function ContactFilterBar({ filters, onChange, pipelines, resultLabel }: ContactFilterBarProps) {
  const isMobile = useIsMobile();
  const { members, nameOf } = useMemberDirectory();
  const latest = useRef(filters);
  latest.current = filters;
  const set = (patch: Partial<ContactFilters>) => onChange({ ...latest.current, ...patch });

  const ownerOptions = [
    { value: "none", label: "Negócio sem responsável" },
    ...members.map((m) => ({ value: m.id, label: m.name })),
  ];
  const owners = filters.deal_owner_ids ?? [];

  const entries: FilterEntry[] = [
    {
      id: "relationship",
      label: "Situação",
      editor: (close) => (
        <ChecklistEditor
          options={(Object.keys(RELATIONSHIP_LABELS) as ContactRelationship[]).map((r) => ({ value: r, label: RELATIONSHIP_LABELS[r] }))}
          initial={filters.relationship ?? []}
          onApply={(v) => {
            set({ relationship: v.length ? (v as ContactRelationship[]) : undefined });
            close();
          }}
        />
      ),
    },
    {
      id: "pipeline",
      label: "Pipeline (tem negócio em)",
      editor: (close) => (
        <ChecklistEditor
          options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
          initial={filters.pipeline_ids ?? []}
          onApply={(v) => {
            set({ pipeline_ids: v.length ? v : undefined });
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
  ];

  const chips = contactFilterChips(filters, { pipelines });
  const count = countContactFilters(filters);

  const controls = (
    <>
      <MultiSelectFilter
        label="Responsável (de um negócio)"
        options={ownerOptions}
        selected={owners}
        onChange={(v) => set({ deal_owner_ids: v.length ? v : undefined })}
        summary={
          owners.length
            ? `Negócio de: ${ownerLabels(owners, nameOf)
                .map((l) => (l === "Sem responsável" ? "ninguém" : l))
                .join(", ")}`
            : undefined
        }
      />
      <DateRangeFilter
        label="Criado em"
        from={filters.created_from}
        to={filters.created_to}
        onChange={(from, to) => set({ created_from: from, created_to: to })}
      />
      <AddFilterMenu entries={entries} />
      <ChipsRow chips={chips} onRemove={(id) => onChange(removeContactChip(latest.current, id))} />
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
