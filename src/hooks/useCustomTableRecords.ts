import { useMemo } from "react";
import { useMutation, useQueries, useQuery, useQueryClient, type QueryObserverResult } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  mapLinksToRows,
  type CustomTableLinkRow,
  type CustomTableTargetRecord,
  type RelationChips,
} from "@/lib/customTables";
import { fetchAllPages } from "@/lib/fetchAllPages";

import type { CustomTable, CustomTableColumn } from "./useCustomTables";

// custom_table_records lags in generated types; scope is enforced via RLS.
const sb = supabase as any;

export interface CustomTableRecord {
  id: string;
  equipe_id: string;
  table_id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export const customTableKeys = {
  records: (tableId: string | null) => ["custom_table_records", tableId] as const,
  relation: (tableId: string, columnKey: string) => ["custom_table_relation", tableId, columnKey] as const,
};

/**
 * Sprint 5.3 T15 — records for a single custom table. Sprint 11 · T21: every
 * record (the API stops at 1,000 rows without a word — pages until one comes
 * short, ordered by id last so no row repeats or goes missing); edits and
 * deletes change the list before the server answers; success is silent (the row
 * shows it), an error always shows.
 */
export const useCustomTableRecords = (tableId: string | null) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;
  const key = customTableKeys.records(tableId);

  const recordsQuery = useQuery({
    queryKey: key,
    enabled: !!tableId,
    queryFn: (): Promise<CustomTableRecord[]> =>
      fetchAllPages<CustomTableRecord>((from, to) =>
        sb
          .from("custom_table_records")
          .select("*")
          .eq("table_id", tableId)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
  });

  const setRecords = (fn: (rows: CustomTableRecord[]) => CustomTableRecord[]) =>
    queryClient.setQueryData<CustomTableRecord[]>(key, (rows) => (rows ? fn(rows) : rows));

  const createRecord = useMutation({
    mutationFn: async (rowData: Record<string, unknown>): Promise<CustomTableRecord> => {
      if (!equipeId) throw new Error("No equipe_id");
      if (!tableId) throw new Error("No table_id");
      const { data, error } = await sb
        .from("custom_table_records")
        .insert({ equipe_id: equipeId, table_id: tableId, data: rowData })
        .select()
        .single();
      if (error) throw error;
      return data as CustomTableRecord;
    },
    onSuccess: (row) => setRecords((rows) => [...rows, row]),
    onError: (error: Error) => toast.error("Erro ao criar registro: " + error.message),
  });

  const updateRecord = useMutation({
    mutationFn: async ({ id, data: rowData }: { id: string; data: Record<string, unknown> }): Promise<CustomTableRecord> => {
      const { data, error } = await sb
        .from("custom_table_records")
        .update({ data: rowData })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as CustomTableRecord;
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CustomTableRecord[]>(key);
      setRecords((rows) => rows.map((r) => (r.id === id ? { ...r, data } : r)));
      return { previous };
    },
    onSuccess: (row) => setRecords((rows) => rows.map((r) => (r.id === row.id ? row : r))),
    onError: (error: Error, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      toast.error("Erro ao atualizar registro: " + error.message);
    },
  });

  /**
   * One or many rows (soft delete), gone from the list at once. The ids go in
   * the POST body (crm_delete_custom_records): in a `.in()` they would go in the
   * URL, and "select all" on a table of hundreds of rows would not fit.
   */
  const deleteRecords = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await sb.rpc("crm_delete_custom_records", { p_ids: ids });
      if (error) throw error;
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CustomTableRecord[]>(key);
      const drop = new Set(ids);
      setRecords((rows) => rows.filter((r) => !drop.has(r.id)));
      return { previous };
    },
    onError: (error: Error, _ids, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      toast.error("Erro ao excluir: " + error.message);
    },
    // A relation column elsewhere may point at these rows.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["custom_table_relation"] }),
  });

  return {
    records: recordsQuery.data ?? [],
    isLoading: recordsQuery.isLoading,
    error: recordsQuery.error,
    createRecord,
    updateRecord,
    deleteRecords,
    refetch: recordsQuery.refetch,
  };
};

const pickData = (results: QueryObserverResult<Record<string, RelationChips>>[]) => results.map((r) => r.data);

/**
 * Sprint 11 · T21 — the chips of every relation column, resolved per column:
 * two requests each (the column's links; the target table's records), joined by
 * mapLinksToRows. Returns column key → row id → chips, for `resolvedFromRow`.
 * Before: two requests per cell.
 */
export function useCustomTableRelations(table: CustomTable, columns: CustomTableColumn[]) {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  const relationColumns = useMemo(
    () => columns.filter((c) => c.type === "relation" && c.relationConfig?.targetTableId),
    [columns],
  );

  const data = useQueries({
    queries: relationColumns.map((col) => ({
      queryKey: customTableKeys.relation(table.id, col.key),
      enabled: !!equipeId,
      queryFn: async (): Promise<Record<string, RelationChips>> => {
        const targetTableId = col.relationConfig!.targetTableId;
        const [links, targets] = await Promise.all([
          fetchAllPages<CustomTableLinkRow>((from, to) =>
            sb
              .from("custom_table_links")
              .select("from_id, to_id")
              .eq("equipe_id", equipeId)
              .eq("from_table", table.slug)
              .eq("relation_key", col.key)
              .is("deleted_at", null)
              .order("id", { ascending: true })
              .range(from, to),
          ),
          fetchAllPages<CustomTableTargetRecord>((from, to) =>
            sb
              .from("custom_table_records")
              .select("id, data")
              .eq("table_id", targetTableId)
              .is("deleted_at", null)
              .order("id", { ascending: true })
              .range(from, to),
          ),
        ]);
        return mapLinksToRows(links, targets, col.relationConfig!.displayField || "name");
      },
    })),
    combine: pickData,
  });

  return useMemo(() => {
    const byColumn: Record<string, Record<string, RelationChips>> = {};
    relationColumns.forEach((col, i) => {
      byColumn[col.key] = data[i] ?? {};
    });
    return byColumn;
  }, [relationColumns, data]);
}
