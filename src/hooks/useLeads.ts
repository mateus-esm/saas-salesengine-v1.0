import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Lead, CreateLeadData, UpdateLeadData } from "@/types/crm";

export type { Lead, CreateLeadData, UpdateLeadData } from "@/types/crm";

export const useLeads = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const leadsQuery = useQuery({
    queryKey: ["leads", equipeId],
    queryFn: async () => {
      if (!equipeId) return [];
      
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("equipe_id", equipeId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Lead[];
    },
    enabled: !!equipeId,
  });

  const createLead = useMutation({
    mutationFn: async (leadData: CreateLeadData) => {
      if (!equipeId) throw new Error("No equipe_id");
      
      const { data, error } = await supabase
        .from("leads")
        .insert({
          name: leadData.name,
          email: leadData.email,
          phone: leadData.phone,
          stage_id: leadData.stage_id,
          observations: leadData.observations,
          source: leadData.source || "manual",
          origem: leadData.source || "manual",
          opportunity_value: leadData.opportunity_value || 0,
          equipe_id: equipeId,
          atendido_por_agente: false,
          tags: leadData.tags || [],
          custom_fields: {},
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads", equipeId] });
      toast.success("Lead criado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar lead: " + error.message);
    },
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateLeadData) => {
      const { data, error } = await supabase
        .from("leads")
        .update({
          ...updateData,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads", equipeId] });
      toast.success("Lead atualizado!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar lead: " + error.message);
    },
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads", equipeId] });
      toast.success("Lead removido!");
    },
    onError: (error) => {
      toast.error("Erro ao remover lead: " + error.message);
    },
  });

  const moveLeadToStage = useMutation({
    mutationFn: async ({ leadId, stageId }: { leadId: string; stageId: string }) => {
      const { data, error } = await supabase
        .from("leads")
        .update({ stage_id: stageId, updated_at: new Date().toISOString() })
        .eq("id", leadId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads", equipeId] });
    },
    onError: (error) => {
      toast.error("Erro ao mover lead: " + error.message);
    },
  });

  return {
    leads: leadsQuery.data || [],
    isLoading: leadsQuery.isLoading,
    error: leadsQuery.error,
    createLead,
    updateLead,
    deleteLead,
    moveLeadToStage,
    refetch: leadsQuery.refetch,
  };
};
