import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Sprint 4 EPIC 1 introduced opportunity_links; generated DB types lag the
// migration. Same escape hatch as useOpportunities.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type OpportunityLinkType = "company" | "property" | "contact";

export interface OpportunityLink {
  id: string;
  opportunity_id: string;
  linked_type: OpportunityLinkType;
  linked_id: string;
  relation: string;
  created_at: string;
}

/**
 * Read-only secondary attachments on an opportunity (companies, properties,
 * co-buyer contacts). Sprint 4 EPIC 2 uses this to render entity chips in
 * `OpportunityDetailModal`. Mutations land in Epic 4 with `EntityLinker`.
 */
export const useOpportunityLinks = (opportunityId: string | null | undefined) => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  const linksQuery = useQuery({
    queryKey: ["opportunity_links", opportunityId, equipeId],
    queryFn: async () => {
      if (!opportunityId || !equipeId) return [] as OpportunityLink[];

      const { data, error } = await sb
        .from("opportunity_links")
        .select("id, opportunity_id, linked_type, linked_id, relation, created_at")
        .eq("opportunity_id", opportunityId)
        .eq("equipe_id", equipeId)
        .is("deleted_at", null);

      if (error) throw error;
      return (data ?? []) as OpportunityLink[];
    },
    enabled: !!opportunityId && !!equipeId,
  });

  const links = linksQuery.data ?? [];

  return {
    links,
    isLoading: linksQuery.isLoading,
    companyIds: links.filter((l) => l.linked_type === "company").map((l) => l.linked_id),
    propertyIds: links.filter((l) => l.linked_type === "property").map((l) => l.linked_id),
    contactIds: links.filter((l) => l.linked_type === "contact").map((l) => l.linked_id),
  };
};
