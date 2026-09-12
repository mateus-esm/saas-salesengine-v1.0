// Sprint 11 · Onda 3 · T31 — the revenue a deal has booked (the ledger's rows).
//
// Read-only: revenue_entries is written by the database when the deal is won,
// reopened, edited or deleted (_crm_sync_revenue). Loaded only while the deal is open.

import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export type RevenueKind = "booking" | "adjustment" | "reversal";

export interface RevenueEntry {
  id: string;
  amount: number;
  kind: RevenueKind;
  recognized_at: string;
  created_at: string;
  owner_id: string | null;
  line_key: string;
  /** The item's name when the entry is for a line of the deal. */
  item_name: string | null;
}

export const dealRevenueKeys = {
  all: ["deal_revenue"] as const,
  deal: (opportunityId: string | null) => ["deal_revenue", opportunityId] as const,
};

export function useDealRevenue(opportunityId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: dealRevenueKeys.deal(opportunityId),
    enabled: enabled && !!opportunityId,
    queryFn: async (): Promise<RevenueEntry[]> => {
      const { data, error } = await sb
        .from("revenue_entries")
        .select("id, amount, kind, recognized_at, created_at, owner_id, line_key, opportunity_items(name)")
        .eq("opportunity_id", opportunityId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        amount: Number(r.amount) || 0,
        kind: (r.kind as RevenueKind) ?? "booking",
        recognized_at: r.recognized_at as string,
        created_at: r.created_at as string,
        owner_id: (r.owner_id as string) ?? null,
        line_key: (r.line_key as string) ?? "value",
        item_name: ((r.opportunity_items as { name?: string } | null)?.name as string) ?? null,
      }));
    },
  });
}

/** Net revenue of a list of entries (the ledger's rule: the sum). */
export const netRevenue = (entries: RevenueEntry[]) =>
  Math.round(entries.reduce((s, e) => s + e.amount, 0) * 100) / 100;
