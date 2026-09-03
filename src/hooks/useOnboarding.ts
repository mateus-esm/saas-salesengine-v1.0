import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";


/**
 * Sprint 8.2 — o quadro de onboarding.
 *
 * O processo entre "aceitou a proposta" e "está no ar" — discovery, treinamento
 * do agente, canais, CRM, integração de anúncios — não existia em lugar nenhum
 * do software. Vivia na cabeça do fundador, e um cliente parado há doze dias
 * esperando a reunião era invisível.
 */

export interface OnboardingStage {
  id: string;
  code: string;
  label: string;
  description: string | null;
  owner: "solo" | "cliente";
  sort_order: number;
  is_initial: boolean;
  is_terminal: boolean;
  active: boolean;
}

export interface OnboardingRow {
  id: string;
  proposal_id: string | null;
  equipe_id: string | null;
  stage_id: string;
  cliente_nome: string;
  golive_previsto: string | null;
  discovery_agendado_em: string | null;
  discovery_feito_em: string | null;
  went_live_at: string | null;
  health: "on_track" | "at_risk" | "blocked";
  blocked_reason: string | null;
  notes: string | null;
  entered_stage_at: string;
  created_at: string;
  /** Vem do join; o quadro mostra o valor para priorizar o que é maior. */
  monthly_value: number;
  contract_id: string | null;
  contract_status: string | null;
  /** Sprint 8.2 — cliente que já operava antes do onboarding existir. */
  is_legacy: boolean;
}

export interface OnboardingEvent {
  id: string;
  from_stage: string | null;
  to_stage: string;
  note: string | null;
  created_at: string;
}

const STAGES_KEY = ["onboarding-stages"] as const;
const CARDS_KEY = ["onboardings"] as const;

export function useOnboardingStages() {
  return useQuery({
    queryKey: STAGES_KEY,
    queryFn: async (): Promise<OnboardingStage[]> => {
      const { data, error } = await supabase
        .from("onboarding_stages")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as OnboardingStage[];
    },
    // As etapas mudam quase nunca; recarregá-las a cada foco é desperdício.
    staleTime: 5 * 60 * 1000,
  });
}

export function useOnboardings() {
  return useQuery({
    queryKey: CARDS_KEY,
    queryFn: async (): Promise<OnboardingRow[]> => {
      const { data, error } = await supabase
        .from("onboardings")
        .select(`
          id, proposal_id, equipe_id, stage_id, cliente_nome, golive_previsto,
          discovery_agendado_em, discovery_feito_em, went_live_at,
          health, blocked_reason, notes, entered_stage_at, created_at,
          proposals ( monthly_price ),
          equipes ( is_legacy, contracts ( id, status, current_period_end,
                                           contract_items ( unit_price, quantity, period ) ) )
        `)
        .order("entered_stage_at");
      if (error) throw error;


      return (data ?? []).map((row: any) => {
        // Um contrato cancelado não é o contrato "do" card: pegar o primeiro da
        // lista poria um contrato antigo no lugar do vivo depois de uma
        // renovação.
        const live = (row.equipes?.contracts ?? []).find((c: any) =>
          ["onboarding", "trialing", "active", "past_due", "suspended"].includes(c.status)
        );

        // Sprint 8.2 — o valor vem do CONTRATO, não da proposta.
        //
        // A Solo Energia aparecia como R$ 0 no quadro apesar de pagar R$ 200:
        // o card dela nasceu do backfill, sem `proposal_id`, e o valor era lido
        // de `proposals.monthly_price` por um join que não existia. O contrato é
        // a fonte honesta — é ele que diz o que está sendo cobrado hoje, e
        // sobrevive a uma proposta editada depois de assinada.
        //
        // A proposta continua como fallback: um card que ainda não virou
        // contrato (etapa 'aceite') só tem ela.
        const fromContract = (live?.contract_items ?? [])
          .filter((i: any) => i.period === "monthly")
          .reduce((s: number, i: any) => s + Number(i.unit_price) * Number(i.quantity ?? 1), 0);

        return {
          ...row,
          monthly_value: fromContract || Number(row.proposals?.monthly_price ?? 0),
          contract_id: live?.id ?? null,
          contract_status: live?.status ?? null,
          is_legacy: row.equipes?.is_legacy === true,
        } as OnboardingRow;
      });

    },
  });
}

export function useOnboardingEvents(onboardingId: string | null) {
  return useQuery({
    queryKey: ["onboarding-events", onboardingId],
    enabled: !!onboardingId,
    queryFn: async (): Promise<OnboardingEvent[]> => {
      const { data, error } = await supabase
        .from("onboarding_events")
        .select("id, from_stage, to_stage, note, created_at")
        .eq("onboarding_id", onboardingId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OnboardingEvent[];
    },
  });
}

/**
 * Move um card de etapa, com atualização otimista.
 *
 * Arrastar tem que parecer instantâneo — o quadro é usado para pensar, e uma
 * espera de 300ms a cada movimento faz o fundador parar de usar. Se o servidor
 * recusar, o `onError` devolve o estado anterior.
 */
export function useMoveStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stageId }: { id: string; stageId: string }) => {
      const { error } = await supabase
        .from("onboardings").update({ stage_id: stageId }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, stageId }) => {
      await qc.cancelQueries({ queryKey: CARDS_KEY });
      const previous = qc.getQueryData<OnboardingRow[]>(CARDS_KEY);
      qc.setQueryData<OnboardingRow[]>(CARDS_KEY, (old) =>
        (old ?? []).map((c) =>
          c.id === id
            ? { ...c, stage_id: stageId, entered_stage_at: new Date().toISOString() }
            : c
        )
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(CARDS_KEY, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: CARDS_KEY });
    },
  });
}

export function useUpdateOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<OnboardingRow> & { id: string }) => {
      const { error } = await supabase.from("onboardings").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CARDS_KEY });
    },
  });
}

export interface GoLiveResponse {
  success?: boolean;
  error?: string;
  missing?: ("doc" | "email")[];
  already_live?: boolean;
  status?: string;
  trial_ends_at?: string | null;
  trial_days?: number;
  setup_invoice_id?: string | null;
  charged?: boolean;
  warnings?: string[];
}

/**
 * Colocar no ar.
 *
 * Não é um `update` de etapa: dispara o trial, emite a cobrança da implantação
 * e avisa o cliente. Por isso passa pela edge function, que valida a cobrança
 * antes de qualquer efeito — e por isso arrastar um card para "Ativo" abre o
 * diálogo em vez de mover.
 */
export function useGoLive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      contract_id?: string;
      onboarding_id?: string;
      /** Correções da conta de cobrança. Gravadas pela função, não pelo navegador. */
      doc?: string;
      email?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("golive-tenant", { body: input });
      if (error) throw error;
      return data as GoLiveResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CARDS_KEY });
      qc.invalidateQueries({ queryKey: ["admin-proposals"] });
    },
  });
}

/** Dias corridos parados na etapa. É daqui que sai a cor do card. */
export function daysInStage(enteredAt: string): number {
  const ms = Date.now() - new Date(enteredAt).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/**
 * A cor do card.
 *
 * Cinco e dez dias não são números mágicos: uma implantação prevista para 21
 * dias tem seis etapas, então uma etapa que passa de cinco dias já está comendo
 * a folga, e dez dias significa que a previsão não vai ser cumprida.
 *
 * `blocked` é sempre vermelho, independente do tempo: um card bloqueado há uma
 * hora precisa de atenção tanto quanto um parado há duas semanas.
 */
export function cardUrgency(card: OnboardingRow): "ok" | "warn" | "late" {
  if (card.health === "blocked") return "late";
  const days = daysInStage(card.entered_stage_at);
  if (days > 10) return "late";
  if (days > 5 || card.health === "at_risk") return "warn";
  return "ok";
}
