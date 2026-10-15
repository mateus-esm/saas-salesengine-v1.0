// Sprint Suporte 1 · #8/#11 — duas pessoas no chat, nunca misturadas.
//
//   Responsável = dono da conta/negócio (leads.responsible_id / opportunities.owner_id)
//   Atendente   = quem está na conversa (conversations.responsible_id)
//
// Puro: a tela só desenha isto. O rótulo de ausência é diferente em cada papel
// para que "sem responsável" nunca seja lido como "sem atendente".

import type { Opportunity } from "@/types/pipelines";

export interface OwnershipSlot {
  id: string | null;
  name: string | null;
  label: string;
}

export interface ChatOwnership {
  responsible: OwnershipSlot;
  attendant: OwnershipSlot;
  /** Linha curta do cabeçalho da conversa. */
  compact: string;
}

function slot(
  id: string | null | undefined,
  nameOf: (id: string | null | undefined) => string | null,
  empty: string,
): OwnershipSlot {
  if (!id) return { id: null, name: null, label: empty };
  const name = nameOf(id);
  return { id, name, label: name ?? "Usuário removido" };
}

const firstName = (s: OwnershipSlot) => (s.name ? s.name.split(" ")[0] : s.label);

export function buildChatOwnership(args: {
  responsibleId: string | null | undefined;
  attendantId: string | null | undefined;
  nameOf: (id: string | null | undefined) => string | null;
}): ChatOwnership {
  const responsible = slot(args.responsibleId, args.nameOf, "Sem responsável");
  const attendant = slot(args.attendantId, args.nameOf, "Sem atendente");
  return {
    responsible,
    attendant,
    compact: `Resp.: ${firstName(responsible)} · Atend.: ${firstName(attendant)}`,
  };
}

/** O negócio que o painel do chat resume: o aberto, senão o primeiro. */
export function summarizeChatDeal(opps: Opportunity[]): Opportunity | null {
  return opps.find((o) => o.status === "open") ?? opps[0] ?? null;
}
