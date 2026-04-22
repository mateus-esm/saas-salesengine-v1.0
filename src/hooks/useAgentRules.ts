import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import type {
  PipelineAgentRules,
  AgentRuleTrigger,
} from "@/types/pipelines";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const TABLE = "pipeline_agent_rules";

interface AgentRulesRow {
  id: string;
  equipe_id: string;
  pipeline_id: string;
  triggers: AgentRuleTrigger[] | null;
  extraction_hints: string | null;
  auto_create_opportunity: boolean;
  auto_advance_stages: boolean;
  auto_extract_custom_fields: boolean;
  cooldown_minutes: number;
  created_at: string;
  updated_at: string;
}

const normalize = (row: AgentRulesRow): PipelineAgentRules => ({
  id: row.id,
  equipe_id: row.equipe_id,
  pipeline_id: row.pipeline_id,
  triggers: Array.isArray(row.triggers) ? row.triggers : [],
  extraction_hints: row.extraction_hints ?? null,
  auto_create_opportunity: !!row.auto_create_opportunity,
  auto_advance_stages: row.auto_advance_stages !== false,
  auto_extract_custom_fields: row.auto_extract_custom_fields !== false,
  cooldown_minutes: row.cooldown_minutes ?? 3,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export interface UpsertAgentRulesData {
  triggers?: AgentRuleTrigger[];
  extraction_hints?: string | null;
  auto_create_opportunity?: boolean;
  auto_advance_stages?: boolean;
  auto_extract_custom_fields?: boolean;
  cooldown_minutes?: number;
}

/**
 * Sprint 4 EPIC 5 — CRUD hook for per-pipeline agent rules.
 *
 * The `pipeline_agent_rules` table has a UNIQUE(pipeline_id) constraint so each
 * pipeline has at most one rules row. The upsert mutation inserts on first save
 * and updates thereafter.
 */
export const useAgentRules = (pipelineId?: string) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const queryKey = ["agent_rules", equipeId, pipelineId];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<PipelineAgentRules | null> => {
      if (!equipeId || !pipelineId) return null;
      const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("equipe_id", equipeId)
        .eq("pipeline_id", pipelineId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return normalize(data as AgentRulesRow);
    },
    enabled: !!equipeId && !!pipelineId,
  });

  // Realtime — rare edits, but keeps multi-tab / multi-agent tidy.
  useEffect(() => {
    if (!equipeId || !pipelineId) return;
    const channel = sb
      .channel(`agent_rules_${pipelineId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: TABLE,
          filter: `pipeline_id=eq.${pipelineId}`,
        },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [equipeId, pipelineId, queryClient, queryKey]);

  const upsertRules = useMutation({
    mutationFn: async (input: UpsertAgentRulesData): Promise<PipelineAgentRules> => {
      if (!equipeId || !pipelineId) throw new Error("No equipe/pipeline");

      const existing = query.data;

      if (existing) {
        // UPDATE
        const { data, error } = await sb
          .from(TABLE)
          .update({
            ...input,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return normalize(data as AgentRulesRow);
      } else {
        // INSERT
        const { data, error } = await sb
          .from(TABLE)
          .insert({
            equipe_id: equipeId,
            pipeline_id: pipelineId,
            triggers: input.triggers ?? [],
            extraction_hints: input.extraction_hints ?? null,
            auto_create_opportunity: input.auto_create_opportunity ?? false,
            auto_advance_stages: input.auto_advance_stages ?? true,
            auto_extract_custom_fields: input.auto_extract_custom_fields ?? true,
            cooldown_minutes: input.cooldown_minutes ?? 3,
          })
          .select()
          .single();
        if (error) throw error;
        return normalize(data as AgentRulesRow);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Regras do agente salvas!");
    },
    onError: (e: Error) => toast.error("Erro ao salvar regras: " + e.message),
  });

  return {
    rules: query.data,
    isLoading: query.isLoading,
    error: query.error,
    upsertRules,
    refetch: query.refetch,
  };
};
