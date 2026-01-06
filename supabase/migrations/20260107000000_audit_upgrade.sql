-- 1. Melhorar a tabela de Auditoria
ALTER TABLE public.ai_decisions 
ADD COLUMN IF NOT EXISTS equipe_id UUID REFERENCES public.equipes(id), -- Para saber de qual empresa é
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'success', -- 'success', 'error', 'warning'
ADD COLUMN IF NOT EXISTS error_details TEXT; -- Para salvar o stack trace do erro

-- 2. Criar índice para filtrar por equipe no Dashboard
CREATE INDEX IF NOT EXISTS idx_ai_decisions_equipe_id ON public.ai_decisions(equipe_id);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_status ON public.ai_decisions(status);
