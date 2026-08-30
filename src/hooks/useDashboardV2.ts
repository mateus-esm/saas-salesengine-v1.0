/**
 * Sprint 9 — the dashboard's data access.
 *
 * REPLACES useDashboardMetrics.ts, which computed leads-by-stage, pipeline
 * value, closed deals and conversion from `leads.stage_id` and
 * `leads.opportunity_value` — columns marked DEPRECATED in Sprint 4 and no
 * longer written by the CRM, which moved to `opportunities`. Those numbers did
 * not match the kanban and could not have.
 *
 * Everything here calls the RPCs from 20260830000600. No metric is computed in
 * the browser: the scheduled WhatsApp report calls the same functions from an
 * edge function, and the two must never be able to disagree.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type {
  BreakdownDimension,
  DashboardFilterOptions,
  DashboardFilters,
  FunnelBreakdownRow,
  FunnelMapStatus,
  FunnelOverview,
  FunnelSeriesPoint,
  LossReasonRow,
  SeriesGranularity,
  TopOpportunity,
} from "@/types/dashboard";

// The generated Supabase types lag new RPCs until `supabase gen types` reruns.
// Same escape hatch useOpportunities.ts uses for opportunities/pipeline_stages_v2.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/**
 * Filters become part of the react-query key, so they have to serialise
 * stably. Array order from a multi-select is not stable, and an unsorted key
 * refetches the same data under a second cache entry.
 */
const filterKey = (f: DashboardFilters) => [
  f.from.toISOString(),
  f.to.toISOString(),
  [...(f.pipelineIds ?? [])].sort().join(","),
  [...(f.responsibleIds ?? [])].sort().join(","),
  [...(f.channels ?? [])].sort().join(","),
];

const rpcArgs = (f: DashboardFilters) => ({
  p_from: f.from.toISOString(),
  p_to: f.to.toISOString(),
  // null, not [], means "no filter" to the RPC. An empty array would match
  // nothing and silently blank the whole dashboard.
  p_pipeline_ids: f.pipelineIds?.length ? f.pipelineIds : null,
  p_responsible_ids: f.responsibleIds?.length ? f.responsibleIds : null,
  p_channels: f.channels?.length ? f.channels : null,
});

/** Metrics change when the CRM changes, not when the user navigates. */
const STALE = 60_000;

export function useFunnelOverview(filters: DashboardFilters) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["funnel_overview", profile?.equipe_id, ...filterKey(filters)],
    enabled: !!profile?.equipe_id,
    staleTime: STALE,
    queryFn: async (): Promise<FunnelOverview> => {
      const { data, error } = await sb.rpc("get_funnel_overview", rpcArgs(filters));
      if (error) throw error;
      return data as FunnelOverview;
    },
  });
}

export function useFunnelSeries(
  filters: DashboardFilters,
  granularity: SeriesGranularity,
) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["funnel_series", profile?.equipe_id, granularity, ...filterKey(filters)],
    enabled: !!profile?.equipe_id,
    staleTime: STALE,
    queryFn: async (): Promise<FunnelSeriesPoint[]> => {
      const { data, error } = await sb.rpc("get_funnel_series", {
        ...rpcArgs(filters),
        p_granularity: granularity,
      });
      if (error) throw error;
      return (data ?? []) as FunnelSeriesPoint[];
    },
  });
}

export function useFunnelBreakdown(
  filters: DashboardFilters,
  dimension: BreakdownDimension,
) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["funnel_breakdown", profile?.equipe_id, dimension, ...filterKey(filters)],
    enabled: !!profile?.equipe_id,
    staleTime: STALE,
    queryFn: async (): Promise<FunnelBreakdownRow[]> => {
      const { data, error } = await sb.rpc("get_funnel_breakdown", {
        ...rpcArgs(filters),
        p_dimension: dimension,
      });
      if (error) throw error;
      return (data ?? []) as FunnelBreakdownRow[];
    },
  });
}

export function useLossReasons(filters: DashboardFilters) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["loss_reasons", profile?.equipe_id, ...filterKey(filters)],
    enabled: !!profile?.equipe_id,
    staleTime: STALE,
    queryFn: async (): Promise<LossReasonRow[]> => {
      const { data, error } = await sb.rpc("get_loss_reasons", {
        p_from: filters.from.toISOString(),
        p_to: filters.to.toISOString(),
        p_pipeline_ids: filters.pipelineIds?.length ? filters.pipelineIds : null,
        p_responsible_ids: filters.responsibleIds?.length ? filters.responsibleIds : null,
      });
      if (error) throw error;
      return (data ?? []) as LossReasonRow[];
    },
  });
}

export function useTopOpportunities(filters: DashboardFilters, limit = 10) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: [
      "top_opportunities",
      profile?.equipe_id,
      limit,
      [...(filters.pipelineIds ?? [])].sort().join(","),
      [...(filters.responsibleIds ?? [])].sort().join(","),
    ],
    enabled: !!profile?.equipe_id,
    staleTime: STALE,
    queryFn: async (): Promise<TopOpportunity[]> => {
      const { data, error } = await sb.rpc("get_top_opportunities", {
        p_limit: limit,
        p_pipeline_ids: filters.pipelineIds?.length ? filters.pipelineIds : null,
        p_responsible_ids: filters.responsibleIds?.length ? filters.responsibleIds : null,
      });
      if (error) throw error;
      return (data ?? []) as TopOpportunity[];
    },
  });
}

export function useDashboardFilterOptions() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["dashboard_filters", profile?.equipe_id],
    enabled: !!profile?.equipe_id,
    // Pipelines and team members change on admin actions, not on navigation.
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DashboardFilterOptions> => {
      const { data, error } = await sb.rpc("get_dashboard_filters");
      if (error) throw error;
      return data as DashboardFilterOptions;
    },
  });
}

/**
 * Stage-mapping coverage.
 *
 * The dashboard needs this to tell two identical-looking zeros apart: "nothing
 * happened in this period" and "nobody has told the system what this pipeline's
 * stages mean". Showing the second one as a plain 0 reads as bad sales
 * performance and is the fastest way to lose the client's trust in the whole
 * area.
 */
export function useFunnelMapStatus() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["funnel_map_status", profile?.equipe_id],
    enabled: !!profile?.equipe_id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FunnelMapStatus[]> => {
      const { data, error } = await sb.rpc("get_funnel_map_status");
      if (error) throw error;
      return (data ?? []) as FunnelMapStatus[];
    },
  });
}

/** True when no pipeline has any stage mapped — the "teach the client" state. */
export function isFunnelUnmapped(status: FunnelMapStatus[] | undefined): boolean {
  if (!status || status.length === 0) return false;
  return status.every((p) => p.mapped_stages === 0);
}
