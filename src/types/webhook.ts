// Webhook Types

export interface WebhookLog {
  id: string;
  equipe_id: string;
  webhook_config_id: string | null;
  direction: 'inbound' | 'outbound';
  event_type: string;
  payload: Record<string, unknown>;
  response_status: number | null;
  response_body: string | null;
  error_message: string | null;
  created_at: string;
}

export interface WebhookConfig {
  id: string;
  equipe_id: string;
  name: string;
  url: string;
  trigger_event: string;
  active: boolean;
  headers: Record<string, string>;
  payload_template: Record<string, unknown>;
  created_at: string;
  // --- inbound fields ---
  inbound_function?: string | null;
  pipeline_id?: string | null;
  field_mappings?: FieldMapping[];
}

export const DEFAULT_LEAD_CREATED_PAYLOAD = {
  event: "{{event}}",
  created_at: "{{created_at}}",
  lead: {
    id: "{{lead.id}}",
    name: "{{lead.name}}",
    email: "{{lead.email}}",
    phone: "{{lead.phone}}",
    source: "{{lead.source}}",
    tags: "{{lead.tags}}",
    custom_fields: "{{lead.custom_fields}}",
  },
};

export type WebhookTriggerEvent =
  | 'lead_created'
  | 'lead_updated'
  | 'stage_changed'
  | 'meeting_scheduled'
  | 'meeting_done'
  | 'no_show';

export const WEBHOOK_TRIGGER_EVENTS: { value: WebhookTriggerEvent; label: string }[] = [
  { value: 'lead_created', label: 'Lead Criado' },
  { value: 'lead_updated', label: 'Lead Atualizado' },
  { value: 'stage_changed', label: 'Etapa Alterada' },
  { value: 'meeting_scheduled', label: 'Reunião Agendada' },
  { value: 'meeting_done', label: 'Reunião Realizada' },
  { value: 'no_show', label: 'No Show' },
];

// --- Inbound field mapping types ---

export type FieldMappingTargetType = 'lead' | 'lead_custom' | 'custom_data' | 'opportunity';

export interface FieldMapping {
  source_field: string;
  target_field: string;
  target_type: FieldMappingTargetType;
}

export const LEAD_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: 'name', label: 'Nome (name)' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Telefone (phone)' },
  { value: 'source', label: 'Origem (source)' },
  { value: 'tags', label: 'Tags' },
  { value: 'observations', label: 'Observações (observations)' },
  { value: 'custom_fields', label: 'Campo Personalizado (custom_fields.*)' },
];

export const PIPELINE_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: 'value', label: 'Valor Financeiro (opportunity.value)' },
  { value: 'custom_data', label: 'Dado Personalizado (custom_data.*)' },
];

export const INBOUND_FUNCTIONS: { value: string; label: string }[] = [
  { value: 'receive_lead', label: 'Receber Lead' },
];
