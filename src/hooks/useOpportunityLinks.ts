import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  linkEntityToContact,
  unlinkEntityFromContact,
  type RelationalLinkKind,
} from "@/hooks/useCreateContactAtomic";

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
    // T7: keep Base de Contatos relationship badges in sync after a cascade.
    queryClient.invalidateQueries({ queryKey: ["lead_entity_summary"] });
  };

  // T7 — resolve the opportunity's underlying contact (lead) for ledger cascade.
  const resolveContactId = async (oppId: string): Promise<string | null> => {
    const { data } = await sb.from("opportunities").select("lead_id").eq("id", oppId).maybeSingle();
    return data?.lead_id ?? null;
  };

  // T7 — mirror a company/property link onto the contact ledger so it shows up
  // in the Base de Contatos grid. Contact-type links don't belong in the ledger.
  const cascadeLink = async (oppId: string, type: OpportunityLinkType, linkedId: string) => {
    if ((type !== "company" && type !== "property") || !equipeId) return;
    const contactId = await resolveContactId(oppId);
    if (!contactId) return;
    await linkEntityToContact({ equipeId, contactId, kind: type as RelationalLinkKind, entityId: linkedId });
  };

  // T7 — only retract the ledger link when NO other active opportunity of the
  // same contact still references that entity (avoids clobbering a relationship
  // the contact legitimately holds via another deal).
  const cascadeUnlink = async (oppId: string, type: OpportunityLinkType, linkedId: string) => {
    if ((type !== "company" && type !== "property") || !equipeId) return;
    const contactId = await resolveContactId(oppId);
    if (!contactId) return;

    const { data: opps } = await sb
      .from("opportunities")
      .select("id")
      .eq("equipe_id", equipeId)
      .eq("lead_id", contactId)
      .is("deleted_at", null);
    const oppIds = ((opps ?? []) as { id: string }[]).map((o) => o.id);

    let stillLinked = false;
    if (oppIds.length > 0) {
      const { data: others } = await sb
        .from(TABLE)
        .select("id")
        .eq("equipe_id", equipeId)
        .eq("linked_type", type)
        .eq("linked_id", linkedId)
        .in("opportunity_id", oppIds)
        .is("deleted_at", null);
      stillLinked = ((others ?? []) as unknown[]).length > 0;
    }

    if (!stillLinked) {
      await unlinkEntityFromContact({ equipeId, contactId, kind: type as RelationalLinkKind, entityId: linkedId });
    }
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

      // T7: cascade the new link down to the contact ledger.
      await cascadeLink(input.opportunity_id, input.linked_type, input.linked_id);

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
      // Capture the link shape before soft-deleting so we can cascade.
      const { data: link } = await sb
        .from(TABLE)
        .select("opportunity_id, linked_type, linked_id")
        .eq("id", id)
        .maybeSingle();

      const { error } = await sb
        .from(TABLE)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;

      // T7: retract the ledger link if no other active deal still needs it.
      if (link) {
        await cascadeUnlink(link.opportunity_id, link.linked_type, link.linked_id);
      }
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
