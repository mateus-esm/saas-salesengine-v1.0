// Sprint 11 — what the server-side Kanban returns.
//
// `crm_board_stage` sends each card already carrying everything the card draws,
// so the Kanban no longer loads every lead of the team (capped at 1,000 rows by
// the API) just to find names, nor fires two score RPCs per lead.

import type { Lead } from "./crm";
import type { Opportunity } from "./pipelines";

/** The slice of a lead a Kanban card needs. */
export type CardLead = Pick<
  Lead,
  | "id"
  | "name"
  | "phone"
  | "email"
  | "next_contact"
  | "tags"
  | "origin_category"
  | "source"
  | "responsible_id"
>;

export interface BoardCard extends Opportunity {
  /** Null only when the lead row is gone (soft-deleted contact). */
  lead: CardLead | null;
  owner_name: string | null;
  touchpoint_count: number;
  /** Null when the pipeline has no ICP criteria. */
  icp_score: number | null;
  /** Null when the lead has no activity yet. */
  velocity: number | null;
  /** 0–10; null when there is no data at all — never a fake 0. */
  lead_score: number | null;
  companies: { id: string; name: string }[];
}

/** One entry per stage from `crm_board_summary`: the column's true totals. */
export interface BoardStageSummary {
  stage_id: string;
  count: number;
  value_sum: number;
}
