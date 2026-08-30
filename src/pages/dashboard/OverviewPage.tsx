/**
 * Sprint 9 — "Visão geral": the top of the top-down structure.
 *
 * Reading order is deliberate and matches how a founder actually looks at their
 * own operation: the money first, then the funnel that produced it, then the
 * trend, then where it leaked, then what to do this afternoon.
 */
import { Link } from "react-router-dom";
import {
  Banknote,
  CalendarCheck,
  FileText,
  Loader2,
  Settings2,
  TrendingUp,
  UserPlus,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KpiTile } from "@/components/dashboard/KpiTile";
import { FunnelChart } from "@/components/dashboard/FunnelChart";
import { RevenueTrendChart, TrendChart } from "@/components/dashboard/TrendChart";
import {
  ChartCard,
  EmptyChart,
  formatBRL,
  formatInt,
  formatRate,
} from "@/components/dashboard/chart-primitives";
import { LossReasonList } from "@/components/dashboard/LossReasonList";
import { TopOpportunitiesTable } from "@/components/dashboard/TopOpportunitiesTable";
import {
  isFunnelUnmapped,
  useFunnelMapStatus,
  useFunnelOverview,
  useFunnelSeries,
  useLossReasons,
  useTopOpportunities,
} from "@/hooks/useDashboardV2";
import type { SeriesGranularity } from "@/types/dashboard";
import { useDashboardContext } from "./DashboardLayout";

export default function OverviewPage() {
  const { filters, preset } = useDashboardContext();

  // Days for short windows, months for long ones — a 90-day daily line is 90
  // points of noise where the client wants a shape.
  const granularity: SeriesGranularity =
    preset === "90d" ? "week" : preset === "today" ? "day" : "day";

  const { data: overview, isLoading } = useFunnelOverview(filters);
  const { data: series } = useFunnelSeries(filters, granularity);
  const { data: losses } = useLossReasons(filters);
  const { data: top } = useTopOpportunities(filters, 8);
  const { data: mapStatus } = useFunnelMapStatus();

  const unmapped = isFunnelUnmapped(mapStatus);

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  const o = overview;

  return (
    <div className="space-y-5">
      {unmapped && <UnmappedBanner />}

      {/* The money, first and biggest. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Receita ganha"
          value={formatBRL(o?.won_value)}
          hint={`${formatInt(o?.deals_won)} negócios fechados`}
          icon={Banknote}
          emphasis
          tone="positive"
        />
        <KpiTile
          label="Pipeline aberto"
          value={formatBRL(o?.open_value)}
          hint={`${formatInt(o?.open_count)} oportunidades em aberto`}
          icon={TrendingUp}
          emphasis
        />
        <KpiTile
          label="Ticket médio"
          value={o?.avg_ticket !== null && o?.avg_ticket !== undefined ? formatBRL(o.avg_ticket) : "—"}
          hint={`Ciclo médio ${formatRate(o?.avg_cycle_days, " dias")}`}
          icon={FileText}
        />
        <KpiTile
          label="Taxa de ganho"
          value={formatRate(o?.win_rate)}
          hint={`${formatInt(o?.deals_lost)} perdidos no período`}
          icon={TrendingUp}
          tone={o?.win_rate !== null && o?.win_rate !== undefined && o.win_rate >= 50 ? "positive" : "default"}
        />
      </div>

      {/* Volume, second. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Novos leads" value={formatInt(o?.new_leads)} icon={UserPlus} />
        <KpiTile label="Propostas enviadas" value={formatInt(o?.proposals_sent)} icon={FileText} />
        <KpiTile
          label="Reuniões realizadas"
          value={formatInt(o?.meetings_done)}
          hint={`${formatRate(o?.show_rate)} de comparecimento`}
          icon={CalendarCheck}
        />
        <KpiTile
          label="No-show"
          value={formatInt(o?.no_shows)}
          hint={formatRate(o?.no_show_rate) + " das agendadas"}
          icon={UserX}
          tone={o?.no_shows ? "negative" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Funil do período"
          description="Quantos negócios passaram por cada etapa — não onde eles estão parados hoje."
        >
          <FunnelChart
            steps={[
              { key: "new", label: "Novas oportunidades", value: o?.new_opportunities ?? 0 },
              { key: "qualified", label: "Qualificados", value: o?.qualified ?? 0 },
              { key: "proposal", label: "Propostas enviadas", value: o?.proposals_sent ?? 0 },
              { key: "meeting_sched", label: "Reuniões agendadas", value: o?.meetings_scheduled ?? 0 },
              { key: "meeting_done", label: "Reuniões realizadas", value: o?.meetings_done ?? 0 },
              { key: "won", label: "Ganhos", value: o?.deals_won ?? 0 },
            ]}
            emptyMessage={
              unmapped
                ? "Este funil ainda não sabe o que cada etapa do seu pipeline significa."
                : "Nenhum evento de funil neste período."
            }
            emptyAction={
              unmapped ? (
                <Button asChild size="sm" variant="outline" className="text-xs">
                  <Link to="/pipeline">Mapear etapas</Link>
                </Button>
              ) : undefined
            }
          />
        </ChartCard>

        <ChartCard title="Evolução" description="Contagens por período.">
          <TrendChart data={series ?? []} granularity={granularity} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Receita ganha ao longo do tempo" description="Em reais.">
          <RevenueTrendChart data={series ?? []} granularity={granularity} />
        </ChartCard>

        <ChartCard
          title="Por que perdemos"
          description="Negócios marcados como perdidos neste período."
        >
          {losses && losses.length > 0 ? (
            <LossReasonList rows={losses} />
          ) : (
            <EmptyChart message="Nenhum negócio perdido no período — ou nenhum motivo registrado ainda." />
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Melhores oportunidades abertas"
        description="Maior valor primeiro. A coluna de dias parado é a que decide o que fazer hoje."
      >
        <TopOpportunitiesTable rows={top ?? []} />
      </ChartCard>
    </div>
  );
}

function UnmappedBanner() {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/[0.04] px-4 py-3">
      <Settings2 className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 text-xs leading-relaxed">
        <span className="font-semibold text-foreground">
          Seus números de funil ainda estão vazios porque nenhuma etapa foi mapeada.
        </span>{" "}
        <span className="text-muted-foreground">
          Diga o que cada etapa do seu pipeline significa (proposta enviada, reunião agendada…) e o
          sistema reprocessa todo o seu histórico — não só daqui pra frente.
        </span>
      </div>
      <Button asChild size="sm" className="text-xs">
        <Link to="/pipeline">Mapear etapas</Link>
      </Button>
    </div>
  );
}
