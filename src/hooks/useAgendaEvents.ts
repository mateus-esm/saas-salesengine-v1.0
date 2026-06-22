import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface AgendaEvent {
  id: string;
  equipe_id: string;
  title: string;
  type: "meeting" | "compromisso" | "block";
  starts_at: string;
  ends_at: string;
  task_id: string | null;
  lead_id: string | null;
  notes: string | null;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export function useAgendaEvents() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const eventsQuery = useQuery({
    queryKey: ["agenda_events", equipeId],
    queryFn: async (): Promise<AgendaEvent[]> => {
      const { data } = await sb
        .from("agenda_events")
        .select("*")
        .eq("equipe_id", equipeId)
        .is("deleted_at", null)
        .order("starts_at", { ascending: true });
      return (data ?? []) as AgendaEvent[];
    },
    enabled: !!equipeId,
  });

  const createEvent = useMutation({
    mutationFn: async (event: {
      title: string;
      type: string;
      starts_at: string;
      ends_at: string;
      task_id?: string;
      lead_id?: string;
      notes?: string;
    }) => {
      await sb.from("agenda_events").insert({ equipe_id: equipeId, ...event });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda_events"] });
      toast.success("Evento criado");
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      await sb.from("agenda_events").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda_events"] });
      toast.success("Evento removido");
    },
  });

  return {
    events: eventsQuery.data ?? [],
    isLoading: eventsQuery.isLoading,
    createEvent,
    deleteEvent,
    refetch: eventsQuery.refetch,
  };
}
