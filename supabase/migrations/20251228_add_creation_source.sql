-- Add creation_source column to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS creation_source TEXT CHECK (creation_source IN ('ai_agent', 'manual'));

-- Set default value for existing leads
UPDATE leads 
SET creation_source = 'manual' 
WHERE creation_source IS NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_leads_creation_source ON leads(creation_source);

-- Add comment
COMMENT ON COLUMN leads.creation_source IS 'Indicates if lead was created by AI agent or manually';
