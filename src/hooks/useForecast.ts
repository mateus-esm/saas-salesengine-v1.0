import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Compute win rate as 0-100 percentage. null when no decisions. */
export function computeWinRate(won: number, lost: number): number | null {
  return won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;
}

/** Compute avg days from created_at to closed_at for won opps. null when none. */
export function computeAvgVelocityDays(
  wonOpps: { created_at: string; closed_at: string }[]
): number | null {
  if (wonOpps.length === 0) return null;
  return Math.round(
    wonOpps.reduce((sum, o) => {
      const created = new Date(o.created_at).getTime();
      const closed = new Date(o.closed_at).getTime();
      return sum + (closed - created) / (1000 * 60 * 60 * 24);
    }, 0) / wonOpps.length
  );
}

/** Compute run-rate: (current/target) * (total/elapsed) * 100. */
export function computeRunRate(
  current: number,
  target: number,
  elapsed: number,
  total: number
): number | null {
  if (target <= 0 || elapsed <= 0 || total <= 0) return null;
  return Math.round((current / target) * (total / elapsed) * 100);
}

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
  goal_revenue: number;
  period: "month" | "quarter";
  /** null when there isn't enough data to compute an honest number. */
  required_inbound: number | null;
  opportunities_needed: number | null;
  proposals_needed: number | null;
  meetings_needed: number | null;
  conversion_rates: ConversionRate[];
  /** false → derived metrics (inbound, conversão) are not trustworthy yet. */
  sufficient_data: boolean;
  placar: Placar;
  /** Win rate as 0-100 percentage. null when no decisions (won+lost === 0). */
  win_rate: number | null;
  /** Average days from created_at to won. null when no won opportunities. */
  avg_velocity_days: number | null;
  /** Sum of value for won opportunities. */
  won_revenue: number;
  /** Per-owner placar: owner_id → { won, lost, in_progress } */
  owner_placar: Record<string, { won: number; lost: number; in_progress: number }>;
  /** Per-owner goals from revenue_config */
  owner_goals: Array<{ owner_id: string; target_deals: number; target_revenue: number }>;
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
      const goal_revenue = config.goal_revenue ?? 0;
      const period: "month" | "quarter" = config.period ?? "month";
      const overrides = config.conversion_overrides ?? {};
      const owner_goals = config.owner_goals ?? [];

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

      // 3. Placar — now with timestamps for velocity computation + assigned_to for per-owner
      const { data: opps } = await sb
        .from("opportunities")
        .select("status, created_at, closed_at, assigned_to, value")
        .eq("pipeline_id", pipelineId);

      const allOpps = (opps ?? []) as any[];
      const won = allOpps.filter((o: any) => o.status === "won").length;
      const lost = allOpps.filter((o: any) => o.status === "lost").length;
      const in_progress = allOpps.filter((o: any) => o.status === "open").length;

      // 3a. Win rate: won / (won + lost) as percentage, null when no decisions
      const win_rate = computeWinRate(won, lost);

      // 3b. Pipeline velocity: avg days from created_at to closed_at (when stage changed to won)
      const wonOpps = allOpps.filter((o: any) => o.status === "won" && o.created_at && o.closed_at);
      const avg_velocity_days = computeAvgVelocityDays(wonOpps);

      // 3c. Revenue from won opportunities
      const won_revenue = allOpps
        .filter((o: any) => o.status === "won")
        .reduce((sum: number, o: any) => sum + (parseFloat(o.value) || 0), 0);

      // 3d. Per-owner placar
      const owner_placar: Record<string, { won: number; lost: number; in_progress: number }> = {};
      for (const opp of allOpps) {
        const ownerId = opp.assigned_to;
        if (!ownerId) continue;
        if (!owner_placar[ownerId]) {
          owner_placar[ownerId] = { won: 0, lost: 0, in_progress: 0 };
        }
        if (opp.status === "won") owner_placar[ownerId].won++;
        else if (opp.status === "lost") owner_placar[ownerId].lost++;
        else if (opp.status === "open") owner_placar[ownerId].in_progress++;
      }

      // 4. Derived metrics are only honest when a goal is set AND there is real
      //    pipeline data to base conversion on. Otherwise we say so instead of
      //    rendering impossible numbers.
      const cumulative = conversion_rates.reduce((acc: number, r) => acc * r.rate, 1.0);
      const sufficient_data =
        goal_deals > 0 && conversion_rates.length > 0 && allOpps.length > 0;
      const required_inbound =
        sufficient_data && cumulative > 0 ? Math.round(goal_deals / cumulative) : null;

      // 4a. Smart defaults: derive activity targets from win rate + stage conversion rates
      //     win_rate is already a percentage (0-100), convert to decimal for math
      const winRateDecimal = win_rate !== null ? win_rate / 100 : null;
      const deals_needed = goal_deals - won;
      const opportunities_needed =
        sufficient_data && winRateDecimal !== null && winRateDecimal > 0
          ? Math.round(deals_needed / winRateDecimal)
          : null;

      // proposals_needed: apply stage1→stage2 conversion rate to opportunities_needed
      // If we have at least 2 stages, use the first stage's rate as "stage1→stage2"
      const stage1Rate = conversion_rates.length > 0 ? conversion_rates[0].rate : null;
      const proposals_needed =
        opportunities_needed !== null && stage1Rate !== null && stage1Rate > 0
          ? Math.round(opportunities_needed / stage1Rate)
          : null;

      // meetings_needed: apply stage2→stage3 conversion rate to proposals_needed
      const stage2Rate = conversion_rates.length > 1 ? conversion_rates[1].rate : null;
      const meetings_needed =
        proposals_needed !== null && stage2Rate !== null && stage2Rate > 0
          ? Math.round(proposals_needed / stage2Rate)
          : null;

      return {
        goal_deals,
        goal_revenue,
        period,
        required_inbound,
        opportunities_needed,
        proposals_needed,
        meetings_needed,
        conversion_rates,
        sufficient_data,
        placar: { won, lost, in_progress, goal: goal_deals },
        win_rate,
        avg_velocity_days,
        won_revenue,
        owner_placar,
        owner_goals,
      } as ForecastData;
    },
    enabled: !!pipelineId,
    staleTime: 30_000,
  });
}
