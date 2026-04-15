-- Fase 2: Team Inbox & Enriquecimento de Dados
-- Adiciona colunas para suportar omnichannel, foto de perfil e nome do agente

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS profile_picture TEXT,
  ADD COLUMN IF NOT EXISTS agent_name TEXT;

-- Índice para filtrar leads por canal
CREATE INDEX IF NOT EXISTS idx_leads_channel ON public.leads(channel);
