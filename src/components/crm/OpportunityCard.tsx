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
import { LeadScoreBadge, type LeadScoreBreakdown } from "./LeadScoreBadge";
import { RelationChip } from "./grid/RelationChip";
import { BRAND } from "@/config/brand";

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
  leadScore?: number | null;                     // Sprint 6.8 T3.3 — combined 0-10 lead score
  leadScoreBreakdown?: LeadScoreBreakdown;       // optional breakdown shown in tooltip
  onClick: () => void;
  onOpenContact?: (leadId: string) => void;
  isDragOverlay?: boolean;
  companies?: { id: string; name: string }[];    // Sprint 6.7 — linked companies for card chips
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

  const fromUrl = (url: string) => {
    const clean = url.split("?")[0]?.split("#")[0] ?? url;
    const name = clean.split("/").filter(Boolean).pop();
    return name ? decodeURIComponent(name) : "Arquivo anexado";
  };

  const objectLabel = (value: unknown): string => {
    if (Array.isArray(value)) {
      const labels = value
        .map((item) => objectLabel(item))
        .filter(Boolean);
      return labels.length ? labels.join(", ") : `${value.length} item(s)`;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const candidate = record.name ?? record.label ?? record.title ?? record.file_name;
      if (typeof candidate === "string" && candidate.trim()) return candidate;
      if (typeof record.url === "string" && record.url.trim()) return fromUrl(record.url);
      if (typeof record.path === "string" && record.path.trim()) return fromUrl(record.path);
      return "Dados preenchidos";
    }
    return String(value);
  };

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
    case "file":
      return objectLabel(raw);
    default:
      if (typeof raw === "object") return objectLabel(raw);
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
  leadScore,
  leadScoreBreakdown,
  onClick,
  onOpenContact,
  isDragOverlay,
  companies = [],
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
        "p-2.5 space-y-1.5 transition-colors overflow-hidden",
        isDragOverlay && "shadow-lg rotate-1 scale-[1.02]",
      )}
    >
      <div className="flex items-center justify-between gap-1.5 text-sm font-medium">
        <div className="flex items-center gap-1.5 min-w-0">
          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span
            className={cn(
              "truncate",
              onOpenContact && lead?.id && "cursor-pointer hover:text-primary",
            )}
            onClick={(e) => {
              if (onOpenContact && lead?.id) {
                e.stopPropagation();
                onOpenContact(lead.id);
              }
            }}
          >
            {formatDisplayName(lead?.name, lead?.phone, "[Novo Contato - WhatsApp]")}
          </span>
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

      {/* Sprint 6.8 T3.3 — unified Lead Score badge (hidden when no score) */}
      {leadScore !== null && leadScore !== undefined && (
        <div className="flex items-center gap-1">
          <LeadScoreBadge score={leadScore} breakdown={leadScoreBreakdown} />
          <span className="text-[10px] text-muted-foreground">Lead Score</span>
        </div>
      )}

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

      {/* Sprint 6.7 — Company chips from opportunity_links */}
      {companies.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {companies.map((c) => (
            <RelationChip key={c.id} label={c.name} />
          ))}
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
      className="grid grid-cols-2 gap-1 pt-1.5 border-t border-border/60"
      onClick={stop}
      onPointerDown={stop}
    >
      <button
        type="button"
        onClick={() => navigate(`/chat?contact=${leadId}`)}
        className="min-w-0 inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded-md text-[11px] text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
        title={`Abrir conversa no ${BRAND.product}`}
      >
        <MessageSquareText className="h-3 w-3 shrink-0" />
        <span className="truncate">Chat</span>
      </button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="min-w-0 inline-flex items-center justify-center gap-1 px-1.5 py-1 rounded-md text-[11px] text-muted-foreground bg-muted/60 hover:bg-muted transition-colors"
            title="Registrar touchpoint"
          >
            <MessageSquarePlus className="h-3 w-3 shrink-0" />
            <span className="truncate">Touchpoint</span>
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
