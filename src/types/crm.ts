// CRM Types - shared across components

export interface Lead {
  id: string;
  equipe_id: string;
  stage_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  opportunity_value: number | null;
  meeting_scheduled: boolean | null;
  meeting_done: boolean | null;
  no_show: boolean | null;
  next_contact: string | null;
  observations: string | null;
  tags: string[] | null;
  custom_fields: Record<string, unknown> | null;
  origem: string | null;
  atendido_por_agente: boolean | null;
  interaction_id: string | null;
  // New fields for PRD v2.2
  responsible_id: string | null;
  meeting_date: string | null;
  meeting_notes: string | null;
  // GPT Maker integration fields
  gpt_maker_chat_id: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineStage {
  id: string;
  equipe_id: string;
  name: string;
  position: number;
  color: string;
  is_default: boolean;
  created_at: string;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  user_id: string | null;
  tipo: string;
  descricao: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface CreateLeadData {
  name: string;
  email?: string;
  phone?: string;
  stage_id?: string;
  tags?: string[];
  observations?: string;
  source?: string;
  opportunity_value?: number;
  responsible_id?: string;
  meeting_date?: string;
  meeting_notes?: string;
  custom_fields?: Record<string, unknown>;
}

export interface UpdateLeadData {
  id: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  stage_id?: string | null;
  tags?: string[];
  observations?: string | null;
  next_contact?: string | null;
  meeting_scheduled?: boolean;
  meeting_done?: boolean;
  no_show?: boolean;
  opportunity_value?: number | null;
  custom_fields?: Record<string, unknown>;
  // New fields for PRD v2.2
  responsible_id?: string | null;
  meeting_date?: string | null;
  meeting_notes?: string | null;
}

export interface WebhookConfig {
  id: string;
  equipe_id: string;
  name: string;
  url: string;
  trigger_event: string;
  active: boolean;
  headers: Record<string, unknown>;
  created_at: string;
}

export interface TeamMember {
  id: string;
  nome_completo: string | null;
  email: string | null;
}
