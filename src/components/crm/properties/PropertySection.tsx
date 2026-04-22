import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Home, Loader2, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { EntityLinker } from "../EntityLinker";
import { AddPropertyModal } from "./AddPropertyModal";
import { PropertyDetailModal } from "./PropertyDetailModal";
import { usePropertyOwnerLinks } from "@/hooks/usePropertyOwnerLinks";
import { useOpportunityLinks } from "@/hooks/useOpportunityLinks";
import type {
  Property,
  PropertyOwnerType,
  PropertyType,
} from "@/types/crm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Mode =
  /** Owner link: property owned by a contact or a company. */
  | { kind: "owner"; ownerType: PropertyOwnerType; ownerId: string }
  /** Opportunity attachment: property linked via opportunity_links. */
  | { kind: "opportunity"; opportunityId: string };

interface PropertySectionProps {
  mode: Mode;
  /** Display title above the section. */
  title?: string;
}

const TYPE_LABEL: Record<PropertyType, string> = {
  address: "Endereço",
  site: "Site",
  unit: "Unidade",
  custom: "Outro",
};

/**
 * Shared "linked properties" section, embedded in:
 *   • CompanyDetailModal   — owner mode (owner_type=company)
 *   • ContactDetailsModal  — owner mode (owner_type=contact)
 *   • OpportunityDetailModal — opportunity mode (opportunity_links)
 *
 * Lists attached properties with type badge + unlink button, and exposes the
 * shared `EntityLinker` to attach existing properties. "Criar nova propriedade"
 * inside the linker opens `AddPropertyModal`; on create we immediately link
 * the new property to the current mode.
 */
export const PropertySection = ({ mode, title }: PropertySectionProps) => {
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;

  const [creating, setCreating] = useState(false);
  const [openDetail, setOpenDetail] = useState<string | null>(null);

  // Owner-mode link hook
  const ownerLinks = usePropertyOwnerLinks(
    mode.kind === "owner"
      ? { by: "owner", ownerType: mode.ownerType, id: mode.ownerId }
      : { by: "owner", ownerType: "contact", id: null },
  );

  // Opportunity-mode link hook
  const oppLinks = useOpportunityLinks(
    mode.kind === "opportunity" ? mode.opportunityId : null,
  );

  const linkedIds: string[] = useMemo(() => {
    if (mode.kind === "owner") {
      return ownerLinks.links.map((l) => l.property_id);
    }
    return oppLinks.propertyIds;
  }, [mode.kind, ownerLinks.links, oppLinks.propertyIds]);

  // Resolve label/type for the linked property rows in one round-trip.
  const { data: propertyMap = new Map<string, Property>(), isLoading } = useQuery<
    Map<string, Property>
  >({
    queryKey: ["property_section_rows", equipeId, linkedIds.sort().join(",")],
    enabled: linkedIds.length > 0 && !!equipeId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("properties")
        .select("id,label,property_type,address")
        .in("id", linkedIds)
        .eq("equipe_id", equipeId)
        .is("deleted_at", null);
      if (error) throw error;
      const map = new Map<string, Property>();
      for (const row of (data ?? []) as Property[]) {
        map.set(row.id, row);
      }
      return map;
    },
  });

  const handleLink = (propertyId: string) => {
    if (mode.kind === "owner") {
      ownerLinks.link.mutate({
        property_id: propertyId,
        owner_type: mode.ownerType,
        owner_id: mode.ownerId,
      });
    } else {
      oppLinks.linkEntity.mutate({
        opportunity_id: mode.opportunityId,
        linked_type: "property",
        linked_id: propertyId,
      });
    }
  };

  const handleUnlink = (linkId: string) => {
    if (mode.kind === "owner") {
      ownerLinks.unlink.mutate(linkId);
    } else {
      oppLinks.unlinkEntity.mutate(linkId);
    }
  };

  // Row = (linkId, propertyId) so we can call the right unlink
  const rows: Array<{ linkId: string; propertyId: string }> =
    mode.kind === "owner"
      ? ownerLinks.links.map((l) => ({ linkId: l.id, propertyId: l.property_id }))
      : oppLinks.links
          .filter((l) => l.linked_type === "property")
          .map((l) => ({ linkId: l.id, propertyId: l.linked_id }));

  const loadingState =
    (mode.kind === "owner" && ownerLinks.isLoading) ||
    (mode.kind === "opportunity" && oppLinks.isLoading) ||
    isLoading;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Home className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">{title ?? "Propriedades"}</h3>
          <Badge variant="outline" className="text-xs">
            {rows.length}
          </Badge>
        </div>
        <EntityLinker
          entity="property"
          onSelect={handleLink}
          onCreateStart={() => setCreating(true)}
          excludeIds={linkedIds}
          variant="inline"
          triggerLabel="Vincular"
        />
      </div>

      {loadingState ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-1">
          Nenhuma propriedade vinculada.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const prop = propertyMap.get(row.propertyId);
            return (
              <div
                key={row.linkId}
                className="flex items-center gap-2 p-2 rounded-md border border-border bg-card/60"
              >
                <button
                  type="button"
                  onClick={() => setOpenDetail(row.propertyId)}
                  className="flex-1 min-w-0 text-left hover:text-primary transition-colors"
                >
                  <div className="text-sm font-medium truncate">
                    {prop?.label ?? "(propriedade removida)"}
                  </div>
                  {prop?.property_type && (
                    <div className="text-xs text-muted-foreground">
                      {TYPE_LABEL[prop.property_type]}
                    </div>
                  )}
                </button>
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

      <AddPropertyModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(p) => handleLink(p.id)}
      />

      <PropertyDetailModal
        propertyId={openDetail}
        open={!!openDetail}
        onClose={() => setOpenDetail(null)}
      />
    </div>
  );
};
