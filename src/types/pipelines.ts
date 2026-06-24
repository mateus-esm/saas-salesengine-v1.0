// CRM v1 — Multi-Pipeline Engine types (Sprint 3)
// Lives alongside src/types/crm.ts. Legacy Lead/PipelineStage stay there.

export type CustomFieldType =
  | "text"
  | "file"
  | "number"
  | "currency"
  | "date"
  | "boolean"
  | "select"
  // Sprint 4 EPIC 1 additions
  | "multi_select"
  | "url"
  | "phone"
  | "address"
  | "property_ref"
  | "company_ref"
  | "contact_ref";

/** Structured value for type === "address". Persisted as JSON object. */
export interface AddressValue {
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface CustomFieldSchema {
  field_id: string;        // stable uuid — never change
  key: string;             // machine key (snake_case, mutable)
  label: string;           // user-facing label (mutable)
  type: CustomFieldType;
  required: boolean;
  /** Only for select / multi_select. */
  options?: string[];
  /** Only for *_ref types. Always 'tenant' in Sprint 4 (RLS scopes by equipe_id). */
  target_scope?: "tenant";
  position: number;
  is_deleted?: boolean;    // soft-deleted; data preserved
  description?: string;
}

// Internal enum stays English; UI renders PT-BR labels (Aberto/Ganho/Perdido/Ciclo)
// via a value→label map. 'ciclo' is the Sprint 6.8 cycle/return stage type.
export type StageType = "open" | "won" | "lost" | "ciclo";

/** Sprint 5.3 T8 — cadence/lifecycle events a stage can fire webhooks on. */
export type StageWebhookEvent =
  | "on_stage_entered"
  | "on_idle_breach"
  | "on_cadence_deadline";

export interface StageWebhookTrigger {
  event: StageWebhookEvent;
  webhook_id: string;
}
export type OpportunityStatus = "open" | "won" | "lost";
export type LeadOrigin = "whatsapp" | "manual" | "web" | "import" | string;

export interface Pipeline {
  id: string;
  equipe_id: string;
  name: string;
  description: string | null;
  /** Sprint 5.2 - null = cadence automation disabled; positive integer = follow-up days. */
  cadence_days: number | null;
  /** Sprint 6.7: ICP weight config. Array of {field_key, weight, target_value, label}. */
  icp_weights: Array<{field_key: string; weight: number; target_value: string; label?: string}>;
  custom_fields_schema: CustomFieldSchema[];
  card_field_ids: string[];        // which custom fields show on Kanban cards
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PipelineStageV2 {
  id: string;
  equipe_id: string;
  pipeline_id: string;
  name: string;
  color: string;
  position: number;
  stage_type: StageType;
  /** Sprint 5.1 section 3.1 - null = no SLA; positive integer = hours before red-pulse. */
  max_idle_hours: number | null;
  /** Sprint 5.2 - null = no limit; positive integer = touchpoints before breach telemetry. */
  max_interactions: number | null;
  /** Sprint 5.3 T7 — per-stage cadence magnitude (e.g. 1, 2, 10). NULL = inherit pipeline-level cadence_days. */
  cadence_value: number | null;
  /** Sprint 5.3 T7 — per-stage cadence unit (hours|days). NULL = inherit pipeline-level cadence_days. */
  cadence_unit: 'hours' | 'days' | null;
  /** Sprint 5.3 T8 — webhooks to fire on stage cadence/lifecycle events. */
  webhook_triggers: StageWebhookTrigger[];
  /** Sprint 6.4 W2 — human description read by Copilot triage to know when a deal belongs here. */
  description?: string;
  /** Sprint 6.8 W6 — days before a ciclo stage auto-returns the lead to cycle_target_stage_id. */
  cycle_days: number | null;
  /** Sprint 6.8 W6 — stage to return the lead to after cycle_days. */
  cycle_target_stage_id: string | null;
  /** Sprint 6.8 W6 — optional webhook URL to POST on cycle return. */
  cycle_webhook_url: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface Opportunity {
  id: string;
  equipe_id: string;
  lead_id: string;
  pipeline_id: string;
  stage_id: string;
  value: number | null;
  currency: string;
  status: OpportunityStatus;
  position: number;
  custom_data: Record<string, unknown>;
  stage_entered_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface OpportunityStageHistory {
  id: number;
  equipe_id: string;
  opportunity_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  changed_by: string | null;
  changed_at: string;
}

// ───────────────────────────────────────────────────────────────
// Mutation payloads
// ───────────────────────────────────────────────────────────────

export interface CreatePipelineData {
  name: string;
  description?: string;
  cadence_days?: number | null;
  custom_fields_schema?: CustomFieldSchema[];
  card_field_ids?: string[];
}

export interface UpdatePipelineData {
  id: string;
  name?: string;
  description?: string | null;
  cadence_days?: number | null;
  custom_fields_schema?: CustomFieldSchema[];
  card_field_ids?: string[];
  is_archived?: boolean;
}

export interface CreateStageV2Data {
  pipeline_id: string;
  name: string;
  color?: string;
  position?: number;
  stage_type?: StageType;
  max_idle_hours?: number | null;
  max_interactions?: number | null;
}

export interface UpdateStageV2Data {
  id: string;
  name?: string;
  color?: string;
  position?: number;
  stage_type?: StageType;
  max_idle_hours?: number | null;
  max_interactions?: number | null;
  /** Sprint 5.3 T7 — per-stage cadence magnitude. */
  cadence_value?: number | null;
  /** Sprint 5.3 T7 — per-stage cadence unit (hours|days). */
  cadence_unit?: 'hours' | 'days' | null;
  /** Sprint 5.3 T8 — webhooks to fire on stage cadence/lifecycle events. */
  webhook_triggers?: StageWebhookTrigger[];
  /** Sprint 6.4 W2 — human description read by Copilot triage. */
  description?: string;
}

export interface CreateOpportunityData {
  lead_id: string;
  pipeline_id: string;
  stage_id?: string;       // defaults to first stage of pipeline if omitted
  value?: number;
  currency?: string;
  custom_data?: Record<string, unknown>;
}

export interface UpdateOpportunityData {
  id: string;
  stage_id?: string;
  value?: number | null;
  currency?: string;
  status?: OpportunityStatus;
  position?: number;
  custom_data?: Record<string, unknown>;
  closed_at?: string | null;
}

// ───────────────────────────────────────────────────────────────
// Visible Lead-side additions (mirrors EPIC 1 schema additions)
// ───────────────────────────────────────────────────────────────

export interface LeadGlobalAdditions {
  origin: LeadOrigin | null;
  deleted_at: string | null;
}

// ───────────────────────────────────────────────────────────────
// Sprint 4 EPIC 1 — identity-layer entities
// ───────────────────────────────────────────────────────────────

export type CompanySizeBracket =
  | "solo"
  | "2-10"
  | "11-50"
  | "51-200"
  | "201-1000"
  | "1000+";

export interface Company {
  id: string;
  equipe_id: string;
  name: string;
  legal_name: string | null;
  cnpj: string | null;
  website: string | null;
  industry: string | null;
  size_bracket: CompanySizeBracket | null;
  custom_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type PropertyType = "address" | "site" | "unit" | "custom";

export interface Property {
  id: string;
  equipe_id: string;
  label: string;
  property_type: PropertyType;
  address: AddressValue | null;
  latitude: number | null;
  longitude: number | null;
  attributes: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ContactCompanyRole =
  | "owner"
  | "decision_maker"
  | "employee"
  | "former"
  | "advisor"
  | "other";

export interface ContactCompanyLink {
  id: string;
  equipe_id: string;
  contact_id: string;
  company_id: string;
  role: ContactCompanyRole;
  is_primary: boolean;
  created_at: string;
  deleted_at: string | null;
}

export type PropertyOwnerType = "contact" | "company";

export interface PropertyOwnerLink {
  id: string;
  equipe_id: string;
  property_id: string;
  owner_type: PropertyOwnerType;
  owner_id: string;
  created_at: string;
  deleted_at: string | null;
}

export type OpportunityLinkType = "company" | "property" | "contact";

export interface OpportunityLink {
  id: string;
  equipe_id: string;
  opportunity_id: string;
  linked_type: OpportunityLinkType;
  linked_id: string;
  relation: string;
  created_at: string;
  deleted_at: string | null;
}

// ───────────────────────────────────────────────────────────────
// Sprint 4 EPIC 1 — Agent Rules (structured triggers + NL hints)
// ───────────────────────────────────────────────────────────────

export type AgentTriggerType =
  | "intent_detected"
  | "message_contains"
  | "media_received"
  | "stage_entered"
  | "idle_in_stage"
  | "custom_field_set";

export type AgentIntent =
  | "meeting_scheduled"
  | "interested"
  | "disqualified"
  | "objection_price"
  | "objection_timing";

export type AgentMediaType = "image" | "audio" | "document" | "video";

export type AgentTriggerWhen =
  | { type: "intent_detected"; intent: AgentIntent }
  | { type: "message_contains"; pattern: string; is_regex?: boolean }
  | { type: "media_received"; media_type: AgentMediaType }
  | { type: "stage_entered"; stage_id: string }
  | { type: "idle_in_stage"; stage_id?: string; hours: number }
  | { type: "custom_field_set"; field_id: string };

export type AgentActionType =
  | "move_stage"
  | "set_status"
  | "set_field"
  | "set_contact_field"
  | "add_touchpoint"
  | "add_note"
  | "create_task"
  | "add_tag"
  | "trigger_webhook";

export type AgentAction =
  | { action: "move_stage"; stage_type: StageType; stage_name_hint?: string }
  | { action: "set_status"; status: OpportunityStatus }
  | { action: "set_field"; field_id: string; value: unknown }
  | { action: "set_contact_field"; key: string; value: unknown }
  | { action: "add_touchpoint"; touchpoint_type: string; content_template: string }
  | { action: "add_note"; content_template: string }
  | { action: "create_task"; title_template: string; due_in_hours?: number }
  | { action: "add_tag"; tag: string }
  | { action: "trigger_webhook"; url: string; body_template?: string };

export interface AgentRuleTrigger {
  id: string;           // stable uuid; referenced by ai_decisions.rule_id
  name: string;
  when: AgentTriggerWhen;
  do: AgentAction[];
  active: boolean;
}

export interface PipelineAgentRules {
  id: string;
  equipe_id: string;
  pipeline_id: string;
  triggers: AgentRuleTrigger[];
  extraction_hints: string | null;
  auto_create_opportunity: boolean;
  auto_advance_stages: boolean;
  auto_extract_custom_fields: boolean;
  cooldown_minutes: number;
  created_at: string;
  updated_at: string;
}
