import { useQuery } from "@tanstack/react-query";
import { COPILOT_URL, getCopilotToken } from "@/services/copilot";
import { useAuth } from "@/contexts/AuthContext";

export interface CopilotDecisionRow {
  id: string;
  created_at: string;
  agent_role: string | null;
  decision_type: string | null;
  status: string;
  lead_id: string | null;
  lead_name: string | null;
  opportunity_id: string | null;
  pipeline_id: string | null;
  field: string | null;
  value: unknown;
  confidence: number | null;
  credits: number;
  output_action?: unknown;
}

interface UseCopilotDecisionsArgs {
  pipelineId?: string | null;
  limit?: number;
}

export function useCopilotDecisions({
  pipelineId,
  limit = 100,
}: UseCopilotDecisionsArgs = {}) {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  return useQuery<CopilotDecisionRow[]>({
    queryKey: ["copilot", "decisions", equipeId, pipelineId ?? "all", limit],
    queryFn: async () => {
      const token = await getCopilotToken();
      const params = new URLSearchParams({ limit: String(limit) });
      if (pipelineId) params.set("pipeline_id", pipelineId);

      const res = await fetch(`${COPILOT_URL}/api/v1/decisions?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error(`Decisions error ${res.status} ${res.statusText}`);
      }

      return (await res.json()) as CopilotDecisionRow[];
    },
    enabled: !!equipeId,
    staleTime: 15_000,
  });
}
