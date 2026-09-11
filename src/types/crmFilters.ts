// Sprint 11 — the one filter contract of the CRM (motor de Consulta).
//
// The server implements it once — `crm_opp_matches` for deals (used by
// `crm_board_summary`, `crm_board_stage` and the Leads table) and
// `crm_lead_matches` for the contact base — so a count can never disagree with
// the rows it counts. The filter bar only builds these objects. An absent key
// means "no filter". Wave 2 added `next_contact`, `custom` and ContactFilters.

import type { OpportunityStatus } from "./pipelines";

/** The contact's next-contact date against today in São Paulo. */
export type NextContactBucket = "overdue" | "today" | "week" | "none";

/**
 * How a declared custom field is filtered. The operators a field type accepts
 * come from the field-type registry (src/lib/fields/registry.ts).
 */
export type CustomFieldFilterOp =
  /** select, multi_select, user: the value (or any item) is in `values`. */
  | "any_of"
  /** text, url, phone: case-insensitive substring of `value`. */
  | "contains"
  /** number, currency: from <= v <= to; either bound optional. */
  | "between_number"
  /** date: from <= v < to (ISO); either bound optional. */
  | "between_date"
  | "is_true"
  /** Only false. An unset boolean is "empty". */
  | "is_false"
  /** Absent, null, "", [] or {}. */
  | "empty"
  | "not_empty";

export interface CustomFieldFilter {
  field_id: string;
  op: CustomFieldFilterOp;
  values?: string[];
  value?: string;
  from?: string | number;
  to?: string | number;
}

/** Deals: the Kanban and the Leads table. */
export interface CrmFilters {
  /** Name, e-mail or phone. Phones are compared by digits, masked or not. */
  search?: string;
  /** ISO timestamp, inclusive. */
  created_from?: string;
  /** ISO timestamp, exclusive. */
  created_to?: string;
  /** The deal's owner (profile ids); "none" selects deals without one. */
  owner_ids?: string[];
  stage_ids?: string[];
  statuses?: OpportunityStatus[];
  origin_categories?: string[];
  /** Matches when the lead carries any of these tags. */
  tags?: string[];
  value_min?: number;
  value_max?: number;
  /** The deal's contact. */
  next_contact?: NextContactBucket;
  /** Declared fields of the pipeline; all of them must match. */
  custom?: CustomFieldFilter[];
}

export const EMPTY_CRM_FILTERS: CrmFilters = {};

/** Derived from the contact's deals: won > open > lost > none. */
export type ContactRelationship = "sem_negocio" | "negociando" | "cliente" | "perdido";

/**
 * The contact base. A contact has no owner of its own — responsibility lives on
 * the deal — so "responsável" here means "owns one of this contact's deals".
 */
export interface ContactFilters {
  search?: string;
  created_from?: string;
  created_to?: string;
  origin_categories?: string[];
  tags?: string[];
  next_contact?: NextContactBucket;
  relationship?: ContactRelationship[];
  /** Has a (non-deleted) deal in one of these pipelines. */
  pipeline_ids?: string[];
  /** Has a deal owned by one of these profiles; "none" = has a deal without owner. */
  deal_owner_ids?: string[];
}

export const EMPTY_CONTACT_FILTERS: ContactFilters = {};

/** Server-side ordering. `key` is one the RPC whitelists, or "cf:<field_id>". */
export interface CrmSort {
  key: string;
  dir: "asc" | "desc";
}
