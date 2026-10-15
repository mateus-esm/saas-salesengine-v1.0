// Sprint Suporte 1 · #8/#11 — os dois verbos do chat.
//
//   useSetResponsible  crm_set_responsible: lead + negócios abertos juntos
//   useSetAttendant    crm_set_attendant: a conversa
//
// Nenhum dos dois escreve em tabela direto: a regra de equipe e a coerência
// lead/negócio moram na RPC (migration 20261015000200).

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

// As RPCs novas ainda não estão em types.ts (mesmo escape de useConversations).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function useSetResponsible() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, userId }: { leadId: string; userId: string | null }) => {
      const { data, error } = await sb.rpc("crm_set_responsible", { p_lead: leadId, p_user: userId });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      for (const key of ["leads", "opportunities", "board", "conversations"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      toast.success(vars.userId ? "Responsável atualizado" : "Responsável removido");
    },
    onError: () => toast.error("Erro ao atribuir responsável"),
  });
}

export function useSetAttendant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, userId }: { conversationId: string; userId: string | null }) => {
      const { error } = await sb.rpc("crm_set_attendant", { p_conversation: conversationId, p_user: userId });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(vars.userId ? "Atendente atualizado" : "Atendente removido");
    },
    onError: () => toast.error("Erro ao atribuir atendente"),
  });
}
