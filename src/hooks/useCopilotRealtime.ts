// src/hooks/useCopilotRealtime.ts
//
// Sprint 6 · EPIC F · F2 — Realtime hydration hook (blind spot A)
//
// Subscribes ONCE (per Kanban/workspace mount) to Supabase Realtime on:
//   • `opportunities`  — filtered by equipe_id
//   • `ai_decisions`   — filtered by equipe_id
//
// Any Postgres change on either table calls queryClient.invalidateQueries so
// React Query re-fetches live data without a full-page refresh.
//
// Query keys invalidated:
//   ["opportunities", equipeId]          — prefix covers all useOpportunities variants
//                                           (equipeId, pipelineId, leadId)
//   ["copilot", "approvals", pipelineId] — owned by F4 useCopilotApprovals; pass
//                                           undefined to invalidate all pipelines
//
// equipe_id source: useAuth() → profile?.equipe_id  (same pattern as every other hook)
//
// The `supabase as any` cast is required because the generated Database types
// don't include every Sprint-6 table yet (same workaround used in useAgentRules).

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/**
 * Mount this hook once in PipelineWorkspace (F4 will do the mount).
 *
 * @param pipelineId  Optional. When provided, the approvals invalidation is
 *                    scoped to ["copilot", "approvals", pipelineId]; when omitted
 *                    the whole ["copilot", "approvals"] prefix is invalidated.
 */
export const useCopilotRealtime = (pipelineId?: string): void => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  useEffect(() => {
    // Guard: do nothing until we know which tenant this user belongs to.
    if (!equipeId) return;

    const opportunitiesChannel = sb
      .channel(`copilot_rt_opportunities_${equipeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "opportunities",
          filter: `equipe_id=eq.${equipeId}`,
        },
        () => {
          // Invalidate the prefix — covers all (equipeId, pipelineId, leadId) combos.
          queryClient.invalidateQueries({ queryKey: ["opportunities", equipeId] });
        },
      )
      .subscribe();

    const approvalsKey: unknown[] = pipelineId
      ? ["copilot", "approvals", pipelineId]
      : ["copilot", "approvals"];

    const decisionsChannel = sb
      .channel(`copilot_rt_ai_decisions_${equipeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ai_decisions",
          filter: `equipe_id=eq.${equipeId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: approvalsKey });
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(opportunitiesChannel);
      sb.removeChannel(decisionsChannel);
    };
  }, [equipeId, pipelineId, queryClient]);
};
