import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Loader2, Star, StarOff, Trash2, Users } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { PropertySection } from "../properties/PropertySection";
import { ContactDetailsModal } from "../ContactDetailsModal";

import { useCompanies, useCompany } from "@/hooks/useCompanies";
import { useContactCompanyLinks } from "@/hooks/useContactCompanyLinks";
import { useReverseOpportunityLinks } from "@/hooks/useOpportunityLinks";
import { useLeads } from "@/hooks/useLeads";
import type {
  Company,
  CompanySizeBracket,
  ContactCompanyRole,
  Lead,
} from "@/types/crm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const SIZE_OPTIONS: Array<{ value: CompanySizeBracket; label: string }> = [
  { value: "solo", label: "Solo (1)" },
  { value: "2-10", label: "2–10" },
  { value: "11-50", label: "11–50" },
  { value: "51-200", label: "51–200" },
  { value: "201-1000", label: "201–1000" },
  { value: "1000+", label: "1000+" },
];

const ROLE_OPTIONS: Array<{ value: ContactCompanyRole; label: string }> = [
  { value: "decision_maker", label: "Decisor" },
  { value: "owner", label: "Dono" },
  { value: "employee", label: "Colaborador" },
  { value: "advisor", label: "Consultor" },
  { value: "former", label: "Ex-colaborador" },
  { value: "other", label: "Outro" },
];

interface CompanyDetailModalProps {
  companyId: string | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Sprint 4 EPIC 4 — full edit drawer for a Company. Top half is identity;
 * bottom is the relational fan-out (contacts / properties / opportunities).
 * Mirrors ContactDetailsModal's structure so operators get a consistent
 * mental model across the three identity entities.
 */
export const CompanyDetailModal = ({
  companyId,
  open,
  onClose,
}: CompanyDetailModalProps) => {
  const { data: company, isLoading } = useCompany(companyId);
  const { updateCompany, deleteCompany } = useCompanies();

  const [form, setForm] = useState<Partial<Company>>({});

  useEffect(() => {
    if (company) setForm({ ...company });
  }, [company]);

  const handleSave = () => {
    if (!company) return;
    updateCompany.mutate({
      id: company.id,
      name: form.name ?? company.name,
      legal_name: form.legal_name ?? null,
      cnpj: form.cnpj ?? null,
      website: form.website ?? null,
      industry: form.industry ?? null,
      size_bracket: (form.size_bracket as CompanySizeBracket | null) ?? null,
    });
    onClose();
  };

  const handleDelete = () => {
    if (!company) return;
    if (!confirm("Remover esta empresa? Vínculos existentes serão preservados em histórico.")) return;
    deleteCompany.mutate(company.id);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {company?.name ?? "Empresa"}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !company ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 py-2">
              {/* Identity block */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nome</Label>
                  <Input
                    value={form.name ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Razão Social</Label>
                  <Input
                    value={form.legal_name ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, legal_name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>CNPJ</Label>
                  <Input
                    value={form.cnpj ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, cnpj: e.target.value }))}
                    placeholder="00.000.000/0000-00"
                  />
                </div>
                <div>
                  <Label>Website</Label>
                  <Input
                    value={form.website ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <Label>Setor</Label>
                  <Input
                    value={form.industry ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, industry: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Tamanho</Label>
                  <Select
                    value={(form.size_bracket as string) || "__none__"}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        size_bracket: v === "__none__" ? null : (v as CompanySizeBracket),
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {SIZE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <CompanyContactsSection companyId={company.id} />
              </div>

              <div className="pt-4 border-t border-border">
                <PropertySection
                  mode={{ kind: "owner", ownerType: "company", ownerId: company.id }}
                />
              </div>

              <div className="pt-4 border-t border-border">
                <CompanyOpportunitiesSection companyId={company.id} />
              </div>
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="flex items-center sm:justify-between gap-2 pt-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="text-destructive"
            disabled={!company}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Excluir
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!company || updateCompany.isPending}>
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Linked contacts
// ─────────────────────────────────────────────────────────────────────

const CompanyContactsSection = ({ companyId }: { companyId: string }) => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const { links, isLoading, link, unlink, updateRole, setPrimary } =
    useContactCompanyLinks({ by: "company", id: companyId });
  const { leads } = useLeads();

  const [openContact, setOpenContact] = useState<string | null>(null);

  const contactMap = useMemo(() => {
    const m = new Map<string, Lead>();
    for (const l of leads) m.set(l.id, l);
    return m;
  }, [leads]);

  // Leads may be paginated/unloaded for this tenant; fall back to a direct
  // fetch when the link points at a contact outside the local list.
  const missingIds = links
    .map((l) => l.contact_id)
    .filter((id) => !contactMap.has(id));
  const { data: missingRows = [] } = useQuery<Lead[]>({
    queryKey: ["company_contacts_fallback", companyId, missingIds.sort().join(",")],
    enabled: missingIds.length > 0 && !!equipeId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("leads")
        .select("id,name,phone,email")
        .in("id", missingIds)
        .eq("equipe_id", equipeId)
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const resolve = (contactId: string): Lead | undefined => {
    return contactMap.get(contactId) ?? missingRows.find((l) => l.id === contactId);
  };

  const linkedIds = links.map((l) => l.contact_id);
  const selectedContact = openContact ? resolve(openContact) ?? null : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Contatos</h3>
          <Badge variant="outline" className="text-xs">
            {links.length}
          </Badge>
        </div>
        <EntityLinker
          entity="contact"
          onSelect={(contactId) =>
            link.mutate({ contact_id: contactId, company_id: companyId })
          }
          excludeIds={linkedIds}
          variant="inline"
          triggerLabel="Vincular"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : links.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-1">
          Nenhum contato vinculado a esta empresa.
        </p>
      ) : (
        <div className="space-y-2">
          {links.map((lnk) => {
            const contact = resolve(lnk.contact_id);
            return (
              <div
                key={lnk.id}
                className="flex items-center gap-2 p-2 rounded-md border border-border bg-card/60"
              >
                <button
                  type="button"
                  onClick={() => setOpenContact(lnk.contact_id)}
                  className="flex-1 min-w-0 text-left hover:text-primary transition-colors"
                >
                  <div className="text-sm font-medium truncate">
                    {contact?.name ?? "(contato removido)"}
                  </div>
                  {contact?.phone && (
                    <div className="text-xs text-muted-foreground">
                      {contact.phone}
                    </div>
                  )}
                </button>

                <Select
                  value={lnk.role}
                  onValueChange={(v) =>
                    updateRole.mutate({ id: lnk.id, role: v as ContactCompanyRole })
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

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-amber-500"
                  onClick={() =>
                    setPrimary.mutate({ id: lnk.id, contact_id: lnk.contact_id })
                  }
                  title={lnk.is_primary ? "Afiliação primária" : "Definir como primária"}
                >
                  {lnk.is_primary ? (
                    <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                  ) : (
                    <StarOff className="h-3.5 w-3.5" />
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => unlink.mutate(lnk.id)}
                  title="Desvincular"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <ContactDetailsModal
        lead={selectedContact ?? null}
        open={!!selectedContact}
        onClose={() => setOpenContact(null)}
        onSave={() => setOpenContact(null)}
        onDelete={() => setOpenContact(null)}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Linked opportunities (read-only, reverse lookup)
// ─────────────────────────────────────────────────────────────────────

const CompanyOpportunitiesSection = ({ companyId }: { companyId: string }) => {
  const { data: links = [], isLoading } = useReverseOpportunityLinks("company", companyId);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">Leads referenciando esta empresa</h3>
        <Badge variant="outline" className="text-xs">
          {links.length}
        </Badge>
      </div>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : links.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-1">
          Nenhum lead referencia esta empresa ainda.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground px-1">
          {links.length} lead(s) vinculados via opportunity_links. Abra a empresa
          a partir do card do lead para detalhes.
        </p>
      )}
    </div>
  );
};
