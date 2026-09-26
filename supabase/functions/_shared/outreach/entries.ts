// ============================================================================
// SE-REV-005 — quais portas (crm_entries) podem disparar outreach.
//
// A consulta já era do time e só de portas ativas. O que aparecia de errado na
// tela era outra coisa: porta `webhook` cujo webhook foi APAGADO. A FK
// crm_entries.webhook_config_id é `on delete set null`, então apagar o webhook
// deixa a porta viva, ativa e com o mesmo nome — mas nenhum lead chega mais por
// ela (o crm-webhook acha a porta por webhook_config_id). Na Casa Flow isso
// deixou duas "Meta ADS - Cadastro" no Select, uma sem tráfego nenhum.
//
// Regra: porta do time, ativa, de um tipo que abre conversa, e — se for
// webhook — com webhook_configs existente, ativo e do mesmo time. Somente
// leitura: a porta órfã não é apagada nem desativada aqui.
// ============================================================================

export const OUTREACH_ENTRY_KINDS = ["webhook", "import", "manual"] as const;

const KIND_LABEL: Record<string, string> = {
  webhook: "Webhook",
  import: "Importação",
  manual: "Manual",
};

type WebhookConfigRef = {
  id: string;
  active: boolean | null;
  equipe_id: string;
};

export type EntryRow = {
  id: string;
  name: string | null;
  kind: string;
  active: boolean | null;
  equipe_id: string;
  webhook_config_id: string | null;
  // PostgREST devolve objeto (FK muitos-para-um); o tipo inferido pelo
  // supabase-js é array. Aceita os dois.
  webhook_config?: WebhookConfigRef | WebhookConfigRef[] | null;
};

export type HiddenReason =
  | "inactive"
  | "kind_not_allowed"
  | "webhook_deleted"
  | "webhook_inactive"
  | "webhook_other_team";

export type EligibleEntry = {
  id: string;
  name: string;
  kind: string;
  label: string;
};
export type HiddenEntry = {
  id: string;
  name: string;
  kind: string;
  reason: HiddenReason;
};

export function entryHiddenReason(
  row: EntryRow,
  equipeId: string,
): HiddenReason | null {
  if (!(OUTREACH_ENTRY_KINDS as readonly string[]).includes(row.kind)) {
    return "kind_not_allowed";
  }
  if (row.active !== true) return "inactive";
  if (row.kind === "webhook") {
    const config = (Array.isArray(row.webhook_config)
      ? row.webhook_config[0]
      : row.webhook_config) ?? null;
    if (!row.webhook_config_id || !config) {
      return "webhook_deleted";
    }
    if (config.equipe_id !== equipeId) {
      return "webhook_other_team";
    }
    if (config.active !== true) {
      return "webhook_inactive";
    }
  }
  return null;
}

/**
 * Separa as portas que aparecem no Select das que ficam de fora (com motivo),
 * e dá a cada porta visível um rótulo único: nome + tipo e, se ainda houver
 * repetição, o começo do id.
 */
export function classifyEntries(
  rows: EntryRow[],
  equipeId: string,
): { entries: EligibleEntry[]; hidden: HiddenEntry[] } {
  const visible: Array<Omit<EligibleEntry, "label">> = [];
  const hidden: HiddenEntry[] = [];
  for (const row of rows) {
    if (row.equipe_id !== equipeId) continue;
    const name = (row.name ?? "").trim() || "Sem nome";
    const reason = entryHiddenReason(row, equipeId);
    if (reason) {
      // Tipos que nunca disparam outreach (WhatsApp, agente) não são "ocultos"
      // por defeito — só não se aplicam. Não poluem o aviso da tela.
      if (reason !== "kind_not_allowed") {
        hidden.push({ id: row.id, name, kind: row.kind, reason });
      }
      continue;
    }
    visible.push({ id: row.id, name, kind: row.kind });
  }
  const base = (e: { name: string; kind: string }) =>
    `${e.name} (${KIND_LABEL[e.kind] ?? e.kind})`;
  const count = new Map<string, number>();
  for (const e of visible) count.set(base(e), (count.get(base(e)) ?? 0) + 1);
  const entries = visible
    .map((e) => ({
      ...e,
      label: (count.get(base(e)) ?? 0) > 1
        ? `${base(e)} · ${e.id.slice(0, 8)}`
        : base(e),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  return { entries, hidden };
}

/** Ids pedidos que não estão entre as portas elegíveis do time. */
export function ineligibleEntryIds(
  requested: string[],
  entries: EligibleEntry[],
): string[] {
  const ok = new Set(entries.map((e) => e.id.toLowerCase()));
  return requested.filter((id) => !ok.has(id.toLowerCase()));
}

/** Colunas para `.select()` com o webhook embutido pela FK. */
export const ENTRY_SELECT =
  "id, name, kind, active, equipe_id, webhook_config_id, webhook_config:webhook_configs(id, active, equipe_id)";

/** Lê e classifica as portas do time (service role). */
export async function loadTeamEntries(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  equipeId: string,
): Promise<{ entries: EligibleEntry[]; hidden: HiddenEntry[] }> {
  const { data, error } = await supabase.from("crm_entries").select(
    ENTRY_SELECT,
  )
    .eq("equipe_id", equipeId).order("name");
  if (error) throw error;
  return classifyEntries((data ?? []) as EntryRow[], equipeId);
}
