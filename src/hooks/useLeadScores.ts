import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface LeadScoreMap {
  [leadId: string]: {
    icpScore: number | null;
    velocity: number | null;
    leadScore: number | null; // 0-10 combined score; null = no data, never a fake 0
  };
}

interface ServerScore {
  icp_score: number | null;
  velocity: number | null;
  lead_score: number | null;
}

/**
 * Lead scores for a set of leads, in ONE request.
 *
 * Sprint 11: this used to fire `fn_calculate_icp_score` and
 * `fn_calculate_lead_velocity` once per lead — about 2,000 requests every time
 * the Solo Energia board opened. `crm_lead_scores` computes them all on the
 * server; the ids travel in the POST body, so there is no URL length limit.
 *
 * The score is null when there is nothing to score (no ICP criteria on the
 * pipeline and no activity on the lead). The badge hides instead of showing 0
 * for everyone.
 */
export function useLeadScores(leadIds: string[]) {
  const deduped = [...new Set(leadIds.filter(Boolean))].sort();

  const { data, isLoading } = useQuery<LeadScoreMap>({
    queryKey: ["lead-scores", ...deduped],
    queryFn: async (): Promise<LeadScoreMap> => {
      const { data: raw, error } = await sb.rpc("crm_lead_scores", { p_lead_ids: deduped });
      if (error) throw error;

      const map: LeadScoreMap = {};
      for (const [leadId, s] of Object.entries((raw ?? {}) as Record<string, ServerScore>)) {
        map[leadId] = {
          icpScore: s.icp_score ?? null,
          velocity: s.velocity ?? null,
          leadScore: s.lead_score ?? null,
        };
      }
      return map;
    },
    enabled: deduped.length > 0,
    staleTime: 60_000, // scores are stable — 1 min cache
  });

  return { scores: data ?? {}, isLoading };
}
