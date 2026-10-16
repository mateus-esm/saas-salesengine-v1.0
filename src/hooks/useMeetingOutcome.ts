import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { outcomeErrorMessage, outcomeToast, type MeetingOutcome } from "@/lib/meetingOutcome";

// The generated types lag the new RPC until `supabase gen types` reruns.
const sb = supabase as any;

export interface MeetingOutcomeArgs {
  opportunityId?: string | null;
  agendaEventId?: string | null;
  /** null = desfazer (só com agendaEventId). */
  outcome: MeetingOutcome | null;
}

export interface MeetingOutcomeResult {
  funnel_event_id: number | null;
  opportunity_id: string | null;
  outcome: MeetingOutcome | null;
  already_recorded?: boolean;
}

/**
 * SE-SUP1-8 (#10) — "Realizada / No-show / Visita técnica", no card do negócio e
 * na agenda. Um só RPC (crm_record_meeting_outcome → record_funnel_event): a
 * agenda e o card não podem contar de jeitos diferentes.
 */
export function useMeetingOutcome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ opportunityId, agendaEventId, outcome }: MeetingOutcomeArgs): Promise<MeetingOutcomeResult> => {
      const { data, error } = await sb.rpc("crm_record_meeting_outcome", {
        p_opportunity_id: opportunityId ?? null,
        p_outcome: outcome,
        p_agenda_event_id: agendaEventId ?? null,
      });
      if (error) throw error;
      return data as MeetingOutcomeResult;
    },
    onSuccess: (r) => {
      toast.success(outcomeToast(r));
      // O atalho da agenda e todos os números que leem funnel_events.
      for (const key of ["agenda_events", "funnel_milestones", "funnel_overview", "funnel_series", "funnel_breakdown"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: (err) => toast.error(outcomeErrorMessage(err)),
  });
}
