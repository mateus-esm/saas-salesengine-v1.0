// src/hooks/useCopilotApprovals.ts
//
// Sprint 6 · EPIC F · F4 — Approval queue query hook
//
// Reads `ai_decisions` rows whose status is `pending_approval` for a given
// pipeline. The query key ["copilot", "approvals", pipelineId] is the exact
// key that useCopilotRealtime (F2) invalidates on Supabase Realtime changes,
// so the list stays live without a full-page refresh.
//
// Typing note: generated Database types do not include `ai_decisions` yet.
// The `supabase as any` cast is the same workaround used in useCopilotRealtime
// and useAgentRules.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

// ── Types ──────────────────────────────────────────────────────────────────────

/** The lead behind the decision — the "which deal" the queue shows. */
export interface AiDecisionLead {
  id: string;
  name: string;
  phone: string | null;
}

export interface AiDecision {
  id: string;
  equipe_id: string;
  pipeline_id: string | null;
  lead_id: string | null;
  opportunity_id: string | null;
  agent_role: string | null;
  status: string;
  output_action: unknown;   // JSONB — shape varies per agent_role
  /** The model's own reason for the action — what the queue shows as "motivo". */
  input_summary: string | null;
  confidence_score: number | null;
  created_at: string;
  /** Embedded `leads` row (SE-COPILOT-002) — null when the decision has no lead. */
  lead: AiDecisionLead | null;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * Returns all `ai_decisions` with `status = 'pending_approval'` for the given
 * pipeline. The list is kept live by the F2 Realtime subscription mounted in
 * PipelineWorkspace — no polling required.
 *
 * Query key: ["copilot", "approvals", pipelineId]
 */
export const useCopilotApprovals = (pipelineId: string) => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  return useQuery<AiDecision[]>({
    queryKey: ["copilot", "approvals", pipelineId],
    queryFn: async (): Promise<AiDecision[]> => {
      if (!equipeId) return [];

      const { data, error } = await sb
        .from("ai_decisions")
        // `lead:leads(...)` mirrors `crm_copilot_feed`, which names the deal in
        // the queue by the contact's name. Same embedding shape as
        // useCopilotCredits' ledger (`select("*, lead:leads(name)")`).
        .select("*, lead:leads(id, name, phone)")
        .eq("equipe_id", equipeId)           // defensive equipe_id filter (RLS also covers this)
        .eq("pipeline_id", pipelineId)
        .eq("status", "pending_approval")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as AiDecision[];
    },
    enabled: !!equipeId && !!pipelineId,
  });
};
