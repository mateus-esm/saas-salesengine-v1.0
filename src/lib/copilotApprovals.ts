// SE-COPILOT-002 — the pipeline's approval queue, in the same words as the home's.
//
// The pipeline panel is fed by `ai_decisions` (useCopilotApprovals), not by
// `crm_copilot_feed`: the row shapes differ, so the panel cannot hand the rows
// straight to the shared queue. This module is the one translation layer —
// it mirrors exactly what `crm_copilot_feed` selects for its `pending` list
// (`output_action->>'label'`, `output_action->>'why'`, `input_summary as
// reason`, `confidence_score`, the contact's name) so the pipeline queue and
// the home queue read the same.

import { formatCopilotActivity } from "@/lib/copilotActivity";
import { formatDisplayName } from "@/lib/displayName";
import type { BulkResolveSummary, FeedItem } from "@/lib/copilotFeed";
import type { AiDecision } from "@/hooks/useCopilotApprovals";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/**
 * The queue without the intent-only guard rows written by the Intent Omission
 * Guard: `intent_detected === true` with no verb/action key. Those are not
 * actionable — approving them would mean nothing. OpportunityCard's badge (T8)
 * reads them independently.
 */
export function actionableDecisions(decisions: AiDecision[] | undefined): AiDecision[] {
  return (decisions ?? []).filter((decision) => {
    const payload = asRecord(decision.output_action);
    const intentOnly =
      !!payload?.intent_detected && payload?.verb == null && payload?.action == null;
    return !intentOnly;
  });
}

/** One pending decision, in the shape the shared queue and copilotFeed read. */
export function decisionToQueueItem(decision: AiDecision): FeedItem {
  const payload = asRecord(decision.output_action);
  const contact = decision.lead
    ? formatDisplayName(decision.lead.name, decision.lead.phone)
    : null;

  return {
    id: decision.id,
    status: decision.status,
    at: decision.created_at,
    // The stored sentence is already written for a person; formatCopilotActivity
    // is the fallback for the legacy payloads that never carried one.
    label: formatCopilotActivity(decision.output_action, {
      leadName: contact ?? "este negócio",
    }).title,
    why: asText(payload?.why),
    reason: decision.input_summary,
    confidence: decision.confidence_score,
    opportunity_id: decision.opportunity_id ?? "",
    pipeline_id: decision.pipeline_id,
    contact,
  };
}

/**
 * Fold a bulk round into one summary. The bulk runs N parallel calls of
 * `resolveApproval` (the python-agent endpoint the individual card already
 * used), each of which rejects on a non-2xx answer — a rejection is one error
 * and never takes the rest of the batch down. Unlike `crm_copilot_resolve`,
 * that endpoint has no `stale` / `not_pending` vocabulary, so those stay zero.
 */
export function summarizeResolveOutcomes(
  outcomes: PromiseSettledResult<unknown>[],
): BulkResolveSummary {
  let ok = 0;
  let failed = 0;
  for (const outcome of outcomes) {
    if (outcome.status === "fulfilled") ok += 1;
    else failed += 1;
  }
  return { total: outcomes.length, ok, stale: 0, notPending: 0, failed };
}
