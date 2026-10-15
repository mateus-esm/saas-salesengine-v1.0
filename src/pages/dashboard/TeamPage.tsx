/**
 * Sprint 9 — "Time": the same funnel, per responsible.
 *
 * A plain seat reaches this page filtered to themselves by the RPC, so it reads
 * as a personal scorecard rather than a leaderboard they are missing from.
 */
import { Loader2 } from "lucide-react";
import { ChartCard } from "@/components/dashboard/chart-primitives";
import { BreakdownView } from "@/components/dashboard/BreakdownView";
import { TouchpointsBySellerView } from "@/components/dashboard/TouchpointsBySellerView";
import {
  useDashboardFilterOptions,
  useFunnelBreakdown,
  useTouchpointsBySeller,
} from "@/hooks/useDashboardV2";
import { useDashboardContext } from "./DashboardLayout";

export default function TeamPage() {
  const { filters } = useDashboardContext();
  const { data: rows, isLoading } = useFunnelBreakdown(filters, "responsible");
  const { data: options } = useDashboardFilterOptions();
  const { data: touchpoints } = useTouchpointsBySeller(filters);

  if (isLoading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ChartCard
        title={options?.can_see_team ? "Receita por responsável" : "Seus números"}
        description={
          options?.can_see_team
            ? "Quem trouxe receita no período, e com que taxa de conversão."
            : "Seu próprio funil no período selecionado."
        }
      >
        <BreakdownView rows={rows ?? []} metric="won_value" />
      </ChartCard>

      <ChartCard
        title="Carga aberta por responsável"
        description="Quanto valor cada pessoa tem em aberto agora."
      >
        <BreakdownView rows={rows ?? []} metric="open_value" />
      </ChartCard>

      <ChartCard
        title="Touchpoints por vendedor"
        description={
          options?.can_see_team
            ? "Quantos contatos cada pessoa registrou no período."
            : "Seus contatos registrados no período."
        }
      >
        <TouchpointsBySellerView data={touchpoints} />
      </ChartCard>
    </div>
  );
}
