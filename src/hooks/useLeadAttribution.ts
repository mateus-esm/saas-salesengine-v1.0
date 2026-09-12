// Sprint 11 · Onda 5 · T53 — where a lead came from: every arrival (touch), the
// first one marked. Loaded only while the deal or the contact is open.

import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export interface AttributionTouch {
  id: string;
  occurred_at: string;
  first: boolean;
  entry_name?: string;
  entry_kind?: string;
  origin_category?: string;
  platform?: string;
  campaign_id?: string;
  campaign?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  gclid?: string;
  ctwa_clid?: string;
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  ad_id?: string;
  form_name?: string;
  landing_page?: string;
  referrer?: string;
}

export interface LeadAttribution {
  first_touch_id: string | null;
  total: number;
  touches: AttributionTouch[];
}

export const leadAttributionKeys = {
  lead: (leadId: string | null) => ["lead_attribution", leadId] as const,
};

export function useLeadAttribution(leadId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: leadAttributionKeys.lead(leadId ?? null),
    enabled: enabled && !!leadId,
    queryFn: async (): Promise<LeadAttribution | null> => {
      const { data, error } = await sb.rpc("crm_lead_attribution", { p_lead_id: leadId });
      if (error) throw error;
      if (!data) return null;
      const d = data as LeadAttribution;
      return { ...d, total: Number(d.total) || 0, touches: d.touches ?? [] };
    },
  });
}

/**
 * Sprint 11 · T57 — a row imported from a spreadsheet is an arrival through the
 * team's "Importação / API" entry (crm_record_touch picks it). Never throws: the
 * lead is already saved.
 */
export async function recordImportTouch(leadId: string): Promise<void> {
  try {
    const { error } = await sb.rpc("crm_record_touch", {
      p_lead_id: leadId,
      p_entry_id: null,
      p_payload: { _entry_kind: "import" },
    });
    if (error) console.error("[crm] crm_record_touch:", error.message);
  } catch (e) {
    console.error("[crm] crm_record_touch:", e);
  }
}
