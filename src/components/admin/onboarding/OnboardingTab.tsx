import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { ChevronDown, ChevronRight, Loader2, Rocket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  useMoveStage,
  useOnboardings,
  useOnboardingStages,
  type OnboardingRow,
  type OnboardingStage,
} from "@/hooks/useOnboarding";
import { cn } from "@/lib/utils";

import { GoLiveDialog } from "./GoLiveDialog";
import { OnboardingCard } from "./OnboardingCard";
import { OnboardingSheet } from "./OnboardingSheet";

function Column({
  stage, cards, children, collapsed, onToggle,
}: {
  stage: OnboardingStage;
  cards: OnboardingRow[];
  children: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  if (collapsed) {
    return (
      <button
        ref={setNodeRef}
        onClick={onToggle}
        className={cn(
          "flex w-11 shrink-0 flex-col items-center gap-3 rounded-lg border bg-muted/30 py-3",
          isOver && "border-primary bg-primary/5",
        )}
      >
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold tabular-nums">{cards.length}</span>
        <span
          className="text-xs font-medium text-muted-foreground"
          style={{ writingMode: "vertical-rl" }}
        >
          {stage.label}
        </span>
      </button>
    );
  }

  return (
    <div ref={setNodeRef} className="flex w-[264px] shrink-0 flex-col">
      <div className="mb-2 flex items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <button
            onClick={onToggle}
            className="flex items-center gap-1 text-sm font-semibold hover:text-primary"
          >
            {stage.is_terminal && <ChevronDown className="h-3.5 w-3.5" />}
            {stage.label}
            <span className="ml-1 text-xs font-normal text-muted-foreground tabular-nums">
              {cards.length}
            </span>
          </button>
          {/* A definição de pronto fica à vista. Uma etapa sem critério de saída
              é onde o trabalho apodrece. */}
          {stage.description && (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
              {stage.description}
            </p>
          )}
        </div>
      </div>

      <div
        className={cn(
          "flex min-h-[120px] flex-1 flex-col gap-2 rounded-lg border border-dashed p-2 transition",
          isOver ? "border-primary bg-primary/5" : "border-transparent bg-muted/30",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Sprint 8.2 — o quadro de onboarding.
 *
 * O processo entre "aceitou" e "está no ar" — discovery, treinamento do agente,
 * canais, CRM, integração de anúncios — não existia em lugar nenhum do software.
 * Vivia na cabeça do fundador, e um cliente parado há doze dias esperando a
 * reunião de discovery era invisível.
 *
 * Arrastar entre etapas é um update simples. Entrar em "Ativo" NÃO é: dispara o
 * trial, emite a cobrança da implantação e avisa o cliente. Por isso o card
 * solto ali abre o diálogo de go-live em vez de simplesmente se mover — um
 * arrasto acidental não pode iniciar uma cobrança recorrente.
 */
export function OnboardingTab() {
  const { data: stages, isLoading: stagesLoading } = useOnboardingStages();
  const { data: cards, isLoading: cardsLoading } = useOnboardings();
  const moveStage = useMoveStage();
  const { toast } = useToast();

  const [dragging, setDragging] = useState<OnboardingRow | null>(null);
  const [detail, setDetail] = useState<OnboardingRow | null>(null);
  const [goLiveTarget, setGoLiveTarget] = useState<OnboardingRow | null>(null);
  // "Ativo" começa fechada: cliente no ar não é trabalho em andamento, mas
  // precisa continuar alcançável.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ ativo: true });

  // Um arrasto só começa depois de 6px, senão todo clique no card vira arrasto
  // e o painel de detalhe nunca abre.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byStage = useMemo(() => {
    const map = new Map<string, OnboardingRow[]>();
    for (const s of stages ?? []) map.set(s.id, []);
    for (const c of cards ?? []) map.get(c.stage_id)?.push(c);
    return map;
  }, [stages, cards]);

  const goLiveStage = (stages ?? []).find((s) => s.code === "go_live");
  const terminal = (stages ?? []).find((s) => s.is_terminal);

  const handleDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const card = (cards ?? []).find((c) => c.id === e.active.id);
    const targetStageId = e.over?.id as string | undefined;
    if (!card || !targetStageId || targetStageId === card.stage_id) return;

    // Soltar em "Ativo" pede confirmação: é dinheiro, não é organização.
    if (terminal && targetStageId === terminal.id) {
      setGoLiveTarget(card);
      return;
    }

    moveStage.mutate(
      { id: card.id, stageId: targetStageId },
      {
        onError: (err) =>
          toast({
            title: "Não foi possível mover",
            description: err instanceof Error ? err.message : undefined,
            variant: "destructive",
          }),
      },
    );
  };

  if (stagesLoading || cardsLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-[264px] shrink-0 rounded-lg" />
        ))}
      </div>
    );
  }

  const live = (cards ?? []).filter((c) => !!c.went_live_at).length;
  const emAndamento = (cards ?? []).length - live;
  const travados = (cards ?? []).filter((c) => c.health === "blocked").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Em implantação</p>
            <p className="text-2xl font-semibold tabular-nums">{emAndamento}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">No ar</p>
            <p className="text-2xl font-semibold tabular-nums">{live}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Travados</p>
            <p
              className={cn(
                "text-2xl font-semibold tabular-nums",
                travados > 0 && "text-red-600 dark:text-red-400",
              )}
            >
              {travados}
            </p>
          </CardContent>
        </Card>
      </div>

      {(cards ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Rocket className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Nenhum onboarding em andamento</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Um card aparece aqui quando você provisiona o ambiente de uma proposta
              aceita, na aba Propostas.
            </p>
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={(e: DragStartEvent) =>
            setDragging((cards ?? []).find((c) => c.id === e.active.id) ?? null)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          <div className="flex gap-3 overflow-x-auto pb-3">
            {(stages ?? []).map((stage) => {
              const stageCards = byStage.get(stage.id) ?? [];
              return (
                <Column
                  key={stage.id}
                  stage={stage}
                  cards={stageCards}
                  collapsed={!!collapsed[stage.code]}
                  onToggle={() =>
                    setCollapsed((c) => ({ ...c, [stage.code]: !c[stage.code] }))}
                >
                  {stageCards.map((card) => (
                    <OnboardingCard
                      key={card.id}
                      card={card}
                      stage={stage}
                      onOpen={setDetail}
                      onGoLive={setGoLiveTarget}
                      showGoLive={stage.id === goLiveStage?.id}
                    />
                  ))}
                </Column>
              );
            })}
          </div>

          <DragOverlay>
            {dragging && (
              <div className="w-[248px] rotate-2 rounded-lg border bg-card p-3 shadow-lg">
                <p className="text-sm font-medium">{dragging.cliente_nome}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <OnboardingSheet
        card={detail}
        stages={stages ?? []}
        onClose={() => setDetail(null)}
        onGoLive={(c) => { setDetail(null); setGoLiveTarget(c); }}
      />

      <GoLiveDialog
        card={goLiveTarget}
        onClose={() => setGoLiveTarget(null)}
      />
    </div>
  );
}
