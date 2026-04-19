import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import type {
  PipelineStageV2,
  CreateStageV2Data,
  UpdateStageV2Data,
} from "@/types/pipelines";

// Database types lag the new pipeline_stages_v2 table — same escape hatch as
// useConversations / usePipelines. Single line, single rule disable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const TABLE = "pipeline_stages_v2";

interface StageRow {
  id: string;
  equipe_id: string;
  pipeline_id: string;
  name: string;
  color: string | null;
  position: number | null;
  stage_type: string | null;
  created_at: string;
  deleted_at: string | null;
}

const normalize = (row: StageRow): PipelineStageV2 => ({
  id: row.id,
  equipe_id: row.equipe_id,
  pipeline_id: row.pipeline_id,
  name: row.name,
  color: row.color || "#64748b",
  position: row.position ?? 0,
  stage_type: (row.stage_type as PipelineStageV2["stage_type"]) || "open",
  created_at: row.created_at,
  deleted_at: row.deleted_at ?? null,
});

/**
 * Stages for a single pipeline. Pass `pipelineId = undefined` to get an empty
 * result without firing a query (useful while the user is selecting a pipeline).
 */
export const usePipelineStagesV2 = (pipelineId?: string) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const query = useQuery({
    queryKey: ["pipeline_stages_v2", equipeId, pipelineId],
    queryFn: async (): Promise<PipelineStageV2[]> => {
      if (!equipeId || !pipelineId) return [];
      const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("equipe_id", equipeId)
        .eq("pipeline_id", pipelineId)
        .is("deleted_at", null)
        .order("position", { ascending: true });
      if (error) throw error;
      return ((data || []) as StageRow[]).map(normalize);
    },
    enabled: !!equipeId && !!pipelineId,
  });

  const createStage = useMutation({
    mutationFn: async (input: CreateStageV2Data): Promise<PipelineStageV2> => {
      if (!equipeId) throw new Error("No equipe_id");
      const max = (query.data || []).reduce((m, s) => Math.max(m, s.position), 0);
      const { data, error } = await sb
        .from(TABLE)
        .insert({
          equipe_id: equipeId,
          pipeline_id: input.pipeline_id,
          name: input.name,
          color: input.color || "#64748b",
          position: input.position ?? max + 1,
          stage_type: input.stage_type || "open",
        })
        .select()
        .single();
      if (error) throw error;
      return normalize(data as StageRow);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline_stages_v2", equipeId, pipelineId] });
    },
    onError: (e: Error) => toast.error("Erro ao criar etapa: " + e.message),
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, ...patch }: UpdateStageV2Data) => {
      const { error } = await sb.from(TABLE).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline_stages_v2", equipeId, pipelineId] });
    },
    onError: (e: Error) => toast.error("Erro ao atualizar etapa: " + e.message),
  });

  const deleteStage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from(TABLE)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline_stages_v2", equipeId, pipelineId] });
    },
    onError: (e: Error) => toast.error("Erro ao excluir etapa: " + e.message),
  });

  const reorderStages = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // Sequential to keep DB position values monotonic and observable in UI.
      await Promise.all(
        orderedIds.map((id, idx) =>
          sb.from(TABLE).update({ position: idx + 1 }).eq("id", id),
        ),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline_stages_v2", equipeId, pipelineId] });
    },
    onError: (e: Error) => toast.error("Erro ao reordenar etapas: " + e.message),
  });

  return {
    stages: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    createStage,
    updateStage,
    deleteStage,
    reorderStages,
    refetch: query.refetch,
  };
};
