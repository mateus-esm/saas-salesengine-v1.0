// Sprint 11 · Onda 2 · T18 — the Leads table reads from the server.
//
// Before: the whole pipeline and every lead of the team were loaded into the
// browser (T5's stopgap), filtered there, and each row asked for its companies
// in its own request. Now each page of 50 comes from `crm_opp_table` — filtered
// by the same `crm_opp_matches` as the Kanban and sorted on the server — with
// everything the row shows. Edits patch the cached pages first and put them back
// if the server refuses.

import { useEffect, useMemo } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cleanFilters, normalizeBoardCard } from "@/lib/board";
import { createDebouncer } from "@/lib/debounce";
import { nextOffset, patchRowInPages, removeRowsFromPages, type TablePages } from "@/lib/tablePages";
import type { CrmFilters, CrmSort } from "@/types/crmFilters";
import type { OppTableRow } from "@/types/crmTables";

// The generated types do not know the Sprint 11 RPCs yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const OPP_TABLE_PAGE_SIZE = 50;
const DEFAULT_SORT: CrmSort = { key: "created_at", dir: "desc" };

export const oppTableKeys = {
  all: (equipeId: string | undefined) => ["opp_table", equipeId] as const,
  pipeline: (equipeId: string | undefined, pipelineId: string | undefined) =>
    ["opp_table", equipeId, pipelineId] as const,
  list: (
    equipeId: string | undefined,
    pipelineId: string | undefined,
    filters: CrmFilters,
    sort: CrmSort | null,
  ) => ["opp_table", equipeId, pipelineId, filters, sort ?? DEFAULT_SORT] as const,
};

function toRow(raw: Record<string, unknown>): OppTableRow {
  return { ...normalizeBoardCard(raw), property_count: Number(raw.property_count) || 0 };
}

function useListKey(pipelineId: string | undefined, filters: CrmFilters, sort: CrmSort | null) {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const f = useMemo(() => cleanFilters(filters), [filters]);
  return { equipeId, f, key: oppTableKeys.list(equipeId, pipelineId, f, sort) as QueryKey };
}

export function useOppTable(pipelineId: string | undefined, filters: CrmFilters, sort: CrmSort | null) {
  const { equipeId, f, key } = useListKey(pipelineId, filters, sort);

  return useInfiniteQuery({
    queryKey: key,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<OppTableRow[]> => {
      const { data, error } = await sb.rpc("crm_opp_table", {
        p_pipeline_id: pipelineId,
        p_filters: f,
        p_sort: sort ?? DEFAULT_SORT,
        p_limit: OPP_TABLE_PAGE_SIZE,
        p_offset: pageParam,
      });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(toRow);
    },
    getNextPageParam: (last, all) => nextOffset(last, all, OPP_TABLE_PAGE_SIZE),
    enabled: !!equipeId && !!pipelineId,
    // Keep the old rows on screen while a new filter or sort is loading.
    placeholderData: keepPreviousData,
  });
}

/** A deal changed elsewhere (another seller, the Copilot, a webhook): refetch, grouped. */
export function useOppTableRealtime(pipelineId: string | undefined) {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!equipeId || !pipelineId) return;
    const refresh = createDebouncer(
      () => queryClient.invalidateQueries({ queryKey: oppTableKeys.pipeline(equipeId, pipelineId) }),
      1000,
      { maxWait: 5000 },
    );
    const channel = sb
      .channel(`opp_table_${equipeId}_${pipelineId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "opportunities", filter: `pipeline_id=eq.${pipelineId}` },
        () => refresh.call(),
      )
      .subscribe();
    return () => {
      refresh.cancel();
      sb.removeChannel(channel);
    };
  }, [equipeId, pipelineId, queryClient]);
}

/**
 * The other screens that show deals. `includeTable` also refetches this table —
 * for bulk actions; a single cell edit does not (its optimistic patch is already
 * on screen, and the realtime subscription refreshes the table a second later
 * without refetching every loaded page on every keystroke).
 */
function useInvalidateDeals(pipelineId: string | undefined) {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const queryClient = useQueryClient();
  return (includeTable = true) => {
    if (includeTable) queryClient.invalidateQueries({ queryKey: oppTableKeys.pipeline(equipeId, pipelineId) });
    queryClient.invalidateQueries({ queryKey: ["board", equipeId, pipelineId] });
    queryClient.invalidateQueries({ queryKey: ["opportunities", equipeId] });
    queryClient.invalidateQueries({ queryKey: ["contacts_table", equipeId] });
  };
}

export interface BulkUpdateVars {
  ids: string[];
  patch: { stage_id?: string; owner_id?: string | null };
  /** Extra fields to show at once while the server answers (e.g. owner_name). */
  display?: Partial<OppTableRow>;
}

/** Move stage / change owner of one or many deals: the business verb, optimistic. */
export function useUpdateOpportunities(pipelineId: string | undefined, filters: CrmFilters, sort: CrmSort | null) {
  const { key } = useListKey(pipelineId, filters, sort);
  const queryClient = useQueryClient();
  const invalidate = useInvalidateDeals(pipelineId);

  return useMutation({
    mutationFn: async ({ ids, patch }: BulkUpdateVars): Promise<number> => {
      const { data, error } = await sb.rpc("crm_update_opportunities", { p_ids: ids, p_patch: patch });
      if (error) throw error;
      return Number(data) || 0;
    },
    onMutate: async ({ ids, patch, display }: BulkUpdateVars) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TablePages<OppTableRow>>(key);
      let next = previous;
      for (const id of ids) next = patchRowInPages(next, id, { ...patch, ...display } as Partial<OppTableRow>);
      if (next) queryClient.setQueryData(key, next);
      return { previous };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      toast.error("Não foi possível salvar: " + e.message);
    },
    onSettled: () => invalidate(),
  });
}

/** Soft-delete deals: the business verb, optimistic. */
export function useDeleteOpportunities(pipelineId: string | undefined, filters: CrmFilters, sort: CrmSort | null) {
  const { key } = useListKey(pipelineId, filters, sort);
  const queryClient = useQueryClient();
  const invalidate = useInvalidateDeals(pipelineId);

  return useMutation({
    mutationFn: async (ids: string[]): Promise<number> => {
      const { data, error } = await sb.rpc("crm_delete_opportunities", { p_ids: ids });
      if (error) throw error;
      return Number(data) || 0;
    },
    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TablePages<OppTableRow>>(key);
      const next = removeRowsFromPages(previous, ids);
      if (next) queryClient.setQueryData(key, next);
      return { previous };
    },
    onSuccess: (n) => toast.success(`${n} ${n === 1 ? "negócio excluído" : "negócios excluídos"}`),
    onError: (e: Error, _ids, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      toast.error("Não foi possível excluir: " + e.message);
    },
    onSettled: () => invalidate(),
  });
}

/**
 * One cell of one deal (value, status, a declared field). Success is silent —
 * the cell shows the new value; a failure is rethrown so the cell shows it, and
 * the page goes back to what it was.
 */
export function useOppCellUpdate(pipelineId: string | undefined, filters: CrmFilters, sort: CrmSort | null) {
  const { key } = useListKey(pipelineId, filters, sort);
  const queryClient = useQueryClient();
  const invalidate = useInvalidateDeals(pipelineId);

  return async (id: string, patch: Record<string, unknown>, display?: Partial<OppTableRow>) => {
    const previous = queryClient.getQueryData<TablePages<OppTableRow>>(key);
    const next = patchRowInPages(previous, id, { ...patch, ...display } as Partial<OppTableRow>);
    if (next) queryClient.setQueryData(key, next);
    const { error } = await sb.from("opportunities").update(patch).eq("id", id);
    if (error) {
      if (previous) queryClient.setQueryData(key, previous);
      throw new Error(error.message);
    }
    invalidate(false);
  };
}

/** Patch one row of the loaded pages (e.g. after linking a company in a cell). */
export function useOppTablePatcher(pipelineId: string | undefined, filters: CrmFilters, sort: CrmSort | null) {
  const { key } = useListKey(pipelineId, filters, sort);
  const queryClient = useQueryClient();
  return (id: string, patch: Partial<OppTableRow>) => {
    const next = patchRowInPages(queryClient.getQueryData<TablePages<OppTableRow>>(key), id, patch);
    if (next) queryClient.setQueryData(key, next);
  };
}
