// Sprint 11 · Onda 2 — what the server-side tables return.
//
// `crm_opp_table` sends each deal as the same card the Kanban draws (built by one
// SQL function, `_crm_card_json`) plus its property count; `crm_contacts_table`
// sends each contact with its relationship, numbers and deals. No row needs a
// second request.

import type { BoardCard } from "./board";
import type { ContactRelationship } from "./crmFilters";
import type { OpportunityStatus } from "./pipelines";

/** A row of the Leads table: the Kanban card plus the contact's property count. */
export interface OppTableRow extends BoardCard {
  property_count: number;
}

/** One deal of a contact, as the contact base shows it. */
export interface ContactDeal {
  id: string;
  pipeline_id: string;
  pipeline_name: string;
  stage_id: string;
  stage_name: string;
  stage_color: string | null;
  status: OpportunityStatus;
  value: number | null;
  owner_id: string | null;
  owner_name: string | null;
}

/** A row of the contact base. A contact has no owner of its own: its deals do. */
export interface ContactRow {
  id: string;
  equipe_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  origin_category: string | null;
  channel: string | null;
  tags: string[];
  observations: string | null;
  created_at: string;
  last_message_at: string | null;
  /** date (YYYY-MM-DD). */
  next_contact: string | null;
  personal_custom_data: Record<string, unknown>;
  /** The primary company (contact_company_links). */
  company_name: string | null;
  property_count: number;
  relationship: ContactRelationship;
  open_count: number;
  /** Sum of the won deals' value (Wave 3: from the revenue ledger). */
  won_value: number;
  last_won_at: string | null;
  /** Up to 10: open first, then the most recent. */
  deals: ContactDeal[];
}
