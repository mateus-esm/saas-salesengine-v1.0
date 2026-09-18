// Sprint 8.2 · discovery_q&a — o discovery visto do painel.
//
// Gerar o link devolve o token em claro UMA vez (depois só existe o hash), então
// quem chama copia na hora. Gerar de novo invalida o link antigo mas NÃO apaga
// resposta nenhuma: as respostas são da linha, não do link — reenviar para quem
// trocou de e-mail é seguro.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DiscoveryAnswers, DiscoveryQuestion } from "@/lib/discovery/types";

export interface DiscoveryRecord {
  answers: DiscoveryAnswers;
  progress: number;
  status: "draft" | "submitted";
  submitted_at: string | null;
  last_seen_at: string | null;
}

export function useDiscoveryQuestions() {
  return useQuery({
    queryKey: ["discovery-questions"],
    queryFn: async (): Promise<DiscoveryQuestion[]> => {
      const { data, error } = await supabase
        .from("discovery_questions").select("*").eq("active", true).order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as DiscoveryQuestion[];
    },
    // O banco de perguntas muda quase nunca; recarregá-lo a cada foco é desperdício.
    staleTime: 5 * 60 * 1000,
  });
}

export function useDiscoveryAnswers(onboardingId: string | null) {
  return useQuery({
    queryKey: ["discovery-answers", onboardingId],
    enabled: !!onboardingId,
    queryFn: async (): Promise<DiscoveryRecord | null> => {
      const { data, error } = await supabase
        .from("onboarding_discovery")
        .select("answers, progress, status, submitted_at, last_seen_at")
        .eq("onboarding_id", onboardingId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as DiscoveryRecord | null;
    },
  });
}

export function useEnsureDiscoveryLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (onboardingId: string): Promise<string> => {
      const { data, error } = await supabase.functions.invoke("admin-discovery-link", {
        body: { onboarding_id: onboardingId },
      });
      if (error) throw error;
      return (data as { url: string }).url;
    },
    onSuccess: (_url, onboardingId) => {
      qc.invalidateQueries({ queryKey: ["onboardings"] });
      qc.invalidateQueries({ queryKey: ["discovery-answers", onboardingId] });
    },
  });
}
