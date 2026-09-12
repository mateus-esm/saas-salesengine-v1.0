// Sprint 11 · Onda 3 · T30 — the lines of one deal.
//
// Loaded only while the deal is open. Saved through crm_set_opportunity_items
// (the whole list, by difference); the answer carries the new deal value, which
// goes straight into the board and table caches.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { ItemPayload } from "@/lib/dealItems";
import { patchRowInCache } from "@/lib/tablePages";
import type { OpportunityItem } from "@/types/revenue";

const sb = supabase as any;

export const dealItemKeys = {
  list: (opportunityId: string | null) => ["opportunity_items", opportunityId] as const,
};

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export function normalizeOpportunityItem(raw: Record<string, unknown>): OpportunityItem {
  return {
    id: raw.id as string,
    opportunity_id: raw.opportunity_id as string,
    catalog_item_id: (raw.catalog_item_id as string) ?? null,
    name: (raw.name as string) ?? "",
    quantity: Number(raw.quantity) || 0,
    unit_price: Number(raw.unit_price) || 0,
    total: Number(raw.total) || 0,
    price_locked: raw.price_locked === true,
    recurrence_every: num(raw.recurrence_every),
    recurrence_unit: raw.recurrence_unit === "day" || raw.recurrence_unit === "month" ? raw.recurrence_unit : null,
    renew_days_before: Number(raw.renew_days_before) || 0,
    position: Number(raw.position) || 0,
  };
}

const MESSAGES: Record<string, string> = {
  catalog_item_not_found: "Esse item não está mais no catálogo.",
  catalog_item_paused: "Esse item está pausado no catálogo.",
  opportunity_not_found: "Este negócio não existe mais.",
  item_not_found: "Um item mudou enquanto você editava — reabra o negócio.",
  opportunity_item_name_present: "Dê um nome à linha avulsa.",
  opportunity_item_quantity_positive: "A quantidade precisa ser maior que zero.",
  opportunity_item_price_positive: "O preço não pode ser negativo.",
};

function itemsErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  const key = Object.keys(MESSAGES).find((k) => msg.includes(k));
  return key ? MESSAGES[key] : "Não foi possível salvar os itens: " + msg;
}

export function useOpportunityItems(opportunityId: string | null, enabled: boolean) {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const queryClient = useQueryClient();
  const key = dealItemKeys.list(opportunityId);

  const query = useQuery({
    queryKey: key,
    enabled: enabled && !!opportunityId,
    queryFn: async (): Promise<OpportunityItem[]> => {
      const { data, error } = await sb
        .from("opportunity_items")
        .select("*")
        .eq("opportunity_id", opportunityId)
        .is("deleted_at", null)
        .order("position", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(normalizeOpportunityItem);
    },
  });

  const save = useMutation({
    mutationFn: async (items: ItemPayload[]): Promise<{ value: number | null; items: OpportunityItem[] }> => {
      const { data, error } = await sb.rpc("crm_set_opportunity_items", {
        p_opportunity_id: opportunityId,
        p_items: items,
      });
      if (error) throw error;
      const raw = (data ?? {}) as { value?: unknown; items?: Record<string, unknown>[] };
      return { value: num(raw.value), items: (raw.items ?? []).map(normalizeOpportunityItem) };
    },
    onSuccess: ({ value, items }) => {
      queryClient.setQueryData(key, items);
      if (opportunityId) {
        for (const scope of [["board", equipeId], ["opp_table", equipeId]]) {
          queryClient.setQueriesData({ queryKey: scope }, (d: unknown) => patchRowInCache(d, opportunityId, { value }));
        }
      }
    },
    onSettled: () => {
      // Column totals and anything that sums values.
      queryClient.invalidateQueries({ queryKey: ["board", equipeId] });
      queryClient.invalidateQueries({ queryKey: ["opportunities", equipeId] });
    },
    onError: (e) => toast.error(itemsErrorMessage(e)),
  });

  return { items: query.data ?? [], isLoading: query.isLoading, save };
}
