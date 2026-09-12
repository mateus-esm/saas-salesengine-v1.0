// Sprint 11 · Onda 5 · T52 — campaigns: the list (with what each brought and cost),
// the form, the spend entries, and the UTMs that arrived with no campaign.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  campaignErrorText,
  normalizeMatchKeys,
  type Campaign,
  type CampaignDraft,
  type CampaignReportRow,
  type UnmatchedUtm,
} from "@/lib/campaigns";

const sb = supabase as any;

export const campaignKeys = {
  all: ["crm_campaigns"] as const,
  list: () => ["crm_campaigns", "list"] as const,
  spend: (campaignId: string | null) => ["crm_campaigns", "spend", campaignId] as const,
  unmatched: () => ["crm_campaigns", "unmatched"] as const,
  report: (args: CampaignReportArgs) =>
    [
      "crm_campaigns",
      "report",
      args.from,
      args.to,
      [...(args.pipelineIds ?? [])].sort().join(","),
      [...(args.responsibleIds ?? [])].sort().join(","),
    ] as const,
};

export interface CampaignReportArgs {
  from: string;
  to: string;
  pipelineIds?: string[];
  responsibleIds?: string[];
}

export interface SpendEntry {
  id: string;
  spent_on: string;
  amount: number;
  source: "manual" | "meta_api" | "google_api";
  note: string | null;
}

export function useCampaigns() {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: campaignKeys.all });

  const list = useQuery({
    queryKey: campaignKeys.list(),
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await sb.rpc("crm_campaign_list");
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((c) => ({
        ...(c as unknown as Campaign),
        match_keys: (c.match_keys as string[] | null) ?? [],
        leads: Number(c.leads) || 0,
        touches: Number(c.touches) || 0,
        spend: Number(c.spend) || 0,
      }));
    },
  });

  const unmatched = useQuery({
    queryKey: campaignKeys.unmatched(),
    queryFn: async (): Promise<UnmatchedUtm[]> => {
      const { data, error } = await sb.rpc("crm_unmatched_utms", { p_limit: 50 });
      if (error) throw error;
      return (data ?? []) as UnmatchedUtm[];
    },
  });

  const save = useMutation({
    mutationFn: async (draft: CampaignDraft) => {
      const { data, error } = await sb.rpc("crm_save_campaign", {
        p: { ...draft, name: draft.name.trim(), match_keys: normalizeMatchKeys(draft.match_keys) },
      });
      if (error) throw error;
      return data as Campaign;
    },
    onSuccess: () => {
      refresh();
      toast.success("Campanha salva");
    },
    onError: (error: Error) => toast.error(campaignErrorText(error.message)),
  });

  const linkUtm = useMutation({
    mutationFn: async ({ campaignId, value }: { campaignId: string; value: string }) => {
      const { data, error } = await sb.rpc("crm_link_utm", { p_campaign_id: campaignId, p_value: value });
      if (error) throw error;
      return data as { touches: number; leads: number };
    },
    onSuccess: (r) => {
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["contacts_table"] });
      toast.success(`Ligada: ${r.touches} chegada(s), ${r.leads} lead(s) passaram para a campanha`);
    },
    onError: (error: Error) => toast.error(campaignErrorText(error.message)),
  });

  return {
    campaigns: list.data ?? [],
    isLoading: list.isLoading,
    unmatched: unmatched.data ?? [],
    save,
    linkUtm,
  };
}

export function useCampaignSpend(campaignId: string | null) {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: campaignKeys.all });

  const list = useQuery({
    queryKey: campaignKeys.spend(campaignId),
    enabled: !!campaignId,
    queryFn: async (): Promise<SpendEntry[]> => {
      const { data, error } = await sb
        .from("crm_campaign_spend")
        .select("id, spent_on, amount, source, note")
        .eq("campaign_id", campaignId)
        .order("spent_on", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as SpendEntry[]).map((s) => ({ ...s, amount: Number(s.amount) || 0 }));
    },
  });

  const add = useMutation({
    mutationFn: async (entry: { spent_on: string; amount: number; note?: string }) => {
      const { error } = await sb.rpc("crm_campaign_spend_add", {
        p_campaign_id: campaignId,
        p_spent_on: entry.spent_on,
        p_amount: entry.amount,
        p_note: entry.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (error: Error) => toast.error("Não foi possível lançar: " + error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.rpc("crm_campaign_spend_delete", { p_id: id });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (error: Error) => toast.error("Não foi possível apagar: " + error.message),
  });

  return { spend: list.data ?? [], isLoading: list.isLoading, add, remove };
}

/**
 * Sprint 11 · T54 — what each campaign brought and cost in the period, counted
 * like the dashboard (same scope, same pipeline and owner filters). Under
 * campaignKeys.all, so a new spend entry refreshes it.
 */
export function useCampaignReport(args: CampaignReportArgs) {
  return useQuery({
    queryKey: campaignKeys.report(args),
    staleTime: 60_000,
    queryFn: async (): Promise<CampaignReportRow[]> => {
      const { data, error } = await sb.rpc("crm_campaign_report", {
        p_from: args.from,
        p_to: args.to,
        // null, not [], means "no filter".
        p_pipeline_ids: args.pipelineIds?.length ? args.pipelineIds : null,
        p_responsible_ids: args.responsibleIds?.length ? args.responsibleIds : null,
      });
      if (error) throw error;
      return ((data ?? []) as CampaignReportRow[]).map((r) => ({
        ...r,
        revenue: Number(r.revenue) || 0,
        spend: Number(r.spend) || 0,
      }));
    },
  });
}
