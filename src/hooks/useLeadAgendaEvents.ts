import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

import type { AgendaEvent } from "./useAgendaEvents";

const sb = supabase as any;

/**
 * Sprint 11 · Onda 2 · T20 — one contact's agenda, for the deal modal.
 *
 * The modal used useAgendaEvents(), which loads every event of the team and was
 * filtered by lead in the browser — and the modal is mounted while closed, so
 * every Kanban and Table visit paid for it. This asks the server for the one
 * contact, only while `enabled` (the modal open and the section expanded).
 * The key sits under ["agenda_events"], so creating or removing an event in the
 * Agenda refreshes it too.
 */
export function useLeadAgendaEvents(leadId: string | null, enabled: boolean) {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  return useQuery({
    queryKey: ["agenda_events", equipeId, "lead", leadId],
    queryFn: async (): Promise<AgendaEvent[]> => {
      const { data, error } = await sb
        .from("agenda_events")
        .select("*")
        .eq("equipe_id", equipeId)
        .eq("lead_id", leadId)
        .is("deleted_at", null)
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgendaEvent[];
    },
    enabled: enabled && !!equipeId && !!leadId,
  });
}
