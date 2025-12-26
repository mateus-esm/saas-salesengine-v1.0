-- Create webhook_logs table for logging webhook activity
CREATE TABLE public.webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  equipe_id UUID NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  webhook_config_id UUID REFERENCES public.webhook_configs(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for webhook_logs
CREATE POLICY "Users can view their team webhook logs"
ON public.webhook_logs
FOR SELECT
USING (equipe_id IN (
  SELECT p.equipe_id FROM profiles p WHERE p.id = auth.uid()
));

-- Create index for performance
CREATE INDEX idx_webhook_logs_equipe_id ON public.webhook_logs(equipe_id);
CREATE INDEX idx_webhook_logs_created_at ON public.webhook_logs(created_at DESC);
CREATE INDEX idx_webhook_logs_direction ON public.webhook_logs(direction);

-- Enable realtime for webhook_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_logs;