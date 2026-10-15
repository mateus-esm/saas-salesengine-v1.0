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

/**
 * O Responsável exibido é o dono do negócio ABERTO (opportunities.owner_id), o que
 * as métricas e a comissão seguem. leads.responsible_id só vale quando não há
 * negócio aberto — senão o chat mostraria um dono que o pipeline não reconhece.
 */
export function resolveResponsibleId(
  opps: Pick<Opportunity, "status" | "owner_id" | "lead_id">[],
  leadResponsibleId: string | null | undefined,
  leadId: string | null | undefined,
): string | null {
  // Só negócios DESTE contato: uma lista sem filtro de lead não pode emprestar dono.
  const open = leadId ? opps.find((o) => o.lead_id === leadId && o.status === "open") : undefined;
  return open ? open.owner_id ?? null : leadResponsibleId ?? null;
}

/** Quantos negócios abertos mudariam de dono ao atribuir `userId`. */
export function countDealsToReassign(
  opps: Pick<Opportunity, "status" | "owner_id" | "lead_id">[],
  userId: string | null,
  leadId: string | null | undefined,
): number {
  if (!leadId) return 0;
  return opps.filter((o) => o.lead_id === leadId && o.status === "open" && (o.owner_id ?? null) !== userId).length;
}

/** Aviso antes de confirmar; null quando só um negócio (ou nenhum) muda. */
export function reassignNotice(count: number): string | null {
  return count > 1 ? `${count} negócios abertos terão o responsável alterado` : null;
}

/** Códigos das RPCs de responsável/atendente em mensagem para a pessoa. */
export function ownershipErrorMessage(err: unknown, fallback: string): string {
  const msg = String((err as { message?: string } | null)?.message ?? err ?? "");
  if (msg.includes("owner_not_in_team")) return "Essa pessoa não pertence à equipe.";
  if (msg.includes("lead_not_found")) return "Contato não encontrado.";
  if (msg.includes("conversation_not_found")) return "Conversa não encontrada.";
  if (msg.includes("not_authenticated")) return "Sessão expirada. Entre novamente.";
  return fallback;
}
