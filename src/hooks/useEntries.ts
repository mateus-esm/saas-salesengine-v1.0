// Sprint 11 · Onda 5 · T52 — the entries: every door a lead comes through, with
// its stamp (category, platform, default campaign) and who takes its deals.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { normalizeOwnerRule, type Entry, type OwnerRule } from "@/lib/campaigns";

const sb = supabase as any;

export const entryKeys = {
  all: ["crm_entries"] as const,
};

export interface EntryPatch {
  name?: string;
  origin_category?: string | null;
  platform?: string | null;
  campaign_id?: string | null;
  pipeline_id?: string | null;
  owner_rule?: OwnerRule;
  active?: boolean;
}

export function useEntries() {
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: entryKeys.all,
    queryFn: async (): Promise<Entry[]> => {
      const { data, error } = await sb.rpc("crm_entry_list");
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((e) => ({
        ...(e as unknown as Entry),
        owner_rule: normalizeOwnerRule(e.owner_rule),
        leads: Number(e.leads) || 0,
        touches_30d: Number(e.touches_30d) || 0,
      }));
    },
  });

  const save = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: EntryPatch }) => {
      const { error } = await sb.rpc("crm_save_entry", { p_entry_id: id, p: patch });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: entryKeys.all });
      toast.success("Entrada salva");
    },
    onError: (error: Error) => toast.error("Não foi possível salvar: " + error.message),
  });

  return { entries: list.data ?? [], isLoading: list.isLoading, save };
}
