import { Clock, MessageSquare, Calendar, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeStageTelemetry } from "@/hooks/useStageTelemetry";
import type { Lead } from "@/types/crm";
import type { Opportunity, PipelineStageV2 } from "@/types/pipelines";
import { formatBrPhone } from "@/lib/displayName";

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
  const t = computeStageTelemetry({
    stageEnteredAt: opportunity.stage_entered_at,
    maxIdleHours: stage?.max_idle_hours ?? null,
    touchpointCount,
    nextContact: lead?.next_contact ?? null,
  });

  const hasPhone = whatsapp && !!lead?.phone;
  const showNextContact = nextContact && !!t.nextContactLabel;

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

      {/* Pillar 2 — Touchpoints */}
      {touchpoints && (
        <div
          className="flex items-center gap-1 px-1.5 py-1 rounded-md text-muted-foreground bg-muted/50"
          title={`${t.touchpointCount} interações`}
        >
          <MessageSquare className="h-3 w-3 shrink-0" />
          <span className="truncate">{t.touchpointCount}</span>
        </div>
      )}

      {/* Pillar 3 — Next Contact */}
      {showNextContact && (
        <div
          className={cn(
            "flex items-center gap-1 px-1.5 py-1 rounded-md col-span-2",
            t.nextContactOverdue
              ? "text-destructive-foreground bg-destructive/15 font-medium"
              : "text-muted-foreground bg-muted/50",
          )}
          title="Próximo contato"
        >
          <Calendar className="h-3 w-3 shrink-0" />
          <span className="truncate">{t.nextContactLabel}</span>
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
