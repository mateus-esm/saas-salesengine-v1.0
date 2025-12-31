-- Corrigir search_path da função handle_lead_lifecycle para segurança
CREATE OR REPLACE FUNCTION public.handle_lead_lifecycle()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    first_stage_id UUID;
BEGIN
    -- CENÁRIO A: Virou CONTACT, SPAM ou ARCHIVED
    -- Ação: Remove do Pipeline (stage_id = null)
    IF NEW.lead_type IN ('contact', 'spam', 'archived') THEN
        NEW.stage_id := NULL;
    END IF;

    -- CENÁRIO B: É um LEAD e está sem fase
    -- Ação: Joga para a primeira fase da MESMA EQUIPE
    IF NEW.lead_type = 'lead' AND NEW.stage_id IS NULL THEN
        SELECT id INTO first_stage_id 
        FROM public.pipeline_stages 
        WHERE equipe_id = NEW.equipe_id
        ORDER BY position ASC 
        LIMIT 1;
        
        NEW.stage_id := first_stage_id;
    END IF;

    RETURN NEW;
END;
$$;