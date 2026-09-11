// Sprint 11 · Onda 2 — the team, by id, for everything that shows a person
// (deal owner, "Usuário" fields). One cached request (crm_team_members), shared by
// every screen.

import { useCallback, useMemo } from "react";

import { useTeamMembers } from "@/hooks/useTeamMembers";

export interface Member {
  id: string;
  name: string;
  email: string;
}

export function useMemberDirectory() {
  const { teamMembers, isLoading } = useTeamMembers();

  const members = useMemo<Member[]>(
    () =>
      teamMembers
        .map((m) => ({
          id: m.id,
          name: m.nome_completo?.trim() || m.email?.split("@")[0] || "Sem nome",
          email: m.email ?? "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [teamMembers],
  );

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  const nameOf = useCallback(
    (id: string | null | undefined): string | null => (id ? byId.get(id) ?? null : null),
    [byId],
  );

  return { members, nameOf, isLoading };
}
