-- Create table for AI decisions audit trail
CREATE TABLE IF NOT EXISTS public.ai_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    decision_type TEXT NOT NULL, -- e.g., 'classify_contact', 'update_lead_field', 'schedule_meeting'
    input_summary TEXT, -- context provided to AI
    output_action JSONB NOT NULL, -- full JSON of the action taken
    confidence_score FLOAT, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.ai_decisions ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users (e.g. dashboard)
CREATE POLICY "Users can view ai decisions" 
ON public.ai_decisions FOR SELECT 
TO authenticated 
USING (true);

-- Allow insert/update only to service_role (Edge Functions)
CREATE POLICY "Service role can manage ai decisions" 
ON public.ai_decisions FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Create index for faster lookups by lead
CREATE INDEX IF NOT EXISTS idx_ai_decisions_lead_id ON public.ai_decisions(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_created_at ON public.ai_decisions(created_at DESC);
