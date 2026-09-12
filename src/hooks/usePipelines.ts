import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import type {
  Pipeline,
  CreatePipelineData,
  UpdatePipelineData,
  CustomFieldSchema,
} from "@/types/pipelines";

// Database types lag the new pipelines table until `supabase gen types` reruns
// post-migration. Single typed escape hatch — same pattern as useConversations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const TABLE = "pipelines";

interface PipelineRow {
  id: string;
  equipe_id: string;
  name: string;
  description: string | null;
  cadence_days: number | null;
  custom_fields_schema: CustomFieldSchema[] | null;
  card_field_ids: string[] | null;
  revenue_config: Record<string, unknown> | null;
  loss_reasons?: unknown;
  natures?: unknown;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Sprint 11 · T36 — every column the screens read must pass through here. The
// first version listed fields one by one and dropped `loss_reasons`: the Kanban's
// loss dialog and the stages editor always saw an empty list (0 of 504 lost deals
// had a reason in 11/09, with 7 pipelines configured).
export const normalizePipeline = (row: PipelineRow): Pipeline => ({
  id: row.id,
  equipe_id: row.equipe_id,
  name: row.name,
  description: row.description ?? null,
  cadence_days: row.cadence_days ?? null,
  custom_fields_schema: Array.isArray(row.custom_fields_schema)
    ? row.custom_fields_schema
    : [],
  card_field_ids: Array.isArray(row.card_field_ids) ? row.card_field_ids : [],
  revenue_config: row.revenue_config ?? {},
  loss_reasons: Array.isArray(row.loss_reasons) ? row.loss_reasons : [],
  natures: row.natures && typeof row.natures === "object" ? row.natures : {},
  icp_weights: (row as any).icp_weights ?? [],
  is_archived: !!row.is_archived,
  created_at: row.created_at,
  updated_at: row.updated_at,
  deleted_at: row.deleted_at ?? null,
});

export const usePipelines = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const query = useQuery({
    queryKey: ["pipelines", equipeId],
    queryFn: async (): Promise<Pipeline[]> => {
      if (!equipeId) return [];
      const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("equipe_id", equipeId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data || []) as PipelineRow[]).map(normalizePipeline);
    },
    enabled: !!equipeId,
  });

  // Realtime — pipeline metadata changes (rare, but keeps multi-tab tidy)
  useEffect(() => {
    if (!equipeId) return;
    const channel = sb
      .channel(`pipelines_updates_${equipeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE, filter: `equipe_id=eq.${equipeId}` },
        () => queryClient.invalidateQueries({ queryKey: ["pipelines", equipeId] }),
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [equipeId, queryClient]);

  const createPipeline = useMutation({
    mutationFn: async (input: CreatePipelineData): Promise<Pipeline> => {
      if (!equipeId) throw new Error("No equipe_id");
      const { data, error } = await sb
        .from(TABLE)
        .insert({
          equipe_id: equipeId,
          name: input.name,
          description: input.description ?? null,
          cadence_days: input.cadence_days ?? null,
          custom_fields_schema: input.custom_fields_schema ?? [],
          card_field_ids: input.card_field_ids ?? [],
          ...(input.natures ? { natures: input.natures } : {}),
        })
        .select()
        .single();
      if (error) throw error;

      if (input.stages?.length) {
        const { error: stagesError } = await sb.from("pipeline_stages_v2").insert(
          input.stages.map((stage) => ({
            equipe_id: equipeId,
            pipeline_id: data.id,
            name: stage.name,
            color: stage.color ?? "#64748b",
            position: stage.position,
            stage_type: stage.stage_type ?? "open",
            max_idle_hours: stage.max_idle_hours ?? null,
            max_interactions: stage.max_interactions ?? null,
            funnel_event: stage.funnel_event ?? null,
            description: stage.description ?? null,
          })),
        );
        if (stagesError) {
          // The line did not finish being created. Hide the fresh, empty parent
          // so a retry cannot leave an orphan in the user's pipeline list.
          await sb.from(TABLE).update({ deleted_at: new Date().toISOString() }).eq("id", data.id);
          throw stagesError;
        }
      }
      return normalizePipeline(data as PipelineRow);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipelines", equipeId] });
      toast.success("Pipeline criada!");
    },
    onError: (e: Error) => toast.error("Erro ao criar pipeline: " + e.message),
  });

  const updatePipeline = useMutation({
    mutationFn: async ({ id, ...patch }: UpdatePipelineData): Promise<Pipeline> => {
      const { data, error } = await sb
        .from(TABLE)
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return normalizePipeline(data as PipelineRow);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipelines", equipeId] });
    },
    onError: (e: Error) => toast.error("Erro ao atualizar pipeline: " + e.message),
  });

  const archivePipeline = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await sb
        .from(TABLE)
        .update({ is_archived: archived })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["pipelines", equipeId] });
      toast.success(vars.archived ? "Pipeline arquivada" : "Pipeline restaurada");
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });

  const deletePipeline = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from(TABLE)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipelines", equipeId] });
      toast.success("Pipeline excluída");
    },
    onError: (e: Error) => toast.error("Erro ao excluir: " + e.message),
  });

  const active = (query.data || []).filter((p) => !p.is_archived);
  const archived = (query.data || []).filter((p) => p.is_archived);

  return {
    pipelines: query.data || [],
    activePipelines: active,
    archivedPipelines: archived,
    isLoading: query.isLoading,
    error: query.error,
    createPipeline,
    updatePipeline,
    archivePipeline,
    deletePipeline,
    refetch: query.refetch,
  };
};
