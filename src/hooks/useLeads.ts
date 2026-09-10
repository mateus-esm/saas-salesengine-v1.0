import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Lead, CreateLeadData, UpdateLeadData } from "@/types/crm";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { createDebouncer } from "@/lib/debounce";

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

      // Sprint 11: every page — the API caps a query at 1,000 rows and Solo
      // Energia has 1,253 contacts. `id` breaks ties (many leads share a null
      // last_message_at), so pages cannot repeat or skip rows.
      return fetchAllPages<Lead>((from, to) =>
        sb
          .from("leads")
          .select("*")
          .eq("equipe_id", equipeId)
          .is("deleted_at", null)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, to),
      );
    },
    enabled: !!equipeId,
  });

  // Escutar atualizações na tabela Leads (Realtime)
  useEffect(() => {
    if (!equipeId) return;

    // Sprint 11: WhatsApp traffic updates last_message_at / unread_count all day,
    // and each change used to refetch every contact. Grouped: one refetch per
    // quiet second, at least one every 5 s under a constant stream.
    const refresh = createDebouncer(
      () => queryClient.invalidateQueries({ queryKey: ["leads", equipeId] }),
      1000,
      { maxWait: 5000 },
    );

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
        () => refresh.call(),
      )
      .subscribe();

    return () => {
      refresh.cancel();
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
          observations: leadData.observations,
          source: leadData.source || "Manual",
          origem: leadData.source || "Manual",
          origin: leadData.origin || "manual",
          creation_source: "manual",
          lead_type: "lead",
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
      toast.success("Contato criado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar contato: " + error.message);
    },
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateLeadData) => {
      // Sprint 4 EPIC 3 — identity-layer columns (personal_custom_data,
      // origin_category, origin_detail, contact_type, channel) flow through
      // the spread below since UpdateLeadData now includes them.
      const { data, error } = await sb
        .from("leads")
        .update({
          ...updateData,
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
      toast.success("Contato atualizado!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar contato: " + error.message);
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
      toast.success("Contato removido!");
    },
    onError: (error) => {
      toast.error("Erro ao remover contato: " + error.message);
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

/**
 * Sprint 11 — save / remove one contact without loading the whole contact base.
 *
 * The Kanban used useLeads() only to get these two mutations, which pulled every
 * lead of the team (capped at 1,000 rows) into memory on every visit. Invalidates
 * the single-lead cache and the board, so the card picks up the new name.
 */
export const useLeadMutations = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const invalidate = (leadId?: string) => {
    queryClient.invalidateQueries({ queryKey: ["leads", equipeId] });
    queryClient.invalidateQueries({ queryKey: ["board", equipeId] });
    if (leadId) queryClient.invalidateQueries({ queryKey: ["lead", leadId] });
  };

  const updateLead = useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateLeadData) => {
      const { data, error } = await sb
        .from("leads")
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      invalidate(vars.id);
      toast.success("Contato atualizado!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar contato: " + error.message);
    },
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from("leads")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      invalidate(id);
      toast.success("Contato removido!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao remover contato: " + error.message);
    },
  });

  return { updateLead, deleteLead };
};
