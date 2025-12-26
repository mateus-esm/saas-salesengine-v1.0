-- Adicionar colunas de gestão na tabela leads
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS responsible_id uuid REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS meeting_date timestamptz,
ADD COLUMN IF NOT EXISTS meeting_notes text;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_leads_responsible ON leads(responsible_id);
CREATE INDEX IF NOT EXISTS idx_leads_meeting_date ON leads(meeting_date);

-- Tabela webhook_configs para integrações futuras
CREATE TABLE IF NOT EXISTS webhook_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id uuid REFERENCES equipes(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  trigger_event text NOT NULL,
  active boolean DEFAULT true,
  headers jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE webhook_configs ENABLE ROW LEVEL SECURITY;

-- Política única para gerenciar webhooks da equipe
CREATE POLICY "Team members can manage webhooks" 
ON webhook_configs FOR ALL 
USING (equipe_id IN (SELECT equipe_id FROM profiles WHERE id = auth.uid()));