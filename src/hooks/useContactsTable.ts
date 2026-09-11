// Sprint 11 · Onda 2 · T19 — the contact base reads from the server.
//
// Pages of 50 from `crm_contacts_table`, filtered by `crm_lead_matches`: each
// contact arrives with its relationship (derived from its deals), open deals,
// total won, last win and up to 10 deals with their owners. Before, every lead
// of the team was loaded into the browser and the companies/properties summary
// sent ~1,250 UUIDs in the URL.

import { useEffect, useMemo } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cleanFilters } from "@/lib/board";
import { createDebouncer } from "@/lib/debounce";
import { nextOffset, patchRowInPages, removeRowsFromPages, type TablePages } from "@/lib/tablePages";
import type { ContactFilters, CrmSort } from "@/types/crmFilters";
import type { ContactDeal, ContactRow } from "@/types/crmTables";

const sb = supabase as any;

export const CONTACTS_PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 200;
const DEFAULT_SORT: CrmSort = { key: "created_at", dir: "desc" };

export const contactsKeys = {
  all: (equipeId: string | undefined) => ["contacts_table", equipeId] as const,
  list: (equipeId: string | undefined, filters: ContactFilters, sort: CrmSort | null) =>
    ["contacts_table", equipeId, "list", filters, sort ?? DEFAULT_SORT] as const,
  count: (equipeId: string | undefined, filters: ContactFilters) =>
    ["contacts_table", equipeId, "count", filters] as const,
};

export function normalizeContactRow(raw: Record<string, unknown>): ContactRow {
  const deals = Array.isArray(raw.deals) ? (raw.deals as Record<string, unknown>[]) : [];
  return {
    ...(raw as unknown as ContactRow),
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    personal_custom_data: (raw.personal_custom_data as Record<string, unknown>) ?? {},
    property_count: Number(raw.property_count) || 0,
    open_count: Number(raw.open_count) || 0,
    won_value: Number(raw.won_value) || 0,
    deals: deals.map((d) => ({ ...(d as unknown as ContactDeal), value: d.value === null ? null : Number(d.value) })),
  };
}

async function fetchPage(filters: ContactFilters, sort: CrmSort | null, limit: number, offset: number) {
  const { data, error } = await sb.rpc("crm_contacts_table", {
    p_filters: filters,
    p_sort: sort ?? DEFAULT_SORT,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeContactRow);
}

function useListKey(filters: ContactFilters, sort: CrmSort | null) {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const f = useMemo(() => cleanFilters(filters), [filters]);
  return { equipeId, f, key: contactsKeys.list(equipeId, f, sort) as QueryKey };
}

export function useContactsTable(filters: ContactFilters, sort: CrmSort | null) {
  const { equipeId, f, key } = useListKey(filters, sort);
  return useInfiniteQuery({
    queryKey: key,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchPage(f, sort, CONTACTS_PAGE_SIZE, pageParam),
    getNextPageParam: (last, all) => nextOffset(last, all, CONTACTS_PAGE_SIZE),
    enabled: !!equipeId,
    placeholderData: keepPreviousData,
  });
}

export function useContactsCount(filters: ContactFilters) {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const f = useMemo(() => cleanFilters(filters), [filters]);
  return useQuery({
    queryKey: contactsKeys.count(equipeId, f),
    queryFn: async (): Promise<number> => {
      const { data, error } = await sb.rpc("crm_contacts_count", { p_filters: f });
      if (error) throw error;
      return Number(data) || 0;
    },
    enabled: !!equipeId,
    placeholderData: keepPreviousData,
  });
}

/** Contacts and their deals change elsewhere (WhatsApp, webhooks, sellers): refetch, grouped. */
export function useContactsRealtime() {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!equipeId) return;
    const refresh = createDebouncer(
      () => queryClient.invalidateQueries({ queryKey: contactsKeys.all(equipeId) }),
      1000,
      { maxWait: 5000 },
    );
    const channel = sb
      .channel(`contacts_table_${equipeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `equipe_id=eq.${equipeId}` }, () =>
        refresh.call(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "opportunities", filter: `equipe_id=eq.${equipeId}` },
        () => refresh.call(),
      )
      .subscribe();
    return () => {
      refresh.cancel();
      sb.removeChannel(channel);
    };
  }, [equipeId, queryClient]);
}

/** Soft-delete contacts: the business verb, optimistic. */
export function useDeleteContacts(filters: ContactFilters, sort: CrmSort | null) {
  const { equipeId, key } = useListKey(filters, sort);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]): Promise<number> => {
      const { data, error } = await sb.rpc("crm_delete_leads", { p_ids: ids });
      if (error) throw error;
      return Number(data) || 0;
    },
    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TablePages<ContactRow>>(key);
      const next = removeRowsFromPages(previous, ids);
      if (next) queryClient.setQueryData(key, next);
      return { previous };
    },
    onSuccess: (n) => toast.success(`${n} ${n === 1 ? "contato removido" : "contatos removidos"}`),
    onError: (e: Error, _ids, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      toast.error("Não foi possível remover: " + e.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: contactsKeys.all(equipeId) });
      queryClient.invalidateQueries({ queryKey: ["board", equipeId] });
      queryClient.invalidateQueries({ queryKey: ["opp_table", equipeId] });
    },
  });
}

/**
 * One cell of one contact. Silent on success (the cell shows the value); a
 * failure — a phone already used by another contact, say — is rethrown for the
 * cell to show, and the page goes back.
 */
export function useContactCellUpdate(filters: ContactFilters, sort: CrmSort | null) {
  const { equipeId, key } = useListKey(filters, sort);
  const queryClient = useQueryClient();
  return async (id: string, patch: Record<string, unknown>) => {
    const previous = queryClient.getQueryData<TablePages<ContactRow>>(key);
    const next = patchRowInPages(previous, id, patch as Partial<ContactRow>);
    if (next) queryClient.setQueryData(key, next);
    const { error } = await sb.from("leads").update(patch).eq("id", id);
    if (error) {
      if (previous) queryClient.setQueryData(key, previous);
      throw new Error(error.message);
    }
    queryClient.invalidateQueries({ queryKey: ["board", equipeId] });
    queryClient.invalidateQueries({ queryKey: ["opp_table", equipeId] });
    queryClient.invalidateQueries({ queryKey: ["lead", id] });
  };
}

/** Every contact that matches the filters, for the export (pages of 200). */
export async function fetchAllContacts(filters: ContactFilters, sort: CrmSort | null): Promise<ContactRow[]> {
  const f = cleanFilters(filters);
  const all: ContactRow[] = [];
  for (let offset = 0; ; offset += EXPORT_PAGE_SIZE) {
    const page = await fetchPage(f, sort, EXPORT_PAGE_SIZE, offset);
    all.push(...page);
    if (page.length < EXPORT_PAGE_SIZE) return all;
  }
}
