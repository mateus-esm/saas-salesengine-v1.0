-- 1. Atualizar Tabela LEADS (Campos de Gestão do Chat)
-- Adiciona o campo para ordenar a lista de conversas (quem falou por último aparece em primeiro)
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- 2. Criar Tabela TASKS (Gestão de Tarefas do CRM)
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES public.profiles(id),
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'overdue')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id)
);

-- 3. Criar Tabela MESSAGES (Espelho do Chat)
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'ai', 'agent', 'system')),
  sender_id UUID REFERENCES public.profiles(id),
  content TEXT,
  media_url TEXT,
  media_type TEXT CHECK (media_type IN ('audio', 'image', 'video', 'document', 'text')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE,
  external_id TEXT
);

-- 4. Criar Índices (Performance Vital para Chat)
CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON public.messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_lead_id ON public.tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_last_message ON public.leads(last_message_at DESC);

-- 5. Segurança (RLS - Row Level Security)
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Política Tasks
CREATE POLICY "Acesso Tasks Equipe" ON public.tasks FOR ALL USING (
  lead_id IN (
    SELECT id FROM public.leads 
    WHERE equipe_id IN (SELECT equipe_id FROM public.profiles WHERE id = auth.uid())
  )
);

-- Política Chat
CREATE POLICY "Acesso Chat Equipe" ON public.messages FOR ALL USING (
  lead_id IN (
    SELECT id FROM public.leads 
    WHERE equipe_id IN (SELECT equipe_id FROM public.profiles WHERE id = auth.uid())
  )
);

-- Habilitar Realtime para messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;