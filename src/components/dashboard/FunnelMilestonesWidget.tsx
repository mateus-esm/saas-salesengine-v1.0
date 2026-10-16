/**
 * SE-SUP1-8 (#10) — "Marcos do funil": reunião agendada, realizada, no-show,
 * proposta enviada, qualificado e fechamento, contados por data.
 *
 * Tabela, não gráfico: a pergunta do gestor é "quantas reuniões o time fez
 * ontem / nesta semana / por vendedor", e a resposta é o número exato. Três
 * recortes do mesmo RPC (get_funnel_milestones): por período (dia/semana/mês no
 * fuso do cliente), por vendedor (dono do negócio no momento do marco) e por
 * pipeline. O período vem do seletor do painel, inclusive o personalizado.
 *
 * Antes do primeiro registro de um marco a célula mostra "—" e o rodapé diz
 * "série começa em <data>": o no-show só existe desde o botão de desfecho, e um
 * zero em setembro leria como "ninguém faltou".
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFunnelMilestones } from "@/hooks/useDashboardV2";
import { bucketLabel, cellValue, defaultGranularity, historyNotes } from "@/lib/funnelMilestonesView";
import type { DashboardFilters, SeriesGranularity } from "@/types/dashboard";
import { MILESTONES, type MilestoneCounts } from "../../../supabase/functions/_shared/funnel-milestones";
import { ChartCard, EmptyChart, formatInt } from "./chart-primitives";

type View = "period" | "seller" | "pipeline";

export function FunnelMilestonesWidget({ filters }: { filters: DashboardFilters }) {
  const [view, setView] = useState<View>("period");
  const [granularity, setGranularity] = useState<SeriesGranularity>(() =>
    defaultGranularity(filters.from, filters.to),
  );
  const { data, isLoading, error } = useFunnelMilestones(filters, granularity);

  const action = (
    <div className="flex shrink-0 items-center gap-1.5">
      <Select value={view} onValueChange={(v) => setView(v as View)}>
        <SelectTrigger className="h-7 w-[8.5rem] text-xs" aria-label="Recorte">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="period">Por período</SelectItem>
          <SelectItem value="seller">Por vendedor</SelectItem>
          <SelectItem value="pipeline">Por pipeline</SelectItem>
        </SelectContent>
      </Select>
      {view === "period" && (
        <Select value={granularity} onValueChange={(v) => setGranularity(v as SeriesGranularity)}>
          <SelectTrigger className="h-7 w-[6.5rem] text-xs" aria-label="Agrupar por">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Dia</SelectItem>
            <SelectItem value="week">Semana</SelectItem>
            <SelectItem value="month">Mês</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );

  const header = (first: string) => (
    <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
      <th className="py-1.5 pr-3 text-left font-medium">{first}</th>
      {MILESTONES.map((m) => (
        <th key={m.key} className="px-2 py-1.5 text-right font-medium whitespace-nowrap" title={m.label}>
          {m.short}
        </th>
      ))}
    </tr>
  );

  const countCells = (c: MilestoneCounts) =>
    MILESTONES.map((m) => (
      <td key={m.key} className="px-2 py-1 text-right tabular-nums">
        {formatInt(c[m.key])}
      </td>
    ));

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  } else if (error || !data) {
    body = <EmptyChart message="Não foi possível carregar os marcos." />;
  } else {
    const rows =
      view === "seller" ? data.by_seller : view === "pipeline" ? data.by_pipeline : null;
    const notes = historyNotes(data, filters.from);
    body = (
      <div className="space-y-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-xs">
            <thead>{header(view === "seller" ? "Vendedor" : view === "pipeline" ? "Pipeline" : "Período")}</thead>
            <tbody>
              {rows === null ? (
                data.series.map((p) => (
                  <tr key={p.bucket} className="border-b border-border/40">
                    <td className="py-1 pr-3 whitespace-nowrap text-muted-foreground">
                      {bucketLabel(p.bucket, data.granularity)}
                    </td>
                    {MILESTONES.map((m) => (
                      <td key={m.key} className="px-2 py-1 text-right tabular-nums">
                        {cellValue(p, m.key, data.since)}
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={MILESTONES.length + 1} className="py-4 text-center text-muted-foreground">
                    Nenhum marco registrado no período.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id ?? "none"} className="border-b border-border/40">
                    <td className="py-1 pr-3 truncate max-w-[12rem]">{r.name}</td>
                    {countCells(r)}
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-1.5 pr-3">Total</td>
                {countCells(data.totals)}
              </tr>
            </tfoot>
          </table>
        </div>
        {notes.length > 0 && (
          <ul className="space-y-0.5 text-[11px] text-muted-foreground">
            {notes.map((n) => (
              <li key={n.key}>— {n.text}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <ChartCard
      title="Marcos do funil"
      description="Contados pela data em que aconteceram (no-show e realizada pelo registro de desfecho)."
      action={action}
    >
      {body}
    </ChartCard>
  );
}
