// Sprint 11 — one lead / one opportunity by id.
//
// The Kanban cards now carry only the slice of the lead they draw. The contact
// and opportunity modals need the whole row, so they fetch it when they open
// instead of the board keeping every lead of the team in memory.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Lead } from "@/types/crm";
import type { Opportunity } from "@/types/pipelines";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const leadKey = (leadId: string | null | undefined) => ["lead", leadId] as const;

export function useLead(leadId: string | null | undefined) {
  return useQuery({
    queryKey: leadKey(leadId),
    queryFn: async (): Promise<Lead | null> => {
      const { data, error } = await sb.from("leads").select("*").eq("id", leadId).maybeSingle();
      if (error) throw error;
      return (data as Lead | null) ?? null;
    },
    enabled: !!leadId,
  });
}

export function useOpportunity(opportunityId: string | null | undefined) {
  return useQuery({
    queryKey: ["opportunity", opportunityId],
    queryFn: async (): Promise<Opportunity | null> => {
      const { data, error } = await sb
        .from("opportunities")
        .select("*")
        .eq("id", opportunityId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        value: data.value !== null && data.value !== undefined ? Number(data.value) : null,
        currency: data.currency || "BRL",
        status: data.status || "open",
        position: data.position ?? 0,
        custom_data: data.custom_data || {},
        owner_id: data.owner_id ?? null,
        lost_reason: data.lost_reason ?? null,
        closed_at: data.closed_at ?? null,
      } as Opportunity;
    },
    enabled: !!opportunityId,
  });
}
