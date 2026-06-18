import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MessageSquarePlus, MessageSquareText, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDisplayName } from "@/lib/displayName";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLogTouchpoint, type CreateTouchpointData } from "@/hooks/useTouchpoints";
import { useCopilotApprovals } from "@/hooks/useCopilotApprovals";
import type { Lead } from "@/types/crm";
import type { CustomFieldSchema, Opportunity, PipelineStageV2 } from "@/types/pipelines";
import { CardTelemetryPillars } from "./CardTelemetryPillars";
import { SyncButton } from "./copilot/SyncButton";

type TouchpointType = CreateTouchpointData["touchpoint_type"];

const TOUCHPOINT_TYPES: { value: TouchpointType; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "call", label: "Ligação" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Reunião" },
  { value: "note", label: "Nota" },
];

export interface NativeCardFlags {
  value: boolean;
  timeInPhase: boolean;
  touchpoints: boolean;
  nextContact: boolean;
  whatsapp: boolean;
}

export const DEFAULT_NATIVE_CARD_FLAGS: NativeCardFlags = {
  value: true,
  timeInPhase: true,
  touchpoints: true,
  nextContact: true,
  whatsapp: true,
};

interface OpportunityCardProps {
  opportunity: Opportunity;
  lead: Lead | undefined;
  stage: PipelineStageV2 | undefined;            // NEW
  cardFields: CustomFieldSchema[];   // schema entries whose field_id ∈ pipeline.card_field_ids (already filtered)
  touchpointCount: number;                       // NEW — supplied by parent (batched)
  nativeFlags?: NativeCardFlags;
  onClick: () => void;
  isDragOverlay?: boolean;
}

const formatCurrency = (value: number | null | undefined, currency: string) => {
  if (value === null || value === undefined) return null;
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency || "BRL",
    }).format(value);
  } catch {
    return `${currency} ${value}`;
  }
};

const renderCustomValue = (field: CustomFieldSchema, raw: unknown): string | null => {
  if (raw === null || raw === undefined || raw === "") return null;
  switch (field.type) {
    case "currency":
      return typeof raw === "number"
        ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(raw)
        : String(raw);
    case "boolean":
      return raw ? "Sim" : "Não";
    case "date":
      try {
        return new Date(String(raw)).toLocaleDateString("pt-BR");
      } catch {
        return String(raw);
      }
    default:
      return String(raw);
  }
};

export const OpportunityCard = ({
  opportunity,
  lead,
  stage,
  cardFields,
  touchpointCount,
  nativeFlags = DEFAULT_NATIVE_CARD_FLAGS,
  onClick,
  isDragOverlay,
}: OpportunityCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: opportunity.id,
    data: { type: "opportunity", opportunity },
    disabled: isDragOverlay,
  });

  const style = isDragOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      };

  const valueText = formatCurrency(opportunity.value, opportunity.currency);

  // Sprint 6.3 T8 — Intent Detected badge (hits shared React Query cache, no extra request)
  const { data: approvals = [] } = useCopilotApprovals(opportunity.pipeline_id);
  const intentDecision = approvals.find(
    (d) =>
      d.opportunity_id === opportunity.id &&
      (d.output_action as { intent_detected?: boolean } | null)?.intent_detected === true,
  );
  const intentKeyword =
    (intentDecision?.output_action as { intent_keyword?: string } | null)?.intent_keyword ?? null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "group cursor-grab active:cursor-grabbing select-none",
        "rounded-md border border-border bg-card hover:border-primary/50 hover:shadow-sm",
        "p-2.5 space-y-1.5 transition-colors",
        isDragOverlay && "shadow-lg rotate-1 scale-[1.02]",
      )}
    >
      <div className="flex items-center justify-between gap-1.5 text-sm font-medium">
        <div className="flex items-center gap-1.5 min-w-0">
          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{formatDisplayName(lead?.name, lead?.phone, "[Novo Contato - WhatsApp]")}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {nativeFlags.value && valueText && (
            <span className="text-xs text-green-600 dark:text-green-400 font-semibold">
              {valueText}
            </span>
          )}
          {/* E2: on-card ⚡ Sync — stop drag/open propagation so it acts standalone */}
          {!isDragOverlay && lead?.id && (
            <span
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={stop}
              onPointerDown={stop}
            >
              <SyncButton
                mode="single"
                variant="card"
                leadId={lead.id}
                opportunityId={opportunity.id}
                pipelineId={opportunity.pipeline_id}
              />
            </span>
          )}
        </div>
      </div>

      {/* Sprint 6.3 T8 — Intent Detected badge: shown only on real cards, not drag overlay */}
      {!isDragOverlay && intentDecision && (
        <div
          className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-medium w-full"
          title={
            intentKeyword
              ? `O lead mencionou "${intentKeyword}". Sincronize o Copilot.`
              : "Intenção comercial detectada pelo Copilot."
          }
        >
          <span className="shrink-0">⚠️</span>
          <span className="truncate">Intenção Detectada</span>
        </div>
      )}

      <CardTelemetryPillars
        opportunity={opportunity}
        stage={stage}
        lead={lead}
        touchpointCount={touchpointCount}
        timeInPhase={nativeFlags.timeInPhase}
        touchpoints={nativeFlags.touchpoints}
        nextContact={nativeFlags.nextContact}
        whatsapp={nativeFlags.whatsapp}
      />

      {cardFields.length > 0 && (
        <div className="space-y-0.5 pt-1 border-t border-border/60">
          {cardFields.map((f) => {
            const display = renderCustomValue(f, opportunity.custom_data?.[f.field_id]);
            if (!display) return null;
            return (
              <div key={f.field_id} className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="uppercase tracking-wide text-muted-foreground truncate">{f.label}</span>
                <span className="truncate text-foreground/90">{display}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Sprint 5.3 — card footer actions: open chat + quick-log a touchpoint */}
      {!isDragOverlay && lead?.id && (
        <CardQuickActions leadId={lead.id} />
      )}
    </div>
  );
};

/** Stop drag/open propagation so footer controls don't move or open the card. */
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

function CardQuickActions({ leadId }: { leadId: string }) {
  const navigate = useNavigate();
  const logTouchpoint = useLogTouchpoint();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TouchpointType>("whatsapp");
  const [content, setContent] = useState("");

  const register = () => {
    logTouchpoint.mutate(
      { lead_id: leadId, touchpoint_type: type, content: content.trim() || TOUCHPOINT_TYPES.find((t) => t.value === type)!.label },
      {
        onSuccess: () => {
          setContent("");
          setOpen(false);
        },
      },
    );
  };

  return (
    <div
      className="flex items-center gap-1 pt-1.5 border-t border-border/60"
      onClick={stop}
      onPointerDown={stop}
    >
      <button
        type="button"
        onClick={() => navigate(`/chat?contact=${leadId}`)}
        className="flex-1 inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded-md text-[11px] text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
        title="Abrir conversa no Sales Engine"
      >
        <MessageSquareText className="h-3 w-3 shrink-0" />
        Chat
      </button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex-1 inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded-md text-[11px] text-muted-foreground bg-muted/60 hover:bg-muted transition-colors"
            title="Registrar touchpoint"
          >
            <MessageSquarePlus className="h-3 w-3 shrink-0" />
            Touchpoint
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-60 space-y-2"
          onClick={stop}
          onPointerDown={stop}
        >
          <p className="text-xs font-medium">Registrar touchpoint</p>
          <Select value={type} onValueChange={(v) => setType(v as TouchpointType)}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOUCHPOINT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Nota (opcional)…"
            className="h-8"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                register();
              }
            }}
          />
          <Button
            size="sm"
            className="w-full h-8"
            onClick={register}
            disabled={logTouchpoint.isPending}
          >
            Registrar
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
