import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface LeadScoreResult {
  score: number | null;   // 0-10 combined lead score
  icpScore: number | null;
  velocity: number | null;
}

/** Combine ICP (0-100) and velocity (0-100) into a single 0-10 score. */
function computeLeadScore(icpScore: number | null, velocity: number | null): number | null {
  if (icpScore === null && velocity === null) return null;
  const avg = ((icpScore ?? 0) + (velocity ?? 0)) / 2;
  return Math.min(Math.max(Math.round(avg / 10), 0), 10);
}

/**
 * Sprint 6.8 T3.3 — Fetch lead score for a single lead.
 *
 * Calls `fn_calculate_icp_score` and `fn_calculate_lead_velocity` via
 * Supabase RPC and returns a combined 0-10 score alongside the raw components.
 *
 * Enabled only when `leadId` is truthy.
 */
export function useLeadScore(leadId: string | undefined) {
  return useQuery<LeadScoreResult>({
    queryKey: ["leadScore", leadId],
    queryFn: async (): Promise<LeadScoreResult> => {
      if (!leadId) return { score: null, icpScore: null, velocity: null };

      const [icpResult, velResult] = await Promise.all([
        sb.rpc("fn_calculate_icp_score", { p_lead_id: leadId }),
        sb.rpc("fn_calculate_lead_velocity", { p_lead_id: leadId }),
      ]);

      const icpRaw = icpResult?.data?.[0];
      const icpScore: number | null =
        icpRaw && typeof icpRaw.score === "number" ? icpRaw.score : null;

      const velRaw = velResult?.data;
      const velocity: number | null =
        velRaw !== null && velRaw !== undefined
          ? typeof velRaw === "number"
            ? velRaw
            : Number(velRaw)
          : null;

      return {
        score: computeLeadScore(icpScore, velocity),
        icpScore,
        velocity,
      };
    },
    enabled: !!leadId,
    staleTime: 60_000,
  });
}
