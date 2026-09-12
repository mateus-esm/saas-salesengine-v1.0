import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeRunRate, placarFromRpc, type OwnerGoal, type Placar } from "@/lib/scoreboard";

/** Start (inclusive) and end (exclusive) of the current month or quarter, local time. */
export function periodBounds(
  period: "month" | "quarter",
  now: Date = new Date(),
): { start: Date; end: Date } {
  if (period === "month") {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }
  const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
  return {
    start: new Date(now.getFullYear(), quarterMonth, 1),
    end: new Date(now.getFullYear(), quarterMonth + 3, 1),
  };
}

// Sprint 11 · T25 — `buildPlacar` (every deal of the pipeline counted in the
// browser) is gone: crm_placar counts on the server, placarFromRpc types it.

/** Days elapsed in the current period. */
function daysElapsed(period: "month" | "quarter"): number {
  const now = new Date();
  if (period === "month") return now.getDate();
  const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
  const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);
  return Math.floor((now.getTime() - quarterStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/** Total days in the current period. */
function daysInPeriod(period: "month" | "quarter"): number {
  const now = new Date();
  if (period === "month") {
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  }
  const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
  let total = 0;
  for (let i = 0; i < 3; i++) {
    total += new Date(now.getFullYear(), quarterMonth + i + 1, 0).getDate();
  }
  return total;
}

export { computeRunRate };

interface ConversionRate {
  stage_id: string;
  rate: number;
  source: "history" | "manual";
}

export interface ForecastData {
  goal_deals: number;
  goal_revenue: number;
  period: "month" | "quarter";
  /** null when there isn't enough data to compute an honest number. */
  required_inbound: number | null;
  opportunities_needed: number | null;
  proposals_needed: number | null;
  meetings_needed: number | null;
  /** Sprint 6.9.1 W3 — touchpoints needed from meetings */
  touchpoints_needed: number | null;
  conversion_rates: ConversionRate[];
  /** false → derived metrics (inbound, conversão) are not trustworthy yet. */
  sufficient_data: boolean;
  /** Sprint 11 · T25 — crm_placar, typed (lib/scoreboard). */
  placar: Placar;
  /** Per-owner goals from revenue_config */
  owner_goals: OwnerGoal[];
  /** Days elapsed / total in the current period (for the pace). */
  elapsed_days: number;
  total_days: number;
}

export function useForecast(pipelineId: string | null) {
  return useQuery<ForecastData>({
    queryKey: ["forecast", pipelineId],
    queryFn: async () => {
      if (!pipelineId) throw new Error("No pipeline ID");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      // 1. Get pipeline revenue_config
      const { data: pipe, error: pipeError } = await sb
        .from("pipelines")
        .select("revenue_config")
        .eq("id", pipelineId)
        .single();
      if (pipeError) throw pipeError;

      const config = pipe?.revenue_config ?? {};
      const goal_deals = config.goal_deals ?? 0;
      const goal_revenue = config.goal_revenue ?? 0;
      const period: "month" | "quarter" = config.period ?? "month";
      const overrides = config.conversion_overrides ?? {};
      const owner_goals = config.owner_goals ?? [];

      // 2. Call fn_stage_conversion_rates via rpc
      const { data: rates, error: ratesError } = await sb.rpc("fn_stage_conversion_rates", {
        p_pipeline_id: pipelineId,
      });
      if (ratesError) throw ratesError;

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

      // 3. The placar of this period: crm_placar counts wins and losses by the
      //    owner at the moment they happened (the dashboard's rule) — one call
      //    instead of every deal of the pipeline.
      const bounds = periodBounds(period);
      const { data: placarData, error: placarError } = await sb.rpc("crm_placar", {
        p_pipeline_id: pipelineId,
        p_from: bounds.start.toISOString(),
        p_to: bounds.end.toISOString(),
      });
      if (placarError) throw placarError;
      const placar = placarFromRpc(placarData);
      const { won, lost, in_progress, win_rate } = placar;

      // 4. Derived metrics
      const cumulative = conversion_rates.reduce((acc: number, r) => acc * r.rate, 1.0);
      const sufficient_data = goal_deals > 0 && conversion_rates.length > 0 && (won + lost + in_progress > 0);
      const required_inbound =
        sufficient_data && cumulative > 0 ? Math.round(goal_deals / cumulative) : null;

      // 4a. Smart defaults: derive activity targets from win rate + stage conversion rates
      const winRateDecimal = win_rate !== null ? win_rate / 100 : null;
      const deals_needed = goal_deals - won;
      const opportunities_needed =
        sufficient_data && winRateDecimal !== null && winRateDecimal > 0
          ? Math.round(deals_needed / winRateDecimal)
          : null;

      const stage1Rate = conversion_rates.length > 0 ? conversion_rates[0].rate : null;
      const proposals_needed =
        opportunities_needed !== null && stage1Rate !== null && stage1Rate > 0
          ? Math.round(opportunities_needed / stage1Rate)
          : null;

      const stage2Rate = conversion_rates.length > 1 ? conversion_rates[1].rate : null;
      const meetings_needed =
        proposals_needed !== null && stage2Rate !== null && stage2Rate > 0
          ? Math.round(proposals_needed / stage2Rate)
          : null;

      const stage3Rate = conversion_rates.length > 2 ? conversion_rates[2].rate : null;
      const touchpoints_needed =
        meetings_needed !== null && stage3Rate !== null && stage3Rate > 0
          ? Math.round(meetings_needed / stage3Rate)
          : null;

      // Gap and pace are the scoreboard's (lib/scoreboard), on whichever goal
      // leads — the old pace looked at deals even when the goal was revenue.
      const result: ForecastData = {
        goal_deals,
        goal_revenue,
        period,
        required_inbound,
        opportunities_needed,
        proposals_needed,
        meetings_needed,
        touchpoints_needed,
        conversion_rates,
        sufficient_data,
        placar,
        owner_goals,
        elapsed_days: daysElapsed(period),
        total_days: daysInPeriod(period),
      };
      return result;
    },
    enabled: !!pipelineId,
    staleTime: 30_000,
  });
}
