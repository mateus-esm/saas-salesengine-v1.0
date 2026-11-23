// Sprint 16 — Growth: experiments, creatives, ads, the ads report and the Windsor
// integration. Everything under growthKeys.all, and a save also refreshes the
// campaigns (an ad's campaign moves spend and leads there).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { campaignKeys } from "@/hooks/useCampaigns";
import {
  growthErrorText,
  type Ad,
  type AdDraft,
  type AdReportRow,
  type Creative,
  type CreativeReportRow,
  type Experiment,
  type ExperimentDraft,
} from "@/lib/growth";

const sb = supabase as any;

export const growthKeys = {
  all: ["crm_growth"] as const,
  experiments: () => ["crm_growth", "experiments"] as const,
  creatives: () => ["crm_growth", "creatives"] as const,
  ads: () => ["crm_growth", "ads"] as const,
  report: (from: string, to: string) => ["crm_growth", "report", from, to] as const,
  integrations: () => ["crm_growth", "integrations"] as const,
};

const num = (v: unknown) => Number(v) || 0;

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: growthKeys.all });
    void qc.invalidateQueries({ queryKey: campaignKeys.all });
    void qc.invalidateQueries({ queryKey: ["contacts_table"] });
  };
}

export function useExperiments() {
  const refresh = useRefresh();
  const list = useQuery({
    queryKey: growthKeys.experiments(),
    queryFn: async (): Promise<Experiment[]> => {
      const { data, error } = await sb.rpc("crm_experiment_list");
      if (error) throw error;
      return ((data ?? []) as Experiment[]).map((e) => ({
        ...e,
        baseline: e.baseline === null ? null : Number(e.baseline),
        target: e.target === null ? null : Number(e.target),
        result_value: e.result_value === null ? null : Number(e.result_value),
        live: e.live
          ? { leads: num(e.live.leads), deals: num(e.live.deals), wins: num(e.live.wins), revenue: num(e.live.revenue), spend: num(e.live.spend) }
          : null,
      }));
    },
  });

  const save = useMutation({
    mutationFn: async (draft: ExperimentDraft) => {
      const { data, error } = await sb.rpc("crm_save_experiment", { p: draft });
      if (error) throw error;
      return data as Experiment;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(growthErrorText(e.message)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.rpc("crm_delete_experiment", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast.success("Experimento apagado");
    },
    onError: (e: Error) => toast.error(growthErrorText(e.message)),
  });

  return { experiments: list.data ?? [], isLoading: list.isLoading, save, remove };
}

export function useCreatives() {
  const refresh = useRefresh();
  const list = useQuery({
    queryKey: growthKeys.creatives(),
    queryFn: async (): Promise<Creative[]> => {
      const { data, error } = await sb.rpc("crm_creative_list");
      if (error) throw error;
      return ((data ?? []) as Creative[]).map((c) => ({ ...c, ads: num(c.ads), leads: num(c.leads) }));
    },
  });
  const save = useMutation({
    mutationFn: async (draft: Partial<Creative> & { code: string }) => {
      const { data, error } = await sb.rpc("crm_save_creative", { p: draft });
      if (error) throw error;
      return data as Creative;
    },
    onSuccess: () => {
      refresh();
      toast.success("Criativo salvo");
    },
    onError: (e: Error) => toast.error(growthErrorText(e.message)),
  });
  return { creatives: list.data ?? [], isLoading: list.isLoading, save };
}

export function useAds() {
  const refresh = useRefresh();
  const list = useQuery({
    queryKey: growthKeys.ads(),
    queryFn: async (): Promise<Ad[]> => {
      const { data, error } = await sb.rpc("crm_ad_list");
      if (error) throw error;
      return ((data ?? []) as Ad[]).map((a) => ({
        ...a,
        spend_30d: num(a.spend_30d),
        leads: num(a.leads),
        daily_budget: a.daily_budget === null ? null : Number(a.daily_budget),
      }));
    },
  });
  const save = useMutation({
    mutationFn: async (draft: AdDraft) => {
      const { data, error } = await sb.rpc("crm_save_ad", { p: draft });
      if (error) throw error;
      return data as Ad;
    },
    onSuccess: () => {
      refresh();
      toast.success("Anúncio salvo");
    },
    onError: (e: Error) => toast.error(growthErrorText(e.message)),
  });
  return { ads: list.data ?? [], isLoading: list.isLoading, save };
}

export function useAdsReport(from: string, to: string) {
  return useQuery({
    queryKey: growthKeys.report(from, to),
    staleTime: 60_000,
    queryFn: async (): Promise<{ ads: AdReportRow[]; creatives: CreativeReportRow[] }> => {
      const { data, error } = await sb.rpc("crm_ads_report", { p_from: from, p_to: to });
      if (error) throw error;
      const fix = <T extends Record<string, unknown>>(r: T) => {
        const out: Record<string, unknown> = { ...r };
        for (const k of ["spend", "impressions", "reach", "clicks", "video_3s", "thruplays", "platform_leads", "conversations", "leads", "deals", "wins", "revenue", "ads"]) {
          if (k in out) out[k] = num(out[k]);
        }
        return out;
      };
      return {
        ads: ((data?.ads ?? []) as Record<string, unknown>[]).map(fix) as unknown as AdReportRow[],
        creatives: ((data?.creatives ?? []) as Record<string, unknown>[]).map(fix) as unknown as CreativeReportRow[],
      };
    },
  });
}

export interface Referrer {
  lead_id: string;
  name: string;
  phone: string | null;
  referrals: number;
  wins: number;
  revenue: number;
}

/** Sprint 16 — who refers the most (and what their referrals closed). */
export function useReferrers(campaignId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["crm_growth", "referrers", campaignId],
    enabled,
    queryFn: async (): Promise<Referrer[]> => {
      const { data, error } = await sb.rpc("crm_referrers", { p_campaign_id: campaignId });
      if (error) throw error;
      return ((data ?? []) as Referrer[]).map((r) => ({ ...r, referrals: num(r.referrals), wins: num(r.wins), revenue: num(r.revenue) }));
    },
  });
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

export interface Integration {
  id: string;
  provider: "windsor";
  status: "connected" | "error" | "disconnected";
  key_last4: string | null;
  accounts: { source: string; id: string; name: string | null }[];
  settings: { select_accounts?: string; fields?: Record<string, Record<string, string>> };
  last_sync_at: string | null;
  last_sync_status: "ok" | "partial" | "error" | null;
  last_sync_error: string | null;
  last_sync_rows: number | null;
}

export interface SyncResult {
  ok: boolean;
  status?: string;
  rows?: number;
  new_ads?: number;
  metric_rows?: number;
  linked_touches?: number;
  skipped?: string[];
  error?: string;
}

async function callWindsor(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("integrations-windsor", { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const j = await ctx.json();
        if (j?.error) message = j.error;
      }
    } catch {
      /* keep the generic message */
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function syncSummary(r: SyncResult | undefined): string {
  if (!r) return "Sincronizado";
  if (!r.ok) return `Falhou: ${r.error ?? "erro"}`;
  const parts = [`${r.rows ?? 0} linha(s)`];
  if (r.new_ads) parts.push(`${r.new_ads} anúncio(s) novo(s)`);
  if (r.linked_touches) parts.push(`${r.linked_touches} lead(s) ligado(s)`);
  return parts.join(" · ");
}

export function useIntegrations() {
  const refresh = useRefresh();
  const list = useQuery({
    queryKey: growthKeys.integrations(),
    queryFn: async (): Promise<Integration[]> => {
      const { data, error } = await sb.rpc("crm_integration_list");
      if (error) throw error;
      return (data ?? []) as Integration[];
    },
  });

  const connect = useMutation({
    mutationFn: async (args: { api_key: string; select_accounts?: string }) =>
      (await callWindsor({ action: "connect", ...args })) as { connected: boolean; sync: SyncResult },
    onSuccess: (r) => {
      refresh();
      toast.success(`Windsor conectado · ${syncSummary(r.sync)}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const sync = useMutation({
    mutationFn: async (days: number) => (await callWindsor({ action: "sync", days })) as SyncResult,
    onSuccess: (r) => {
      refresh();
      if (r.ok) toast.success(syncSummary(r));
      else toast.error(syncSummary(r));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveSettings = useMutation({
    mutationFn: async (select_accounts: string) => callWindsor({ action: "settings", select_accounts }),
    onSuccess: () => {
      refresh();
      toast.success("Contas salvas");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const disconnect = useMutation({
    mutationFn: async () => callWindsor({ action: "disconnect" }),
    onSuccess: () => {
      refresh();
      toast.success("Windsor desconectado — a chave foi apagada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const windsor = (list.data ?? []).find((i) => i.provider === "windsor") ?? null;
  return { windsor, isLoading: list.isLoading, connect, sync, saveSettings, disconnect };
}
