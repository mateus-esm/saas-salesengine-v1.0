import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { supabase } from "@/integrations/supabase/client";
import type { ColumnDef } from "./types";

interface RelationPickerProps {
  column: ColumnDef;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (toId: string, label: string) => void;
  equipeId: string;
}

/**
 * Sprint 6.7 — Record-level relation picker used inside the spreadsheet grid.
 * Opens a popover with a searchable Command list of records from
 * `column.relation.table`, tenant-scoped by `equipeId`.
 *
 * Reuses the same Popover + Command pattern as EntityLinker but is simpler:
 * no create flow, no sublabel rendering, no excludeIds.
 */
export function RelationPicker({
  column,
  open,
  onOpenChange,
  onPick,
  equipeId,
}: RelationPickerProps) {
  const [search, setSearch] = useState("");

  const rel = column.relation;
  const table = rel?.table;
  const displayField = rel?.displayField;

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["relation-picker", table, search, equipeId],
    queryFn: async () => {
      if (!table || !displayField || !equipeId) return [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      let query = sb
        .from(table)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        .select(`id, ${displayField}`)
        .eq("equipe_id", equipeId)
        .is("deleted_at", null)
        .limit(20);

      if (search.trim()) {
        query = query.ilike(displayField, `%${search.trim()}%`);
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { data } = await query;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: r.id as string,
        label: String(r[displayField] ?? ""),
      }));
    },
    enabled: open && !!table && !!displayField && !!equipeId,
  });

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="hidden">
          Vincular
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={`Buscar ${table ?? "..."}...`}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Buscando..." : "Nenhum registro encontrado."}
            </CommandEmpty>
            <CommandGroup>
              {results.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => {
                    onPick(item.id, item.label);
                    onOpenChange(false);
                    setSearch("");
                  }}
                >
                  <Check className="mr-2 h-4 w-4 opacity-0" />
                  {item.label}
                </CommandItem>
              ))}
              <CommandItem
                disabled
                className="text-muted-foreground text-xs"
              >
                Criar novo... (em breve)
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
