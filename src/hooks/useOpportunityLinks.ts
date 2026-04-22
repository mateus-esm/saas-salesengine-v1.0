import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Sprint 4 EPIC 1 introduced opportunity_links; generated DB types lag the
// migration. Same escape hatch as useOpportunities.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const TABLE = "opportunity_links";

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
 * Secondary attachments on an opportunity (companies, properties, co-buyer
 * contacts). Sprint 4 EPIC 2 introduced read access for EntityChips; EPIC 4
 * adds the link/unlink mutations used by the three assignment flows.
 */
export const useOpportunityLinks = (opportunityId: string | null | undefined) => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const equipeId = profile?.equipe_id;

  const linksQuery = useQuery({
    queryKey: ["opportunity_links", opportunityId, equipeId],
    queryFn: async () => {
      if (!opportunityId || !equipeId) return [] as OpportunityLink[];

      const { data, error } = await sb
        .from(TABLE)
        .select("id, opportunity_id, linked_type, linked_id, relation, created_at")
        .eq("opportunity_id", opportunityId)
        .eq("equipe_id", equipeId)
        .is("deleted_at", null);

      if (error) throw error;
      return (data ?? []) as OpportunityLink[];
    },
    enabled: !!opportunityId && !!equipeId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["opportunity_links"] });
  };

  const linkEntity = useMutation({
    mutationFn: async (input: {
      opportunity_id: string;
      linked_type: OpportunityLinkType;
      linked_id: string;
      relation?: string;
    }): Promise<OpportunityLink> => {
      if (!equipeId) throw new Error("No equipe_id");
      const { data, error } = await sb
        .from(TABLE)
        .insert({
          equipe_id: equipeId,
          opportunity_id: input.opportunity_id,
          linked_type: input.linked_type,
          linked_id: input.linked_id,
          relation: input.relation ?? "related",
        })
        .select()
        .single();
      if (error) throw error;
      return data as OpportunityLink;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Vinculação criada");
    },
    onError: (e: Error) => toast.error("Erro ao vincular: " + e.message),
  });

  const unlinkEntity = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from(TABLE)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Vinculação removida");
    },
    onError: (e: Error) => toast.error("Erro ao remover vínculo: " + e.message),
  });

  const links = linksQuery.data ?? [];

  return {
    links,
    isLoading: linksQuery.isLoading,
    companyIds: links.filter((l) => l.linked_type === "company").map((l) => l.linked_id),
    propertyIds: links.filter((l) => l.linked_type === "property").map((l) => l.linked_id),
    contactIds: links.filter((l) => l.linked_type === "contact").map((l) => l.linked_id),
    linkEntity,
    unlinkEntity,
  };
};

/**
 * Reverse index: find all opportunities that reference a given linked entity
 * (company / property / contact). Used by CompanyDetailModal /
 * PropertyDetailModal to show "Opportunities referencing this company".
 */
export const useReverseOpportunityLinks = (
  linkedType: OpportunityLinkType | null,
  linkedId: string | null | undefined,
) => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  return useQuery({
    queryKey: ["opportunity_links_reverse", linkedType, linkedId, equipeId],
    queryFn: async (): Promise<OpportunityLink[]> => {
      if (!linkedType || !linkedId || !equipeId) return [];
      const { data, error } = await sb
        .from(TABLE)
        .select("id, opportunity_id, linked_type, linked_id, relation, created_at")
        .eq("linked_type", linkedType)
        .eq("linked_id", linkedId)
        .eq("equipe_id", equipeId)
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as OpportunityLink[];
    },
    enabled: !!linkedType && !!linkedId && !!equipeId,
  });
};
