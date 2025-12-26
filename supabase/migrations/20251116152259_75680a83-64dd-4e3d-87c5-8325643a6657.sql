-- Add workspace_id, plano_id, and limite_creditos to equipes table
ALTER TABLE public.equipes 
ADD COLUMN workspace_id VARCHAR,
ADD COLUMN plano_id INTEGER,
ADD COLUMN limite_creditos INTEGER DEFAULT 1000;

-- Create planos table for subscription management
CREATE TABLE public.planos (
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
CREATE POLICY "Todos podem ver planos"
ON public.planos
FOR SELECT
USING (true);

-- Insert subscription plans (Starter, Pro, Scale)
INSERT INTO public.planos (id, nome, preco_mensal, limite_creditos, limite_usuarios, funcionalidades) VALUES
(1, 'Solo Starter', 99.90, 1000, 1, ARRAY['Setup do Agente', 'Acesso ao Chat', 'Acesso ao CRM (Read-Only)']),
(2, 'Pro', 299.00, 5000, 5, ARRAY['Setup do Agente', 'Acesso ao Chat', 'Acesso ao CRM (Read-Only)', 'Dashboard de Performance', 'Billing', 'Suporte de Manutenção (Limitado)']),
(3, 'Scale', 999.00, 20000, NULL, ARRAY['Setup do Agente', 'Acesso ao Chat', 'Acesso ao CRM (Read-Only)', 'Dashboard de Performance', 'Billing', 'Suporte de Manutenção (Limitado)', 'Consultoria de Desenvolvimento']);

-- Add foreign key constraint for plano_id
ALTER TABLE public.equipes
ADD CONSTRAINT fk_equipes_plano
FOREIGN KEY (plano_id) REFERENCES public.planos(id);

-- Add trigger for planos updated_at
CREATE TRIGGER update_planos_updated_at
BEFORE UPDATE ON public.planos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();