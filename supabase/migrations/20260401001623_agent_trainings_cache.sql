-- Create agent_trainings cache table for instant UI loading
CREATE TABLE IF NOT EXISTS public.agent_trainings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  equipe_id UUID REFERENCES public.equipes(id) ON DELETE CASCADE NOT NULL,
  gpt_training_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('TEXT','WEBSITE','VIDEO','DOCUMENT')),
  content TEXT,
  image TEXT,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.agent_trainings ENABLE ROW LEVEL SECURITY;

-- Users can view their own team's trainings
CREATE POLICY "Users can view own team trainings"
ON public.agent_trainings FOR SELECT
TO authenticated
USING (
  equipe_id IN (
    SELECT equipe_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Service role can do everything (Edge Functions use service_role)
CREATE INDEX idx_agent_trainings_equipe ON public.agent_trainings(equipe_id);
CREATE INDEX idx_agent_trainings_gpt_id ON public.agent_trainings(gpt_training_id);
