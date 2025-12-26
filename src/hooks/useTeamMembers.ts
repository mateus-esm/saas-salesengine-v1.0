import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { TeamMember } from "@/types/crm";

export const useTeamMembers = () => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  const teamMembersQuery = useQuery({
    queryKey: ["team_members", equipeId],
    queryFn: async (): Promise<TeamMember[]> => {
      if (!equipeId) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome_completo, email")
        .eq("equipe_id", equipeId)
        .order("nome_completo");

      if (error) throw error;
      return (data || []) as TeamMember[];
    },
    enabled: !!equipeId,
  });

  return {
    teamMembers: teamMembersQuery.data || [],
    isLoading: teamMembersQuery.isLoading,
    error: teamMembersQuery.error,
    refetch: teamMembersQuery.refetch,
  };
};
