import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Sprint 4 EPIC 0 — default pipeline picker.
// The column lives on public.equipes. Reads go through a direct select
// (covered by the existing "Users can view their own team" policy); writes
// go through the set_default_pipeline RPC (SECURITY DEFINER, checks equipe).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const useDefaultPipeline = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const query = useQuery({
    queryKey: ["equipe_default_pipeline", equipeId],
    queryFn: async (): Promise<string | null> => {
      if (!equipeId) return null;
      const { data, error } = await sb
        .from("equipes")
        .select("default_pipeline_id")
        .eq("id", equipeId)
        .maybeSingle();
      if (error) throw error;
      return (data?.default_pipeline_id as string | null) ?? null;
    },
    enabled: !!equipeId,
  });

  const setDefault = useMutation({
    mutationFn: async (pipelineId: string | null) => {
      const { data, error } = await sb.rpc("set_default_pipeline", {
        p_pipeline_id: pipelineId,
      });
      if (error) throw error;
      return data as string | null;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["equipe_default_pipeline", equipeId] });
      toast.success(
        variables === null ? "Pipeline padrão removida" : "Pipeline padrão atualizada",
      );
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Erro ao salvar pipeline padrão";
      toast.error(msg);
    },
  });

  return {
    defaultPipelineId: query.data ?? null,
    isLoading: query.isLoading,
    setDefault,
  };
};
