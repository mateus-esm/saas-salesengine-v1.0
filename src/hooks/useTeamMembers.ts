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

      // Sprint 11: a RLS de profiles só mostra o próprio profile, então a query
      // direta devolvia só o usuário logado para quem não é super admin.
      // crm_team_members() devolve a equipe inteira de quem chama, e só ela.
      // Os tipos gerados ainda não conhecem a RPC.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("crm_team_members");

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
