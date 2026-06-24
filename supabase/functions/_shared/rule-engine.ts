// ============================================================================
// Sprint 4 EPIC 5 — Rule evaluation + action execution engine.
//
// Called by `analyze-message` after AI extraction. Evaluates each active
// trigger against the AI result and executes matching actions atomically.
// Each firing rule logs one `ai_decisions` row with `rule_id` set.
// ============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveStageByTypeAndName } from "./opportunities.ts";

// ─── Types (mirror src/types/pipelines.ts) ─────────────────────────────

interface AgentTriggerWhen {
  type: string;
  intent?: string;
  pattern?: string;
  is_regex?: boolean;
  media_type?: string;
  stage_id?: string;
  hours?: number;
  field_id?: string;
}

interface AgentAction {
  action: string;
  stage_type?: string;
  stage_name_hint?: string;
  status?: string;
  field_id?: string;
  key?: string;
  value?: unknown;
  touchpoint_type?: string;
  content_template?: string;
  title_template?: string;
  due_in_hours?: number;
  tag?: string;
  url?: string;
  body_template?: string;
}

interface AgentRule {
  id: string;
  name: string;
  when: AgentTriggerWhen;
  do: AgentAction[];
  active: boolean;
}

interface PipelineAgentRules {
  id: string;
  pipeline_id: string;
  triggers: AgentRule[];
  extraction_hints: string | null;
  auto_create_opportunity: boolean;
  auto_advance_stages: boolean;
  auto_extract_custom_fields: boolean;
  cooldown_minutes: number;
}

// ─── Evaluation context ────────────────────────────────────────────────

export interface RuleEvalContext {
  aiIntent: string;               // e.g. "SCHEDULED", "INTERESTED"
  newMessagesText: string;         // concatenated new messages for substring match
  mediaTypes: string[];            // media types from new messages (if any)
  previousCustomData: Record<string, unknown>;
  newCustomData: Record<string, unknown>;
  currentStageId: string | null;
}

export interface FiredRule {
  rule: AgentRule;
  ruleId: string;
}

// ─── Intent mapping (AI output → rule intent key) ──────────────────────

const INTENT_MAP: Record<string, string> = {
  SCHEDULED: "meeting_scheduled",
  INTERESTED: "interested",
  DISQUALIFIED: "disqualified",
  OBJECTION_PRICE: "objection_price",
  OBJECTION_TIMING: "objection_timing",
};

// ─── Evaluate triggers ─────────────────────────────────────────────────

/**
 * Check each active trigger against the AI result context.
 * Returns the list of rules whose trigger condition matched.
 *
 * Note: `stage_entered` and `idle_in_stage` are event/cron-driven and
 * cannot fire from a message analysis pass. They are skipped here —
 * Sprint 5 will wire them via DB triggers and scheduled functions.
 */
export function evaluateTriggers(
  rules: AgentRule[],
  ctx: RuleEvalContext,
): FiredRule[] {
  const fired: FiredRule[] = [];

  for (const rule of rules) {
    if (!rule.active) continue;

    const w = rule.when;
    let matched = false;

    switch (w.type) {
      case "intent_detected": {
        const normalizedIntent = INTENT_MAP[ctx.aiIntent] ?? ctx.aiIntent.toLowerCase();
        matched = normalizedIntent === w.intent;
        break;
      }

      case "message_contains": {
        const pattern = w.pattern ?? "";
        if (!pattern) break;
        if (w.is_regex) {
          try {
            matched = new RegExp(pattern, "i").test(ctx.newMessagesText);
          } catch {
            // Invalid regex — skip silently.
          }
        } else {
          matched = ctx.newMessagesText.toLowerCase().includes(pattern.toLowerCase());
        }
        break;
      }

      case "media_received": {
        matched = ctx.mediaTypes.includes(w.media_type ?? "");
        break;
      }

      case "custom_field_set": {
        const fieldId = w.field_id ?? "";
        if (!fieldId) break;
        const wasMissing =
          ctx.previousCustomData[fieldId] === undefined ||
          ctx.previousCustomData[fieldId] === null;
        const nowSet =
          ctx.newCustomData[fieldId] !== undefined &&
          ctx.newCustomData[fieldId] !== null;
        matched = wasMissing && nowSet;
        break;
      }

      // Event/cron-driven — cannot fire from message analysis.
      case "stage_entered":
      case "idle_in_stage":
        break;

      default:
        break;
    }

    if (matched) {
      fired.push({ rule, ruleId: rule.id });
    }
  }

  return fired;
}

// ─── Execute actions ───────────────────────────────────────────────────

export interface ActionContext {
  supabase: SupabaseClient;
  equipe_id: string;
  lead_id: string;
  opportunity_id: string;
  pipeline_id: string;
  contact_name?: string;
}

/**
 * Execute a list of actions from a fired rule. Mutations are applied
 * sequentially (not batched in a single RPC) because each action may
 * depend on the outcome of the previous one (e.g. move_stage then set_field).
 *
 * Returns a summary of applied operations for the audit log.
 */
export async function executeActions(
  actions: AgentAction[],
  ctx: ActionContext,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];

  for (const action of actions) {
    try {
      switch (action.action) {
        case "move_stage": {
          const target = await resolveStageByTypeAndName(ctx.supabase, {
            equipe_id: ctx.equipe_id,
            pipeline_id: ctx.pipeline_id,
            stage_type: (action.stage_type as "aberto" | "ganho" | "perdido" | "ciclo") ?? "aberto",
            nameHint: action.stage_name_hint,
          });
          if (target) {
            await ctx.supabase
              .from("opportunities")
              .update({ stage_id: target.id, stage_entered_at: new Date().toISOString() })
              .eq("id", ctx.opportunity_id);
            results.push({ action: "move_stage", stage: target.name });
          }
          break;
        }

        case "set_status": {
          const patch: Record<string, unknown> = { status: action.status };
          if (action.status === "won" || action.status === "lost") {
            patch.closed_at = new Date().toISOString();
          }
          await ctx.supabase
            .from("opportunities")
            .update(patch)
            .eq("id", ctx.opportunity_id);
          results.push({ action: "set_status", status: action.status });
          break;
        }

        case "set_field": {
          if (!action.field_id) break;
          // Fetch current custom_data, merge, write back.
          const { data: opp } = await ctx.supabase
            .from("opportunities")
            .select("custom_data")
            .eq("id", ctx.opportunity_id)
            .maybeSingle();
          const merged = {
            ...((opp?.custom_data as Record<string, unknown>) ?? {}),
            [action.field_id]: action.value,
          };
          await ctx.supabase
            .from("opportunities")
            .update({ custom_data: merged })
            .eq("id", ctx.opportunity_id);
          results.push({ action: "set_field", field_id: action.field_id });
          break;
        }

        case "set_contact_field": {
          if (!action.key) break;
          const { data: lead } = await ctx.supabase
            .from("leads")
            .select("personal_custom_data")
            .eq("id", ctx.lead_id)
            .maybeSingle();
          const merged = {
            ...((lead?.personal_custom_data as Record<string, unknown>) ?? {}),
            [action.key]: action.value,
          };
          await ctx.supabase
            .from("leads")
            .update({ personal_custom_data: merged })
            .eq("id", ctx.lead_id);
          results.push({ action: "set_contact_field", key: action.key });
          break;
        }

        case "add_touchpoint": {
          await ctx.supabase.from("touchpoints").insert({
            equipe_id: ctx.equipe_id,
            lead_id: ctx.lead_id,
            touchpoint_type: action.touchpoint_type ?? "note",
            content: interpolate(action.content_template ?? "", ctx),
            created_by: "ai_agent",
          });
          results.push({ action: "add_touchpoint" });
          break;
        }

        case "add_note": {
          await ctx.supabase.from("lead_activities").insert({
            lead_id: ctx.lead_id,
            equipe_id: ctx.equipe_id,
            activity_type: "note",
            content: interpolate(action.content_template ?? "", ctx),
          });
          results.push({ action: "add_note" });
          break;
        }

        case "create_task": {
          const due = action.due_in_hours
            ? new Date(Date.now() + action.due_in_hours * 3600_000).toISOString()
            : null;
          await ctx.supabase.from("tasks").insert({
            equipe_id: ctx.equipe_id,
            lead_id: ctx.lead_id,
            title: interpolate(action.title_template ?? "", ctx),
            due_date: due,
            status: "pending",
          });
          results.push({ action: "create_task" });
          break;
        }

        case "add_tag": {
          if (!action.tag) break;
          const { data: lead } = await ctx.supabase
            .from("leads")
            .select("tags")
            .eq("id", ctx.lead_id)
            .maybeSingle();
          const existing: string[] = Array.isArray(lead?.tags)
            ? (lead.tags as string[])
            : [];
          if (!existing.includes(action.tag)) {
            await ctx.supabase
              .from("leads")
              .update({ tags: [...existing, action.tag] })
              .eq("id", ctx.lead_id);
          }
          results.push({ action: "add_tag", tag: action.tag });
          break;
        }

        case "trigger_webhook": {
          if (!action.url) break;
          // Fire-and-forget — don't block the analysis pipeline.
          fetch(action.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "rule_triggered",
              equipe_id: ctx.equipe_id,
              lead_id: ctx.lead_id,
              opportunity_id: ctx.opportunity_id,
              pipeline_id: ctx.pipeline_id,
            }),
          }).catch((e) => console.error("[rule-engine] Webhook error:", e));
          results.push({ action: "trigger_webhook", url: action.url });
          break;
        }
      }
    } catch (e) {
      console.error(`[rule-engine] Action ${action.action} failed:`, e);
      results.push({ action: action.action, error: (e as Error).message });
    }
  }

  return results;
}

// ─── Template interpolation (simple) ───────────────────────────────────

function interpolate(template: string, ctx: ActionContext): string {
  return template
    .replace(/\{\{contact\.name\}\}/gi, ctx.contact_name ?? "")
    .replace(/\{\{lead_id\}\}/gi, ctx.lead_id)
    .replace(/\{\{opportunity_id\}\}/gi, ctx.opportunity_id);
}

// ─── Fetch rules for a pipeline ────────────────────────────────────────

export async function fetchPipelineAgentRules(
  supabase: SupabaseClient,
  pipelineId: string,
): Promise<PipelineAgentRules | null> {
  const { data, error } = await supabase
    .from("pipeline_agent_rules")
    .select("*")
    .eq("pipeline_id", pipelineId)
    .maybeSingle();

  if (error) {
    console.error("[rule-engine] Erro buscando agent rules:", error);
    return null;
  }

  if (!data) return null;

  return {
    id: data.id,
    pipeline_id: data.pipeline_id,
    triggers: Array.isArray(data.triggers) ? data.triggers : [],
    extraction_hints: data.extraction_hints ?? null,
    auto_create_opportunity: !!data.auto_create_opportunity,
    auto_advance_stages: data.auto_advance_stages !== false,
    auto_extract_custom_fields: data.auto_extract_custom_fields !== false,
    cooldown_minutes: data.cooldown_minutes ?? 3,
  };
}
