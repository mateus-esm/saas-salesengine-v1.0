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
  created_at: string;
}

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
