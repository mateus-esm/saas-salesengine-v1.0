-- Sprint 7 W0.2 — Solo API (whatsmiau) instances + provider columns
-- Spec: Planning/Sprints/sprint_7_studio_ai_v1.md · Planning/Sprints/sprint_7_api_reference.md

CREATE TABLE IF NOT EXISTS public.wpp_instances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id      uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,
  instance_name  text NOT NULL UNIQUE,           -- "se-{8 primeiros chars do equipe_id}-{slug}"
  display_name   text NOT NULL,
  status         text NOT NULL DEFAULT 'awaiting_qr'
                 CHECK (status IN ('awaiting_qr','connected','disconnected','error')),
  phone          text,
  ingest_inbound boolean NOT NULL DEFAULT true,  -- false quando o mesmo número também está no GPT Maker
  billing_active boolean NOT NULL DEFAULT false,
  connected_at   timestamptz,
  last_health_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wpp_instances_equipe ON public.wpp_instances(equipe_id);

ALTER TABLE public.wpp_instances ENABLE ROW LEVEL SECURITY;

-- Leitura: membros da equipe (UI de canais + inbox). Escrita: apenas service-role (edge functions).
DROP POLICY IF EXISTS wpp_instances_select ON public.wpp_instances;
CREATE POLICY wpp_instances_select ON public.wpp_instances
  FOR SELECT USING (
    equipe_id IN (SELECT equipe_id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Conversas solo-native apontam para a instância que as originou (roteamento T5).
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS solo_instance_id uuid REFERENCES public.wpp_instances(id) ON DELETE SET NULL;

-- Proveniência da mensagem (generaliza gpt_message_id, que permanece).
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS provider text;             -- 'gptmaker' | 'solo'
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS provider_message_id text;  -- key.id do whatsmiau

CREATE INDEX IF NOT EXISTS idx_messages_provider_msg
  ON public.messages(provider_message_id) WHERE provider_message_id IS NOT NULL;
