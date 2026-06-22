BEGIN;

-- =============================================================================
-- Sprint 6.7 — Lifecycle-advance trigger
--
-- Rule-based (NO ML) trigger that automatically advances leads through the
-- Predictable-Revenue funnel: raw -> mql -> sql -> opportunity -> client -> lost
--
-- Rules:
--   raw -> mql:  contact has email AND >=1 enrichment field in personal_custom_data
--   mql -> sql:  an opportunity EXISTS for the lead AND velocity >= 10
--   sql+ onward: never downgraded automatically (manual only)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_advance_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_has_enrichment BOOLEAN;
  v_velocity NUMERIC;
  v_has_opportunity BOOLEAN;
BEGIN
  -- Rule 1: raw -> mql
  -- Contact has email AND at least one enrichment field in personal_custom_data
  IF NEW.lifecycle_stage = 'raw' THEN
    SELECT COUNT(*) > 0
      INTO v_has_enrichment
      FROM jsonb_each_text(COALESCE(NEW.personal_custom_data, '{}'::jsonb))
     WHERE value IS NOT NULL AND value != '';

    IF NEW.email IS NOT NULL AND NEW.email != '' AND v_has_enrichment THEN
      NEW.lifecycle_stage := 'mql';
    END IF;
  END IF;

  -- Rule 2: mql -> sql
  -- Lead has an opportunity AND velocity >= 10
  IF NEW.lifecycle_stage = 'mql' THEN
    v_velocity := public.fn_calculate_lead_velocity(NEW.id);

    SELECT EXISTS(
      SELECT 1 FROM public.opportunities WHERE lead_id = NEW.id
    ) INTO v_has_opportunity;

    IF v_has_opportunity AND v_velocity >= 10 THEN
      NEW.lifecycle_stage := 'sql';
    END IF;
  END IF;

  -- Never downgrade automatically — if none of the above matched,
  -- the stage stays as-is. The only way to go backwards is manual.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_advance_lifecycle IS
  'Sprint 6.7: rule-based lifecycle advancement. raw->mql (email+enrichment), mql->sql (opportunity+velocity>=10). Never auto-downgrades.';

-- Attach trigger: fires BEFORE INSERT or when relevant columns update
CREATE TRIGGER trg_advance_lifecycle
  BEFORE INSERT OR UPDATE OF email, personal_custom_data, lifecycle_stage
  ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_advance_lifecycle();

COMMIT;
