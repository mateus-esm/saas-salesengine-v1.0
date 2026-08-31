/**
 * Sprint 9 — where the client teaches the dashboard what their pipeline means.
 *
 * This is the small screen the entire BI area depends on. Until a stage is
 * mapped, "propostas enviadas" has no way to know which column that is, so
 * every funnel widget stays honestly empty. The dashboard's empty state links
 * straight here.
 *
 * Two things live together because they are the same job — describing the
 * commercial process — and splitting them across two screens would mean a
 * client configures one and never finds the other:
 *
 *   1. what each stage MEANS (stage → canonical funnel event)
 *   2. the reasons offered when a deal is lost
 *
 * After a remap, history is reprocessed on demand rather than automatically:
 * the rebuild rewrites every number the team looks at, so it is a button
 * somebody presses, not a side effect of editing a dropdown.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePipelineStagesV2 } from "@/hooks/usePipelineStagesV2";
import { usePipelines } from "@/hooks/usePipelines";
import { FUNNEL_EVENT_LABELS, MAPPABLE_FUNNEL_EVENTS } from "@/types/dashboard";
import type { Pipeline } from "@/types/pipelines";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const NONE = "__none__";

interface LossReason {
  label: string;
  color?: string;
}

export function PipelineFunnelSettings({ pipeline }: { pipeline: Pipeline }) {
  const { stages, isLoading, updateStage } = usePipelineStagesV2(pipeline.id);
  const { updatePipeline } = usePipelines();
  const qc = useQueryClient();

  const recompute = useMutation({
    mutationFn: async () => {
      const { data, error } = await sb.rpc("recompute_funnel_events", {
        p_pipeline_id: pipeline.id,
      });
      if (error) throw error;
      return data as { pipelines_processed: number; net_events_change: number };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["funnel_overview"] });
      qc.invalidateQueries({ queryKey: ["funnel_series"] });
      qc.invalidateQueries({ queryKey: ["funnel_breakdown"] });
      qc.invalidateQueries({ queryKey: ["funnel_map_status"] });
      toast.success(
        `Histórico reprocessado (${r?.net_events_change >= 0 ? "+" : ""}${r?.net_events_change ?? 0} eventos)`,
      );
    },
    onError: (e: Error) => toast.error(e.message ?? "Não foi possível reprocessar"),
  });

  // --- loss reasons, edited as a local draft and saved explicitly ----------
  const initialReasons = useMemo<LossReason[]>(() => {
    const raw = (pipeline as unknown as { loss_reasons?: unknown }).loss_reasons;
    return Array.isArray(raw) ? (raw as LossReason[]) : [];
  }, [pipeline]);

  const [reasons, setReasons] = useState<LossReason[]>(initialReasons);
  const [newReason, setNewReason] = useState("");

  useEffect(() => setReasons(initialReasons), [initialReasons]);

  const reasonsDirty =
    JSON.stringify(reasons.map((r) => r.label)) !==
    JSON.stringify(initialReasons.map((r) => r.label));

  const addReason = () => {
    const label = newReason.trim();
    if (!label) return;
    if (reasons.some((r) => r.label.toLowerCase() === label.toLowerCase())) {
      toast.error("Esse motivo já está na lista");
      return;
    }
    setReasons((r) => [...r, { label }]);
    setNewReason("");
  };

  const liveStages = (stages ?? []).filter((s) => !s.deleted_at);
  const mappedCount = liveStages.filter(
    (s) => s.stage_type === "won" || s.stage_type === "lost" || !!s.funnel_event,
  ).length;

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">O que cada etapa significa</CardTitle>
          <CardDescription className="text-xs">
            O dashboard e o relatório não adivinham o seu processo. Diga qual etapa é "proposta
            enviada", qual é "reunião agendada", e os números passam a existir — inclusive para
            trás. Etapas de ganho e perda já são reconhecidas pelo tipo da etapa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {liveStages.map((stage) => {
                const terminal = stage.stage_type === "won" || stage.stage_type === "lost";
                const current = (stage as { funnel_event?: string | null }).funnel_event ?? null;
                return (
                  <div
                    key={stage.id}
                    className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                      {stage.name}
                    </span>

                    {terminal ? (
                      // Not editable on purpose: stage_type already decides this,
                      // and a second control saying the same thing would drift.
                      <span className="shrink-0 rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                        {stage.stage_type === "won" ? "Ganho" : "Perdido"} · pelo tipo da etapa
                      </span>
                    ) : (
                      <Select
                        value={current ?? NONE}
                        onValueChange={(v) =>
                          updateStage.mutate({
                            id: stage.id,
                            funnel_event: v === NONE ? null : v,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-[190px] shrink-0 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE} className="text-xs text-muted-foreground">
                            Sem significado no funil
                          </SelectItem>
                          {MAPPABLE_FUNNEL_EVENTS.map((ev) => (
                            <SelectItem key={ev} value={ev} className="text-xs">
                              {FUNNEL_EVENT_LABELS[ev]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <p className="text-[11px] text-muted-foreground">
                  {mappedCount} de {liveStages.length} etapas com significado definido.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  disabled={recompute.isPending}
                  onClick={() => recompute.mutate()}
                >
                  {recompute.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Reprocessar histórico
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Reprocessar relê todas as movimentações já registradas e reconstrói os números do
                dashboard com o mapa atual. É seguro rodar quantas vezes quiser — rodar duas vezes
                seguidas não muda nada.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Motivos de perda</CardTitle>
          <CardDescription className="text-xs">
            Oferecidos quando um negócio é movido para uma etapa de perda. Uma lista curta é lida;
            uma lista de vinte vira "outro".
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {reasons.map((r) => (
              <span
                key={r.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"
              >
                {r.color && (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: r.color }}
                  />
                )}
                {r.label}
                <button
                  type="button"
                  onClick={() => setReasons((list) => list.filter((x) => x.label !== r.label))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remover ${r.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {reasons.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Nenhum motivo configurado — a equipe poderá digitar um texto livre.
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Input
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addReason();
                }
              }}
              placeholder="Adicionar motivo (ex.: Prazo de entrega)"
              className="h-8 text-xs"
              maxLength={40}
            />
            <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1 text-xs" onClick={addReason}>
              <Plus className="h-3 w-3" />
              Adicionar
            </Button>
          </div>

          {reasonsDirty && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() =>
                  updatePipeline.mutate(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    { id: pipeline.id, loss_reasons: reasons } as any,
                    { onSuccess: () => toast.success("Motivos de perda salvos") },
                  )
                }
              >
                Salvar motivos
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => setReasons(initialReasons)}
              >
                Descartar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
