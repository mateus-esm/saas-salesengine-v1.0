// SE-TEAMACCESS-001 — as regras de quem pode mexer em quem, sem I/O.
// Ficam fora da edge function para serem testáveis sem Supabase.

export type AppRole = "user" | "admin" | "owner" | "super_admin";

/** O dono só concede estes dois. Owner e super_admin não se dão por aqui. */
export const ASSIGNABLE_ROLES = ["user", "admin"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function isAssignableRole(role: unknown): role is AssignableRole {
  return typeof role === "string" &&
    (ASSIGNABLE_ROLES as readonly string[]).includes(role);
}

export type TargetCheck =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Pode o chamador alterar ESTE membro?
 *
 * Recusa a si mesmo (o dono que se restringe tranca a própria equipe para fora)
 * e qualquer owner/super_admin (o fundador tem conta em equipes de cliente e o
 * cliente não pode tirá-lo de lá).
 */
export function checkTarget(
  callerId: string,
  targetId: string,
  targetRole: AppRole,
): TargetCheck {
  if (callerId === targetId) {
    return { ok: false, status: 403, error: "Você não pode alterar o próprio acesso" };
  }
  if (targetRole === "owner" || targetRole === "super_admin") {
    return { ok: false, status: 403, error: "Este usuário não pode ser alterado por aqui" };
  }
  return { ok: true };
}

/** Papel mais alto de uma lista (um usuário pode ter mais de uma linha). */
export function highestRole(roles: string[]): AppRole {
  const rank: Record<string, number> = { user: 1, admin: 2, owner: 3, super_admin: 4 };
  let best: AppRole = "user";
  for (const r of roles) {
    if ((rank[r] ?? 0) > rank[best]) best = r as AppRole;
  }
  return best;
}

/** Mapeia a exceção do trigger de assentos para um erro que o dono entende. */
export function seatErrorMessage(message: string | undefined): string | null {
  if (!message || !/seat_limit_reached/.test(message)) return null;
  return "Limite de usuários do plano atingido. Restrinja alguém ou faça upgrade.";
}
