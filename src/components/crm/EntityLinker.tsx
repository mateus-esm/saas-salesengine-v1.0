import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type EntityKind = "company" | "property" | "contact";

interface EntityOption {
  id: string;
  label: string;
  sublabel?: string;
}

const ENTITY_META: Record<
  EntityKind,
  {
    table: string;
    labelCol: string;
    selectCols: string;
    placeholder: string;
    createLabel: string;
    emptyHint: string;
  }
> = {
  company: {
    table: "companies",
    labelCol: "name",
    selectCols: "id,name,industry",
    placeholder: "Buscar empresa...",
    createLabel: "Criar nova empresa",
    emptyHint: "Nenhuma empresa encontrada.",
  },
  property: {
    table: "properties",
    labelCol: "label",
    selectCols: "id,label,property_type",
    placeholder: "Buscar propriedade...",
    createLabel: "Criar nova propriedade",
    emptyHint: "Nenhuma propriedade encontrada.",
  },
  contact: {
    table: "leads",
    labelCol: "name",
    selectCols: "id,name,phone",
    placeholder: "Buscar contato...",
    createLabel: "Criar novo contato",
    emptyHint: "Nenhum contato encontrado.",
  },
};

const toOption = (entity: EntityKind, row: Record<string, unknown>): EntityOption => {
  if (entity === "property") {
    return {
      id: row.id as string,
      label: (row.label as string) || "(sem rótulo)",
      sublabel: row.property_type as string | undefined,
    };
  }
  if (entity === "contact") {
    return {
      id: row.id as string,
      label: (row.name as string) || "(sem nome)",
      sublabel: row.phone as string | undefined,
    };
  }
  return {
    id: row.id as string,
    label: (row.name as string) || "(sem nome)",
    sublabel: row.industry as string | undefined,
  };
};

export interface EntityLinkerProps {
  entity: EntityKind;
  /** Currently selected id (single-select mode). Omit for "attach" mode where
   *  selection resolves via `onSelect` and the picker never shows a value. */
  selected?: string | null;
  /** Invoked with the chosen id. For attach flows the parent usually closes
   *  the popover and performs a link mutation in response. */
  onSelect: (id: string) => void;
  /** Optional clear handler. When provided, the trigger shows an X button next
   *  to the label to clear the selection. */
  onClear?: () => void;
  /** Invoked when the user picks the "Criar novo..." row. The parent should
   *  open its matching AddModal and — on create — call `onSelect(newId)` to
   *  finish the flow. */
  onCreateStart?: () => void;
  /** Ids to hide from the list (already-linked entities, self-ref guard). */
  excludeIds?: string[];
  /** Render variant. "button" (default) is a full-width combobox for form-like
   *  contexts. "inline" is a compact trigger used inside section lists. */
  variant?: "button" | "inline";
  /** Trigger label override (used by inline variant for the "Vincular" CTA). */
  triggerLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Sprint 4 EPIC 4 — shared search-and-create picker for companies, properties,
 * and contacts. Used by:
 *   • Assignment flows (Contact↔Company, Opportunity→Property)
 *   • EntityRefField inside DynamicFieldRenderer (custom-field values)
 *   • EntityChips in OpportunityDetailModal
 *
 * The picker is intentionally dumb about mutations: it searches existing rows
 * via tenant-scoped ilike and delegates creation to the caller via
 * `onCreateStart`. Keeping creation out of here means each call site can
 * decide how rich a "new entity" form to show.
 */
export const EntityLinker = ({
  entity,
  selected,
  onSelect,
  onClear,
  onCreateStart,
  excludeIds,
  variant = "button",
  triggerLabel,
  disabled,
  className,
}: EntityLinkerProps) => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const meta = ENTITY_META[entity];

  // Currently-selected row (for label when closed). Only fetched when `selected`
  // is set and the trigger needs to render its name.
  const { data: selectedRow } = useQuery<EntityOption | null>({
    queryKey: ["entity_linker_selected", entity, selected, equipeId],
    enabled: !!selected && !!equipeId,
    queryFn: async () => {
      if (!selected) return null;
      const { data, error } = await sb
        .from(meta.table)
        .select(meta.selectCols)
        .eq("id", selected)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return toOption(entity, data);
    },
  });

  const { data: rawOptions = [], isFetching } = useQuery<EntityOption[]>({
    queryKey: ["entity_linker_search", entity, equipeId, search],
    enabled: open && !!equipeId,
    queryFn: async () => {
      let q = sb
        .from(meta.table)
        .select(meta.selectCols)
        .eq("equipe_id", equipeId)
        .is("deleted_at", null)
        .order(meta.labelCol, { ascending: true })
        .limit(20);
      if (search.trim()) {
        q = q.ilike(meta.labelCol, `%${search.trim()}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((row: unknown) =>
        toOption(entity, row as Record<string, unknown>),
      );
    },
  });

  const excludeSet = new Set(excludeIds ?? []);
  const options = rawOptions.filter((o) => !excludeSet.has(o.id));

  const triggerContent =
    variant === "inline" ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        className={cn("h-7 px-2 text-xs", className)}
      >
        <Plus className="h-3 w-3 mr-1" />
        {triggerLabel ?? "Vincular"}
      </Button>
    ) : (
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        disabled={disabled}
        className={cn("w-full justify-between", className)}
      >
        <span className={cn("truncate", !selectedRow && "text-muted-foreground")}>
          {selectedRow ? selectedRow.label : meta.placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {selected && onClear && !disabled && (
            <span
              role="button"
              aria-label="Limpar seleção"
              className="text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </div>
      </Button>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{triggerContent}</PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width] min-w-[260px]"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={meta.placeholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {isFetching ? "Buscando..." : meta.emptyHint}
            </CommandEmpty>
            {options.length > 0 && (
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.id}
                    value={opt.id}
                    onSelect={() => {
                      onSelect(opt.id);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selected === opt.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm truncate">{opt.label}</span>
                      {opt.sublabel && (
                        <span className="text-xs text-muted-foreground truncate">
                          {opt.sublabel}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {onCreateStart && (
              <>
                {options.length > 0 && <CommandSeparator />}
                <CommandGroup>
                  <CommandItem
                    value="__create__"
                    onSelect={() => {
                      setOpen(false);
                      setSearch("");
                      onCreateStart();
                    }}
                    className="text-primary"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    <span>
                      {meta.createLabel}
                      {search.trim() ? `: “${search.trim()}”` : ""}
                    </span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
