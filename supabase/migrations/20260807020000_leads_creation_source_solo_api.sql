-- Sprint 7 fix — allow creation_source = 'solo_api' on leads.
--
-- O T2 (`solo-wpp-webhook`) insere leads com `creation_source: 'solo_api'`,
-- conforme especificado em Planning/Sprints/sprint_7_studio_ai_v1.md (linha
-- 162), mas a migration do sprint (20260705000000) nunca estendeu o CHECK
-- `leads_creation_source_check`, que só aceitava manual|ai_agent|webhook|import.
--
-- Efeito em produção: TODA mensagem inbound da Solo API de um número novo
-- falhava com 23514 ao criar o lead, abortando a ingestão inteira. Detectado
-- em E2E sintético 2026-08-07 (o token 401 mascarava este erro até então).

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_creation_source_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_creation_source_check
  CHECK (creation_source IN ('manual', 'ai_agent', 'webhook', 'import', 'solo_api'));
