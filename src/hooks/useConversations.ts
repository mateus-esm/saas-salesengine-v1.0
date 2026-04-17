import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Database types lag the new conversations table until `supabase gen types` reruns post-migration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/**
 * Epic 1 — Relational Inbox.
 * A conversation is a distinct session between a lead and the team/AI.
 * One lead → many conversations. Status lifecycle: active | archived | deleted.
 */
export type ConversationStatus = "active" | "archived" | "deleted";

export interface ConversationLeadSlice {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  profile_picture: string | null;
  tags: string[] | null;
  lead_type: string | null;
  source: string | null;
  origem: string | null;
  stage_id: string | null;
  opportunity_value: number | null;
  observations: string | null;
  assigned_to: string | null;
  created_at: string | null;
}

export interface Conversation {
  id: string;
  lead_id: string;
  equipe_id: string;
  channel: string;
  status: ConversationStatus;
  responsible_id: string | null;
  atendido_por_agente: boolean;
  agent_name: string | null;
  gpt_maker_chat_id: string | null;
  last_message_at: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  lead: ConversationLeadSlice | null;
}

export const useConversations = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const conversationsQuery = useQuery({
    queryKey: ["conversations", equipeId],
    queryFn: async (): Promise<Conversation[]> => {
      if (!equipeId) return [];

      const { data, error } = await sb
        .from("conversations")
        .select(
          `
          *,
          lead:leads!inner(
            id, name, phone, email, profile_picture, tags, lead_type,
            source, origem, stage_id, opportunity_value, observations,
            assigned_to, created_at
          )
        `
        )
        .eq("equipe_id", equipeId)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (error) throw error;
      return (data || []) as unknown as Conversation[];
    },
    enabled: !!equipeId,
  });

  useEffect(() => {
    if (!equipeId) return;

    const invalidate = () =>
      queryClient.invalidateQueries({ queryKey: ["conversations", equipeId] });

    const channel = supabase
      .channel(`conversations_updates_${equipeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `equipe_id=eq.${equipeId}`,
        },
        invalidate
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        invalidate
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "leads",
          filter: `equipe_id=eq.${equipeId}`,
        },
        invalidate
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [equipeId, queryClient]);

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: ConversationStatus;
    }) => {
      const patch: Record<string, unknown> = { status };
      if (status === "archived") patch.archived_at = new Date().toISOString();
      if (status === "deleted") patch.deleted_at = new Date().toISOString();
      if (status === "active") {
        patch.archived_at = null;
        patch.deleted_at = null;
      }
      const { error } = await sb
        .from("conversations")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["conversations", equipeId] });
      const label: Record<ConversationStatus, string> = {
        active: "Conversa reaberta",
        archived: "Conversa arquivada",
        deleted: "Conversa removida",
      };
      toast.success(label[vars.status]);
    },
    onError: () => toast.error("Erro ao atualizar conversa"),
  });

  const assignResponsible = useMutation({
    mutationFn: async ({
      id,
      responsibleId,
    }: {
      id: string;
      responsibleId: string | null;
    }) => {
      const { error } = await sb
        .from("conversations")
        .update({ responsible_id: responsibleId })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations", equipeId] });
    },
    onError: () => toast.error("Erro ao atribuir responsável"),
  });

  const toggleHandoff = useMutation({
    mutationFn: async ({
      id,
      isHuman,
    }: {
      id: string;
      isHuman: boolean;
    }) => {
      const { error } = await sb
        .from("conversations")
        .update({ atendido_por_agente: isHuman })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations", equipeId] });
    },
    onError: () => toast.error("Erro ao alternar atendimento"),
  });

  return {
    conversations: conversationsQuery.data || [],
    isLoading: conversationsQuery.isLoading,
    refetch: conversationsQuery.refetch,
    updateStatus,
    assignResponsible,
    toggleHandoff,
  };
};
