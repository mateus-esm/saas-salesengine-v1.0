import { useMemo } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryKey,
  type QueryObserverResult,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  mapLinksToRows,
  type CustomTableLinkRow,
  type CustomTableSort,
  type CustomTableTargetRecord,
  type RelationChips,
} from "@/lib/customTables";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { flattenPages, nextOffset, patchRowInCache, removeRowsFromPages, type TablePages } from "@/lib/tablePages";

import type { CustomTable, CustomTableColumn } from "./useCustomTables";

// custom_table_records lags in generated types; scope is enforced via RLS.
const sb = supabase as any;

export const CUSTOM_TABLE_PAGE_SIZE = 50;

export interface CustomTableRecord {
  id: string;
  equipe_id: string;
  table_id: string;
  /** Values by field_id (Sprint 11 · T39). */
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export const customTableKeys = {
  /** Every loaded list of a table, whatever the search and sort. */
  records: (tableId: string | null) => ["custom_table_records", tableId] as const,
  page: (tableId: string | null, search: string, sort: CustomTableSort | null) =>
    ["custom_table_records", tableId, search, sort] as const,
  count: (tableId: string | null, search: string) => ["custom_table_count", tableId, search] as const,
  relation: (tableId: string, fieldId: string) => ["custom_table_relation", tableId, fieldId] as const,
};

type Snapshot = [QueryKey, unknown][];

/**
 * Sprint 5.3 T15 — records for a single custom table. Sprint 11 · T39: pages of
 * 50 from the server (crm_custom_table_page), which also searches and sorts by
 * the column's type — the browser used to load every record and filter them
 * itself. Edits and deletes change every loaded list before the server answers
 * (and put them back on error); success is silent, an error always shows.
 */
export const useCustomTableRecords = (tableId: string | null, search = "", sort: CustomTableSort | null = null) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;
  const q = search.trim();
  const lists = customTableKeys.records(tableId);

  const recordsQuery = useInfiniteQuery({
    queryKey: customTableKeys.page(tableId, q, sort),
    initialPageParam: 0,
    enabled: !!tableId,
    queryFn: async ({ pageParam }): Promise<CustomTableRecord[]> => {
      const { data, error } = await sb.rpc("crm_custom_table_page", {
        p_table_id: tableId,
        p_search: q || null,
        p_sort: sort,
        p_limit: CUSTOM_TABLE_PAGE_SIZE,
        p_offset: pageParam,
      });
      if (error) throw error;
      return (data ?? []) as CustomTableRecord[];
    },
    getNextPageParam: (last, all) => nextOffset(last, all, CUSTOM_TABLE_PAGE_SIZE),
    // Keep the old rows on screen while a new search or sort is loading.
    placeholderData: keepPreviousData,
  });

  const countQuery = useQuery({
    queryKey: customTableKeys.count(tableId, q),
    enabled: !!tableId,
    queryFn: async (): Promise<number> => {
      const { data, error } = await sb.rpc("crm_custom_table_count", { p_table_id: tableId, p_search: q || null });
      if (error) throw error;
      return Number(data ?? 0);
    },
    placeholderData: keepPreviousData,
  });

  const records = useMemo(() => flattenPages(recordsQuery.data), [recordsQuery.data]);

  const snapshot = async (): Promise<Snapshot> => {
    await queryClient.cancelQueries({ queryKey: lists });
    return queryClient.getQueriesData({ queryKey: lists });
  };
  const restore = (previous: Snapshot | undefined) => previous?.forEach(([k, d]) => queryClient.setQueryData(k, d));
  const patchLists = (id: string, patch: Record<string, unknown>) =>
    queryClient.setQueriesData({ queryKey: lists }, (d: unknown) => patchRowInCache(d, id, patch));
  const refreshTotals = () => {
    void queryClient.invalidateQueries({ queryKey: lists });
    void queryClient.invalidateQueries({ queryKey: ["custom_table_count", tableId] });
  };

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
    // Where the new row lands depends on the sort: the server says.
    onSuccess: refreshTotals,
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
      const previous = await snapshot();
      patchLists(id, { data });
      return { previous };
    },
    onSuccess: (row) => patchLists(row.id, row as unknown as Record<string, unknown>),
    onError: (error: Error, _vars, ctx) => {
      restore(ctx?.previous);
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
      const previous = await snapshot();
      queryClient.setQueriesData({ queryKey: lists }, (d: unknown) =>
        d && typeof d === "object" && Array.isArray((d as { pages?: unknown }).pages)
          ? removeRowsFromPages(d as TablePages<CustomTableRecord>, ids)
          : d,
      );
      return { previous };
    },
    onError: (error: Error, _ids, ctx) => {
      restore(ctx?.previous);
      toast.error("Erro ao excluir: " + error.message);
    },
    onSettled: () => {
      refreshTotals();
      // A relation column elsewhere may point at these rows.
      void queryClient.invalidateQueries({ queryKey: ["custom_table_relation"] });
    },
  });

  return {
    records,
    total: countQuery.data ?? null,
    isLoading: recordsQuery.isLoading,
    error: recordsQuery.error,
    hasMore: !!recordsQuery.hasNextPage,
    loadingMore: recordsQuery.isFetchingNextPage,
    loadMore: () => {
      if (recordsQuery.hasNextPage && !recordsQuery.isFetchingNextPage) void recordsQuery.fetchNextPage();
    },
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
 * mapLinksToRows. Returns column field_id → row id → chips, for `resolvedFromRow`.
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
      queryKey: customTableKeys.relation(table.id, col.field_id),
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
              .eq("relation_key", col.field_id)
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
      byColumn[col.field_id] = data[i] ?? {};
    });
    return byColumn;
  }, [relationColumns, data]);
}
