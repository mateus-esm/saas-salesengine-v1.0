/**
 * O "Ganho" — irmão do LossReasonDialog e do RecycleDialog.
 *
 * Aberto por useMoveToStage quando UM negócio vai para uma etapa de ganho. Mostra
 * como a venda andou (ciclo, 1ª resposta, touchpoints, reuniões) e pede o
 * checklist: quais itens fecharam (e por quanto), qual proposta foi aceita e qual
 * contrato foi assinado. Confirmar grava o checklist (crm_close_won_prepare) e só
 * então move — o webhook de ganho já sai com o valor, a proposta e o contrato
 * certos. Fechar (Cancelar, Esc, clicar fora) CANCELA o movimento.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, FileSignature, FileText, Loader2, Trophy } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCloseWon, useDealTimeline } from "@/hooks/useDealTimeline";
import {
  brl,
  defaultArtifact,
  hoursLabel,
  shortDate,
  wonValue,
  type TimelineArtifact,
  type WonItemChoice,
} from "@/lib/dealTimeline";
import { cn } from "@/lib/utils";

import { DealTimelineStrip } from "./deal/DealTimeline";

interface Props {
  open: boolean;
  opportunityId: string;
  leadName?: string;
  onCancel: () => void;
  /** The checklist is saved; now run the move. */
  onConfirm: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "rascunho", generated: "gerada", sent: "enviada", accepted: "aceita", signed: "assinado", rejected: "descartada",
};

export function WonDialog({ open, opportunityId, leadName, onCancel, onConfirm }: Props) {
  const { data, isLoading, error } = useDealTimeline(opportunityId, open);
  const closeWon = useCloseWon();

  const [choices, setChoices] = useState<Record<string, WonItemChoice>>({});
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState<string>("");
  const [touched, setTouched] = useState(false);

  // Defaults once the deal loads: every item won at its price, the likely proposal/contract.
  useEffect(() => {
    if (!data || touched) return;
    setChoices(Object.fromEntries(data.items.map((i) => [i.id, { id: i.id, won: true, unit_price: i.unit_price }])));
    setProposalId(defaultArtifact(data.artifacts, "proposal"));
    setContractId(defaultArtifact(data.artifacts, "contract"));
  }, [data, touched]);

  useEffect(() => {
    if (!open) { setTouched(false); setManualValue(""); }
  }, [open]);

  const proposals = useMemo(() => data?.artifacts.filter((a) => a.kind === "proposal") ?? [], [data]);
  const contracts = useMemo(() => data?.artifacts.filter((a) => a.kind === "contract") ?? [], [data]);
  const proposal = proposals.find((p) => p.id === proposalId) ?? null;
  const hasItems = (data?.items.length ?? 0) > 0;
  const computed = data ? wonValue(data.items, choices, proposal, data.summary.value) : null;
  const value = hasItems || manualValue === "" ? computed : Number(manualValue);
  const noneWon = hasItems && Object.values(choices).every((c) => !c.won);

  const touch = () => setTouched(true);
  const setItem = (id: string, patch: Partial<WonItemChoice>) => {
    touch();
    setChoices((c) => ({ ...c, [id]: { ...c[id], ...patch } }));
  };

  const confirm = async () => {
    try {
      await closeWon.mutateAsync({
        opportunityId,
        items: Object.values(choices),
        proposalId,
        contractId,
        value: hasItems ? null : value,
      });
      onConfirm();
    } catch (e) {
      toast.error(`Não foi possível fechar a venda: ${(e as Error).message}`);
    }
  };

  const s = data?.summary;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !closeWon.isPending && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-emerald-500" />
            Fechar venda{leadName ? ` · ${leadName}` : ""}
          </DialogTitle>
          <DialogDescription>
            Confirme o que foi vendido. O valor do negócio, a proposta e o contrato seguem para as automações de ganho.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            {error ? "Não foi possível carregar o negócio." : <Loader2 className="h-5 w-5 animate-spin" />}
          </div>
        ) : (
          <div className="space-y-5">
            {/* Como a venda andou */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Ciclo" value={`${s!.cycle_days} dia${s!.cycle_days === 1 ? "" : "s"}`} />
              <Stat label="1ª resposta" value={hoursLabel(s!.first_response_hours)} />
              <Stat label="Touchpoints" value={String(s!.touchpoints)} hint={s!.last_touchpoint_at ? `último ${shortDate(s!.last_touchpoint_at)}` : undefined} />
              <Stat
                label="Reuniões"
                value={String(s!.meetings_done)}
                hint={s!.no_shows ? `${s!.no_shows} no-show` : s!.meetings_scheduled ? `${s!.meetings_scheduled} agendada(s)` : undefined}
                tone={s!.no_shows ? "warn" : undefined}
              />
            </div>
            <DealTimelineStrip timeline={data} compact />

            {/* Itens */}
            {hasItems && (
              <Section title="O que foi vendido" hint="Desmarque o que ficou fora da negociação">
                <div className="divide-y divide-border/60 rounded-lg border">
                  {data.items.map((i) => {
                    const c = choices[i.id];
                    return (
                      <label key={i.id} className={cn("flex items-center gap-3 px-3 py-2", c && !c.won && "opacity-50")}>
                        <Checkbox checked={c?.won ?? true} onCheckedChange={(v) => setItem(i.id, { won: v === true })} />
                        <span className="flex-1 min-w-0">
                          <span className={cn("block truncate text-sm font-medium", c && !c.won && "line-through")}>{i.name}</span>
                          {i.quantity !== 1 && <span className="text-xs text-muted-foreground">{i.quantity} ×</span>}
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          aria-label={`Preço de ${i.name}`}
                          className="h-8 w-32 text-right font-mono text-sm"
                          value={c?.unit_price ?? i.unit_price}
                          disabled={c && !c.won}
                          onChange={(e) => setItem(i.id, { unit_price: Number(e.target.value) })}
                        />
                      </label>
                    );
                  })}
                </div>
              </Section>
            )}

            <ArtifactPicker
              title="Proposta que fechou"
              icon={<FileText className="h-4 w-4" />}
              empty="Nenhuma proposta neste negócio."
              list={proposals}
              selected={proposalId}
              onSelect={(id) => { touch(); setProposalId(id); }}
            />
            <ArtifactPicker
              title="Contrato assinado"
              icon={<FileSignature className="h-4 w-4" />}
              empty="Nenhum contrato neste negócio."
              list={contracts}
              selected={contractId}
              onSelect={(id) => { touch(); setContractId(id); }}
            />

            {/* Valor */}
            <div className="flex items-end justify-between gap-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3">
              <div>
                <p className="text-xs text-muted-foreground">Valor real da venda</p>
                {hasItems ? (
                  <p className="text-xl font-semibold font-mono">{brl(value)}</p>
                ) : (
                  <Input
                    type="number"
                    step="0.01"
                    aria-label="Valor real da venda"
                    className="mt-1 h-9 w-44 font-mono"
                    placeholder={computed != null ? String(computed) : "0,00"}
                    value={manualValue}
                    onChange={(e) => setManualValue(e.target.value)}
                  />
                )}
              </div>
              {s!.value != null && value != null && value !== s!.value && (
                <p className="text-xs text-muted-foreground">antes {brl(s!.value)}</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={closeWon.isPending}>Cancelar</Button>
          <Button
            onClick={() => void confirm()}
            disabled={!data || closeWon.isPending || noneWon}
            className="bg-emerald-600 hover:bg-emerald-600/90 text-white"
          >
            {closeWon.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
            Confirmar ganho{value != null ? ` · ${brl(value)}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-semibold leading-tight">{value}</p>
      {hint && <p className={cn("text-[11px] text-muted-foreground", tone === "warn" && "text-rose-600 dark:text-rose-400")}>{hint}</p>}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium">{title}</h4>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function ArtifactPicker({
  title, icon, empty, list, selected, onSelect,
}: {
  title: string;
  icon: React.ReactNode;
  empty: string;
  list: TimelineArtifact[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (list.length === 0) {
    return (
      <Section title={title}>
        <p className="text-xs text-muted-foreground italic">{empty}</p>
      </Section>
    );
  }
  return (
    <Section title={title} hint={list.length > 1 ? "As outras ficam como descartadas" : undefined}>
      <div className="grid gap-1.5" role="radiogroup" aria-label={title}>
        {list.map((a) => {
          const on = a.id === selected;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onSelect(on ? null : a.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                on ? "border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500/40" : "hover:bg-muted/40",
              )}
            >
              <span className={cn("text-muted-foreground", on && "text-emerald-600")}>{icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-sm font-medium">{a.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[a.table, shortDate(a.created_at), a.items].filter(Boolean).join(" · ")}
                </span>
              </span>
              {a.value != null && <span className="font-mono text-sm">{brl(a.value)}</span>}
              {a.status && (
                <Badge variant="secondary" className="text-[10px]">{STATUS_LABEL[a.status] ?? a.status}</Badge>
              )}
            </button>
          );
        })}
      </div>
    </Section>
  );
}
