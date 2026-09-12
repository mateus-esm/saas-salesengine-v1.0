// Sprint 11 · Onda 3 · T29 — the team's catalog of products and services.
//
// Read straight from catalog_items (RLS: the team's own; the list is small).
// Written only through the verbs crm_save_catalog_item / crm_archive_catalog_items,
// the same ones the Copilot and the MCP will use.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { CatalogDraft } from "@/lib/catalog";
import type { CatalogItem } from "@/types/revenue";

const sb = supabase as any;

export const catalogKeys = {
  all: (equipeId: string | undefined) => ["catalog", equipeId] as const,
};

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export function normalizeCatalogItem(raw: Record<string, unknown>): CatalogItem {
  return {
    id: raw.id as string,
    equipe_id: raw.equipe_id as string,
    name: (raw.name as string) ?? "",
    kind: raw.kind === "service" ? "service" : "product",
    price: num(raw.price),
    price_mode: raw.price_mode === "fixed" ? "fixed" : "negotiable",
    recurrence_every: num(raw.recurrence_every),
    recurrence_unit: raw.recurrence_unit === "day" || raw.recurrence_unit === "month" ? raw.recurrence_unit : null,
    renew_days_before: Number(raw.renew_days_before) || 0,
    renew_pipeline_id: (raw.renew_pipeline_id as string) ?? null,
    renew_stage_id: (raw.renew_stage_id as string) ?? null,
    description: (raw.description as string) ?? null,
    active: raw.active !== false,
    created_at: raw.created_at as string,
    updated_at: raw.updated_at as string,
  };
}

const MESSAGES: Record<string, string> = {
  catalog_fixed_has_price: "Preço fixo precisa do preço.",
  catalog_recurrence_pair: "Recorrência precisa de intervalo e unidade.",
  renew_stage_not_in_pipeline: "A etapa do retorno precisa ser do pipeline do retorno.",
  renew_pipeline_not_found: "O pipeline do retorno não existe mais.",
  catalog_item_not_found: "Este item não existe mais.",
};

export function catalogErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  const key = Object.keys(MESSAGES).find((k) => msg.includes(k));
  return key ? MESSAGES[key] : msg;
}

export function useCatalog() {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const queryClient = useQueryClient();
  const key = catalogKeys.all(equipeId);

  const query = useQuery({
    queryKey: key,
    enabled: !!equipeId,
    queryFn: async (): Promise<CatalogItem[]> => {
      const { data, error } = await sb
        .from("catalog_items")
        .select("*")
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(normalizeCatalogItem);
    },
  });

  const save = useMutation({
    mutationFn: async (item: Partial<CatalogDraft> & { id?: string }): Promise<string> => {
      const { data, error } = await sb.rpc("crm_save_catalog_item", { p_item: item });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(catalogErrorMessage(e)),
  });

  const archive = useMutation({
    mutationFn: async (ids: string[]): Promise<number> => {
      const { data, error } = await sb.rpc("crm_archive_catalog_items", { p_ids: ids });
      if (error) throw error;
      return Number(data) || 0;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(catalogErrorMessage(e)),
  });

  return { items: query.data ?? [], isLoading: query.isLoading, error: query.error, save, archive };
}
