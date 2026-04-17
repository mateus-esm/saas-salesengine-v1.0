-- ============================================================================
-- EPIC 1 — Relational Inbox Architecture (Conversations vs. Leads)
--
-- Introduces a conversations layer between `leads` and `messages` so a single
-- lead can have multiple distinct conversations with their own lifecycle
-- (active / archived / deleted) without losing CRM data.
--
-- Migration is additive. Legacy columns on `leads` (channel, gpt_maker_chat_id,
-- responsible_id, etc.) are kept for dual-read during the transition and will
-- be removed in a later epic.
-- ============================================================================

-- ------------------------------------------------------------
-- 1. conversations table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id              uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  equipe_id            uuid NOT NULL REFERENCES public.equipes(id) ON DELETE CASCADE,

  channel              text NOT NULL DEFAULT 'whatsapp',
  status               text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'archived', 'deleted')),

  responsible_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  atendido_por_agente  boolean NOT NULL DEFAULT false,
  agent_name           text,

  gpt_maker_chat_id    text,

  last_message_at      timestamptz,
  unread_count         integer NOT NULL DEFAULT 0,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  archived_at          timestamptz,
  deleted_at           timestamptz
);

COMMENT ON TABLE public.conversations IS
  'Epic 1: decoupled conversation sessions per lead. One lead can have many.';

-- ------------------------------------------------------------
-- 2. messages.conversation_id FK
-- ------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS conversation_id uuid
    REFERENCES public.conversations(id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- 3. Indexes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id
  ON public.conversations(lead_id);

CREATE INDEX IF NOT EXISTS idx_conversations_equipe_status_lastmsg
  ON public.conversations(equipe_id, status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_channel
  ON public.conversations(channel);

CREATE INDEX IF NOT EXISTS idx_conversations_responsible
  ON public.conversations(responsible_id);

CREATE INDEX IF NOT EXISTS idx_conversations_gpt_maker_chat_id
  ON public.conversations(gpt_maker_chat_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
  ON public.messages(conversation_id);

-- ------------------------------------------------------------
-- 4. updated_at trigger
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS update_conversations_updated_at ON public.conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 5. Backfill: one conversation per existing lead
-- ------------------------------------------------------------
INSERT INTO public.conversations (
  id, lead_id, equipe_id, channel, status, responsible_id,
  atendido_por_agente, agent_name, gpt_maker_chat_id,
  last_message_at, unread_count, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  l.id,
  l.equipe_id,
  COALESCE(l.channel, 'whatsapp'),
  'active',
  COALESCE(l.responsible_id, l.assigned_to),
  COALESCE(l.atendido_por_agente, false),
  l.agent_name,
  l.gpt_maker_chat_id,
  l.last_message_at,
  COALESCE(l.unread_count, 0),
  COALESCE(l.created_at, now()),
  now()
FROM public.leads l
WHERE NOT EXISTS (
  SELECT 1 FROM public.conversations c WHERE c.lead_id = l.id
);

-- Backfill messages.conversation_id by matching lead_id to the (unique)
-- conversation we just created.
UPDATE public.messages m
SET conversation_id = c.id
FROM public.conversations c
WHERE c.lead_id = m.lead_id
  AND m.conversation_id IS NULL;

-- ------------------------------------------------------------
-- 6. Row Level Security
-- ------------------------------------------------------------
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their team conversations" ON public.conversations;
CREATE POLICY "Users can view their team conversations"
ON public.conversations
FOR SELECT
USING (
  equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid())
);

DROP POLICY IF EXISTS "Users can manage their team conversations" ON public.conversations;
CREATE POLICY "Users can manage their team conversations"
ON public.conversations
FOR ALL
USING (
  equipe_id IN (SELECT p.equipe_id FROM public.profiles p WHERE p.id = auth.uid())
);

-- ------------------------------------------------------------
-- 7. RPC: increment unread count on a conversation
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_conversation_unread_count(conv_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET unread_count = COALESCE(unread_count, 0) + 1
  WHERE id = conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_conversation_unread_count(uuid) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 8. Realtime publication
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;
