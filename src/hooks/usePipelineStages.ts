import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface PipelineStage {
  id: string;
  equipe_id: string;
  name: string;
  position: number;
  color: string;
  is_default: boolean;
  created_at: string;
}

export interface CreateStageData {
  name: string;
  color?: string;
  position?: number;
}

export interface UpdateStageData {
  id: string;
  name?: string;
  color?: string;
  position?: number;
  is_default?: boolean;
}

const DEFAULT_STAGES = [
  { name: "Novo Lead", color: "#6b7280", position: 1, is_default: true },
  { name: "Qualificação", color: "#f59e0b", position: 2, is_default: false },
  { name: "Reunião Agendada", color: "#3b82f6", position: 3, is_default: false },
  { name: "Proposta Enviada", color: "#8b5cf6", position: 4, is_default: false },
  { name: "Fechado", color: "#10b981", position: 5, is_default: false },
];

export const usePipelineStages = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const stagesQuery = useQuery({
    queryKey: ["pipeline_stages", equipeId],
    queryFn: async () => {
      if (!equipeId) {
        console.log("[usePipelineStages] No equipeId, returning empty array");
        return [];
      }
      
      console.log("[usePipelineStages] Fetching stages for equipe:", equipeId);
      
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("equipe_id", equipeId)
        .order("position", { ascending: true });

      if (error) {
        console.error("[usePipelineStages] Error fetching stages:", error);
        throw error;
      }
      
      console.log("[usePipelineStages] Fetched stages:", data?.length || 0);
      
      // If no stages exist, create default ones
      if (!data || data.length === 0) {
        console.log("[usePipelineStages] No stages found, creating defaults for equipe:", equipeId);
        
        const stagesToCreate = DEFAULT_STAGES.map(stage => ({
          ...stage,
          equipe_id: equipeId,
        }));

        const { data: createdStages, error: createError } = await supabase
          .from("pipeline_stages")
          .insert(stagesToCreate)
          .select();

        if (createError) {
          console.error("[usePipelineStages] Error creating default stages:", createError);
          toast.error("Erro ao criar etapas padrão: " + createError.message);
          return [];
        }

        console.log("[usePipelineStages] Created default stages:", createdStages?.length || 0);
        return (createdStages || []) as PipelineStage[];
      }

      return (data || []) as PipelineStage[];
    },
    enabled: !!equipeId,
  });

  const createStage = useMutation({
    mutationFn: async (stageData: CreateStageData) => {
      if (!equipeId) throw new Error("No equipe_id");
      
      // Get max position
      const maxPosition = stagesQuery.data?.reduce(
        (max, s) => Math.max(max, s.position),
        0
      ) || 0;

      const { data, error } = await supabase
        .from("pipeline_stages")
        .insert({
          ...stageData,
          equipe_id: equipeId,
          position: stageData.position ?? maxPosition + 1,
          color: stageData.color || "#6b7280",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline_stages", equipeId] });
      toast.success("Etapa criada!");
    },
    onError: (error) => {
      toast.error("Erro ao criar etapa: " + error.message);
    },
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateStageData) => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline_stages", equipeId] });
      toast.success("Etapa atualizada!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar etapa: " + error.message);
    },
  });

  const deleteStage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pipeline_stages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline_stages", equipeId] });
      toast.success("Etapa removida!");
    },
    onError: (error) => {
      toast.error("Erro ao remover etapa: " + error.message);
    },
  });

  const reorderStages = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, index) => 
        supabase
          .from("pipeline_stages")
          .update({ position: index + 1 })
          .eq("id", id)
      );
      
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline_stages", equipeId] });
    },
    onError: (error) => {
      toast.error("Erro ao reordenar: " + error.message);
    },
  });

  return {
    stages: stagesQuery.data || [],
    isLoading: stagesQuery.isLoading,
    error: stagesQuery.error,
    createStage,
    updateStage,
    deleteStage,
    reorderStages,
    refetch: stagesQuery.refetch,
  };
};