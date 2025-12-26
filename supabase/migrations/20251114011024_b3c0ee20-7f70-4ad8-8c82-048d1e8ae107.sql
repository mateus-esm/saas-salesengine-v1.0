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
CREATE POLICY "users_view_team_kpis"
ON public.kpis_dashboard FOR SELECT
USING (equipe_id IN (
  SELECT equipe_id FROM profiles WHERE user_id = auth.uid()
));

-- Create unique constraint to prevent duplicate entries per period
CREATE UNIQUE INDEX IF NOT EXISTS idx_kpis_dashboard_equipe_periodo 
ON public.kpis_dashboard(equipe_id, periodo);

-- Add trigger for updating updated_at
CREATE TRIGGER update_kpis_dashboard_updated_at
BEFORE UPDATE ON public.kpis_dashboard
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();