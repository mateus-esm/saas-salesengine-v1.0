import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ConversionRate {
  stage_id: string;
  rate: number;
  source: "history" | "manual";
}

interface Placar {
  closed: number;
  in_progress: number;
  goal: number;
}

export interface ForecastData {
  goal_deals: number;
  required_inbound: number;
  conversion_rates: ConversionRate[];
  placar: Placar;
}

export function useForecast(pipelineId: string | null) {
  return useQuery<ForecastData>({
    queryKey: ["forecast", pipelineId],
    queryFn: async () => {
      if (!pipelineId) throw new Error("No pipeline ID");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      // 1. Get pipeline revenue_config
      const { data: pipe } = await sb
        .from("pipelines")
        .select("revenue_config")
        .eq("id", pipelineId)
        .single();

      const config = pipe?.revenue_config ?? {};
      const goal_deals = config.goal_deals ?? 0;
      const overrides = config.conversion_overrides ?? {};

      // 2. Call fn_stage_conversion_rates via rpc
      const { data: rates } = await sb.rpc("fn_stage_conversion_rates", {
        p_pipeline_id: pipelineId,
      });

      const conversion_rates: ConversionRate[] = (rates ?? []).map((r: any) => ({
        stage_id: r.stage_id,
        rate: r.stage_id in overrides ? overrides[r.stage_id] : r.conversion_rate,
        source: r.stage_id in overrides ? "manual" : ("history" as const),
      }));

      // 3. Cumulative rate
      const cumulative = conversion_rates.reduce((acc: number, r) => acc * r.rate, 1.0);
      const required_inbound =
        goal_deals > 0 && cumulative > 0 ? Math.round(goal_deals / cumulative) : 0;

      // 4. Placar
      const { data: opps } = await sb
        .from("opportunities")
        .select("status")
        .eq("pipeline_id", pipelineId);

      const allOpps = (opps ?? []) as any[];
      const closed = allOpps.filter((o: any) => o.status === "won").length;
      const in_progress = allOpps.filter((o: any) => o.status === "open").length;

      return { goal_deals, required_inbound, conversion_rates, placar: { closed, in_progress, goal: goal_deals } };
    },
    enabled: !!pipelineId,
    staleTime: 30_000,
  });
}
