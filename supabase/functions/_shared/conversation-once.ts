// ============================================================================
// SE-SUP1-4 (#9) — criar a conversa UMA vez.
//
// Dois webhooks (ou um webhook e um envio manual) que chegam juntos olham o
// banco, não acham conversa e inserem as duas: o inbox mostra a mesma pessoa
// em duas conversas e as mensagens ficam fatiadas (Solo, 05/10, 4 s de
// diferença). O índice parcial uq_conversations_active_lead_channel (migration
// 20261015000300) deixa só a primeira passar; aqui a perdedora pega a vencedora
// e aplica o que ela queria gravar — o mesmo padrão do 23505 em leads.
// ============================================================================

// deno-lint-ignore no-explicit-any
type Db = any;

// O que identifica a conversa, ou é contador do webhook: nunca regravado na
// vencedora (unread_count é incrementado por RPC separada).
const IDENTITY_COLUMNS = ["lead_id", "equipe_id", "channel", "status", "unread_count", "atendido_por_agente"];

export async function insertConversationOnce(
  supabase: Db,
  row: Record<string, unknown>,
): Promise<{ id: string; created: boolean }> {
  const { data, error } = await supabase.from("conversations").insert(row).select("id").single();
  if (!error) return { id: data.id as string, created: true };
  if ((error as { code?: string }).code !== "23505") throw error;

  const { data: winner } = await supabase
    .from("conversations")
    .select("id")
    .eq("lead_id", row.lead_id)
    .eq("channel", row.channel)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!winner) throw error;

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!IDENTITY_COLUMNS.includes(k) && v !== undefined && v !== null) patch[k] = v;
  }
  if (Object.keys(patch).length > 0) {
    await supabase.from("conversations").update(patch).eq("id", winner.id);
  }
  return { id: winner.id as string, created: false };
}
