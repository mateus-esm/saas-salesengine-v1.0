/**
 * Sprint 9 — "Funil": the funnel by pipeline.
 *
 * Two clients running two pipelines have two different processes, and averaging
 * them produces a shape neither of them has. So the funnel is shown per
 * pipeline, and the breakdown underneath says which pipeline is actually
 * converting.
 */
import { Loader2 } from "lucide-react";
import { ChartCard } from "@/components/dashboard/chart-primitives";
import { FunnelChart } from "@/components/dashboard/FunnelChart";
import { BreakdownView } from "@/components/dashboard/BreakdownView";
import { useFunnelBreakdown, useFunnelOverview } from "@/hooks/useDashboardV2";
import { useDashboardContext } from "./DashboardLayout";

export default function FunnelPage() {
  const { filters } = useDashboardContext();
  const { data: overview, isLoading } = useFunnelOverview(filters);
  const { data: byPipeline } = useFunnelBreakdown(filters, "pipeline");

  if (isLoading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  const o = overview;

  return (
    <div className="space-y-5">
      <ChartCard
        title="Funil consolidado"
        description="Eventos que aconteceram no período, independente de onde o negócio está hoje."
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
        />
      </ChartCard>

      <ChartCard title="Por pipeline" description="Volume e conversão de cada processo comercial.">
        <BreakdownView rows={byPipeline ?? []} metric="won_value" />
      </ChartCard>
    </div>
  );
}
