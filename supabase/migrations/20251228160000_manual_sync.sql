-- Migration gerada manualmente para sincronizar alterações feitas no SQL Editor
-- Data: 2025-12-28

-- 1. Alterar tipo da coluna meeting_date
ALTER TABLE leads 
ALTER COLUMN meeting_date TYPE TIMESTAMP;

-- 2. Adicionar coluna creation_source se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'creation_source') THEN
        ALTER TABLE leads 
        ADD COLUMN creation_source TEXT CHECK (creation_source IN ('ai_agent', 'manual'));
    END IF;
END $$;

-- 3. Atualizar registros antigos
UPDATE leads 
SET creation_source = 'manual' 
WHERE creation_source IS NULL;

-- 4. Garantir índice
CREATE INDEX IF NOT EXISTS idx_leads_creation_source ON leads(creation_source);
