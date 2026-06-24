import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface LeadScoreMap {
  [leadId: string]: {
    icpScore: number | null;
    velocity: number | null;
    leadScore: number | null; // 0-10 combined score
  };
}

/** Combine ICP (0-100) and velocity (0-100) into a single 0-10 score. */
function computeLeadScore(icpScore: number | null, velocity: number | null): number | null {
  if (icpScore === null && velocity === null) return null;
  const avg = ((icpScore ?? 0) + (velocity ?? 0)) / 2;
  return Math.min(Math.max(Math.round(avg / 10), 0), 10);
}

/**
 * Sprint 6.7 — Batch-fetch ICP and lead-velocity scores for a set of lead IDs.
 *
 * Calls `fn_calculate_icp_score` and `fn_calculate_lead_velocity` for each
 * lead in parallel via Supabase RPC. Results are cached per lead set.
 *
 * Returns `{ scores, isLoading }` where `scores` is a map of lead_id → {icpScore, velocity}.
 */
export function useLeadScores(leadIds: string[]) {
  const deduped = [...new Set(leadIds.filter(Boolean))];

  const { data, isLoading } = useQuery<LeadScoreMap>({
    queryKey: ["lead-scores", ...deduped.sort()],
    queryFn: async (): Promise<LeadScoreMap> => {
      const results = await Promise.all(
        deduped.map(async (leadId) => {
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

          return { leadId, icpScore, velocity, leadScore: computeLeadScore(icpScore, velocity) };
        }),
      );

      const map: LeadScoreMap = {};
      for (const r of results) {
        map[r.leadId] = { icpScore: r.icpScore, velocity: r.velocity, leadScore: r.leadScore };
      }
      return map;
    },
    enabled: deduped.length > 0,
    staleTime: 60_000, // scores are stable — 1 min cache
  });

  return { scores: data ?? {}, isLoading };
}
