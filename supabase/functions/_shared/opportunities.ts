// ============================================================================
// Sprint 4 EPIC 0 — shared opportunity helpers for Edge Functions.
//
// Inbound writers (webhooks + AI agent) must stop writing lead.stage_id and
// instead create/resolve an Opportunity. This helper is the single source of
// truth for both flows.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Sprint 11: callers may still say 'aberto'/'ganho'/'perdido'; the database stores English. */
export type StageTypeInput = "open" | "won" | "lost" | "ciclo" | "aberto" | "ganho" | "perdido";

export function toDbStageType(t: StageTypeInput): "open" | "won" | "lost" | "ciclo" {
  switch (t) {
    case "aberto":
      return "open";
    case "ganho":
      return "won";
    case "perdido":
      return "lost";
    default:
      return t;
  }
}

export interface OpportunityLookupResult {
  opportunity_id: string;
  pipeline_id: string;
  stage_id: string;
  created: boolean;
}

/**
 * Find the Opportunity an inbound writer should target for a given contact.
 *
 * Resolution order:
 *   1. If the contact has an open (status='open') Opportunity — in `pipeline_id`
 *      when one is given — return the most recently updated one.
 *   2. Else, if `createIfMissing` is true, create a new Opportunity in the first
 *      open stage of `pipeline_id` (or of the equipe's `default_pipeline_id`)
 *      and return it.
 *   3. Else, return null — caller handles the "no opportunity yet" path.
 *
 * Sprint 11: the first-stage lookup asked for stage_type = 'aberto'. Sprint 6.8
 * reverted stage types to English and missed this file, so from 23/06 no inbound
 * lead became a deal (~300 leads never reached a Kanban). And an inbound webhook
 * configured for a specific pipeline had its leads created in the team default.
 */
export async function resolveActiveOpportunity(
  supabase: SupabaseClient,
  params: {
    equipe_id: string;
    lead_id: string;
    createIfMissing?: boolean;
    /** Target pipeline (e.g. the one an inbound webhook is configured for). Defaults to the team's. */
    pipeline_id?: string | null;
  },
): Promise<OpportunityLookupResult | null> {
  const { equipe_id, lead_id, createIfMissing = false, pipeline_id = null } = params;

  const findOpen = () => {
    let q = supabase
      .from("opportunities")
      .select("id, pipeline_id, stage_id")
      .eq("lead_id", lead_id)
      .eq("equipe_id", equipe_id)
      .eq("status", "open")
      .is("deleted_at", null);
    if (pipeline_id) q = q.eq("pipeline_id", pipeline_id);
    return q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  };

  // 1. Look for an existing open opportunity.
  const { data: existing, error: existingErr } = await findOpen();

  if (existingErr) {
    console.error("[opportunities] Erro buscando opportunity ativa:", existingErr);
    throw existingErr;
  }

  if (existing) {
    return {
      opportunity_id: existing.id,
      pipeline_id: existing.pipeline_id,
      stage_id: existing.stage_id,
      created: false,
    };
  }

  if (!createIfMissing) return null;

  // 2. Resolve the target pipeline (explicit, else the team default) + its
  //    first open stage.
  let target_pipeline_id = pipeline_id;
  if (!target_pipeline_id) {
    const { data: equipe, error: equipeErr } = await supabase
      .from("equipes")
      .select("default_pipeline_id")
      .eq("id", equipe_id)
      .maybeSingle();

    if (equipeErr) {
      console.error("[opportunities] Erro buscando equipe:", equipeErr);
      throw equipeErr;
    }
    target_pipeline_id = equipe?.default_pipeline_id ?? null;
  }

  if (!target_pipeline_id) {
    console.log("[opportunities] Equipe sem default_pipeline_id; pulando criação.");
    return null;
  }

  const { data: firstStage, error: stageErr } = await supabase
    .from("pipeline_stages_v2")
    .select("id, pipeline_id")
    .eq("pipeline_id", target_pipeline_id)
    .eq("equipe_id", equipe_id)
    .is("deleted_at", null)
    .eq("stage_type", "open")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (stageErr) {
    console.error("[opportunities] Erro buscando primeira stage:", stageErr);
    throw stageErr;
  }

  if (!firstStage) {
    console.warn(
      `[opportunities] Pipeline ${target_pipeline_id} não tem etapa 'open'; pulando criação.`,
    );
    return null;
  }

  // 3. Race-safe create: re-check open opportunity before insert, because two
  //    concurrent webhook deliveries may both reach this point.
  const { data: recheck } = await findOpen();

  if (recheck) {
    return {
      opportunity_id: recheck.id,
      pipeline_id: recheck.pipeline_id,
      stage_id: recheck.stage_id,
      created: false,
    };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("opportunities")
    .insert({
      equipe_id,
      lead_id,
      pipeline_id: target_pipeline_id,
      stage_id: firstStage.id,
      status: "open",
    })
    .select("id, pipeline_id, stage_id")
    .single();

  if (insertErr) {
    console.error("[opportunities] Erro criando opportunity:", insertErr);
    throw insertErr;
  }

  console.log(
    `[opportunities] Nova opportunity ${inserted.id} criada em pipeline ${target_pipeline_id}.`,
  );

  return {
    opportunity_id: inserted.id,
    pipeline_id: inserted.pipeline_id,
    stage_id: inserted.stage_id,
    created: true,
  };
}

/**
 * Resolve a target stage within a pipeline by stage_type + optional name hint.
 * Used by analyze-message to move opportunities on intents like SCHEDULED.
 *
 * Strategy:
 *   - Filter by pipeline + non-deleted + stage_type.
 *   - If nameHint is given, prefer an exact (case-insensitive) match.
 *   - Fall back to the lowest-position stage of that type.
 *
 * Sprint 11: callers pass 'aberto'/'ganho'/'perdido'; the database stores
 * 'open'/'won'/'lost'. Without the mapping this found nothing and every
 * intent-based move (meeting scheduled, won, lost) silently did nothing.
 */
export async function resolveStageByTypeAndName(
  supabase: SupabaseClient,
  params: {
    equipe_id: string;
    pipeline_id: string;
    stage_type: StageTypeInput;
    nameHint?: string | null;
  },
): Promise<{ id: string; name: string } | null> {
  const { equipe_id, pipeline_id, stage_type, nameHint } = params;

  const { data: stages, error } = await supabase
    .from("pipeline_stages_v2")
    .select("id, name, position")
    .eq("equipe_id", equipe_id)
    .eq("pipeline_id", pipeline_id)
    .is("deleted_at", null)
    .eq("stage_type", toDbStageType(stage_type))
    .order("position", { ascending: true });

  if (error) {
    console.error("[opportunities] Erro resolvendo stage:", error);
    throw error;
  }

  if (!stages || stages.length === 0) return null;

  if (nameHint) {
    const needle = nameHint.trim().toLowerCase();
    const match = stages.find((s) => (s.name || "").trim().toLowerCase() === needle);
    if (match) return { id: match.id, name: match.name };
  }

  return { id: stages[0].id, name: stages[0].name };
}
