import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { toast } from "sonner";

export interface AgendaEvent {
  id: string;
  equipe_id: string;
  title: string;
  type: string;
  starts_at: string;
  ends_at: string;
  task_id: string | null;
  lead_id: string | null;
  notes: string | null;
  created_at: string;
  // SE-SUP1-8 (#10): o desfecho marcado (só atalho de UI; a contagem vem de
  // funnel_events) e o negócio da reunião. Ausentes antes da migration 000700.
  opportunity_id?: string | null;
  outcome?: "done" | "no_show" | "technical_visit" | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function useAgendaEvents(loadEvents = true) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const eventsQuery = useQuery({
    queryKey: ["agenda_events", equipeId],
    queryFn: async (): Promise<AgendaEvent[]> => {
      return fetchAllPages<AgendaEvent>((from, to) => sb.from("agenda_events").select("*")
        .eq("equipe_id", equipeId).is("deleted_at", null)
        .order("starts_at").order("id").range(from, to));
    },
    enabled: loadEvents && !!equipeId,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["agenda_events"] });
    queryClient.invalidateQueries({ queryKey: ["deal_timeline"] });
  };
  const saveEvent = useMutation({
    mutationFn: async ({ id, ...fields }: Pick<AgendaEvent,"title"|"type"|"starts_at"|"ends_at"|"notes"|"lead_id"|"opportunity_id"> & { id?: string }) => {
      const table = sb.from("agenda_events");
      const query = id ? table.update(fields).eq("id",id).eq("equipe_id",equipeId).is("deleted_at",null)
        : table.insert({ ...fields, equipe_id: equipeId });
      const { error } = await query.select("id").single();
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Evento salvo"); },
  });
  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("agenda_events").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("equipe_id", equipeId).select("id").single();
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Evento removido"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return {
    events: eventsQuery.data ?? [],
    isLoading: eventsQuery.isLoading,
    saveEvent,
    deleteEvent,
    refetch: eventsQuery.refetch,
  };
}
