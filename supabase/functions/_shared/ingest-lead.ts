// ============================================================================
// Sprint 17 — o núcleo de "um lead chegou por uma porta de entrada".
//
// Extraído da rota /inbound do crm-webhook (comportamento caracterizado em
// ingest-lead.test.ts) para que o formulário do Meta crie lead pelo MESMO
// caminho: identidade pelo telefone normalizado (o índice UNIQUE
// equipe + phone_normalized), atualização de quem volta, inserção de quem é novo.
// A porta Meta liga duas opções: e-mail como 2ª chave e observação acrescentada.
// ============================================================================

// deno-lint-ignore no-explicit-any
type Db = any;

export interface ExistingLead {
  id: string;
  custom_fields: Record<string, unknown> | null;
  tags: string[] | null;
  observations?: string | null;
}

/** Como o lead nasceu (colunas de procedência). */
export interface LeadOrigin {
  source: string;
  origem: string;
  creation_source: "webhook" | "form" | "import";
  created_by_type: "webhook" | "import";
}

export const INBOUND_WEBHOOK_ORIGIN: LeadOrigin = {
  source: "webhook_inbound",
  origem: "webhook",
  creation_source: "webhook",
  created_by_type: "webhook",
};

export const META_FORM_ORIGIN: LeadOrigin = {
  source: "meta_lead_ads",
  origem: "meta_lead_ads",
  creation_source: "form",
  created_by_type: "webhook",
};

/**
 * Sprint 11: o lead vivo da equipe pelo telefone, comparado como o índice UNIQUE
 * compara (normalize_phone_br). Se a RPC falhar, devolve null e o chamador segue
 * sem deduplicar em vez de derrubar a porta.
 */
export async function findLeadByPhone(db: Db, equipeId: string, phone: string, tag = "[ingest-lead]"): Promise<ExistingLead | null> {
  const { data: leadId, error } = await db.rpc("crm_find_lead_by_phone", { p_equipe_id: equipeId, p_phone: phone });
  if (error) {
    console.error(tag, "crm_find_lead_by_phone falhou; seguindo sem deduplicar:", error);
    return null;
  }
  if (!leadId) return null;
  const { data } = await db.from("leads").select("id, custom_fields, tags, observations").eq("id", leadId).maybeSingle();
  return (data as ExistingLead | null) ?? null;
}

async function findLeadByEmail(db: Db, equipeId: string, email: string): Promise<ExistingLead | null> {
  const { data } = await db
    .from("leads")
    .select("id, custom_fields, tags, observations")
    .eq("equipe_id", equipeId)
    .eq("email", email.trim().toLowerCase())
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as ExistingLead | null) ?? null;
}

export interface InboundLeadInput {
  equipeId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  tags?: string[] | null;
  observations?: string | null;
  custom_fields?: Record<string, unknown> | null;
  /** `source` do lead novo (padrão: o da origem). */
  source?: string | null;
  origin: LeadOrigin;
  /** Porta Meta: sem telefone conhecido, procura pelo e-mail. */
  matchEmail?: boolean;
  /** Porta Meta: a observação nova vai para o fim da antiga em vez de trocá-la. */
  appendObservations?: boolean;
  logPrefix?: string;
}

export type InboundLeadResult = { ok: true; leadId: string; isNew: boolean } | { ok: false; error: string };

export async function upsertInboundLead(db: Db, i: InboundLeadInput): Promise<InboundLeadResult> {
  const tag = i.logPrefix ?? "[ingest-lead]";
  const checkPhone = i.phone ? String(i.phone).replace(/\D/g, "") : null;

  let existing: ExistingLead | null = null;
  if (checkPhone) existing = await findLeadByPhone(db, i.equipeId, String(i.phone), tag);
  if (!existing && i.matchEmail && i.email) existing = await findLeadByEmail(db, i.equipeId, i.email);

  if (existing) {
    const update: Record<string, unknown> = {};
    if (i.email) update.email = i.email;
    if (i.observations) {
      const prev = (existing.observations ?? "").trim();
      update.observations = i.appendObservations && prev && !prev.includes(i.observations.trim())
        ? `${prev}\n\n${i.observations}`
        : i.appendObservations && prev.includes(i.observations.trim())
        ? prev
        : i.observations;
    }
    if (i.tags) update.tags = i.tags;
    update.custom_fields = { ...(existing.custom_fields ?? {}), ...(i.custom_fields ?? {}) };
    const { error } = await db.from("leads").update(update).eq("id", existing.id);
    if (error) console.error(tag, "Error updating existing lead:", error);
    return { ok: true, leadId: existing.id, isNew: false };
  }

  const row = {
    equipe_id: i.equipeId,
    name: i.name,
    email: i.email || null,
    phone: checkPhone || i.phone || null,
    source: i.source || i.origin.source,
    origem: i.origin.origem,
    creation_source: i.origin.creation_source,
    created_by_type: i.origin.created_by_type,
    atendido_por_agente: false,
    tags: i.tags || [],
    observations: i.observations || null,
    custom_fields: i.custom_fields || {},
  };
  const { data, error } = await db.from("leads").insert(row).select().single();
  if (error) {
    console.error(tag, "Error creating lead:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true, leadId: (data as { id: string }).id, isNew: true };
}
