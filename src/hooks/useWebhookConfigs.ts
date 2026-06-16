import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { WebhookConfig, FieldMapping } from "@/types/webhook";

interface CreateWebhookData {
  name: string;
  url: string;
  trigger_event: string;
  headers?: Record<string, string>;
  active?: boolean;
  inbound_function?: string | null;
  pipeline_id?: string | null;
  field_mappings?: FieldMapping[];
}

interface UpdateWebhookData {
  id: string;
  name?: string;
  url?: string;
  trigger_event?: string;
  headers?: Record<string, string>;
  active?: boolean;
  inbound_function?: string | null;
  pipeline_id?: string | null;
  field_mappings?: FieldMapping[];
}

export const useWebhookConfigs = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const configsQuery = useQuery({
    queryKey: ["webhook-configs", equipeId],
    queryFn: async () => {
      if (!equipeId) return [];
      
      const { data, error } = await supabase
        .from("webhook_configs")
        .select("*")
        .eq("equipe_id", equipeId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as WebhookConfig[];
    },
    enabled: !!equipeId,
  });

  const createConfig = useMutation({
    mutationFn: async (configData: CreateWebhookData) => {
      if (!equipeId) throw new Error("No equipe_id");
      
      const { data, error } = await supabase
        .from("webhook_configs")
        .insert({
          equipe_id: equipeId,
          name: configData.name,
          url: configData.url,
          trigger_event: configData.trigger_event,
          headers: configData.headers || {},
          active: configData.active ?? true,
          inbound_function: configData.inbound_function ?? null,
          pipeline_id: configData.pipeline_id ?? null,
          field_mappings: configData.field_mappings ?? [],
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhook-configs", equipeId] });
      toast.success("Webhook configurado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao configurar webhook: " + error.message);
    },
  });

  const updateConfig = useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateWebhookData) => {
      const { data, error } = await supabase
        .from("webhook_configs")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhook-configs", equipeId] });
      toast.success("Webhook atualizado!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar webhook: " + error.message);
    },
  });

  const deleteConfig = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("webhook_configs")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhook-configs", equipeId] });
      toast.success("Webhook removido!");
    },
    onError: (error) => {
      toast.error("Erro ao remover webhook: " + error.message);
    },
  });

  return {
    configs: configsQuery.data || [],
    isLoading: configsQuery.isLoading,
    error: configsQuery.error,
    createConfig,
    updateConfig,
    deleteConfig,
    refetch: configsQuery.refetch,
  };
};
