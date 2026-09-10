import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/fetchAllPages";

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

/** The columns the placar reads from each opportunity. */
export interface PlacarOpp {
  status: string | null;
  created_at: string | null;
  closed_at: string | null;
  owner_id: string | null;
  value: number | string | null;
}

export interface PlacarResult {
  won: number;
  lost: number;
  in_progress: number;
  win_rate: number | null;
  avg_velocity_days: number | null;
  won_revenue: number;
  owner_placar: Record<string, { won: number; lost: number; in_progress: number }>;
}

/**
 * Sprint 11 — the placar of THIS period.
 *
 * A win or a loss counts only when it closed inside the period; a deal with no
 * close date is not "this month" (Solo Energia imported 61 wins without one).
 * In progress is a snapshot of every open deal. Per-owner rows use
 * opportunities.owner_id — the old code read `assigned_to`, a column that does
 * not exist on opportunities, so the query failed and every number was zero.
 */
export function buildPlacar(
  opps: PlacarOpp[],
  bounds: { start: Date; end: Date },
): PlacarResult {
  const inPeriod = (iso: string | null) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && t >= bounds.start.getTime() && t < bounds.end.getTime();
  };
  const money = (v: number | string | null) => (v === null ? 0 : Number(v) || 0);

  let won = 0;
  let lost = 0;
  let in_progress = 0;
  let won_revenue = 0;
  const wonForVelocity: { created_at: string; closed_at: string }[] = [];
  const owner_placar: PlacarResult["owner_placar"] = {};
  const bump = (ownerId: string | null, key: "won" | "lost" | "in_progress") => {
    if (!ownerId) return;
    owner_placar[ownerId] ??= { won: 0, lost: 0, in_progress: 0 };
    owner_placar[ownerId][key]++;
  };

  for (const o of opps) {
    if (o.status === "open") {
      in_progress++;
      bump(o.owner_id, "in_progress");
    } else if (o.status === "won" && inPeriod(o.closed_at)) {
      won++;
      won_revenue += money(o.value);
      bump(o.owner_id, "won");
      if (o.created_at && o.closed_at) {
        wonForVelocity.push({ created_at: o.created_at, closed_at: o.closed_at });
      }
    } else if (o.status === "lost" && inPeriod(o.closed_at)) {
      lost++;
      bump(o.owner_id, "lost");
    }
  }

  return {
    won,
    lost,
    in_progress,
    win_rate: computeWinRate(won, lost),
    avg_velocity_days: computeAvgVelocityDays(wonForVelocity),
    won_revenue,
    owner_placar,
  };
}

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
  /** Sprint 6.9.1 W3 — touchpoints needed from meetings */
  touchpoints_needed: number | null;
  /** Sprint 6.9.1 W3 — gap between current and goal */
  deals_gap: number;
  revenue_gap: number;
  /** Sprint 6.9.1 W3 — pace status derived from run-rate */
  pace_status: "ahead" | "on_track" | "behind";
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

      // 3. Placar of this period (Sprint 11). Every page: the pipeline can pass
      // the 1,000-row cap (Solo Energia has 1,259 deals). Errors are thrown —
      // the old query asked for a column that does not exist, the error was
      // swallowed, and the placar showed zeros for months.
      const allOpps = await fetchAllPages<PlacarOpp>((from, to) =>
        sb
          .from("opportunities")
          .select("status, created_at, closed_at, owner_id, value")
          .eq("pipeline_id", pipelineId)
          .is("deleted_at", null)
          .order("id", { ascending: true })
          .range(from, to),
      );

      const { won, lost, in_progress, win_rate, avg_velocity_days, won_revenue, owner_placar } =
        buildPlacar(allOpps, periodBounds(period));

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

      // W3 — touchpoints: apply stage3→stage4 rate to meetings_needed
      const stage3Rate = conversion_rates.length > 2 ? conversion_rates[2].rate : null;
      const touchpoints_needed =
        meetings_needed !== null && stage3Rate !== null && stage3Rate > 0
          ? Math.round(meetings_needed / stage3Rate)
          : null;

      // W3 — gap & pace
      const deals_gap = Math.max(0, goal_deals - won);
      const revenue_gap = Math.max(0, goal_revenue - won_revenue);
      const pctElapsed = Math.min(1, daysElapsed(period) / daysInPeriod(period));
      const expectPct = pctElapsed > 0 ? won / (goal_deals * pctElapsed) : 0;
      const pace_status: "ahead" | "on_track" | "behind" =
        goal_deals === 0 ? "on_track"
        : won >= goal_deals ? "ahead"
        : expectPct >= 1.1 ? "ahead"
        : expectPct >= 0.9 ? "on_track"
        : "behind";

      return {
        goal_deals,
        goal_revenue,
        period,
        required_inbound,
        opportunities_needed,
        proposals_needed,
        meetings_needed,
        touchpoints_needed,
        deals_gap,
        revenue_gap,
        pace_status,
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
