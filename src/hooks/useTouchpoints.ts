import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useEffect } from "react";
import { Touchpoint } from "@/types/crm";

// Sprint 5.2 T3: cadence lookups traverse opportunities -> pipelines.cadence_days.
// Same escape hatch used across the CRM hooks while generated nested types lag.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/**
 * Sprint 5.2 T3 — Cadence Shift Linkage.
 *
 * Resolves the lead's active pipeline cadence and, when set, atomically pushes
 * `leads.next_contact` to `today + cadence_days`. Done here (not via a prop on
 * TouchpointsList) so the touchpoint callers — including T10's
 * OpportunityDetailModal in the same wave — stay untouched.
 */
async function applyCadenceShift(leadId: string): Promise<boolean> {
  const { data: opp } = await sb
    .from("opportunities")
    .select("pipeline_id")
    .eq("lead_id", leadId)
    .is("deleted_at", null)
    .neq("status", "lost")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!opp?.pipeline_id) return false;

  const { data: pipeline } = await sb
    .from("pipelines")
    .select("cadence_days")
    .eq("id", opp.pipeline_id)
    .maybeSingle();

  const cadenceDays = pipeline?.cadence_days ?? null;
  if (!cadenceDays || cadenceDays <= 0) return false;

  // Local-date formatting to match the rest of the CRM (avoids TZ drift).
  const next = new Date();
  next.setDate(next.getDate() + cadenceDays);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");

  const { error } = await sb
    .from("leads")
    .update({ next_contact: `${year}-${month}-${day}` })
    .eq("id", leadId);

  return !error;
}

export interface CreateTouchpointData {
  lead_id: string;
  touchpoint_type: 'call' | 'email' | 'whatsapp' | 'meeting' | 'note';
  content: string;
  contact_date?: string;
}

export const useTouchpoints = (leadId?: string) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const touchpointsQuery = useQuery({
    queryKey: ["touchpoints", leadId],
    queryFn: async () => {
      if (!leadId) return [];
      
      const { data, error } = await supabase
        .from("touchpoints")
        .select("*")
        .eq("lead_id", leadId)
        .order("contact_date", { ascending: false });

      if (error) {
        console.error("[useTouchpoints] Error fetching:", error);
        throw error;
      }
      
      return (data || []) as Touchpoint[];
    },
    enabled: !!leadId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!leadId) return;

    const channel = supabase
      .channel(`touchpoints-${leadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'touchpoints',
          filter: `lead_id=eq.${leadId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["touchpoints", leadId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId, queryClient]);

  const createTouchpoint = useMutation({
    mutationFn: async (data: CreateTouchpointData) => {
      if (!profile?.id) throw new Error("Usuário não autenticado");

      const { data: result, error } = await supabase
        .from("touchpoints")
        .insert({
          lead_id: data.lead_id,
          user_id: profile.id,
          touchpoint_type: data.touchpoint_type,
          content: data.content,
          contact_date: data.contact_date || new Date().toISOString().split('T')[0],
        })
        .select()
        .single();

      if (error) throw error;

      // T3: fire the cadence calculator immediately after the touchpoint lands.
      const cadenceShifted = await applyCadenceShift(data.lead_id);

      return { result, cadenceShifted };
    },
    onSuccess: ({ cadenceShifted }) => {
      queryClient.invalidateQueries({ queryKey: ["touchpoints", leadId] });
      // Refresh card/grid surfaces so the new next_contact paints right away.
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      toast.success(cadenceShifted ? "Touchpoint registrado — próximo contato atualizado!" : "Touchpoint registrado!");
    },
    onError: (error) => {
      toast.error("Erro ao registrar: " + error.message);
    },
  });

  const deleteTouchpoint = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("touchpoints")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["touchpoints", leadId] });
      toast.success("Touchpoint removido!");
    },
    onError: (error) => {
      toast.error("Erro ao remover: " + error.message);
    },
  });

  return {
    touchpoints: touchpointsQuery.data || [],
    isLoading: touchpointsQuery.isLoading,
    error: touchpointsQuery.error,
    createTouchpoint,
    deleteTouchpoint,
    refetch: touchpointsQuery.refetch,
  };
};
