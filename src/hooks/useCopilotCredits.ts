// src/hooks/useCopilotCredits.ts
//
// Sprint 6.1 · EPIC F · F1 — Copilot credit balance + ledger queries.
//
// Both read directly via the Supabase client (RLS scopes rows to the caller's
// equipe_id — no backend call needed). The SyncButton invalidates
// ["copilot","credits"] on a run's `done`, so these refetch live.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// The generated Database types don't include the Sprint-6.1 tables yet
// (same workaround as useCopilotRealtime / useAgentRules).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface CreditLedgerRow {
  id: string;
  equipe_id: string;
  opportunity_id: string | null;
  lead_id: string | null;
  lead: { name: string | null } | null;
  decision_id: string | null;
  verb: string;
  credits_charged: number;
  model: string | null;
  mode: "auto" | "manual";
  created_at: string;
}

export function useCreditBalance() {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  return useQuery({
    queryKey: ["copilot", "credits", "balance", equipeId],
    enabled: !!equipeId,
    queryFn: async (): Promise<number> => {
      const { data, error } = await sb
        .from("agent_credits_balance")
        .select("balance")
        .eq("equipe_id", equipeId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.balance ?? 0;
    },
  });
}

export interface LedgerRange {
  from?: string; // ISO date
  to?: string;   // ISO date
  limit?: number;
}

export function useCreditLedger(range: LedgerRange = {}) {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const { from, to, limit = 200 } = range;

  return useQuery({
    queryKey: ["copilot", "credits", "ledger", equipeId, from, to, limit],
    enabled: !!equipeId,
    queryFn: async (): Promise<CreditLedgerRow[]> => {
      let q = sb
        .from("agent_action_ledger")
        .select("*, lead:leads(name)")
        .eq("equipe_id", equipeId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CreditLedgerRow[];
    },
  });
}
