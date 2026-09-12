import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useCatalog } from "@/hooks/useCatalog";
import { usePipelineStagesV2 } from "@/hooks/usePipelineStagesV2";
import { MILESTONES, missingMilestones, normalizeNatures } from "@/lib/natures";
import type { Milestone, PipelineNatures } from "@/types/natures";
import type { Pipeline } from "@/types/pipelines";

const sb = supabase as any;

interface PipelineNaturesEditorProps {
  pipeline: Pipeline;
}

/**
 * Sprint 11 · Onda 3 · T35 — what the line sells and how it sells.
 *
 * Oferta: free value (today's behaviour) or the catalog — which items the line
 * offers (the deal's item picker shows only those). Processo: the milestones of
 * a consultative sale (each becomes a stage that declares it, so the dashboard
 * counts it from day one) or a one-touch purchase. Saved on its own, apart from
 * the page's "Salvar".
 */
export function PipelineNaturesEditor({ pipeline }: PipelineNaturesEditorProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const equipeId = profile?.equipe_id;
  const stored = useMemo(() => normalizeNatures(pipeline.natures), [pipeline.natures]);
  const [draft, setDraft] = useState<PipelineNatures>(stored);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const { items: catalog } = useCatalog();
  const { stages } = usePipelineStagesV2(pipeline.id);

  useEffect(() => setDraft(stored), [stored]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(stored);
  const declared = new Set(stages.filter((s) => !s.deleted_at).map((s) => s.funnel_event).filter(Boolean));
  const missing = draft.process.mode === "milestones" ? missingMilestones(stages.filter((s) => !s.deleted_at), draft.process.milestones) : [];

  const setOffer = (patch: Partial<PipelineNatures["offer"]>) => setDraft((d) => ({ ...d, offer: { ...d.offer, ...patch } }));
  const setProcess = (patch: Partial<PipelineNatures["process"]>) => setDraft((d) => ({ ...d, process: { ...d.process, ...patch } }));

  const toggleMilestone = (m: Milestone, on: boolean) =>
    setProcess({ milestones: on ? [...draft.process.milestones, m] : draft.process.milestones.filter((x) => x !== m) });

  const toggleItem = (id: string, on: boolean) =>
    setOffer({ catalog_item_ids: on ? [...draft.offer.catalog_item_ids, id] : draft.offer.catalog_item_ids.filter((x) => x !== id) });

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await sb.rpc("crm_save_pipeline_natures", { p_pipeline_id: pipeline.id, p_natures: draft });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["pipelines", equipeId] });
      toast.success("Natureza da linha salva");
    } catch (e) {
      toast.error("Não foi possível salvar a natureza: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const createMissing = async () => {
    setCreating(true);
    try {
      const { data, error } = await sb.rpc("crm_add_milestone_stages", { p_pipeline_id: pipeline.id, p_milestones: missing });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["pipeline_stages_v2"] });
      toast.success(`${Number(data) || 0} etapa(s) criada(s) — reordene em Etapas se quiser`);
    } catch (e) {
      toast.error("Não foi possível criar as etapas: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Oferta ── */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Oferta — o que a linha vende</h3>
          <p className="text-xs text-muted-foreground">Com catálogo, o negócio lista itens e o valor vira a soma deles.</p>
        </div>
        <RadioGroup
          value={draft.offer.mode}
          onValueChange={(v) => setOffer({ mode: v as PipelineNatures["offer"]["mode"] })}
          className="grid gap-2 sm:grid-cols-2"
        >
          <Label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 font-normal">
            <RadioGroupItem value="free" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Valor livre</span>
              <span className="block text-xs text-muted-foreground">O vendedor digita o valor do negócio.</span>
            </span>
          </Label>
          <Label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 font-normal">
            <RadioGroupItem value="catalog" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Catálogo</span>
              <span className="block text-xs text-muted-foreground">Produtos e serviços com preço e recorrência.</span>
            </span>
          </Label>
        </RadioGroup>
        {draft.offer.mode === "catalog" && (
          <div className="space-y-2 rounded-md border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">
              {catalog.length === 0
                ? "O catálogo está vazio — cadastre itens na aba Catálogo do CRM."
                : "Quais itens esta linha oferece (nenhum marcado = todos)."}
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {catalog.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.offer.catalog_item_ids.includes(c.id)}
                    onCheckedChange={(on) => toggleItem(c.id, !!on)}
                  />
                  <span className="truncate">{c.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Processo ── */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Processo — como a linha vende</h3>
          <p className="text-xs text-muted-foreground">
            Cada marco vira uma etapa que já conta no dashboard (qualificados, reuniões, propostas, contratos).
          </p>
        </div>
        <RadioGroup
          value={draft.process.mode}
          onValueChange={(v) => setProcess({ mode: v as PipelineNatures["process"]["mode"] })}
          className="grid gap-2 sm:grid-cols-2"
        >
          <Label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 font-normal">
            <RadioGroupItem value="milestones" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Venda com marcos</span>
              <span className="block text-xs text-muted-foreground">Qualificação, reunião, proposta, contrato.</span>
            </span>
          </Label>
          <Label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 font-normal">
            <RadioGroupItem value="direct" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Compra direta</span>
              <span className="block text-xs text-muted-foreground">Entrou → comprou (ou não).</span>
            </span>
          </Label>
        </RadioGroup>

        {draft.process.mode === "milestones" && (
          <div className="space-y-2 rounded-md border border-border/60 p-3">
            {MILESTONES.map((m) => {
              const on = draft.process.milestones.includes(m.key);
              return (
                <label key={m.key} className="flex cursor-pointer items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <Checkbox checked={on} onCheckedChange={(v) => toggleMilestone(m.key, !!v)} />
                    {m.label}
                  </span>
                  {declared.has(m.key) ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                      <Check className="h-3 w-3" /> já tem etapa
                    </span>
                  ) : (
                    on && <span className="text-[11px] text-amber-600">sem etapa</span>
                  )}
                </label>
              );
            })}
            {missing.length > 0 && (
              <Button variant="outline" size="sm" className="mt-1 h-8 text-xs" onClick={createMissing} disabled={creating}>
                {creating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                Criar {missing.length} etapa{missing.length > 1 ? "s" : ""} para os marcos que faltam
              </Button>
            )}
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Salvar natureza
        </Button>
      </div>
    </div>
  );
}
