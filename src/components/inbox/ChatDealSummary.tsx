// Sprint Suporte 1 · #8 — o resumo do negócio no chat usa o mesmo modelo do cartão
// do Kanban (buildCardModel): etapa, valor, próximo contato e campos-chave. Sem
// visão nova: só lê o que LeadOpportunitiesSection já carrega (mesmo cache).

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import { usePipelines } from "@/hooks/usePipelines";
import { usePipelineStagesV2 } from "@/hooks/usePipelineStagesV2";
import { buildCardModel, cardFieldsFor } from "@/lib/cardModel";
import { summarizeChatDeal } from "@/lib/chatOwnership";
import { DEFAULT_NATIVE_CARD_FLAGS } from "@/components/crm/OpportunityCard";
import type { BoardCard } from "@/types/board";

export function ChatDealSummary({ leadId, nextContact }: { leadId: string; nextContact?: string | null }) {
  const { opportunities } = useOpportunities({ leadId });
  const { activePipelines } = usePipelines();
  const { nameOf } = useMemberDirectory();
  const deal = summarizeChatDeal(opportunities);
  const pipeline = activePipelines.find((p) => p.id === deal?.pipeline_id);
  const { stages } = usePipelineStagesV2(deal?.pipeline_id);
  const stage = stages.find((s) => s.id === deal?.stage_id);

  const model = useMemo(() => {
    if (!deal) return null;
    const card = {
      ...deal,
      lead: { id: leadId, next_contact: nextContact ?? null },
      owner_name: null,
      touchpoint_count: 0,
    } as unknown as BoardCard;
    return buildCardModel(card, stage, DEFAULT_NATIVE_CARD_FLAGS, cardFieldsFor(pipeline), new Date(), (id) =>
      nameOf(id),
    );
  }, [deal, leadId, nextContact, stage, pipeline, nameOf]);

  if (!deal || !model) return null;
  return (
    <div className="space-y-1.5" data-testid="chat-deal-summary">
      <div className="flex items-center gap-2 flex-wrap">
        {stage && (
          <Badge variant="outline" className="text-xs" style={{ borderColor: stage.color, color: stage.color }}>
            {stage.name}
          </Badge>
        )}
        {model.valueText && <span className="text-xs font-medium">{model.valueText}</span>}
        {model.timeInStageText && <span className="text-[11px] text-muted-foreground">{model.timeInStageText}</span>}
        {model.nextContactBadge && (
          <span className="text-[11px] text-muted-foreground">Próx. contato: {model.nextContactBadge.label}</span>
        )}
      </div>
      {model.badges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {model.badges.map((b) => (
            <Badge key={b.kind} variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
              {b.label}
            </Badge>
          ))}
        </div>
      )}
      {model.fields.map((f) => (
        <div key={f.field_id} className="flex justify-between gap-2 text-xs">
          <span className="text-muted-foreground truncate">{f.label}</span>
          <span className="truncate text-right">{f.value}</span>
        </div>
      ))}
    </div>
  );
}
