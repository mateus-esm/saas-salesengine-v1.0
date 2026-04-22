import { useState } from "react";
import { Building2, Home, User } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import type { Lead } from "@/types/crm";
import { useOpportunityLinks } from "@/hooks/useOpportunityLinks";
import { CompanySection } from "./companies/CompanySection";
import { PropertySection } from "./properties/PropertySection";

interface EntityChipsProps {
  opportunityId: string;
  primaryContact: Lead | undefined;
  /**
   * Invoked when the Contact chip is clicked. Parent (OpportunityDetailModal)
   * uses this to close itself and pop the Contact drawer — the bidirectional
   * navigation called out in Sprint 4 EPIC 2 §2.3.
   */
  onOpenContact?: (contactId: string) => void;
}

/**
 * Header chips on `OpportunityDetailModal`.
 *
 * Contact chip (Sprint 4 EPIC 2): clicking closes the opp modal and opens
 * `ContactDetailsModal`.
 *
 * Company / Property chips (Sprint 4 EPIC 4): clicking opens a compact manage
 * dialog that embeds the matching section (list + EntityLinker for adds).
 * The Opportunity body also carries those sections for direct editing — the
 * chips provide a quick-access affordance at the header level.
 */
export const EntityChips = ({
  opportunityId,
  primaryContact,
  onOpenContact,
}: EntityChipsProps) => {
  const { companyIds, propertyIds, isLoading } = useOpportunityLinks(opportunityId);
  const [openManager, setOpenManager] = useState<"company" | "property" | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {primaryContact ? (
        <Chip
          icon={<User className="h-3 w-3" />}
          label={primaryContact.name || "Contato"}
          tone="contact"
          onClick={() => onOpenContact?.(primaryContact.id)}
          title="Abrir contato"
        />
      ) : (
        <Chip
          icon={<User className="h-3 w-3" />}
          label="Sem contato"
          tone="muted"
          disabled
        />
      )}

      <Chip
        icon={<Building2 className="h-3 w-3" />}
        label={
          isLoading
            ? "Empresas…"
            : companyIds.length > 0
              ? `${companyIds.length} empresa${companyIds.length > 1 ? "s" : ""}`
              : "Vincular empresa"
        }
        tone={companyIds.length > 0 ? "company" : "muted"}
        onClick={() => setOpenManager("company")}
        title="Gerenciar empresas vinculadas"
      />

      <Chip
        icon={<Home className="h-3 w-3" />}
        label={
          isLoading
            ? "Imóveis…"
            : propertyIds.length > 0
              ? `${propertyIds.length} imóvel/site${propertyIds.length > 1 ? "s" : ""}`
              : "Vincular imóvel"
        }
        tone={propertyIds.length > 0 ? "property" : "muted"}
        onClick={() => setOpenManager("property")}
        title="Gerenciar propriedades vinculadas"
      />

      <Dialog
        open={openManager === "company"}
        onOpenChange={(o) => !o && setOpenManager(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Empresas vinculadas</DialogTitle>
          </DialogHeader>
          <CompanySection mode={{ kind: "opportunity", opportunityId }} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={openManager === "property"}
        onOpenChange={(o) => !o && setOpenManager(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Propriedades vinculadas</DialogTitle>
          </DialogHeader>
          <PropertySection mode={{ kind: "opportunity", opportunityId }} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface ChipProps {
  icon: React.ReactNode;
  label: string;
  tone: "contact" | "company" | "property" | "muted";
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}

const toneClasses: Record<ChipProps["tone"], string> = {
  contact: "border-primary/40 text-primary hover:bg-primary/10",
  company: "border-blue-500/40 text-blue-500 hover:bg-blue-500/10",
  property: "border-amber-500/40 text-amber-500 hover:bg-amber-500/10",
  muted: "border-border text-muted-foreground hover:bg-muted/50",
};

const Chip = ({ icon, label, tone, onClick, disabled, title }: ChipProps) => {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        toneClasses[tone],
        disabled && "opacity-60 cursor-not-allowed",
      )}
    >
      {icon}
      <span className="truncate max-w-[160px]">{label}</span>
    </button>
  );
};
