-- Adicionar campos do Asaas à tabela equipes
ALTER TABLE public.equipes
ADD COLUMN IF NOT EXISTS asaas_customer_id varchar UNIQUE,
ADD COLUMN IF NOT EXISTS asaas_subscription_id varchar,
ADD COLUMN IF NOT EXISTS subscription_status varchar;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_equipes_asaas_customer_id ON public.equipes(asaas_customer_id);

COMMENT ON COLUMN public.equipes.asaas_customer_id IS 'ID do cliente no gateway Asaas';
COMMENT ON COLUMN public.equipes.asaas_subscription_id IS 'ID da assinatura ativa no Asaas';
COMMENT ON COLUMN public.equipes.subscription_status IS 'Status da assinatura: ACTIVE, INACTIVE, OVERDUE, etc';