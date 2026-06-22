BEGIN;

-- =============================================================================
-- Sprint 6.7 — Predictable Revenue DNA
-- Lead-velocity scoring function
--
-- Formula:  S = Σ(Aj) − (Dk × t)
--   Aj = activity points per event (each activity = +10)
--   t  = days since last activity
--   Dk = decay factor (constant 2.0)
--
-- Returns a non-negative numeric score. Higher values = more engaged lead.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_calculate_lead_velocity(p_lead_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total_points    NUMERIC;
  v_days_since_last NUMERIC;
  v_velocity        NUMERIC;
  v_decay_factor    CONSTANT NUMERIC := 2.0;
BEGIN
  -- Sum activity points (each activity = +10 points)
  SELECT COALESCE(COUNT(*) * 10, 0)
    INTO v_total_points
    FROM public.lead_activities
   WHERE lead_id = p_lead_id;

  -- Days since last activity (0 if no activities exist)
  SELECT COALESCE(
           EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) / 86400,
           0
         )
    INTO v_days_since_last
    FROM public.lead_activities
   WHERE lead_id = p_lead_id;

  -- Calculate: sum(points) - (decay × days since last)
  v_velocity := v_total_points - (v_decay_factor * v_days_since_last);

  -- Floor at zero (velocity never goes negative)
  RETURN GREATEST(0, v_velocity);
END;
$$;

COMMENT ON FUNCTION public.fn_calculate_lead_velocity IS
  'Sprint 6.7: Predictable-Revenue lead-velocity score. S = Σ(Aj) − (Dk × t).';

COMMIT;
