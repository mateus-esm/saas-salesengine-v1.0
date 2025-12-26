
-- Add fields to equipes table for API integrations
ALTER TABLE public.equipes 
ADD COLUMN IF NOT EXISTS gpt_maker_agent_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS jestor_api_token VARCHAR(500);

-- Create table for tracking credit consumption
CREATE TABLE IF NOT EXISTS public.consumo_creditos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id UUID REFERENCES equipes(id) NOT NULL,
  creditos_utilizados INTEGER NOT NULL,
  periodo VARCHAR(7) NOT NULL, -- formato: YYYY-MM
  data_consumo TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on consumo_creditos
ALTER TABLE public.consumo_creditos ENABLE ROW LEVEL SECURITY;

-- Policy for viewing credit consumption
-- Policy for viewing credit consumption
DROP POLICY IF EXISTS "users_view_team_credits" ON public.consumo_creditos;
CREATE POLICY "users_view_team_credits"
ON public.consumo_creditos FOR SELECT
USING (equipe_id IN (
  SELECT equipe_id FROM profiles WHERE user_id = auth.uid()
));

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_consumo_creditos_equipe_periodo 
ON public.consumo_creditos(equipe_id, periodo);

-- Create table for KPI data from Jestor
CREATE TABLE IF NOT EXISTS public.kpis_dashboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id UUID REFERENCES equipes(id) NOT NULL,
  leads_atendidos INTEGER DEFAULT 0,
  reunioes_agendadas INTEGER DEFAULT 0,
  negocios_fechados INTEGER DEFAULT 0,
  valor_total_negocios DECIMAL(10,2) DEFAULT 0,
  periodo VARCHAR(7) NOT NULL, -- formato: YYYY-MM
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on kpis_dashboard
ALTER TABLE public.kpis_dashboard ENABLE ROW LEVEL SECURITY;

-- Policy for viewing KPIs
-- Policy for viewing KPIs
DROP POLICY IF EXISTS "users_view_team_kpis" ON public.kpis_dashboard;
CREATE POLICY "users_view_team_kpis"
ON public.kpis_dashboard FOR SELECT
USING (equipe_id IN (
  SELECT equipe_id FROM profiles WHERE user_id = auth.uid()
));

-- Create unique constraint to prevent duplicate entries per period
CREATE UNIQUE INDEX IF NOT EXISTS idx_kpis_dashboard_equipe_periodo 
ON public.kpis_dashboard(equipe_id, periodo);

-- Add trigger for updating updated_at
-- Add trigger for updating updated_at
DROP TRIGGER IF EXISTS update_kpis_dashboard_updated_at ON public.kpis_dashboard;
CREATE TRIGGER update_kpis_dashboard_updated_at
BEFORE UPDATE ON public.kpis_dashboard
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add workspace_id, plano_id, and limite_creditos to equipes table
ALTER TABLE public.equipes 
ADD COLUMN IF NOT EXISTS workspace_id VARCHAR,
ADD COLUMN IF NOT EXISTS plano_id INTEGER,
ADD COLUMN IF NOT EXISTS limite_creditos INTEGER DEFAULT 1000;

-- Create planos table for subscription management
CREATE TABLE IF NOT EXISTS public.planos (
  id INTEGER PRIMARY KEY,
  nome VARCHAR NOT NULL,
  preco_mensal NUMERIC(10,2) NOT NULL,
  limite_creditos INTEGER NOT NULL,
  limite_usuarios INTEGER,
  funcionalidades TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on planos
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view plans
-- Policy: Everyone can view plans
DROP POLICY IF EXISTS "Todos podem ver planos" ON public.planos;
CREATE POLICY "Todos podem ver planos"
ON public.planos
FOR SELECT
USING (true);

-- Insert subscription plans (Starter, Pro, Scale)
-- Using ON CONFLICT TO AVOID ERRORS
INSERT INTO public.planos (id, nome, preco_mensal, limite_creditos, limite_usuarios, funcionalidades) VALUES
(1, 'Solo Starter', 99.90, 1000, 1, ARRAY['Setup do Agente', 'Acesso ao Chat', 'Acesso ao CRM (Read-Only)']),
(2, 'Pro', 299.00, 5000, 5, ARRAY['Setup do Agente', 'Acesso ao Chat', 'Acesso ao CRM (Read-Only)', 'Dashboard de Performance', 'Billing', 'Suporte de Manutenção (Limitado)']),
(3, 'Scale', 999.00, 20000, NULL, ARRAY['Setup do Agente', 'Acesso ao Chat', 'Acesso ao CRM (Read-Only)', 'Dashboard de Performance', 'Billing', 'Suporte de Manutenção (Limitado)', 'Consultoria de Desenvolvimento'])
ON CONFLICT (id) DO NOTHING;

-- Add foreign key constraint for plano_id
-- We need to check if constraint exists, or just try to add it. PG doesn't have IF NOT EXISTS for constraint easily in one line without DO block.
-- But Supabase db push is usually smart enough? No, usually it runs SQL.
-- Let's retry constraint add inside a DO block or just hope it doesn't fail. 
-- Actually, let's wrap it.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_equipes_plano') THEN
        ALTER TABLE public.equipes
        ADD CONSTRAINT fk_equipes_plano
        FOREIGN KEY (plano_id) REFERENCES public.planos(id);
    END IF;
END $$;

-- Add trigger for planos updated_at
-- Add trigger for planos updated_at
DROP TRIGGER IF EXISTS update_planos_updated_at ON public.planos;
CREATE TRIGGER update_planos_updated_at
BEFORE UPDATE ON public.planos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Atualizar planos com novos valores e funcionalidades

-- Atualiza Plano Starter (ID 1)
UPDATE public.planos
SET 
  preco_mensal = 150, 
  limite_creditos = 1000, 
  limite_usuarios = 3, 
  funcionalidades = ARRAY['Setup do Agente', 'Acesso ao Chat', 'Acesso ao CRM (Read-Only)', 'Suporte para ajustes (limitado)']
WHERE id = 1;

-- Atualiza Plano Scale (ID 2)
UPDATE public.planos
SET 
  nome = 'Solo Scale', 
  preco_mensal = 400, 
  limite_creditos = 3000, 
  limite_usuarios = 5, 
  funcionalidades = ARRAY['Tudo do Starter', 'Dashboard de Performance', 'Billing', 'Suporte Builder Mode (1h mensal)']
WHERE id = 2;

-- Atualiza Plano Pro (ID 3)
UPDATE public.planos
SET 
  nome = 'Solo Pro', 
  preco_mensal = 1000, 
  limite_creditos = 10000, 
  limite_usuarios = NULL, 
  funcionalidades = ARRAY['Tudo do Scale', 'Usuários Ilimitados', 'Suporte Builder Mode (3h mensal)']
WHERE id = 3;
