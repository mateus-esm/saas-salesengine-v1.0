/**
 * Sprint 9 — "Visão geral": the top of the top-down structure.
 *
 * Reading order is deliberate and matches how a founder actually looks at their
 * own operation: the money first, then the funnel that produced it, then the
 * trend, then where it leaked, then what to do this afternoon.
 *
 * Which cards appear, and in what order, comes from the saved layout (T8).
 * The catalogue owns the design of each card; the client owns the selection.
 */
import { Link } from "react-router-dom";
import {
  Banknote,
  CalendarCheck,
  Clock,
  FileText,
  Loader2,
  MessageSquare,
  Settings2,
  TrendingDown,
  TrendingUp,
  UserPlus,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KpiTile } from "@/components/dashboard/KpiTile";
import { FunnelChart } from "@/components/dashboard/FunnelChart";
import { RevenueTrendChart, TrendChart } from "@/components/dashboard/TrendChart";
import { BreakdownView } from "@/components/dashboard/BreakdownView";
import { CustomizeDashboardSheet } from "@/components/dashboard/CustomizeDashboardSheet";
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
  useFunnelBreakdown,
  useFunnelMapStatus,
  useFunnelOverview,
  useFunnelSeries,
  useLossReasons,
  useTopOpportunities,
} from "@/hooks/useDashboardV2";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import { WIDGET_BY_ID } from "@/config/widgetCatalog";
import type { SeriesGranularity } from "@/types/dashboard";
import { useDashboardContext } from "./DashboardLayout";

export default function OverviewPage() {
  const { filters, preset } = useDashboardContext();
  const { layout } = useDashboardLayout();

  // Weeks for the long window — a 90-day daily line is 90 points of noise
  // where the client wants a shape.
  const granularity: SeriesGranularity = preset === "90d" ? "week" : "day";

  const { data: overview, isLoading } = useFunnelOverview(filters);
  const { data: series } = useFunnelSeries(filters, granularity);
  const { data: losses } = useLossReasons(filters);
  const { data: top } = useTopOpportunities(filters, 8);
  const { data: mapStatus } = useFunnelMapStatus();
  const { data: byChannel } = useFunnelBreakdown(filters, "channel");
  const { data: byResponsible } = useFunnelBreakdown(filters, "responsible");

  const unmapped = isFunnelUnmapped(mapStatus);

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  const o = overview;
  const on = (id: string) => layout.find((w) => w.id === id)?.visible ?? false;

  // Ordered by the saved layout, then split by kind so the KPI grid stays a
  // grid instead of interleaving full-width panels into it.
  const ordered = layout.filter((w) => w.visible);
  const kpiIds = ordered.filter((w) => WIDGET_BY_ID.get(w.id)?.kind === "kpi").map((w) => w.id);
  const panelIds = ordered.filter((w) => WIDGET_BY_ID.get(w.id)?.kind === "panel").map((w) => w.id);

  const kpi = (id: string) => {
    switch (id) {
      case "kpi_won_value":
        return (
          <KpiTile
            key={id}
            label="Receita ganha"
            value={formatBRL(o?.won_value)}
            hint={`${formatInt(o?.deals_won)} negócios fechados`}
            icon={Banknote}
            emphasis
            tone="positive"
          />
        );
      case "kpi_open_value":
        return (
          <KpiTile
            key={id}
            label="Pipeline aberto"
            value={formatBRL(o?.open_value)}
            hint={`${formatInt(o?.open_count)} oportunidades em aberto`}
            icon={TrendingUp}
            emphasis
          />
        );
      case "kpi_avg_ticket":
        return (
          <KpiTile
            key={id}
            label="Ticket médio"
            value={o?.avg_ticket != null ? formatBRL(o.avg_ticket) : "—"}
            hint="Por negócio ganho"
            icon={FileText}
          />
        );
      case "kpi_lost_value":
        return (
          <KpiTile
            key={id}
            label="Valor perdido"
            value={formatBRL(o?.lost_value)}
            hint={`${formatInt(o?.deals_lost)} negócios perdidos`}
            icon={TrendingDown}
            tone={o?.deals_lost ? "negative" : "default"}
          />
        );
      case "kpi_new_leads":
        return <KpiTile key={id} label="Novos leads" value={formatInt(o?.new_leads)} icon={UserPlus} />;
      case "kpi_proposals":
        return (
          <KpiTile key={id} label="Propostas enviadas" value={formatInt(o?.proposals_sent)} icon={FileText} />
        );
      case "kpi_meetings":
        return (
          <KpiTile
            key={id}
            label="Reuniões realizadas"
            value={formatInt(o?.meetings_done)}
            hint={`${formatRate(o?.show_rate)} de comparecimento`}
            icon={CalendarCheck}
          />
        );
      case "kpi_touchpoints":
        return (
          <KpiTile
            key={id}
            label="Interações"
            value={formatInt(o?.touchpoints)}
            hint={`${formatRate(o?.touchpoints_per_lead, "")} por lead`}
            icon={MessageSquare}
          />
        );
      case "kpi_win_rate":
        return (
          <KpiTile
            key={id}
            label="Taxa de ganho"
            value={formatRate(o?.win_rate)}
            hint={`${formatInt(o?.deals_lost)} perdidos no período`}
            icon={TrendingUp}
            tone={o?.win_rate != null && o.win_rate >= 50 ? "positive" : "default"}
          />
        );
      case "kpi_no_show":
        return (
          <KpiTile
            key={id}
            label="No-show"
            value={formatInt(o?.no_shows)}
            hint={`${formatRate(o?.no_show_rate)} das agendadas`}
            icon={UserX}
            tone={o?.no_shows ? "negative" : "default"}
          />
        );
      case "kpi_cycle":
        return (
          <KpiTile
            key={id}
            label="Ciclo de venda"
            value={o?.avg_cycle_days != null ? `${formatRate(o.avg_cycle_days, "")} d` : "—"}
            hint="Da criação ao ganho"
            icon={Clock}
          />
        );
      default:
        return null;
    }
  };

  const panel = (id: string) => {
    switch (id) {
      case "panel_funnel":
        return (
          <ChartCard
            key={id}
            title="Funil do período"
            description="Quantos negócios passaram por cada etapa — não onde estão parados hoje."
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
        );
      case "panel_trend":
        return (
          <ChartCard key={id} title="Evolução" description="Contagens por período.">
            <TrendChart data={series ?? []} granularity={granularity} />
          </ChartCard>
        );
      case "panel_revenue_trend":
        return (
          <ChartCard key={id} title="Receita ao longo do tempo" description="Em reais.">
            <RevenueTrendChart data={series ?? []} granularity={granularity} />
          </ChartCard>
        );
      case "panel_loss_reasons":
        return (
          <ChartCard
            key={id}
            title="Por que perdemos"
            description="Negócios marcados como perdidos neste período."
          >
            {losses && losses.length > 0 ? (
              <LossReasonList rows={losses} />
            ) : (
              <EmptyChart message="Nenhum negócio perdido no período — ou nenhum motivo registrado ainda." />
            )}
          </ChartCard>
        );
      case "panel_top_opportunities":
        return (
          <ChartCard
            key={id}
            className="lg:col-span-2"
            title="Melhores oportunidades abertas"
            description="Maior valor primeiro. A coluna de dias parado é a que decide o que fazer hoje."
          >
            <TopOpportunitiesTable rows={top ?? []} />
          </ChartCard>
        );
      case "panel_by_channel":
        return (
          <ChartCard
            key={id}
            className="lg:col-span-2"
            title="Por canal de aquisição"
            description="De onde vieram os leads que fecharam."
          >
            <BreakdownView rows={byChannel ?? []} metric="won_value" />
          </ChartCard>
        );
      case "panel_by_responsible":
        return (
          <ChartCard
            key={id}
            className="lg:col-span-2"
            title="Por responsável"
            description="Quem trouxe receita no período."
          >
            <BreakdownView rows={byResponsible ?? []} metric="won_value" />
          </ChartCard>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <CustomizeDashboardSheet />
      </div>

      {unmapped && <UnmappedBanner />}

      {kpiIds.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{kpiIds.map(kpi)}</div>
      )}

      {panelIds.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">{panelIds.map(panel)}</div>
      )}

      {kpiIds.length === 0 && panelIds.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="text-xs text-muted-foreground">
            Todos os cartões estão desligados. Abra "Personalizar" para escolher o que ver.
          </p>
        </div>
      )}
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
