
-- Add gpt_maker_chat_id to leads table
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS gpt_maker_chat_id TEXT;

-- Create index for faster lookups by webhooks
CREATE INDEX IF NOT EXISTS idx_leads_gpt_maker_chat_id ON public.leads(gpt_maker_chat_id);
