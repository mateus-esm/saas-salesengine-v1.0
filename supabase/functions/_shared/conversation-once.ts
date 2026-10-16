// ============================================================================
// SE-SUP1-4 (#9) — criar (ou reabrir) a conversa UMA vez.
//
// Dois webhooks (ou um webhook e um envio manual) que chegam juntos olham o
// banco, não acham conversa e inserem as duas: o inbox mostra a mesma pessoa
// em duas conversas e as mensagens ficam fatiadas (Solo, 05/10, 4 s de
// diferença). O índice parcial uq_conversations_active_lead_channel (migration
// 20261015000300) deixa só a primeira passar; aqui a perdedora pega a vencedora
// e aplica o que ela queria gravar — o mesmo padrão do 23505 em leads.
//
// Reabrir uma arquivada (status -> 'active') colide com o mesmo índice quando já
// existe outra ativa: updateConversationOnce re-aponta para a ativa.
// ============================================================================

// deno-lint-ignore no-explicit-any
type Db = any;

// Identidade e contadores: nunca regravados na vencedora (unread_count é
// incrementado por RPC separada).
const IDENTITY_COLUMNS = ["lead_id", "equipe_id", "channel", "status", "unread_count", "atendido_por_agente"];
// A vencedora já foi aberta por alguém: quem abriu primeiro continua valendo.
const OPENING_COLUMNS = ["opened_at", "opened_via", "archived_at"];

const later = (a?: string | null, b?: string | null): string | null =>
  a && b ? (new Date(a) >= new Date(b) ? a : b) : (a ?? b ?? null);

async function findActive(supabase: Db, leadId: unknown, channel: unknown) {
  const { data } = await supabase
    .from("conversations")
    .select("id, last_message_at")
    .eq("lead_id", leadId)
    .eq("channel", channel)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data as { id: string; last_message_at: string | null } | null;
}

async function patchWinner(
  supabase: Db,
  winner: { id: string; last_message_at: string | null },
  row: Record<string, unknown>,
) {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (IDENTITY_COLUMNS.includes(k) || OPENING_COLUMNS.includes(k)) continue;
    if (v !== undefined && v !== null) patch[k] = v;
  }
  // Uma mensagem atrasada não pode fazer a conversa "voltar no tempo".
  if (patch.last_message_at !== undefined) {
    patch.last_message_at = later(winner.last_message_at, patch.last_message_at as string);
  }
  if (Object.keys(patch).length > 0) {
    await supabase.from("conversations").update(patch).eq("id", winner.id);
  }
}

export async function insertConversationOnce(
  supabase: Db,
  row: Record<string, unknown>,
): Promise<{ id: string; created: boolean }> {
  const { data, error } = await supabase.from("conversations").insert(row).select("id").single();
  if (!error) return { id: data.id as string, created: true };
  if ((error as { code?: string }).code !== "23505") throw error;

  const winner = await findActive(supabase, row.lead_id, row.channel);
  if (!winner) throw error;
  await patchWinner(supabase, winner, row);
  return { id: winner.id, created: false };
}

/**
 * UPDATE de uma conversa existente (inclui reabrir arquivada). Se o UPDATE
 * colidir com a conversa ativa do mesmo (lead, canal), aplica o patch nela e
 * devolve o id dela. Outros erros sobem.
 */
export async function updateConversationOnce(
  supabase: Db,
  conversationId: string,
  patch: Record<string, unknown>,
  key: { lead_id: string; channel: string },
): Promise<string> {
  const { error } = await supabase.from("conversations").update(patch).eq("id", conversationId);
  if (!error) return conversationId;
  if ((error as { code?: string }).code !== "23505") throw error;

  const winner = await findActive(supabase, key.lead_id, key.channel);
  if (!winner) throw error;
  await patchWinner(supabase, winner, { ...patch, lead_id: key.lead_id, channel: key.channel });
  return winner.id;
}
