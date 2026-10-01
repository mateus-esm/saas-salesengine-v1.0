import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * SE-TEAMACCESS-001 — usuários e permissões da própria equipe (só o dono).
 *
 * Leitura por RPC (a RLS de profiles só mostra o próprio perfil); escrita pela
 * edge function `team-access`, que é quem valida papel, equipe e limite de plano.
 */

export type MemberRole = "user" | "admin" | "owner" | "super_admin";
export type AccessStatus = "active" | "restricted";

export interface TeamAccessMember {
  user_id: string;
  email: string | null;
  nome_completo: string;
  role: MemberRole;
  access_status: AccessStatus;
  last_sign_in_at: string | null;
  is_me: boolean;
}

export interface SeatUsage {
  used: number;
  /** null = sem plano, sem limite. */
  limit: number | null;
  can_add: boolean;
}

export interface TeamAccessOverview {
  equipe_id: string;
  seats: SeatUsage;
  members: TeamAccessMember[];
}

export type TeamAccessAction =
  | { action: "add"; email: string; password: string; full_name?: string; role: "user" | "admin" }
  | { action: "set_role"; user_id: string; role: "user" | "admin" }
  | { action: "set_access"; user_id: string; access: AccessStatus };

/** A edge function devolve { error } em non-2xx; o SDK esconde isso atrás de uma mensagem genérica. */
async function invokeTeamAccess(payload: TeamAccessAction) {
  const { data, error } = await supabase.functions.invoke("team-access", { body: payload });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const parsed = ctx ? await ctx.json() : null;
      if (parsed?.error) message = parsed.error;
    } catch {
      // mantém a mensagem genérica
    }
    throw new Error(message);
  }
  if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
  return data;
}

export function useTeamAccess(enabled = true) {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const queryClient = useQueryClient();
  const queryKey = ["team_access", equipeId];

  const query = useQuery({
    queryKey,
    enabled: enabled && !!equipeId,
    staleTime: 15_000,
    queryFn: async (): Promise<TeamAccessOverview> => {
      // Os tipos gerados ainda não conhecem a RPC.
      const { data, error } = await (supabase as any).rpc("team_access_overview");
      if (error) throw error;
      return data as TeamAccessOverview;
    },
  });

  const mutation = useMutation({
    mutationFn: invokeTeamAccess,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      // O assento muda o que a tela de plano mostra.
      queryClient.invalidateQueries({ queryKey: ["entitlements", equipeId] });
      queryClient.invalidateQueries({ queryKey: ["team_members", equipeId] });
    },
  });

  return {
    overview: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    run: mutation.mutateAsync,
    isMutating: mutation.isPending,
  };
}
