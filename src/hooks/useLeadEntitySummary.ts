import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface LeadEntitySummary {
  companyId: string | null;
  companyName: string | null;
  companyCount: number;
  propertyCount: number;
  opportunityCount: number;
  opportunityTotalValue: number;
}

type ContactCompanyRow = {
  contact_id: string;
  company_id: string;
  is_primary: boolean | null;
  created_at: string | null;
};

type CompanyRow = {
  id: string;
  name: string;
};

type PropertyOwnerRow = {
  owner_id: string;
  property_id: string;
};

const emptySummary: LeadEntitySummary = {
  companyId: null,
  companyName: null,
  companyCount: 0,
  propertyCount: 0,
  opportunityCount: 0,
  opportunityTotalValue: 0,
};

/**
 * Batched relationship summary for Base de Contatos.
 *
 * Contact drawers already use per-record hooks. The ledger needs one query set
 * for the visible lead ids so the table can show company + property density
 * without causing a request per row.
 */
export const useLeadEntitySummary = (leadIds: string[]) => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  const normalizedLeadIds = useMemo(
    () => Array.from(new Set(leadIds)).filter(Boolean).sort(),
    [leadIds],
  );

  return useQuery<Record<string, LeadEntitySummary>>({
    queryKey: ["lead_entity_summary", equipeId, normalizedLeadIds.join(",")],
    enabled: !!equipeId && normalizedLeadIds.length > 0,
    queryFn: async () => {
      if (!equipeId || normalizedLeadIds.length === 0) return {};

      const [
        { data: companyLinks, error: companyLinksError },
        { data: propertyLinks, error: propertyLinksError },
        { data: opportunities, error: opportunitiesError },
      ] = await Promise.all([
        sb
          .from("contact_company_links")
          .select("contact_id, company_id, is_primary, created_at")
          .eq("equipe_id", equipeId)
          .in("contact_id", normalizedLeadIds)
          .is("deleted_at", null),
        sb
          .from("property_owner_links")
          .select("owner_id, property_id")
          .eq("equipe_id", equipeId)
          .eq("owner_type", "contact")
          .in("owner_id", normalizedLeadIds)
          .is("deleted_at", null),
        sb
          .from("opportunities")
          .select("lead_id, value, status")
          .eq("equipe_id", equipeId)
          .in("lead_id", normalizedLeadIds)
          .is("deleted_at", null)
          .neq("status", "lost"),
      ]);

      if (companyLinksError) throw companyLinksError;
      if (propertyLinksError) throw propertyLinksError;
      if (opportunitiesError) throw opportunitiesError;

      const contactCompanyRows = (companyLinks ?? []) as ContactCompanyRow[];
      const propertyOwnerRows = (propertyLinks ?? []) as PropertyOwnerRow[];
      const companyIds = Array.from(
        new Set(contactCompanyRows.map((row) => row.company_id).filter(Boolean)),
      );

      let companyNameById: Record<string, string> = {};
      if (companyIds.length > 0) {
        const { data: companies, error: companiesError } = await sb
          .from("companies")
          .select("id, name")
          .eq("equipe_id", equipeId)
          .in("id", companyIds)
          .is("deleted_at", null);

        if (companiesError) throw companiesError;
        companyNameById = Object.fromEntries(
          ((companies ?? []) as CompanyRow[]).map((company) => [company.id, company.name]),
        );
      }

      const summary: Record<string, LeadEntitySummary> = {};
      for (const leadId of normalizedLeadIds) {
        summary[leadId] = { ...emptySummary };
      }

      const companyLinksByContact = contactCompanyRows.reduce<
        Record<string, ContactCompanyRow[]>
      >((acc, row) => {
        if (!acc[row.contact_id]) acc[row.contact_id] = [];
        acc[row.contact_id].push(row);
        return acc;
      }, {});

      for (const [contactId, rows] of Object.entries(companyLinksByContact)) {
        const sortedRows = [...rows].sort((a, b) => {
          if (!!a.is_primary !== !!b.is_primary) return a.is_primary ? -1 : 1;
          return (a.created_at ?? "").localeCompare(b.created_at ?? "");
        });
        const primaryCompany = sortedRows[0];
        summary[contactId] = {
          ...summary[contactId],
          companyId: primaryCompany?.company_id ?? null,
          companyName: primaryCompany
            ? companyNameById[primaryCompany.company_id] ?? "Empresa"
            : null,
          companyCount: rows.length,
        };
      }

      const propertyIdsByContact = propertyOwnerRows.reduce<Record<string, Set<string>>>(
        (acc, row) => {
          if (!acc[row.owner_id]) acc[row.owner_id] = new Set<string>();
          acc[row.owner_id].add(row.property_id);
          return acc;
        },
        {},
      );

      for (const [contactId, propertyIds] of Object.entries(propertyIdsByContact)) {
        summary[contactId] = {
          ...summary[contactId],
          propertyCount: propertyIds.size,
        };
      }

      // Aggregate open opportunity count and total value per contact
      const opportunityRows = (opportunities ?? []) as { lead_id: string; value: number | string | null; status: string }[];
      const opportunitiesByContact = opportunityRows.reduce<Record<string, { count: number; total: number }>>(
        (acc, row) => {
          if (!acc[row.lead_id]) acc[row.lead_id] = { count: 0, total: 0 };
          acc[row.lead_id].count += 1;
          acc[row.lead_id].total += Number(row.value) || 0;
          return acc;
        },
        {},
      );

      for (const [contactId, data] of Object.entries(opportunitiesByContact)) {
        summary[contactId] = {
          ...summary[contactId],
          opportunityCount: data.count,
          opportunityTotalValue: data.total,
        };
      }

      return summary;
    },
    placeholderData: {},
  });
};
