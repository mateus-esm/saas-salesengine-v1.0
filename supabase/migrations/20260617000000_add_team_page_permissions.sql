-- Create migration to add page_permissions to equipes and secure pages
ALTER TABLE public.equipes 
ADD COLUMN IF NOT EXISTS page_permissions JSONB NOT NULL DEFAULT '{
  "webhooks": true,
  "ai_studio": true,
  "billing": true,
  "toolkit": true,
  "clube": true,
  "suporte": true
}'::jsonb;

-- Backfill existing teams with default permissions
UPDATE public.equipes 
SET page_permissions = '{
  "webhooks": true,
  "ai_studio": true,
  "billing": true,
  "toolkit": true,
  "clube": true,
  "suporte": true
}'::jsonb
WHERE page_permissions IS NULL OR page_permissions = '{}'::jsonb;

-- Update RLS policies on webhook_configs to enforce team permission
DROP POLICY IF EXISTS "Enable read for webhook_configs based on team permission" ON public.webhook_configs;
CREATE POLICY "Enable read for webhook_configs based on team permission" 
ON public.webhook_configs
FOR SELECT 
TO authenticated
USING (
  equipe_id IN (
    SELECT id FROM public.equipes 
    WHERE (page_permissions->>'webhooks')::boolean = true
  )
);

DROP POLICY IF EXISTS "Enable write for webhook_configs based on team permission" ON public.webhook_configs;
CREATE POLICY "Enable write for webhook_configs based on team permission" 
ON public.webhook_configs
FOR ALL
TO authenticated
USING (
  equipe_id IN (
    SELECT id FROM public.equipes 
    WHERE (page_permissions->>'webhooks')::boolean = true
  )
)
WITH CHECK (
  equipe_id IN (
    SELECT id FROM public.equipes 
    WHERE (page_permissions->>'webhooks')::boolean = true
  )
);
