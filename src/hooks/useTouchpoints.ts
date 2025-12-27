import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useEffect } from "react";
import { Touchpoint } from "@/types/crm";

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
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["touchpoints", leadId] });
      toast.success("Touchpoint registrado!");
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
