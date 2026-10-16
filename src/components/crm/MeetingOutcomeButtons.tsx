/**
 * SE-SUP1-8 (#10) — os três desfechos de uma reunião, como botões.
 *
 * No card do negócio cada clique registra um marco (não há "desmarcar": o card
 * não sabe a qual reunião o clique se refere). Num evento da agenda o botão
 * marcado mostra o desfecho e, clicado de novo, desfaz — o RPC apaga a linha que
 * aquele evento gravou.
 */
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMeetingOutcome } from "@/hooks/useMeetingOutcome";
import { MEETING_OUTCOMES, nextOutcome } from "@/lib/meetingOutcome";
import { cn } from "@/lib/utils";

interface Props {
  opportunityId?: string | null;
  agendaEventId?: string | null;
  /** agenda_events.outcome — só o estado do botão. */
  current?: string | null;
  compact?: boolean;
  className?: string;
}

export function MeetingOutcomeButtons({ opportunityId, agendaEventId, current, compact, className }: Props) {
  const mutation = useMeetingOutcome();
  const fromAgenda = !!agendaEventId;

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)} onClick={(e) => e.stopPropagation()}>
      {MEETING_OUTCOMES.map((o) => {
        const active = fromAgenda && current === o.value;
        const pending = mutation.isPending && mutation.variables?.outcome === o.value;
        return (
          <Button
            key={o.value}
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            className={cn(compact ? "h-6 px-2 text-[10px]" : "h-7 px-2.5 text-xs")}
            disabled={mutation.isPending}
            aria-pressed={fromAgenda ? active : undefined}
            title={active ? "Clique para desfazer" : `Registrar: ${o.label}`}
            onClick={() =>
              mutation.mutate({
                opportunityId,
                agendaEventId,
                outcome: nextOutcome(current, o.value, fromAgenda),
              })
            }
          >
            {pending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}
