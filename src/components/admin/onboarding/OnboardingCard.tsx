import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, CalendarClock, Lock, Rocket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/hooks/useBilling";
import { cardUrgency, daysInStage, type OnboardingRow, type OnboardingStage } from "@/hooks/useOnboarding";
import { cn } from "@/lib/utils";

interface Props {
  card: OnboardingRow;
  stage: OnboardingStage | undefined;
  onOpen: (card: OnboardingRow) => void;
  onGoLive: (card: OnboardingRow) => void;
  /** O card na coluna Go-live ganha o botão; nas outras ele seria prematuro. */
  showGoLive: boolean;
}

/** dd/mm — o ano só aparece quando não é o corrente, para caber no card. */
function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", ...(sameYear ? {} : { year: "2-digit" }),
  });
}

/**
 * Um cliente no quadro.
 *
 * Mostra as quatro coisas que decidem para onde olhar primeiro: quem é, quanto
 * vale, há quanto tempo está parado e quando prometemos entregar. O resto vive
 * no painel de detalhe — um card que tenta contar tudo não é lido de relance,
 * e ler de relance é a única razão de existir de um quadro.
 */
export function OnboardingCard({ card, stage, onOpen, onGoLive, showGoLive }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
  });

  const urgency = cardUrgency(card);
  const days = daysInStage(card.entered_stage_at);

  // A data prevista fica vermelha quando já passou: é a promessa que o cliente
  // tem no vencimento da fatura de implantação, então atrasá-la tem preço.
  const atrasado = card.golive_previsto
    ? new Date(`${card.golive_previsto}T23:59:59`) < new Date()
    : false;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "rounded-lg border bg-card p-3 text-left shadow-sm transition",
        "hover:border-primary/40 hover:shadow-md",
        isDragging && "opacity-40",
        urgency === "warn" && "border-amber-500/50",
        urgency === "late" && "border-red-500/60",
      )}
    >
      {/* A alça de arrasto é o corpo do card; o botão fica fora dela para que
          clicar em "Colocar no ar" não vire um arrasto de 2px. */}
      <div
        {...listeners}
        {...attributes}
        role="button"
        tabIndex={0}
        onClick={() => onOpen(card)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(card); }
        }}
        className="cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight">{card.cliente_nome}</p>
            {/* Sprint 8.2 — cliente que já operava antes deste processo existir.
                Sem a marca, um card em "Ativo" parece ter passado por discovery
                e implantação aqui, e não passou. */}
            {card.is_legacy && (
              <Badge
                variant="outline"
                className="mt-1 h-4 px-1 text-[9px] font-normal text-muted-foreground"
              >
                Legado
              </Badge>
            )}
          </div>
          {card.monthly_value > 0 && (
            <span className="shrink-0 text-xs font-semibold text-muted-foreground">
              {formatBRL(card.monthly_value)}
            </span>
          )}
        </div>

        {card.health === "blocked" && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="line-clamp-2">{card.blocked_reason}</span>
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span
            className={cn(
              "inline-flex items-center gap-1",
              urgency === "warn" && "text-amber-600 dark:text-amber-400",
              urgency === "late" && "font-medium text-red-600 dark:text-red-400",
            )}
          >
            {urgency !== "ok" && <AlertTriangle className="h-3 w-3" />}
            {days === 0 ? "hoje" : days === 1 ? "1 dia" : `${days} dias`}
          </span>

          <span
            className={cn(
              "inline-flex items-center gap-1",
              atrasado && "font-medium text-red-600 dark:text-red-400",
            )}
            title={atrasado
              ? "A previsão de conclusão já passou — é a data que o cliente tem no vencimento da implantação"
              : "Previsão de conclusão da implantação"}
          >
            <CalendarClock className="h-3 w-3" />
            {shortDate(card.golive_previsto)}
          </span>

          {/* De quem é a bola. Metade dos travamentos não são nossos, e sem isto
              o quadro mostra o atraso sem mostrar a causa. */}
          {stage && !stage.is_terminal && (
            <Badge
              variant="outline"
              className={cn(
                "h-4 px-1.5 text-[10px] font-normal",
                stage.owner === "cliente" && "border-violet-500/40 text-violet-600 dark:text-violet-400",
              )}
            >
              {stage.owner === "cliente" ? "cliente" : "Solo"}
            </Badge>
          )}
        </div>
      </div>

      {showGoLive && (
        <Button
          size="sm"
          className="mt-3 h-7 w-full text-xs"
          onClick={(e) => { e.stopPropagation(); onGoLive(card); }}
        >
          <Rocket className="mr-1.5 h-3 w-3" />
          Colocar no ar
        </Button>
      )}
    </div>
  );
}
