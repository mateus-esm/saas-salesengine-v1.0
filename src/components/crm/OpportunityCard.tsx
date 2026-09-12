import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRightLeft, Clock, MessageCircle, MessageSquare, MessageSquarePlus, MessageSquareText } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useLogTouchpoint, type CreateTouchpointData } from "@/hooks/useTouchpoints";
import { useCopilotApprovals } from "@/hooks/useCopilotApprovals";
import { buildCardModel, type CardBadgeKind } from "@/lib/cardModel";
import { formatBrPhone } from "@/lib/displayName";
import type { BoardCard } from "@/types/board";
import type { CustomFieldSchema, PipelineStageV2 } from "@/types/pipelines";
import { BRAND } from "@/config/brand";

import { SyncButton } from "./copilot/SyncButton";
import { UserAvatar } from "./fields/UserAvatar";
import { RelationChip } from "./grid/RelationChip";
import { LeadScoreBadge } from "./LeadScoreBadge";
import { NextContactBadge } from "./NextContactBadge";

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

const BADGE_STYLE: Record<CardBadgeKind, string> = {
  won: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  lost: "border-border bg-muted text-muted-foreground",
  overdue: "border-destructive/30 bg-destructive/10 text-destructive",
  sla: "border-destructive/30 bg-destructive/10 text-destructive",
  interactions: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

const MAX_TAGS = 3;

interface OpportunityCardProps {
  /** Sprint 11 · T24 — the board card carries everything the card draws. */
  card: BoardCard;
  stage: PipelineStageV2 | undefined;
  /** Schema entries whose field_id ∈ pipeline.card_field_ids (already filtered, in order). */
  cardFields: CustomFieldSchema[];
  nativeFlags?: NativeCardFlags;
  onClick: () => void;
  onOpenContact?: (leadId: string) => void;
  /** Touch screens: moving is "Mover para…", not dragging. */
  onMoveRequest?: () => void;
  isDragOverlay?: boolean;
  /** Member names for "Usuário" fields and the owner (loaded once by the Kanban). */
  nameOf?: (userId: string) => string | null;
}

const toLocalDateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Stop drag/open propagation so the card's controls don't move or open it. */
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

/**
 * Sprint 11 · Onda 2B · T24 — the Kanban card, drawn from buildCardModel:
 * name and owner; value · time in stage · next contact; badges in order; up to
 * three card fields, tags and companies; actions on hover (desktop) or always
 * (touch). No request per card: everything comes in the board card, and the
 * Copilot approvals are one shared query per pipeline.
 */
export const OpportunityCard = ({
  card,
  stage,
  cardFields,
  nativeFlags = DEFAULT_NATIVE_CARD_FLAGS,
  onClick,
  onOpenContact,
  onMoveRequest,
  isDragOverlay,
  nameOf,
}: OpportunityCardProps) => {
  const queryClient = useQueryClient();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "opportunity", opportunity: card },
    disabled: isDragOverlay || !!onMoveRequest,
  });

  const model = useMemo(
    () => buildCardModel(card, stage, nativeFlags, cardFields, new Date(), nameOf),
    [card, stage, nativeFlags, cardFields, nameOf],
  );
  const lead = card.lead;

  // Sprint 6.3 T8 — Intent Detected badge (hits shared React Query cache, no extra request)
  const { data: approvals = [] } = useCopilotApprovals(card.pipeline_id);
  const intentDecision = approvals.find(
    (d) =>
      d.opportunity_id === card.id &&
      (d.output_action as { intent_detected?: boolean } | null)?.intent_detected === true,
  );
  const intentKeyword =
    (intentDecision?.output_action as { intent_keyword?: string } | null)?.intent_keyword ?? null;

  // T11 (Sprint 5) — Driver Override: change the next contact right on the card.
  const handleNextContactChange = async (date: Date | null) => {
    if (!lead?.id) return;
    await (supabase as any)
      .from("leads")
      .update({ next_contact: date ? toLocalDateString(date) : null })
      .eq("id", lead.id);
    queryClient.invalidateQueries({ queryKey: ["board"] });
    queryClient.invalidateQueries({ queryKey: ["opp_table"] });
    queryClient.invalidateQueries({ queryKey: ["lead", lead.id] });
  };

  const style = isDragOverlay
    ? undefined
    : { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const hiddenTags = Math.max(0, model.tags.length - MAX_TAGS);
  const showWhatsApp = nativeFlags.whatsapp && !!lead?.phone;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "group select-none space-y-1.5 overflow-hidden rounded-md border border-border bg-card p-2.5 transition-colors",
        onMoveRequest ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
        "hover:border-primary/50 hover:shadow-sm",
        model.status === "lost" && "opacity-75",
        isDragOverlay && "rotate-1 scale-[1.02] shadow-lg",
      )}
    >
      {/* Line 1 — who, and whose */}
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "min-w-0 truncate text-sm font-medium leading-5",
            onOpenContact && model.leadId && "cursor-pointer hover:text-primary",
          )}
          title={model.title}
          onClick={(e) => {
            if (onOpenContact && model.leadId) {
              e.stopPropagation();
              onOpenContact(model.leadId);
            }
          }}
        >
          {model.title}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {card.lead_score !== null && card.lead_score !== undefined && (
            <LeadScoreBadge
              score={card.lead_score}
              size="sm"
              breakdown={{ icp: card.icp_score, velocity: card.velocity }}
            />
          )}
          <UserAvatar userId={model.ownerId} name={model.ownerName} size="xs" />
        </div>
      </div>

      {/* Line 2 — value · time in stage · touchpoints · next contact */}
      {(model.valueText || model.timeInStageText || nativeFlags.touchpoints || (nativeFlags.nextContact && lead)) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          {model.valueText && (
            <span className="font-semibold text-green-600 dark:text-green-400">{model.valueText}</span>
          )}
          {model.timeInStageText && (
            <span
              className={cn("inline-flex items-center gap-0.5", model.slaBreached && "font-medium text-destructive")}
              title={model.slaBreached ? `Acima do SLA da etapa (${stage?.max_idle_hours}h)` : "Tempo na etapa"}
            >
              <Clock className="h-3 w-3 shrink-0" />
              {model.timeInStageText}
            </span>
          )}
          {nativeFlags.touchpoints && (
            <span
              className={cn("inline-flex items-center gap-0.5", model.interactionsBreached && "font-medium text-amber-600")}
              title={`${model.touchpointCount} interações`}
            >
              <MessageSquare className="h-3 w-3 shrink-0" />
              {model.touchpointCount}
            </span>
          )}
          {nativeFlags.nextContact && lead && !isDragOverlay && (
            <span onClick={stop} onPointerDown={stop}>
              <NextContactBadge
                nextContactLabel={model.nextContactBadge?.label ?? null}
                nextContactState={model.nextContactBadge?.variant ?? null}
                currentDate={lead.next_contact ?? null}
                onChange={handleNextContactChange}
              />
            </span>
          )}
        </div>
      )}

      {/* Badges — outcome, overdue, SLA, interaction cap; then the Copilot's intent */}
      {(model.badges.length > 0 || (!isDragOverlay && intentDecision)) && (
        <div className="flex flex-wrap gap-1">
          {model.badges.map((b) => (
            <span
              key={b.kind}
              className={cn("max-w-full truncate rounded border px-1.5 py-0.5 text-[10px] font-medium", BADGE_STYLE[b.kind])}
              title={b.label}
            >
              {b.label}
            </span>
          ))}
          {!isDragOverlay && intentDecision && (
            <span
              className="truncate rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
              title={
                intentKeyword
                  ? `O lead mencionou "${intentKeyword}". Sincronize o Copilot.`
                  : "Intenção comercial detectada pelo Copilot."
              }
            >
              Intenção detectada
            </span>
          )}
        </div>
      )}

      {/* Line 3 — the card's fields, then tags and companies */}
      {model.fields.length > 0 && (
        <div className="space-y-0.5 border-t border-border/60 pt-1">
          {model.fields.map((f) => (
            <div key={f.field_id} className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="truncate uppercase tracking-wide text-muted-foreground">{f.label}</span>
              <span className="truncate text-foreground/90">{f.value}</span>
            </div>
          ))}
        </div>
      )}
      {(model.companies.length > 0 || model.tags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1">
          {model.companies.map((c) => (
            <RelationChip key={c.id} label={c.name} />
          ))}
          {model.tags.slice(0, MAX_TAGS).map((t) => (
            <span key={t} className="max-w-[8rem] truncate rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t}
            </span>
          ))}
          {hiddenTags > 0 && <span className="text-[10px] text-muted-foreground">+{hiddenTags}</span>}
        </div>
      )}

      {/* Actions — on hover where there is a mouse, always on touch */}
      {!isDragOverlay && lead?.id && (
        <div
          className={cn(
            "flex items-center gap-1 border-t border-border/60 pt-1.5 transition-opacity",
            "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100",
          )}
          onClick={stop}
          onPointerDown={stop}
        >
          <ChatAction leadId={lead.id} />
          <TouchpointAction leadId={lead.id} />
          {showWhatsApp && (
            <a
              href={`https://wa.me/${lead.phone!.replace(/\D/g, "").replace(/^(?!55)/, "55$&")}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-green-700 hover:bg-green-500/10 dark:text-green-400"
              title={`WhatsApp ${formatBrPhone(lead.phone) ?? lead.phone}`}
              aria-label="Abrir no WhatsApp"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </a>
          )}
          <span className="ml-auto flex items-center gap-1">
            {onMoveRequest && (
              <button
                type="button"
                onClick={onMoveRequest}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-primary hover:bg-primary/10"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Mover para…
              </button>
            )}
            <SyncButton
              mode="single"
              variant="card"
              leadId={lead.id}
              opportunityId={card.id}
              pipelineId={card.pipeline_id}
            />
          </span>
        </div>
      )}
    </div>
  );
};

function ChatAction({ leadId }: { leadId: string }) {
  const navigate = useNavigate();
  const title = `Abrir conversa no ${BRAND.product}`;
  return (
    <button
      type="button"
      onClick={() => navigate(`/chat?contact=${leadId}`)}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-primary hover:bg-primary/10"
      title={title}
      aria-label={title}
    >
      <MessageSquareText className="h-3.5 w-3.5" />
    </button>
  );
}

function TouchpointAction({ leadId }: { leadId: string }) {
  const logTouchpoint = useLogTouchpoint();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TouchpointType>("whatsapp");
  const [content, setContent] = useState("");

  const register = () => {
    logTouchpoint.mutate(
      {
        lead_id: leadId,
        touchpoint_type: type,
        content: content.trim() || TOUCHPOINT_TYPES.find((t) => t.value === type)!.label,
      },
      {
        onSuccess: () => {
          setContent("");
          setOpen(false);
        },
      },
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Registrar touchpoint"
          aria-label="Registrar touchpoint"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 space-y-2" onClick={stop} onPointerDown={stop}>
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
        <Button size="sm" className="h-8 w-full" onClick={register} disabled={logTouchpoint.isPending}>
          Registrar
        </Button>
      </PopoverContent>
    </Popover>
  );
}
