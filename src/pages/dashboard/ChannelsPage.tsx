/**
 * Sprint 9 — "Canais": where the leads come from, and which of those actually pay.
 *
 * Two different questions share this page on purpose:
 *
 *   canal de aquisição   — marketing/prospecting origin. The one that decides
 *                          where to spend money.
 *   canal de atendimento — whatsapp/instagram/…, the inbox. Nearly always
 *                          WhatsApp in this product, so it is the secondary cut,
 *                          shown but not led with.
 *
 * Collapsing the two into one "canal" chart is the mistake this page exists to
 * avoid — it reports that 90% of leads come from WhatsApp, which is true and
 * useless.
 */
import { Loader2 } from "lucide-react";
import { ChartCard } from "@/components/dashboard/chart-primitives";
import { BreakdownView } from "@/components/dashboard/BreakdownView";
import { useFunnelBreakdown } from "@/hooks/useDashboardV2";
import { useDashboardContext } from "./DashboardLayout";

export default function ChannelsPage() {
  const { filters } = useDashboardContext();
  const { data: byChannel, isLoading } = useFunnelBreakdown(filters, "channel");
  const { data: byGroup } = useFunnelBreakdown(filters, "origin_group");
  const { data: byContact } = useFunnelBreakdown(filters, "contact_channel");

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
        title="Canal de aquisição"
        description="De onde o lead veio. É o corte que decide onde investir."
      >
        <BreakdownView
          rows={byChannel ?? []}
          metric="won_value"
          emptyMessage="Nenhum lead com origem registrada no período."
        />
      </ChartCard>

      <ChartCard
        title="Inbound, outbound, rede"
        description="Os 12 canais agrupados nos quatro que se dirigem de forma diferente."
      >
        <BreakdownView rows={byGroup ?? []} metric="new_opportunities" />
      </ChartCard>

      <ChartCard
        title="Canal de atendimento"
        description="Por onde a conversa acontece — diferente de onde o lead veio."
      >
        <BreakdownView rows={byContact ?? []} metric="new_opportunities" />
      </ChartCard>
    </div>
  );
}
