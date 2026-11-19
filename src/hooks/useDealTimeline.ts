import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { DealTimeline, WonItemChoice } from "@/lib/dealTimeline";

// The generated types lag the new RPCs until `supabase gen types` reruns.
const sb = supabase as any;

export const dealTimelineKey = (opportunityId: string | null) => ["deal_timeline", opportunityId] as const;

/** Summary, items, proposals/contracts and every event of one deal (crm_deal_timeline). */
export function useDealTimeline(opportunityId: string | null, enabled = true) {
  return useQuery({
    queryKey: dealTimelineKey(opportunityId),
    enabled: enabled && !!opportunityId,
    staleTime: 15_000,
    queryFn: async (): Promise<DealTimeline> => {
      const { data, error } = await sb.rpc("crm_deal_timeline", { p_opportunity_id: opportunityId });
      if (error) throw error;
      return data as DealTimeline;
    },
  });
}

export interface CloseWonInput {
  opportunityId: string;
  items: WonItemChoice[];
  proposalId: string | null;
  contractId: string | null;
  value: number | null;
}

/**
 * The "Ganho" checklist, saved BEFORE the stage changes: items that closed, the
 * accepted proposal, the signed contract and the real value. The won webhook
 * fires on the stage change and reads all of it.
 */
export function useCloseWon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CloseWonInput) => {
      const { data, error } = await sb.rpc("crm_close_won_prepare", {
        p_opportunity_id: input.opportunityId,
        p_items: input.items,
        p_proposal_id: input.proposalId,
        p_contract_id: input.contractId,
        p_value: input.value,
      });
      if (error) throw error;
      return data as { value: number | null; stage_id: string };
    },
    onSettled: (_d, _e, input) => {
      for (const key of [
        dealTimelineKey(input.opportunityId), ["deal_artifacts"], ["opportunity_items"],
        ["board"], ["opportunities"], ["deal_revenue"],
      ]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}
