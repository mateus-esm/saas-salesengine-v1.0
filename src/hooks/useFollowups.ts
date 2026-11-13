// Sprint 15b · T3 — follow-ups agendados de um negócio.
//
// Leitura: crm_followups (RLS: o time lê). Escrita: só pelas RPCs
// crm_schedule_followup e crm_cancel_followup. Os tipos gerados ainda não
// conhecem a tabela nem as RPCs, por isso `sb` sem tipo (padrão do projeto).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { followupErrorMessage, type Followup, type FollowupChannel, type FollowupKind } from "@/lib/followups";

const sb = supabase as any;

export const followupKeys = {
  all: ["followups"] as const,
  list: (opportunityId: string | null) => ["followups", opportunityId] as const,
  line: (equipeId: string | null | undefined) => ["outreach_line", equipeId ?? null] as const,
};

export function useFollowups(opportunityId: string | null) {
  return useQuery({
    queryKey: followupKeys.list(opportunityId),
    enabled: !!opportunityId,
    queryFn: async (): Promise<Followup[]> => {
      const { data, error } = await sb
        .from("crm_followups")
        .select("*")
        .eq("opportunity_id", opportunityId)
        .order("due_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Followup[];
    },
  });
}

export interface ScheduleFollowupInput {
  opportunityId: string;
  dueAt: string;
  kind?: FollowupKind;
  ownerId?: string | null;
  reason?: string | null;
  notifyOwner?: boolean;
  sendMessage?: boolean;
  messageText?: string | null;
  returnStageId?: string | null;
}

export function useScheduleFollowup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ScheduleFollowupInput): Promise<Followup> => {
      const { data, error } = await sb.rpc("crm_schedule_followup", {
        p_opportunity_id: input.opportunityId,
        p_due_at: input.dueAt,
        p_kind: input.kind ?? "manual",
        p_owner_id: input.ownerId ?? null,
        p_reason: input.reason ?? null,
        p_notify_owner: input.notifyOwner ?? true,
        p_send_message: input.sendMessage ?? false,
        p_message_text: input.sendMessage ? input.messageText ?? null : null,
        p_return_stage_id: input.returnStageId ?? null,
      });
      if (error) throw error;
      return data as Followup;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: followupKeys.all });
      toast.success("Follow-up agendado");
    },
    onError: (error: unknown) => toast.error(followupErrorMessage(error)),
  });
}

export function useCancelFollowup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (followupId: string): Promise<Followup> => {
      const { data, error } = await sb.rpc("crm_cancel_followup", { p_followup_id: followupId });
      if (error) throw error;
      return data as Followup;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: followupKeys.all });
      toast.success("Follow-up cancelado");
    },
    onError: (error: unknown) => toast.error(followupErrorMessage(error)),
  });
}

export interface OutreachLine {
  hasLine: boolean;
  /** Nome da instância Solo (só Solo; outros provedores: null); null se não der para saber. */
  label: string | null;
  isLoading: boolean;
}

/**
 * A linha de WhatsApp do time (conversation_opener_settings). Mesma regra da
 * RPC: vale `solo_instance_id` ou um `channel_id` não vazio.
 */
export function useOutreachLine(): OutreachLine {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id ?? null;
  const query = useQuery({
    queryKey: followupKeys.line(equipeId),
    enabled: !!equipeId,
    staleTime: 60_000,
    queryFn: async (): Promise<{ hasLine: boolean; label: string | null }> => {
      const { data, error } = await sb
        .from("conversation_opener_settings")
        .select("provider, channel_id, solo_instance_id")
        .eq("equipe_id", equipeId)
        .maybeSingle();
      if (error) throw error;
      const soloId: string | null = data?.solo_instance_id ?? null;
      const channelId: string = (data?.channel_id ?? "").trim();
      const hasLine = !!soloId || channelId !== "";
      if (!hasLine) return { hasLine: false, label: null };
      if (soloId) {
        const { data: inst } = await sb
          .from("wpp_instances")
          .select("display_name, instance_name")
          .eq("id", soloId)
          .maybeSingle();
        return { hasLine: true, label: inst?.display_name || inst?.instance_name || null };
      }
      return { hasLine: true, label: null };
    },
  });
  return { hasLine: query.data?.hasLine ?? false, label: query.data?.label ?? null, isLoading: query.isLoading };
}
