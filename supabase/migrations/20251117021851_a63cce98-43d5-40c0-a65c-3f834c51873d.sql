-- Adicionar coluna de explicação dinâmica para a página Home
ALTER TABLE public.equipes 
ADD COLUMN IF NOT EXISTS home_explanation TEXT DEFAULT 'O AdvAI é o seu assistente jurídico inteligente, desenvolvido pela Solo Ventures para automatizar e otimizar processos jurídicos. Utilize o chat para interagir com o agente e aproveite todas as funcionalidades do portal.';