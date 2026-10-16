import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  distributionErrorMessage,
  normalizeDistribution,
  toSavePayload,
  type DistributionConfig,
} from "@/lib/distribution";

// The generated types lag the new tables/RPC until `supabase gen types` reruns.
const sb = supabase as any;

export interface DistributionRun {
  id: number;
  opportunity_id: string;
  assigned_to: string | null;
  status: "assigned" | "no_candidate" | "error";
  reason: string;
  created_at: string;
}

/**
 * SE-SUP1-8 (#17) — a roleta de um pipeline: a configuração (leitura pela RLS,
 * escrita só pelo crm_save_pipeline_distribution) e as últimas decisões, para o
 * gestor ver por que cada negócio caiu com quem caiu.
 */
export function usePipelineDistribution(pipelineId: string | null | undefined, enabled = true) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const key = ["pipeline_distribution", profile?.equipe_id, pipelineId];

  const config = useQuery({
    queryKey: key,
    enabled: enabled && !!pipelineId && !!profile?.equipe_id,
    queryFn: async (): Promise<DistributionConfig> => {
      const { data, error } = await sb
        .from("pipeline_distribution")
        .select("mode, members, rules, max_open_per_seller, skip_away, active")
        .eq("pipeline_id", pipelineId)
        .maybeSingle();
      if (error) throw error;
      return normalizeDistribution(data);
    },
  });

  const runs = useQuery({
    queryKey: [...key, "runs"],
    enabled: enabled && !!pipelineId && !!profile?.equipe_id,
    queryFn: async (): Promise<DistributionRun[]> => {
      const { data, error } = await sb
        .from("pipeline_distribution_runs")
        .select("id, opportunity_id, assigned_to, status, reason, created_at")
        .eq("pipeline_id", pipelineId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as DistributionRun[];
    },
  });

  const save = useMutation({
    mutationFn: async (c: DistributionConfig): Promise<DistributionConfig> => {
      const { data, error } = await sb.rpc("crm_save_pipeline_distribution", {
        p_pipeline_id: pipelineId,
        p_config: toSavePayload(c),
      });
      if (error) throw error;
      return normalizeDistribution(data);
    },
    onSuccess: (saved) => {
      qc.setQueryData(key, saved);
      toast.success(saved.active ? "Roleta salva e ativa" : "Roleta salva (desligada)");
    },
    onError: (err) => toast.error(distributionErrorMessage(err)),
  });

  return { config, runs, save };
}
