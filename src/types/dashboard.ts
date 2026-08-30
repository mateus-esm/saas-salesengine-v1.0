/**
 * Sprint 9 — the shapes the metrics RPCs return.
 *
 * These mirror the jsonb built in 20260830000600_sprint9_metrics_rpcs.sql.
 * Keep them in step: the RPC is the contract, this is the transcription.
 */

/** Rates are null — never 0 — when the denominator is empty. See the RPC. */
export type Rate = number | null;

export interface FunnelOverview {
  period: { from: string; to: string };
  new_leads: number;
  new_opportunities: number;
  qualified: number;
  proposals_sent: number;
  meetings_scheduled: number;
  meetings_done: number;
  no_shows: number;
  deals_won: number;
  deals_lost: number;
  won_value: number;
  lost_value: number;
  open_value: number;
  open_count: number;
  touchpoints: number;
  avg_ticket: Rate;
  win_rate: Rate;
  no_show_rate: Rate;
  show_rate: Rate;
  lead_to_won_rate: Rate;
  avg_cycle_days: Rate;
  touchpoints_per_lead: Rate;
}

export interface FunnelSeriesPoint {
  bucket: string;
  new_leads: number;
  proposals_sent: number;
  meetings_scheduled: number;
  meetings_done: number;
  no_shows: number;
  deals_won: number;
  deals_lost: number;
  won_value: number;
}

export interface FunnelBreakdownRow {
  label: string;
  new_opportunities: number;
  open_count: number;
  open_value: number;
  proposals_sent: number;
  meetings_done: number;
  no_shows: number;
  deals_won: number;
  deals_lost: number;
  won_value: number;
  win_rate: Rate;
}

export interface LossReasonRow {
  reason: string;
  count: number;
  value: number;
}

export interface TopOpportunity {
  opportunity_id: string;
  lead_id: string;
  lead_name: string;
  value: number;
  pipeline_name: string | null;
  stage_name: string | null;
  responsible_name: string | null;
  days_in_stage: number;
  last_touch_at: string | null;
}

export interface DashboardFilterOptions {
  /** False for a plain seat: the RPCs have already narrowed their data to them. */
  can_see_team: boolean;
  pipelines: { id: string; name: string }[];
  responsibles: { id: string; name: string }[];
  channels: string[];
}

export type BreakdownDimension =
  | "pipeline"
  | "responsible"
  | "channel"
  | "contact_channel"
  | "origin_group"
  | "loss_reason";

export type SeriesGranularity = "day" | "week" | "month";

/** What the user has narrowed the whole page to. Sent to every RPC. */
export interface DashboardFilters {
  from: Date;
  to: Date;
  pipelineIds?: string[];
  responsibleIds?: string[];
  channels?: string[];
}

/** Per-pipeline stage-mapping coverage — lets a widget say "unmapped" vs "empty". */
export interface FunnelMapStatus {
  pipeline_id: string;
  pipeline_name: string;
  total_stages: number;
  mapped_stages: number;
  events_covered: string[];
}

/** The canonical funnel events, in funnel order, with their Portuguese labels. */
export const FUNNEL_EVENT_LABELS: Record<string, string> = {
  qualified: "Qualificado",
  proposal_sent: "Proposta enviada",
  meeting_scheduled: "Reunião agendada",
  meeting_done: "Reunião realizada",
  no_show: "No-show",
  won: "Ganho",
  lost: "Perdido",
};

export const MAPPABLE_FUNNEL_EVENTS = [
  "qualified",
  "proposal_sent",
  "meeting_scheduled",
  "meeting_done",
  "no_show",
] as const;

export const BREAKDOWN_LABELS: Record<BreakdownDimension, string> = {
  pipeline: "Pipeline",
  responsible: "Responsável",
  channel: "Canal de aquisição",
  contact_channel: "Canal de atendimento",
  origin_group: "Grupo de origem",
  loss_reason: "Motivo de perda",
};
