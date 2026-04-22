import { Building2, Home, Plus, User } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import type { Lead } from "@/types/crm";
import { useOpportunityLinks } from "@/hooks/useOpportunityLinks";

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
 * Sprint 4 EPIC 2 — header chips on `OpportunityDetailModal`.
 *
 * Contact chip: fully wired this sprint (clicking closes the opp modal and
 * opens `LeadDetailsModal`).
 *
 * Company / Property chips: render counts from `opportunity_links` and the
 * "+ Vincular" affordance, but the actual drawers + linker arrive in Epic 4.
 * We surface a toast so users know the link is shipping next sprint instead of
 * silently no-op'ing.
 */
export const EntityChips = ({
  opportunityId,
  primaryContact,
  onOpenContact,
}: EntityChipsProps) => {
  const { companyIds, propertyIds, isLoading } = useOpportunityLinks(opportunityId);

  const epic4ComingSoon = (entity: "Empresa" | "Imóvel/Site") =>
    toast.info(`Vinculador de ${entity} chega em Sprint 4 · EPIC 4.`);

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
        rightIcon={companyIds.length === 0 ? <Plus className="h-3 w-3" /> : undefined}
        onClick={() => epic4ComingSoon("Empresa")}
        title="Disponível em Sprint 4 · EPIC 4"
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
        rightIcon={propertyIds.length === 0 ? <Plus className="h-3 w-3" /> : undefined}
        onClick={() => epic4ComingSoon("Imóvel/Site")}
        title="Disponível em Sprint 4 · EPIC 4"
      />
    </div>
  );
};

interface ChipProps {
  icon: React.ReactNode;
  rightIcon?: React.ReactNode;
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

const Chip = ({ icon, rightIcon, label, tone, onClick, disabled, title }: ChipProps) => {
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
      {rightIcon}
    </button>
  );
};

