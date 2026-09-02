import { useEffect, useState } from "react";
import { ArrowRight, ExternalLink, Loader2, Rocket } from "lucide-react";

import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useOnboardingEvents, useUpdateOnboarding,
  type OnboardingRow, type OnboardingStage,
} from "@/hooks/useOnboarding";

interface Props {
  card: OnboardingRow | null;
  stages: OnboardingStage[];
  onClose: () => void;
  onGoLive: (card: OnboardingRow) => void;
}

const HEALTH: { value: OnboardingRow["health"]; label: string }[] = [
  { value: "on_track", label: "No prazo" },
  { value: "at_risk", label: "Em risco" },
  { value: "blocked", label: "Travado" },
];

/** `datetime-local` só aceita 'YYYY-MM-DDTHH:mm'; o banco devolve ISO com fuso. */
const toLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * O detalhe de um card.
 *
 * O quadro mostra o que decide para onde olhar; aqui fica o que decide o que
 * fazer. O histórico é a parte que não existe em lugar nenhum: um cliente que
 * voltou duas vezes de Homologação para Implantação tem um problema que a
 * posição atual do card não conta.
 */
export function OnboardingSheet({ card, stages, onClose, onGoLive }: Props) {
  const { toast } = useToast();
  const update = useUpdateOnboarding();
  const { data: events, isLoading: eventsLoading } = useOnboardingEvents(card?.id ?? null);

  const [form, setForm] = useState({
    golive_previsto: "",
    discovery_agendado_em: "",
    discovery_feito_em: "",
    health: "on_track" as OnboardingRow["health"],
    blocked_reason: "",
    notes: "",
  });

  useEffect(() => {
    if (!card) return;
    setForm({
      golive_previsto: card.golive_previsto ?? "",
      discovery_agendado_em: toLocalInput(card.discovery_agendado_em),
      discovery_feito_em: toLocalInput(card.discovery_feito_em),
      health: card.health,
      blocked_reason: card.blocked_reason ?? "",
      notes: card.notes ?? "",
    });
  }, [card]);

  const stageLabel = (code: string | null) =>
    stages.find((s) => s.code === code)?.label ?? code ?? "—";

  const save = async () => {
    if (!card) return;
    // O banco recusa 'blocked' sem motivo (é um CHECK). Dizer isso aqui é mais
    // útil do que deixar a violação de constraint chegar como toast genérico.
    if (form.health === "blocked" && !form.blocked_reason.trim()) {
      toast({
        title: "Diga o que travou",
        description: "Um card travado sem motivo é um card que ninguém consegue destravar.",
        variant: "destructive",
      });
      return;
    }
    try {
      await update.mutateAsync({
        id: card.id,
        golive_previsto: form.golive_previsto || null,
        discovery_agendado_em: form.discovery_agendado_em
          ? new Date(form.discovery_agendado_em).toISOString() : null,
        discovery_feito_em: form.discovery_feito_em
          ? new Date(form.discovery_feito_em).toISOString() : null,
        health: form.health,
        blocked_reason: form.health === "blocked" ? form.blocked_reason.trim() : null,
        notes: form.notes || null,
      });
      toast({ title: "Salvo" });
      onClose();
    } catch (e) {
      toast({
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  };

  return (
    <Sheet open={!!card} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{card?.cliente_nome}</SheetTitle>
          <SheetDescription>
            {stageLabel(stages.find((s) => s.id === card?.stage_id)?.code ?? null)}
            {card?.went_live_at && " · no ar"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="prev" className="text-xs">Previsão de conclusão</Label>
            <Input
              id="prev"
              type="date"
              value={form.golive_previsto}
              onChange={(e) => setForm((f) => ({ ...f, golive_previsto: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">
              É o vencimento da fatura de implantação. Mudar aqui muda o que o cliente
              vê no boleto.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="disc-a" className="text-xs">Discovery agendado</Label>
              <Input
                id="disc-a"
                type="datetime-local"
                value={form.discovery_agendado_em}
                onChange={(e) => setForm((f) => ({ ...f, discovery_agendado_em: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="disc-f" className="text-xs">Discovery realizado</Label>
              <Input
                id="disc-f"
                type="datetime-local"
                value={form.discovery_feito_em}
                onChange={(e) => setForm((f) => ({ ...f, discovery_feito_em: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Situação</Label>
            <Select
              value={form.health}
              onValueChange={(v) => setForm((f) => ({ ...f, health: v as OnboardingRow["health"] }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {HEALTH.map((h) => (
                  <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.health === "blocked" && (
            <div className="space-y-1.5">
              <Label htmlFor="motivo" className="text-xs">O que travou</Label>
              <Input
                id="motivo"
                value={form.blocked_reason}
                onChange={(e) => setForm((f) => ({ ...f, blocked_reason: e.target.value }))}
                placeholder="Cliente não enviou o material do agente"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notas" className="text-xs">Notas</Label>
            <Textarea
              id="notas"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={save} disabled={update.isPending} className="flex-1">
              {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
            {card && !card.went_live_at && (
              <Button variant="secondary" onClick={() => onGoLive(card)}>
                <Rocket className="mr-2 h-4 w-4" />
                No ar
              </Button>
            )}
          </div>

          {(card?.equipe_id || card?.proposal_id) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {card?.equipe_id && (
                <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs">
                  <a href={`/admin?tab=equipes&equipe=${card.equipe_id}`}>
                    <ExternalLink className="mr-1.5 h-3 w-3" />
                    Equipe
                  </a>
                </Button>
              )}
              {card?.proposal_id && (
                <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs">
                  <a href="/admin?tab=propostas">
                    <ExternalLink className="mr-1.5 h-3 w-3" />
                    Proposta
                  </a>
                </Button>
              )}
            </div>
          )}

          <Separator />

          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Histórico</p>
            {eventsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (events ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem movimentações.</p>
            ) : (
              <ol className="space-y-2">
                {(events ?? []).map((ev) => (
                  <li key={ev.id} className="flex items-center gap-2 text-xs">
                    <span className="tabular-nums text-muted-foreground">
                      {new Date(ev.created_at).toLocaleDateString("pt-BR", {
                        day: "2-digit", month: "2-digit",
                      })}
                    </span>
                    {ev.from_stage && (
                      <>
                        <span className="text-muted-foreground">{stageLabel(ev.from_stage)}</span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      </>
                    )}
                    <span className="font-medium">{stageLabel(ev.to_stage)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
