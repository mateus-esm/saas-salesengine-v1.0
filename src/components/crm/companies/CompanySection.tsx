import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Loader2, Star, StarOff, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { EntityLinker } from "../EntityLinker";
import { AddCompanyModal } from "./AddCompanyModal";
import { CompanyDetailModal } from "./CompanyDetailModal";
import { useContactCompanyLinks } from "@/hooks/useContactCompanyLinks";
import { useOpportunityLinks } from "@/hooks/useOpportunityLinks";
import type { Company, ContactCompanyRole } from "@/types/crm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Mode =
  /** Contact↔Company via contact_company_links (role + is_primary). */
  | { kind: "contact"; contactId: string }
  /** Opportunity→Company via opportunity_links (relation-less). */
  | { kind: "opportunity"; opportunityId: string };

interface CompanySectionProps {
  mode: Mode;
  title?: string;
}

const ROLE_OPTIONS: Array<{ value: ContactCompanyRole; label: string }> = [
  { value: "decision_maker", label: "Decisor" },
  { value: "owner", label: "Dono" },
  { value: "employee", label: "Colaborador" },
  { value: "advisor", label: "Consultor" },
  { value: "former", label: "Ex-colaborador" },
  { value: "other", label: "Outro" },
];

/**
 * Sprint 4 EPIC 4 — shared "linked companies" section. Two modes:
 *   • contact     → uses contact_company_links (role + primary flag)
 *   • opportunity → uses opportunity_links (secondary attachments)
 *
 * Mirrors PropertySection's shape so consumers compose both in the same layout.
 */
export const CompanySection = ({ mode, title }: CompanySectionProps) => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const [creating, setCreating] = useState(false);
  const [openDetail, setOpenDetail] = useState<string | null>(null);

  // Contact mode
  const contactLinks = useContactCompanyLinks(
    mode.kind === "contact"
      ? { by: "contact", id: mode.contactId }
      : { by: "contact", id: null },
  );

  // Opportunity mode
  const oppLinks = useOpportunityLinks(
    mode.kind === "opportunity" ? mode.opportunityId : null,
  );

  const linkedIds: string[] = useMemo(() => {
    if (mode.kind === "contact") {
      return contactLinks.links.map((l) => l.company_id);
    }
    return oppLinks.companyIds;
  }, [mode.kind, contactLinks.links, oppLinks.companyIds]);

  // Resolve company label/industry for the linked rows.
  const { data: companyMap = new Map<string, Company>(), isLoading: loadingCompanies } =
    useQuery<Map<string, Company>>({
      queryKey: ["company_section_rows", equipeId, linkedIds.sort().join(",")],
      enabled: linkedIds.length > 0 && !!equipeId,
      queryFn: async () => {
        const { data, error } = await sb
          .from("companies")
          .select("id,name,industry,size_bracket")
          .in("id", linkedIds)
          .eq("equipe_id", equipeId)
          .is("deleted_at", null);
        if (error) throw error;
        const m = new Map<string, Company>();
        for (const row of (data ?? []) as Company[]) m.set(row.id, row);
        return m;
      },
    });

  const handleLink = (companyId: string) => {
    if (mode.kind === "contact") {
      contactLinks.link.mutate({
        contact_id: mode.contactId,
        company_id: companyId,
      });
    } else {
      oppLinks.linkEntity.mutate({
        opportunity_id: mode.opportunityId,
        linked_type: "company",
        linked_id: companyId,
      });
    }
  };

  const handleUnlink = (linkId: string) => {
    if (mode.kind === "contact") {
      contactLinks.unlink.mutate(linkId);
    } else {
      oppLinks.unlinkEntity.mutate(linkId);
    }
  };

  // Row = (linkId, companyId, role?, isPrimary?) so we can dispatch per-mode
  const rows: Array<{
    linkId: string;
    companyId: string;
    role?: ContactCompanyRole;
    isPrimary?: boolean;
  }> =
    mode.kind === "contact"
      ? contactLinks.links.map((l) => ({
          linkId: l.id,
          companyId: l.company_id,
          role: l.role,
          isPrimary: l.is_primary,
        }))
      : oppLinks.links
          .filter((l) => l.linked_type === "company")
          .map((l) => ({ linkId: l.id, companyId: l.linked_id }));

  const loading =
    (mode.kind === "contact" && contactLinks.isLoading) ||
    (mode.kind === "opportunity" && oppLinks.isLoading) ||
    loadingCompanies;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">{title ?? "Empresas"}</h3>
          <Badge variant="outline" className="text-xs">
            {rows.length}
          </Badge>
        </div>
        <EntityLinker
          entity="company"
          onSelect={handleLink}
          onCreateStart={() => setCreating(true)}
          excludeIds={linkedIds}
          variant="inline"
          triggerLabel="Vincular"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-1">
          Nenhuma empresa vinculada.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const company = companyMap.get(row.companyId);
            return (
              <div
                key={row.linkId}
                className="flex items-center gap-2 p-2 rounded-md border border-border bg-card/60"
              >
                <button
                  type="button"
                  onClick={() => setOpenDetail(row.companyId)}
                  className="flex-1 min-w-0 text-left hover:text-primary transition-colors"
                >
                  <div className="text-sm font-medium truncate">
                    {company?.name ?? "(empresa removida)"}
                  </div>
                  {company?.industry && (
                    <div className="text-xs text-muted-foreground truncate">
                      {company.industry}
                    </div>
                  )}
                </button>

                {mode.kind === "contact" && row.role && (
                  <Select
                    value={row.role}
                    onValueChange={(v) =>
                      contactLinks.updateRole.mutate({
                        id: row.linkId,
                        role: v as ContactCompanyRole,
                      })
                    }
                  >
                    <SelectTrigger className="h-7 w-[130px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {mode.kind === "contact" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-amber-500"
                    onClick={() =>
                      contactLinks.setPrimary.mutate({
                        id: row.linkId,
                        contact_id: mode.contactId,
                      })
                    }
                    title={row.isPrimary ? "Afiliação primária" : "Definir como primária"}
                  >
                    {row.isPrimary ? (
                      <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                    ) : (
                      <StarOff className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => handleUnlink(row.linkId)}
                  title="Desvincular"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <AddCompanyModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(c) => handleLink(c.id)}
      />

      <CompanyDetailModal
        companyId={openDetail}
        open={!!openDetail}
        onClose={() => setOpenDetail(null)}
      />
    </div>
  );
};
