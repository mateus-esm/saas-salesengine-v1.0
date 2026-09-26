// ============================================================================
// SE-REV-005 — o lead já está em atendimento?
//
// Caso real (Casa Flow, 2026-09-26): a lead "Vale" mandou mensagem pelo
// WhatsApp às 00:42, conversou com o agente até 00:44 ("Até logo!") e o
// cadastro do formulário chegou às 00:50 — e o Rev mandou "Vi que você se
// cadastrou — posso te ajudar?" para quem já tinha sido atendida. Mesma coisa
// com "Ineida" às 01:01, com o agente respondendo no mesmo segundo.
//
// Sinal usado: mensagem do PRÓPRIO lead (messages.sender_type = 'customer')
// numa janela recente. `conversations.opened_at` NÃO serve: ele só é gravado
// quando o Rev abre a conversa, e nos dois casos acima estava nulo — a conversa
// tinha sido criada pela mensagem de entrada. Abertura repetida pelo Rev já é
// barrada pela chave de idempotência (lead:<id>).
//
// Janela de 24 h: é a janela de atendimento do WhatsApp — depois da última
// mensagem do cliente, a conversa está "aberta". Um lead que falou há um mês e
// se cadastra de novo hoje recebe a abertura normalmente.
// ============================================================================

export const IN_SERVICE_WINDOW_HOURS = 24;

export type InServiceCheck = {
  inService: boolean;
  lastCustomerMessageAt: string | null;
};

/** Decisão pura: última mensagem do cliente dentro da janela. */
export function isInService(
  lastCustomerMessageAt: string | null | undefined,
  now: Date,
  windowHours = IN_SERVICE_WINDOW_HOURS,
): boolean {
  if (!lastCustomerMessageAt) return false;
  const at = new Date(lastCustomerMessageAt).getTime();
  if (Number.isNaN(at)) return false;
  return now.getTime() - at <= windowHours * 3_600_000;
}

/**
 * Lê a última mensagem do lead. Erro de leitura NÃO libera o envio: devolve
 * `inService: true` com o erro, e quem chama registra o motivo — mandar a
 * abertura para quem pode estar conversando é o erro caro aqui.
 */
export async function checkLeadInService(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  leadId: string,
  now = new Date(),
): Promise<InServiceCheck & { error?: string }> {
  const { data, error } = await supabase
    .from("messages")
    .select("created_at")
    .eq("lead_id", leadId)
    .eq("sender_type", "customer")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return {
      inService: true,
      lastCustomerMessageAt: null,
      error: error.message ?? String(error),
    };
  }
  const last = (data?.created_at as string | undefined) ?? null;
  return { inService: isInService(last, now), lastCustomerMessageAt: last };
}
