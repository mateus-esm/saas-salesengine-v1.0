-- Migration: Add niches table for dynamic multitenant management
-- Replaces the hardcoded tenants.ts config with a DB-driven registry

CREATE TABLE IF NOT EXISTS public.niches (
  id text PRIMARY KEY,                         -- slug: 'juridico', 'energia_solar', 'bmg'
  nome text NOT NULL,                          -- display name: 'AdvAI', 'Solon'
  domain text NOT NULL UNIQUE,                 -- full domain: 'solon.soloventures.com.br'
  description text,                            -- tagline shown on login page
  primary_color text DEFAULT '28 100% 50%',    -- HSL color for CSS variables
  custom_fields jsonb DEFAULT '[]'::jsonb,     -- CustomFieldDefinition[]
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.niches ENABLE ROW LEVEL SECURITY;

-- Anyone (even anon) can read niches — needed for tenant resolution at app startup
CREATE POLICY "Anyone can read active niches"
  ON public.niches FOR SELECT
  USING (true);

-- Only super_admins can insert/update/delete
CREATE POLICY "Super admins can manage niches"
  ON public.niches FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_niches_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER niches_updated_at
  BEFORE UPDATE ON public.niches
  FOR EACH ROW EXECUTE FUNCTION public.set_niches_updated_at();

-- Seed with the existing hardcoded tenants so nothing breaks on first deploy
INSERT INTO public.niches (id, nome, domain, description, custom_fields) VALUES
  ('advai',    'AdvAI',           'advai.soloventures.com.br',    'Assistente Jurídico Inteligente',        '[{"key":"numero_processo","label":"Número do Processo","type":"text","placeholder":"0000000-00.0000.0.00.0000"},{"key":"area_atuacao","label":"Área de Atuação","type":"select","options":["Trabalhista","Cível","Criminal","Tributário","Empresarial","Família","Outros"]}]'),
  ('solon',    'Solon',           'solon.soloventures.com.br',    'Máquina de Vendas para Energia Solar',   '[{"key":"consumo_medio","label":"Consumo Médio (kWh)","type":"number","placeholder":"Ex: 500"},{"key":"valor_conta","label":"Valor da Conta (R$)","type":"number","placeholder":"Ex: 350"},{"key":"tipo_telhado","label":"Tipo de Telhado","type":"select","options":["Cerâmica","Fibrocimento","Metálico","Laje","Outro"]}]'),
  ('cb',       'Cinemas Benfica', 'cb.soloventures.com.br',       'Agente de Suporte do Cinemas Benfica',   '[{"key":"filme_interesse","label":"Filme de Interesse","type":"text","placeholder":"Nome do filme"},{"key":"data_sessao","label":"Data da Sessão","type":"text","placeholder":"DD/MM/AAAA"}]'),
  ('nutria',   'NutriA',          'nutria.soloventures.com.br',   'Máquina de Vendas para Nutricionistas',  '[{"key":"objetivo","label":"Objetivo","type":"select","options":["Emagrecimento","Ganho de Massa","Reeducação Alimentar","Saúde Geral","Outro"]},{"key":"restricao_alimentar","label":"Restrição Alimentar","type":"text","placeholder":"Ex: Intolerância a lactose"}]'),
  ('imob',     'Imob',            'imob.soloventures.com.br',     'Máquina de Vendas para Imobiliárias',    '[{"key":"tipo_imovel","label":"Tipo de Imóvel","type":"select","options":["Apartamento","Casa","Terreno","Comercial","Rural"]},{"key":"bairro_interesse","label":"Bairro de Interesse","type":"text","placeholder":"Ex: Centro"},{"key":"faixa_preco","label":"Faixa de Preço","type":"select","options":["Até R$ 200 mil","R$ 200-500 mil","R$ 500 mil - 1 milhão","Acima de R$ 1 milhão"]}]'),
  ('bmg',      'Be My Guest',     'bmg.soloventures.com.br',      'Máquina de Vendas Automatizada',         '[]'),
  ('leadland', 'Lead Land',       'leadland.soloventures.com.br', 'Máquina de Vendas Automatizada',         '[]'),
  ('default',  'Solo SaaS',       'soloventures.com.br',          'Máquina de Vendas Automatizada',         '[]')
ON CONFLICT (id) DO NOTHING;
