// ============================================================================
// Sprint 4 EPIC 0 — shared opportunity helpers for Edge Functions.
//
// Inbound writers (webhooks + AI agent) must stop writing lead.stage_id and
// instead create/resolve an Opportunity. This helper is the single source of
// truth for both flows.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

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
 *   1. If the contact has an open (status='open') Opportunity, return the
 *      most recently updated one.
 *   2. Else, if `createIfMissing` is true AND the equipe has a
 *      `default_pipeline_id`, create a new Opportunity in that pipeline's
 *      first open stage and return it.
 *   3. Else, return null — caller handles the "no opportunity yet" path.
 */
export async function resolveActiveOpportunity(
  supabase: SupabaseClient,
  params: {
    equipe_id: string;
    lead_id: string;
    createIfMissing?: boolean;
  },
): Promise<OpportunityLookupResult | null> {
  const { equipe_id, lead_id, createIfMissing = false } = params;

  // 1. Look for an existing open opportunity.
  const { data: existing, error: existingErr } = await supabase
    .from("opportunities")
    .select("id, pipeline_id, stage_id")
    .eq("lead_id", lead_id)
    .eq("equipe_id", equipe_id)
    .eq("status", "open")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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

  // 2. Resolve the tenant's default pipeline + its first open stage.
  const { data: equipe, error: equipeErr } = await supabase
    .from("equipes")
    .select("default_pipeline_id")
    .eq("id", equipe_id)
    .maybeSingle();

  if (equipeErr) {
    console.error("[opportunities] Erro buscando equipe:", equipeErr);
    throw equipeErr;
  }

  const default_pipeline_id = equipe?.default_pipeline_id;
  if (!default_pipeline_id) {
    console.log("[opportunities] Equipe sem default_pipeline_id; pulando criação.");
    return null;
  }

  const { data: firstStage, error: stageErr } = await supabase
    .from("pipeline_stages_v2")
    .select("id, pipeline_id")
    .eq("pipeline_id", default_pipeline_id)
    .eq("equipe_id", equipe_id)
    .is("deleted_at", null)
    .eq("stage_type", "aberto")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (stageErr) {
    console.error("[opportunities] Erro buscando primeira stage:", stageErr);
    throw stageErr;
  }

  if (!firstStage) {
    console.warn(
      `[opportunities] Pipeline default ${default_pipeline_id} não tem stage 'aberto'; pulando criação.`,
    );
    return null;
  }

  // 3. Race-safe create: re-check open opportunity before insert, because two
  //    concurrent webhook deliveries may both reach this point.
  const { data: recheck } = await supabase
    .from("opportunities")
    .select("id, pipeline_id, stage_id")
    .eq("lead_id", lead_id)
    .eq("equipe_id", equipe_id)
    .eq("status", "open")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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
      pipeline_id: default_pipeline_id,
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
    `[opportunities] Nova opportunity ${inserted.id} criada em pipeline ${default_pipeline_id}.`,
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
 *   - Filter by pipeline + non-deleted + stage_type (aberto/ganho/perdido).
 *   - If nameHint is given, prefer an exact (case-insensitive) match.
 *   - Fall back to the lowest-position stage of that type.
 */
export async function resolveStageByTypeAndName(
  supabase: SupabaseClient,
  params: {
    equipe_id: string;
    pipeline_id: string;
    stage_type: "aberto" | "ganho" | "perdido" | "ciclo";
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
    .eq("stage_type", stage_type)
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
