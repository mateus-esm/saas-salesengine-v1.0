-- ============================================================================
-- SE-REV-002 · Fase 0 — a abertura automática filtra pela PORTA de entrada.
--
-- O filtro por `trigger_sources` da SE-REV-001 compara texto livre com
-- `leads.source`, que sai do field_mapping de cada webhook e, sem mapeamento,
-- vira 'webhook_inbound'. O nome que o cliente vê na tela ("<nome do
-- webhook>") é o nome da PORTA (crm_entries.name), não o source — então o
-- filtro por texto não casava.
--
-- A porta (crm_entries.id) é um UUID estável que já existe para toda chegada
-- de lead (crm_record_touch) e que a UI já lista. Vazio = sem filtro de porta
-- (compatível com o comportamento atual). `trigger_sources` continua valendo.
--
-- Aditivo: uma coluna com default; nada existente muda.
-- ============================================================================

alter table public.conversation_opener_settings
  add column if not exists trigger_entry_ids uuid[] not null default '{}';

comment on column public.conversation_opener_settings.trigger_entry_ids is
  'SE-REV-002: portas (crm_entries.id) que disparam a abertura automática. Vazio = qualquer porta.';
