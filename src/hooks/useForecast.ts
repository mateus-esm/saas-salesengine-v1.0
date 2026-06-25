import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ConversionRate {
  stage_id: string;
  rate: number;
  source: "history" | "manual";
}

interface Placar {
  won: number;
  lost: number;
  in_progress: number;
  goal: number;
}

export interface ForecastData {
  goal_deals: number;
  /** null when there isn't enough data to compute an honest number. */
  required_inbound: number | null;
  conversion_rates: ConversionRate[];
  /** false → derived metrics (inbound, conversão) are not trustworthy yet. */
  sufficient_data: boolean;
  placar: Placar;
  /** Win rate as 0-100 percentage. null when no decisions (won+lost === 0). */
  win_rate: number | null;
  /** Average days from created_at to won. null when no won opportunities. */
  avg_velocity_days: number | null;
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

      // Clamp every rate to [0,1]: a bad/over-1 conversion rate must never
      // explode required_inbound or render as nonsense (e.g. "2600%").
      const conversion_rates: ConversionRate[] = (rates ?? []).map((r: any) => {
        const raw = r.stage_id in overrides ? overrides[r.stage_id] : r.conversion_rate;
        return {
          stage_id: r.stage_id,
          rate: Math.max(0, Math.min(1, Number(raw) || 0)),
          source: r.stage_id in overrides ? "manual" : ("history" as const),
        };
      });

      // 3. Placar — now with timestamps for velocity computation
      const { data: opps } = await sb
        .from("opportunities")
        .select("status, created_at, closed_at")
        .eq("pipeline_id", pipelineId);

      const allOpps = (opps ?? []) as any[];
      const won = allOpps.filter((o: any) => o.status === "won").length;
      const lost = allOpps.filter((o: any) => o.status === "lost").length;
      const in_progress = allOpps.filter((o: any) => o.status === "open").length;

      // 3a. Win rate: won / (won + lost) as percentage, null when no decisions
      const win_rate =
        won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;

      // 3b. Pipeline velocity: avg days from created_at to closed_at (when stage changed to won)
      const wonOpps = allOpps.filter((o: any) => o.status === "won" && o.created_at && o.closed_at);
      const avg_velocity_days =
        wonOpps.length > 0
          ? Math.round(
              wonOpps.reduce((sum: number, o: any) => {
                const created = new Date(o.created_at).getTime();
                const closed = new Date(o.closed_at).getTime();
                return sum + (closed - created) / (1000 * 60 * 60 * 24);
              }, 0) / wonOpps.length
            )
          : null;

      // 4. Derived metrics are only honest when a goal is set AND there is real
      //    pipeline data to base conversion on. Otherwise we say so instead of
      //    rendering impossible numbers.
      const cumulative = conversion_rates.reduce((acc: number, r) => acc * r.rate, 1.0);
      const sufficient_data =
        goal_deals > 0 && conversion_rates.length > 0 && allOpps.length > 0;
      const required_inbound =
        sufficient_data && cumulative > 0 ? Math.round(goal_deals / cumulative) : null;

      return {
        goal_deals,
        required_inbound,
        conversion_rates,
        sufficient_data,
        placar: { won, lost, in_progress, goal: goal_deals },
        win_rate,
        avg_velocity_days,
      } as ForecastData;
    },
    enabled: !!pipelineId,
    staleTime: 30_000,
  });
}
