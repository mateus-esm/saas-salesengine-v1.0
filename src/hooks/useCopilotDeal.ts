// Sprint 11 · Onda 6 · T65 — the Copilot on one deal: its summary, what waits,
// what it did (crm_copilot_deal_brief). Asked only while the panel is open.

import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export interface DealBrief {
  opportunity: { id: string; contact: string | null; stage: string | null; owner: string | null; days_in_stage: number | null };
  summary: string | null;
  summary_at: string | null;
  origin: { entry: string | null; category: string | null; platform: string | null; campaign: string | null } | null;
  open_tasks: { title: string; due_date: string | null; status: string }[];
  pending: { id: string; label: string | null; why: string | null; at: string }[];
  recent: { id: string; label: string | null; status: string; at: string }[];
  last_job: { status: string; reason: string; finished_at: string | null; last_error: string | null;
              result: { applied?: number; pending?: number } | null } | null;
}

export function useCopilotDeal(opportunityId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["copilot", "deal", opportunityId],
    enabled: enabled && !!opportunityId,
    queryFn: async (): Promise<DealBrief> => {
      const { data, error } = await sb.rpc("crm_copilot_deal_brief", { p_opportunity_id: opportunityId });
      if (error) throw error;
      return data as DealBrief;
    },
  });
}
