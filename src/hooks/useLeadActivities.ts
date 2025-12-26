import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface LeadActivity {
  id: string;
  lead_id: string;
  user_id: string | null;
  tipo: string;
  descricao: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CreateActivityData {
  lead_id: string;
  tipo: string;
  descricao?: string;
  metadata?: Record<string, unknown>;
}

export const useLeadActivities = (leadId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const activitiesQuery = useQuery({
    queryKey: ["lead_activities", leadId],
    queryFn: async () => {
      if (!leadId) return [];
      
      const { data, error } = await supabase
        .from("lead_activities")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as LeadActivity[];
    },
    enabled: !!leadId,
  });

  const createActivity = useMutation({
    mutationFn: async (activityData: CreateActivityData) => {
      const { data, error } = await supabase
        .from("lead_activities")
        .insert({
          lead_id: activityData.lead_id,
          tipo: activityData.tipo,
          descricao: activityData.descricao || null,
          user_id: user?.id || null,
          metadata: activityData.metadata || {},
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead_activities", leadId] });
    },
    onError: (error) => {
      toast.error("Erro ao registrar atividade: " + error.message);
    },
  });

  return {
    activities: activitiesQuery.data || [],
    isLoading: activitiesQuery.isLoading,
    error: activitiesQuery.error,
    createActivity,
    refetch: activitiesQuery.refetch,
  };
};