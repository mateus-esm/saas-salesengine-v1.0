import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import type { CopilotAgent, AutonomyMode } from "@/types/copilot";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const TABLE = "copilot_agents";

export interface UpsertCopilotAgentInput {
  scope: "chat" | "contact_base" | "pipeline";
  pipeline_id?: string | null;
  name?: string;
  system_prompt?: string | null;
  autonomy_mode?: AutonomyMode;
}

/**
 * Sprint 6 Wave 3 — CRUD hook for per-tenant copilot agent configs.
 *
 * The `copilot_agents` table has a UNIQUE(equipe_id, scope, pipeline_id) constraint
 * so each (equipe, scope, pipeline) combination has at most one config row.
 * The upsert mutation inserts on first save and updates thereafter.
 * For global (non-pipeline) scopes, pipeline_id is null.
 */
export const useCopilotAgents = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const queryKey = ["copilot_agents", equipeId];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<CopilotAgent[]> => {
      if (!equipeId) return [];
      const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("equipe_id", equipeId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CopilotAgent[];
    },
    enabled: !!equipeId,
  });

  // Realtime — invalidate on any change to the tenant's copilot agents.
  useEffect(() => {
    if (!equipeId) return;
    const channel = sb
      .channel(`copilot_agents_${equipeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: TABLE,
          filter: `equipe_id=eq.${equipeId}`,
        },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [equipeId, queryClient, queryKey]);

  const upsert = useMutation({
    mutationFn: async (input: UpsertCopilotAgentInput): Promise<CopilotAgent> => {
      if (!equipeId) throw new Error("Nenhuma equipe autenticada");

      const { scope, pipeline_id = null, ...patch } = input;

      // Find existing row matching (equipe_id, scope, pipeline_id).
      // For null pipeline_id we use .is() because .eq() does not match SQL NULL.
      const existing = (query.data ?? []).find(
        (a) =>
          a.scope === scope &&
          (pipeline_id === null ? a.pipeline_id === null : a.pipeline_id === pipeline_id),
      );

      if (existing) {
        // UPDATE existing row by primary key.
        const { data, error } = await sb
          .from(TABLE)
          .update({
            ...patch,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return data as CopilotAgent;
      } else {
        // INSERT new row.
        const { data, error } = await sb
          .from(TABLE)
          .insert({
            equipe_id: equipeId,
            scope,
            pipeline_id,
            name: patch.name ?? scope,
            system_prompt: patch.system_prompt ?? null,
            autonomy_mode: patch.autonomy_mode ?? "observe",
          })
          .select()
          .single();
        if (error) throw error;
        return data as CopilotAgent;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Configuração do copiloto salva!");
    },
    onError: (e: Error) =>
      toast.error("Erro ao salvar configuração do copiloto: " + e.message),
  });

  const bulkSetAutonomy = useMutation({
    mutationFn: async (mode: AutonomyMode) => {
      if (!equipeId) throw new Error("No equipe");
      const { data: existing } = await sb
        .from(TABLE)
        .select("id, scope, pipeline_id")
        .eq("equipe_id", equipeId);
      // Only update existing agents
      for (const agent of existing ?? []) {
        await sb
          .from(TABLE)
          .update({ autonomy_mode: mode, updated_at: new Date().toISOString() })
          .eq("id", agent.id);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    agents: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    upsert,
    bulkSetAutonomy,
  };
};
