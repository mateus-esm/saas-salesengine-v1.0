-- 20260617000200_sprint63_ledger_lead_fk.sql
-- Add FK agent_action_ledger.lead_id → public.leads(id) ON DELETE SET NULL.
-- Required so PostgREST can resolve the `lead:leads(name)` embed used by
-- useCopilotCredits.ts; without a declared FK PostgREST returns PGRST200.

-- 1. Null any orphaned lead_id references so the constraint can be added safely.
UPDATE public.agent_action_ledger l
   SET lead_id = NULL
 WHERE l.lead_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.leads le WHERE le.id = l.lead_id);

-- 2. Add the FK idempotently (ADD CONSTRAINT has no IF NOT EXISTS; guard via
--    pg_constraint so re-applying the migration is safe).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_action_ledger_lead_id_fkey'
  ) THEN
    ALTER TABLE public.agent_action_ledger
      ADD CONSTRAINT agent_action_ledger_lead_id_fkey
      FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;
  END IF;
END $$;
