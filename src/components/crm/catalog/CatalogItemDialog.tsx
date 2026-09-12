import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { usePipelines } from "@/hooks/usePipelines";
import { usePipelineStagesV2 } from "@/hooks/usePipelineStagesV2";
import { parseBrNumber } from "@/lib/fields/registry";
import { catalogItemErrors, EMPTY_CATALOG_DRAFT, recurrenceLabel, type CatalogDraft } from "@/lib/catalog";
import type { CatalogItem } from "@/types/revenue";

const SAME = "__same__";
const FIRST_OPEN = "__first_open__";

interface CatalogItemDialogProps {
  open: boolean;
  /** null = a new item. */
  item: CatalogItem | null;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: CatalogDraft & { id?: string }) => Promise<unknown>;
}

const toDraft = (item: CatalogItem | null): CatalogDraft =>
  item
    ? {
        name: item.name,
        kind: item.kind,
        price: item.price,
        price_mode: item.price_mode,
        recurrence_every: item.recurrence_every,
        recurrence_unit: item.recurrence_unit,
        renew_days_before: item.renew_days_before,
        renew_pipeline_id: item.renew_pipeline_id,
        renew_stage_id: item.renew_stage_id,
        description: item.description,
        active: item.active,
      }
    : { ...EMPTY_CATALOG_DRAFT };

const priceText = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

/**
 * Sprint 11 · Onda 3 · T29 — one catalog item: what it is, how it is priced and,
 * when it comes back (a cleaning every 6 months), when and where the return deal
 * opens. The rules are the database's; the form shows them before saving.
 */
export function CatalogItemDialog({ open, item, saving, onClose, onSave }: CatalogItemDialogProps) {
  const [draft, setDraft] = useState<CatalogDraft>(() => toDraft(item));
  const [price, setPrice] = useState(priceText(item?.price ?? null));
  const [showErrors, setShowErrors] = useState(false);
  const { activePipelines } = usePipelines();
  const { stages } = usePipelineStagesV2(draft.renew_pipeline_id ?? undefined);
  const openStages = stages.filter((s) => s.stage_type === "open").sort((a, b) => a.position - b.position);

  useEffect(() => {
    if (!open) return;
    setDraft(toDraft(item));
    setPrice(priceText(item?.price ?? null));
    setShowErrors(false);
  }, [open, item]);

  const set = (patch: Partial<CatalogDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const recurring = draft.recurrence_every !== null;
  const errors = catalogItemErrors(draft);

  const submit = async () => {
    if (errors.length > 0) {
      setShowErrors(true);
      return;
    }
    try {
      await onSave({ ...draft, id: item?.id });
      onClose();
    } catch {
      // the hook shows the error; the draft stays
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Editar item" : "Novo item do catálogo"}</DialogTitle>
          <DialogDescription>O que suas linhas vendem, a que preço e quando o serviço volta.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Nome</Label>
            <Input
              id="cat-name"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Ex.: Limpeza, Usina 5 kWp, Ingresso"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={draft.kind} onValueChange={(v) => set({ kind: v as CatalogDraft["kind"] })}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Produto</SelectItem>
                  <SelectItem value="service">Serviço</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Preço</Label>
              <Select value={draft.price_mode} onValueChange={(v) => set({ price_mode: v as CatalogDraft["price_mode"] })}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="negotiable">Negociável</SelectItem>
                  <SelectItem value="fixed">Fixo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-price">{draft.price_mode === "fixed" ? "Valor (R$)" : "Valor sugerido (R$, opcional)"}</Label>
            <Input
              id="cat-price"
              inputMode="decimal"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                const n = parseBrNumber(e.target.value);
                set({ price: e.target.value.trim() === "" ? null : n });
              }}
              placeholder="0,00"
            />
            <p className="text-xs text-muted-foreground">
              {draft.price_mode === "fixed"
                ? "O negócio usa este preço."
                : "O vendedor ajusta o preço em cada negócio."}
            </p>
          </div>

          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Volta de tempos em tempos</p>
                <p className="text-xs text-muted-foreground">
                  Quando vendido, um negócio novo abre antes do próximo ciclo.
                </p>
              </div>
              <Switch
                checked={recurring}
                onCheckedChange={(on) =>
                  set(
                    on
                      ? { recurrence_every: 6, recurrence_unit: "month", renew_days_before: 15 }
                      : { recurrence_every: null, recurrence_unit: null, renew_days_before: 0, renew_pipeline_id: null, renew_stage_id: null },
                  )
                }
                aria-label="Volta de tempos em tempos"
              />
            </div>

            {recurring && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>A cada</span>
                  <Input
                    className="h-8 w-16"
                    inputMode="numeric"
                    value={draft.recurrence_every ?? ""}
                    onChange={(e) => set({ recurrence_every: e.target.value === "" ? 0 : parseInt(e.target.value, 10) || 0 })}
                    aria-label="Intervalo"
                  />
                  <Select
                    value={draft.recurrence_unit ?? "month"}
                    onValueChange={(v) => set({ recurrence_unit: v as CatalogDraft["recurrence_unit"] })}
                  >
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">meses</SelectItem>
                      <SelectItem value="day">dias</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">
                    ({recurrenceLabel(draft.recurrence_every, draft.recurrence_unit) ?? "—"})
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>Abrir o retorno</span>
                  <Input
                    className="h-8 w-16"
                    inputMode="numeric"
                    value={draft.renew_days_before}
                    onChange={(e) => set({ renew_days_before: parseInt(e.target.value, 10) || 0 })}
                    aria-label="Dias de antecedência"
                  />
                  <span>dias antes</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">No pipeline</Label>
                    <Select
                      value={draft.renew_pipeline_id ?? SAME}
                      onValueChange={(v) => set({ renew_pipeline_id: v === SAME ? null : v, renew_stage_id: null })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SAME}>O mesmo do negócio</SelectItem>
                        {activePipelines.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Na etapa</Label>
                    <Select
                      value={draft.renew_stage_id ?? FIRST_OPEN}
                      onValueChange={(v) => set({ renew_stage_id: v === FIRST_OPEN ? null : v })}
                      disabled={!draft.renew_pipeline_id}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={FIRST_OPEN}>Primeira etapa aberta</SelectItem>
                        {openStages.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">Descrição (opcional)</Label>
            <Textarea
              id="cat-desc"
              rows={2}
              value={draft.description ?? ""}
              onChange={(e) => set({ description: e.target.value || null })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Disponível para vender</p>
              <p className="text-xs text-muted-foreground">Pausado não aparece para novos negócios.</p>
            </div>
            <Switch checked={draft.active} onCheckedChange={(on) => set({ active: on })} aria-label="Disponível" />
          </div>

          {showErrors && errors.length > 0 && (
            <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
