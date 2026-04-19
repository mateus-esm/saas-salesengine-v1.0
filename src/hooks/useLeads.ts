import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Lead, CreateLeadData, UpdateLeadData } from "@/types/crm";

export type { Lead, CreateLeadData, UpdateLeadData } from "@/types/crm";

// Sprint 3 EPIC 1 added `origin` + `deleted_at` to leads. Generated types lag
// the migration until `supabase gen types` reruns. Same pattern as useConversations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

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
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (error) throw error;
      return (data || []) as Lead[];
    },
    enabled: !!equipeId,
  });

  // Escutar atualizações na tabela Leads (Realtime)
  useEffect(() => {
    if (!equipeId) return;

    const channel = supabase
      .channel(`leads_updates_${equipeId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "leads",
          filter: `equipe_id=eq.${equipeId}`
        },
        () => {
          // Quando o banco atualizar (ex: Webhook alterar o last_message_at ou unread_count), refetch!
          queryClient.invalidateQueries({ queryKey: ["leads", equipeId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [equipeId, queryClient]);

  const createLead = useMutation({
    mutationFn: async (leadData: CreateLeadData) => {
      if (!equipeId) throw new Error("No equipe_id");
      
      const { data, error } = await sb
        .from("leads")
        .insert({
          name: leadData.name,
          email: leadData.email,
          phone: leadData.phone,
          stage_id: leadData.stage_id,
          observations: leadData.observations,
          source: leadData.source || "Manual",
          origem: leadData.source || "Manual",
          origin: leadData.origin || "manual",
          creation_source: "manual",
          lead_type: "lead",
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
      const { data, error } = await sb
        .from("leads")
        .update({
          ...updateData,
          custom_fields: updateData.custom_fields,
          updated_at: new Date().toISOString(),
        })
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
      // Soft-delete (Sprint 3 EPIC 1 convention). Hard-deletes are reserved
      // for admin tooling and would also cascade through opportunities.
      const { error } = await sb
        .from("leads")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
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
