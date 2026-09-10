// Sprint 11 — the one filter contract of the CRM.
//
// The server implements it once (`crm_opp_matches`, used by `crm_board_summary`
// and `crm_board_stage`), so a column's count can never disagree with the cards
// it shows. Wave 2's filter bar only has to build this object. An absent key
// means "no filter".

import type { OpportunityStatus } from "./pipelines";

export interface CrmFilters {
  /** Name, e-mail or phone. Phones are compared by digits, masked or not. */
  search?: string;
  /** ISO timestamp, inclusive. */
  created_from?: string;
  /** ISO timestamp, exclusive. */
  created_to?: string;
  /** Profile ids; "none" selects deals without an owner. */
  owner_ids?: string[];
  stage_ids?: string[];
  statuses?: OpportunityStatus[];
  origin_categories?: string[];
  /** Matches when the lead carries any of these tags. */
  tags?: string[];
  value_min?: number;
  value_max?: number;
}

export const EMPTY_CRM_FILTERS: CrmFilters = {};
