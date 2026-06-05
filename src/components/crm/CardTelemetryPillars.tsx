import { Clock, MessageSquare, MessageCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { computeStageTelemetry } from "@/hooks/useStageTelemetry";
import { NextContactBadge } from "./NextContactBadge";
import { supabase } from "@/integrations/supabase/client";
import type { Lead } from "@/types/crm";
import type { Opportunity, PipelineStageV2 } from "@/types/pipelines";
import { formatBrPhone } from "@/lib/displayName";

const toLocalDateString = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

interface CardTelemetryPillarsProps {
  opportunity: Opportunity;
  stage: PipelineStageV2 | undefined;
  lead: Lead | undefined;
  touchpointCount: number;
  timeInPhase?: boolean;
  touchpoints?: boolean;
  nextContact?: boolean;
  whatsapp?: boolean;
}

export const CardTelemetryPillars = ({
  opportunity,
  stage,
  lead,
  touchpointCount,
  timeInPhase = true,
  touchpoints = true,
  nextContact = true,
  whatsapp = true,
}: CardTelemetryPillarsProps) => {
  const queryClient = useQueryClient();
  const t = computeStageTelemetry({
    stageEnteredAt: opportunity.stage_entered_at,
    maxIdleHours: stage?.max_idle_hours ?? null,
    touchpointCount,
    nextContact: lead?.next_contact ?? null,
    maxInteractions: stage?.max_interactions ?? null,
  });

  const hasPhone = whatsapp && !!lead?.phone;
  const showNextContact = nextContact && !!lead;

  // T11 — Driver Override: persist an inline next-contact change.
  const handleNextContactChange = async (date: Date | null) => {
    if (!lead?.id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("leads")
      .update({ next_contact: date ? toLocalDateString(date) : null })
      .eq("id", lead.id);
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["opportunities"] });
  };

  if (!timeInPhase && !touchpoints && !showNextContact && !hasPhone) return null;

  return (
    <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-border/60 text-[11px]">
      {/* Pillar 1 — Time in Phase */}
      {timeInPhase && (
        <div
          className={cn(
            "flex items-center gap-1 px-1.5 py-1 rounded-md",
            t.slaBreached
              ? "text-destructive-foreground bg-destructive/15 animate-pulse font-medium"
              : "text-muted-foreground bg-muted/50",
          )}
          title={`Em fase há ${t.hoursInPhaseLabel}`}
        >
          <Clock className="h-3 w-3 shrink-0" />
          <span className="truncate">{t.hoursInPhaseLabel}</span>
        </div>
      )}

      {/* Pillar 2 — Touchpoints (T11: pulses red when the interaction cap is breached) */}
      {touchpoints && (
        <div
          className={cn(
            "flex items-center gap-1 px-1.5 py-1 rounded-md",
            t.interactionsBreached
              ? "text-destructive-foreground bg-destructive/15 animate-pulse font-medium"
              : "text-muted-foreground bg-muted/50",
          )}
          title={
            t.interactionsBreached
              ? `${t.touchpointCount} interações — limite (${stage?.max_interactions}) excedido`
              : `${t.touchpointCount} interações`
          }
        >
          <MessageSquare className="h-3 w-3 shrink-0" />
          <span className="truncate">{t.touchpointCount}</span>
        </div>
      )}

      {/* Pillar 3 — Next Contact (T11: colored T4 badge + inline driver override) */}
      {showNextContact && (
        <div className="col-span-2" onClick={(e) => e.stopPropagation()}>
          <NextContactBadge
            nextContactLabel={t.nextContactLabel}
            nextContactState={t.nextContactState}
            currentDate={lead?.next_contact ?? null}
            onChange={handleNextContactChange}
          />
        </div>
      )}

      {/* Pillar 4 — Mirrored identity shortcut */}
      {hasPhone && (
        <a
          href={`https://wa.me/${lead!.phone!.replace(/\D/g, "").replace(/^(?!55)/, "55$&")}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="col-span-2 flex items-center gap-1 px-1.5 py-1 rounded-md text-green-700 dark:text-green-400 bg-green-500/10 hover:bg-green-500/20"
          title={formatBrPhone(lead!.phone) ?? lead!.phone!}
        >
          <MessageCircle className="h-3 w-3 shrink-0" />
          <span className="truncate">{formatBrPhone(lead!.phone) ?? lead!.phone}</span>
        </a>
      )}
    </div>
  );
};
