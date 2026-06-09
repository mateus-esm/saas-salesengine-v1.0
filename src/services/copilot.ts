// src/services/copilot.ts
// Sprint 6 — F1: Copilot API client
// Connects to the Agno FastAPI backend at VITE_COPILOT_URL.
// Every request attaches a Supabase bearer token from the active session.

import { supabase } from "@/integrations/supabase/client";
import type { CustomFieldType, StageType } from "@/types/pipelines";

// ── Types ──────────────────────────────────────────────────────────────────────

/** Mirrors python-agent/app/schemas.py::CustomFieldBlueprint */
export interface CustomFieldBlueprint {
  key: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  options?: string[];        // only for select / multi_select
  position: number;
  description?: string;
}

/** Mirrors python-agent/app/schemas.py::StageBlueprint */
export interface StageBlueprint {
  name: string;
  position: number;
  stage_type: StageType;
  color: string;
  max_idle_hours?: number | null;
  cadence_value?: number | null;
  cadence_unit?: "hours" | "days" | null;
}

/** Mirrors python-agent/app/schemas.py::PipelineBlueprint (§P4) */
export interface PipelineBlueprint {
  pipeline_name: string;
  description?: string;
  stages: StageBlueprint[];
  custom_fields: CustomFieldBlueprint[];
}

export interface SyncOpportunityArgs {
  lead_id: string;
  opportunity_id?: string;
  pipeline_id?: string;
}

export interface SyncOpportunityResult {
  decision_id: string;
  status: string;
  result: unknown;
}

// ── Private helper ─────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_COPILOT_URL as string;

async function copilotFetch<T>(
  path: string,
  body: unknown
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail: string;
    const contentType = response.headers.get("content-type") ?? "";
    try {
      if (contentType.includes("application/json")) {
        const json = await response.json();
        detail = JSON.stringify(json);
      } else {
        detail = await response.text();
      }
    } catch {
      detail = "(could not read response body)";
    }
    throw new Error(
      `Copilot API error ${response.status} ${response.statusText}: ${detail}`
    );
  }

  return response.json() as Promise<T>;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/shape/preview
 * Generates a pipeline blueprint from a natural-language prompt.
 * Does NOT write to the database.
 */
export async function shapePreview(
  prompt: string,
  locale?: string
): Promise<PipelineBlueprint> {
  return copilotFetch<PipelineBlueprint>("/api/v1/shape/preview", {
    prompt,
    locale,
  });
}

/**
 * POST /api/v1/shape/apply
 * Re-validates the blueprint and atomically mints the pipeline + stages + field_ids.
 */
export async function shapeApply(
  blueprint: PipelineBlueprint
): Promise<{ pipeline_id: string }> {
  return copilotFetch<{ pipeline_id: string }>("/api/v1/shape/apply", blueprint);
}

/**
 * POST /api/v1/sync
 * Runs the Tower→Floor→Worker cascade for a given lead/opportunity.
 */
export async function syncOpportunity(
  args: SyncOpportunityArgs
): Promise<SyncOpportunityResult> {
  return copilotFetch<SyncOpportunityResult>("/api/v1/sync", args);
}

/**
 * POST /api/v1/approvals/:decisionId/resolve
 * Approves or rejects a pending ai_decision.
 */
export async function resolveApproval(
  decisionId: string,
  action: "approve" | "reject"
): Promise<unknown> {
  return copilotFetch<unknown>(
    `/api/v1/approvals/${decisionId}/resolve`,
    { action }
  );
}
