import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SERVICE_WINDOW_MS } from "@/lib/service-window";
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
  /**
   * SE-REV-006 — preenchido quando a conversa vive numa instância Solo API,
   * que é uma conexão NÃO OFICIAL (janela sempre aberta).
   */
  solo_instance_id: string | null;
  last_message_at: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  lead: ConversationLeadSlice | null;
}

/**
 * SE-REV-006 — `conversationId → ISO da última mensagem DO CLIENTE dentro das
 * 24 h`. É o único sinal de relógio que a janela do WhatsApp OFICIAL usa.
 *
 * Antes cada consumidor calculava o próprio corte com um sinal diferente: o
 * header varria as mensagens da conversa aberta e a sidebar comparava
 * `conversations.last_message_at` — que o envio do time também empurra (ver
 * send-chat-message). Agora os dois leem daqui.
 */
export type CustomerWindowSignal = Record<string, string>;

/** Busca as mensagens de cliente das últimas 24 h e reduz para a mais recente
 *  por conversa. A RLS de `messages` já limita o resultado à equipe do usuário,
 *  então não é preciso enumerar ids de conversa. */
async function fetchCustomerWindowSignal(): Promise<CustomerWindowSignal> {
  const since = new Date(Date.now() - SERVICE_WINDOW_MS).toISOString();
  const { data, error } = await sb
    .from("messages")
    .select("conversation_id, created_at")
    .eq("sender_type", "customer")
    .gte("created_at", since)
    .not("conversation_id", "is", null);
  if (error) throw error;

  const latest: CustomerWindowSignal = {};
  for (const row of (data ?? []) as {
    conversation_id: string | null;
    created_at: string | null;
  }[]) {
    const id = row.conversation_id;
    if (!id || !row.created_at) continue;
    if (!latest[id] || Date.parse(row.created_at) > Date.parse(latest[id])) {
      latest[id] = row.created_at;
    }
  }
  return latest;
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

  // A chave repete o prefixo ["conversations", equipeId] de propósito: toda
  // invalidação que já existe (realtime de mensagens e as mutations) alcança
  // este query por prefixo, então o sinal de janela anda junto com a lista.
  const customerWindowQuery = useQuery({
    queryKey: ["conversations", equipeId, "customer-window-signal"],
    queryFn: fetchCustomerWindowSignal,
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

  // Sprint 5.5 1.2 — Multi-Select Demolition.
  // Bulk actions used to loop N round trips ("await updateStatus.mutateAsync"
  // per id), which felt sluggish and could partially fail. Now one PATCH
  // with `.in('id', ids)` covers the whole selection. Optimistic update
  // removes the rows from cache so they vanish from the viewport before the
  // network round-trip resolves; we roll back on error.
  const bulkUpdateStatus = useMutation({
    mutationFn: async ({
      ids,
      status,
    }: {
      ids: string[];
      status: ConversationStatus;
    }) => {
      if (ids.length === 0) return;
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
        .in("id", ids);
      if (error) throw error;
    },
    onMutate: async ({ ids, status }) => {
      await queryClient.cancelQueries({ queryKey: ["conversations", equipeId] });
      const previous = queryClient.getQueryData<Conversation[]>([
        "conversations",
        equipeId,
      ]);
      if (previous) {
        const idSet = new Set(ids);
        const next = previous.map((c) =>
          idSet.has(c.id) ? { ...c, status } : c,
        );
        queryClient.setQueryData(["conversations", equipeId], next);
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["conversations", equipeId], ctx.previous);
      }
      toast.error("Erro ao atualizar conversas");
    },
    onSuccess: (_data, vars) => {
      const label: Record<ConversationStatus, string> = {
        active: "reabertas",
        archived: "arquivadas",
        deleted: "removidas",
      };
      const n = vars.ids.length;
      toast.success(`${n} conversa${n > 1 ? "s" : ""} ${label[vars.status]}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations", equipeId] });
    },
  });

  const bulkMarkRead = useMutation({
    mutationFn: async ({ ids }: { ids: string[] }) => {
      if (ids.length === 0) return;
      const { error } = await sb
        .from("conversations")
        .update({ unread_count: 0 })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["conversations", equipeId] });
      const n = vars.ids.length;
      toast.success(`${n} conversa${n > 1 ? "s" : ""} marcada${n > 1 ? "s" : ""} como lida${n > 1 ? "s" : ""}`);
    },
    onError: () => toast.error("Erro ao marcar como lida"),
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

  const markRead = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await sb
        .from("conversations")
        .update({ unread_count: 0 })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations", equipeId] });
    },
    onError: () => toast.error("Erro ao marcar como lida"),
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
    /**
     * SE-REV-006 — sinal de janela por conversa. Vazio enquanto carrega ou se a
     * leitura falhar: conversa oficial aparece fechada, nunca aberta por
     * engano.
     */
    lastCustomerMessageAtByConversation: customerWindowQuery.data || {},
    isLoading: conversationsQuery.isLoading,
    refetch: conversationsQuery.refetch,
    updateStatus,
    bulkUpdateStatus,
    assignResponsible,
    toggleHandoff,
    markRead,
    bulkMarkRead,
  };
};
