// CRM v1 — Multi-Pipeline Engine types (Sprint 3)
// Lives alongside src/types/crm.ts. Legacy Lead/PipelineStage stay there.

export type CustomFieldType =
  | "text"
  | "number"
  | "currency"
  | "date"
  | "boolean"
  | "select";

export interface CustomFieldSchema {
  field_id: string;        // stable uuid — never change
  key: string;             // machine key (snake_case, mutable)
  label: string;           // user-facing label (mutable)
  type: CustomFieldType;
  required: boolean;
  options?: string[];      // only for type === "select"
  position: number;
  is_deleted?: boolean;    // soft-deleted; data preserved
  description?: string;
}

export type StageType = "open" | "won" | "lost";
export type OpportunityStatus = "open" | "won" | "lost";
export type LeadOrigin = "whatsapp" | "manual" | "web" | "import" | string;

export interface Pipeline {
  id: string;
  equipe_id: string;
  name: string;
  description: string | null;
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
  custom_fields_schema?: CustomFieldSchema[];
  card_field_ids?: string[];
}

export interface UpdatePipelineData {
  id: string;
  name?: string;
  description?: string | null;
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
}

export interface UpdateStageV2Data {
  id: string;
  name?: string;
  color?: string;
  position?: number;
  stage_type?: StageType;
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
