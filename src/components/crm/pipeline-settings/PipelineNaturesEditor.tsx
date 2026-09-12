import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ORIGIN_CATEGORY_OPTIONS } from "@/config/originTaxonomy";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useCatalog } from "@/hooks/useCatalog";
import { useDefaultPipeline } from "@/hooks/useDefaultPipeline";
import { useEntries } from "@/hooks/useEntries";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import { usePipelineStagesV2 } from "@/hooks/usePipelineStagesV2";
import { platformLabel } from "@/lib/attribution";
import { ENTRY_KIND_LABEL, ownerRuleLabel, type Entry } from "@/lib/campaigns";
import {
  MILESTONES,
  durationError,
  durationWindow,
  entriesFeedingLine,
  missingMilestones,
  normalizeNatures,
} from "@/lib/natures";
import type { Milestone, PipelineNatures } from "@/types/natures";
import type { Pipeline } from "@/types/pipelines";

const sb = supabase as any;

interface PipelineNaturesEditorProps {
  pipeline: Pipeline;
}

const categoryLabel = (v: string | null) => (v ? ORIGIN_CATEGORY_OPTIONS.find((o) => o.value === v)?.label ?? v : null);

/** An entry's stamp in one line: category · platform · default campaign. */
const stampOf = (e: Entry) =>
  [categoryLabel(e.origin_category), e.platform ? platformLabel(e.platform) : null, e.campaign_name].filter(Boolean).join(" · ") ||
  "Sem carimbo";

/**
 * Sprint 11 · Onda 3 · T35 — what the line sells and how it sells.
 *
 * Oferta: free value (today's behaviour) or the catalog — which items the line
 * offers (the deal's item picker shows only those). Processo: the milestones of
 * a consultative sale (each becomes a stage that declares it, so the dashboard
 * counts it from day one) or a one-touch purchase. Saved on its own, apart from
 * the page's "Salvar".
 *
 * Onda 5 · T55 — Duração: continuous, or a campaign with a start and an end
 * (after the end, new deals go to the team's default line; the placar becomes
 * the campaign's). Entradas: the doors whose new deals land here, with their
 * stamp — edited where they live (webhooks; CRM › Campanhas › Entradas).
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
  const { entries } = useEntries();
  const { defaultPipelineId } = useDefaultPipeline();
  const { nameOf } = useMemberDirectory();
  const feeding = entriesFeedingLine(entries, pipeline.id, defaultPipelineId);
  const isDefault = defaultPipelineId === pipeline.id;

  useEffect(() => setDraft(stored), [stored]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(stored);
  const declared = new Set(stages.filter((s) => !s.deleted_at).map((s) => s.funnel_event).filter(Boolean));
  const missing = draft.process.mode === "milestones" ? missingMilestones(stages.filter((s) => !s.deleted_at), draft.process.milestones) : [];

  const setOffer = (patch: Partial<PipelineNatures["offer"]>) => setDraft((d) => ({ ...d, offer: { ...d.offer, ...patch } }));
  const setProcess = (patch: Partial<PipelineNatures["process"]>) => setDraft((d) => ({ ...d, process: { ...d.process, ...patch } }));
  const setDuration = (patch: Partial<PipelineNatures["duration"]>) => setDraft((d) => ({ ...d, duration: { ...d.duration, ...patch } }));
  const durationErr = durationError(draft.duration);
  const campaignWindow = durationWindow(draft.duration);
  const closedNow = durationWindow(stored.duration)?.state === "ended";

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
      const message = e instanceof Error ? e.message : String(e);
      toast.error(
        message.includes("invalid_duration")
          ? "A campanha precisa de início e fim, com o fim depois do início."
          : "Não foi possível salvar a natureza: " + message,
      );
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
      {/* ── Duração ── */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Duração — até quando a linha recebe</h3>
          <p className="text-xs text-muted-foreground">
            Numa campanha, depois do fim os negócios novos vão para a linha padrão da equipe; quem já está aqui continua.
          </p>
        </div>
        <RadioGroup
          value={draft.duration.mode}
          onValueChange={(v) => setDuration({ mode: v as PipelineNatures["duration"]["mode"] })}
          className="grid gap-2 sm:grid-cols-2"
        >
          <Label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 font-normal">
            <RadioGroupItem value="continuous" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Contínua</span>
              <span className="block text-xs text-muted-foreground">Recebe sempre.</span>
            </span>
          </Label>
          <Label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 font-normal">
            <RadioGroupItem value="campaign" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Campanha</span>
              <span className="block text-xs text-muted-foreground">Início e fim; o placar vira o da campanha.</span>
            </span>
          </Label>
        </RadioGroup>
        {draft.duration.mode === "campaign" && (
          <div className="grid gap-3 rounded-md border border-border/60 p-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="line-starts-on">Início</Label>
              <Input
                id="line-starts-on"
                type="date"
                value={draft.duration.starts_on ?? ""}
                onChange={(e) => setDuration({ starts_on: e.target.value || null })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="line-ends-on">Fim (último dia)</Label>
              <Input
                id="line-ends-on"
                type="date"
                value={draft.duration.ends_on ?? ""}
                onChange={(e) => setDuration({ ends_on: e.target.value || null })}
              />
            </div>
            {durationErr ? (
              <p className="text-xs text-destructive sm:col-span-2">{durationErr}</p>
            ) : campaignWindow ? (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {campaignWindow.state === "ended"
                  ? "Encerrada: os negócios novos vão para a linha padrão da equipe."
                  : campaignWindow.state === "upcoming"
                    ? "Ainda não começou — a linha já recebe."
                    : `No ar: dia ${campaignWindow.elapsedDays} de ${campaignWindow.totalDays}.`}
              </p>
            ) : null}
            {isDefault && (
              <p className="text-xs text-amber-600 sm:col-span-2">
                Esta é a linha padrão da equipe: depois do fim ela continua recebendo, porque não há outra para onde
                mandar. Escolha outra linha padrão antes do fim.
              </p>
            )}
          </div>
        )}
      </section>

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
        <Button size="sm" onClick={save} disabled={!dirty || saving || !!durationErr}>
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Salvar natureza
        </Button>
      </div>

      {/* ── Entradas ── */}
      <section className="space-y-3 border-t border-border/60 pt-4">
        <div>
          <h3 className="text-sm font-semibold">Entradas — quem alimenta a linha</h3>
          <p className="text-xs text-muted-foreground">
            As portas cujo negócio novo nasce aqui, com o carimbo de cada uma. Cadastro manual e importação escolhem a
            linha na hora.
          </p>
        </div>
        {feeding.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma entrada põe negócio novo nesta linha. Aponte um webhook para ela, ou um número de WhatsApp ou o
            agente em{" "}
            <Link to="/crm?tab=campanhas" className="underline underline-offset-2 hover:text-foreground">
              CRM › Campanhas › Entradas
            </Link>
            .
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border rounded-md border border-border">
              {feeding.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
                  <span className="min-w-0 text-sm">
                    <span className="font-medium">{e.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {" "}· {ENTRY_KIND_LABEL[e.kind]}
                      {!e.active && " · desativada"}
                      {!e.pipeline_id && " · pela linha padrão"}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {stampOf(e)} · {ownerRuleLabel(e.owner_rule, nameOf)}
                  </span>
                </li>
              ))}
            </ul>
            {closedNow && !isDefault && (
              <p className="text-xs text-amber-600">
                Campanha encerrada: estas entradas já mandam o negócio novo para a linha padrão da equipe.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              O carimbo e quem pega o negócio se editam em{" "}
              <Link to="/crm?tab=campanhas" className="underline underline-offset-2 hover:text-foreground">
                CRM › Campanhas › Entradas
              </Link>
              .
            </p>
          </>
        )}
      </section>
    </div>
  );
}
