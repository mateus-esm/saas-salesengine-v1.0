BEGIN;

-- =============================================================================
-- Sprint 6.7 — ICP (Ideal Customer Profile) configurable weights + scoring
--
-- Design decision (Task 3.5): icp_weights JSONB on pipelines table, NOT a new
-- table. Each pipeline stores an array of {field_key, weight, target_value,
-- label}. Weights are normalized at scoring time.
--
-- Formula: I = (Σ Wi × Vi) × 100, Vi ∈ [0,1]
-- =============================================================================

-- ── 1. Add icp_weights column to pipelines ──────────────────────────────────

ALTER TABLE public.pipelines
  ADD COLUMN IF NOT EXISTS icp_weights jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.pipelines.icp_weights IS
  'Sprint 6.7: ICP weight config. Array of {field_key, weight, target_value, label}. E.g. [{"field_key":"job_title","weight":0.4,"target_value":"engenheiro","label":"Cargo"}]. Weights normalized at scoring time.';

-- ── 2. ICP scoring function ─────────────────────────────────────────────────

-- I = (Σ Wi × Vi) × 100, weights normalized, Vi ∈ [0,1]
CREATE OR REPLACE FUNCTION public.fn_calculate_icp_score(p_lead_id UUID)
RETURNS TABLE(score NUMERIC, breakdown jsonb)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_equipe_id UUID;
  v_pipeline_id UUID;
  v_weights jsonb;
  v_total_score NUMERIC;
  v_weight_sum NUMERIC;
  v_item jsonb;
  v_field_key TEXT;
  v_weight NUMERIC;
  v_target TEXT;
  v_label TEXT;
  v_actual TEXT;
  v_match NUMERIC;
  v_breakdown jsonb := '[]'::jsonb;
BEGIN
  -- Get lead's equipe and first opportunity pipeline
  SELECT l.equipe_id, o.pipeline_id INTO v_equipe_id, v_pipeline_id
  FROM public.leads l
  LEFT JOIN public.opportunities o ON o.lead_id = l.id AND o.deleted_at IS NULL
  WHERE l.id = p_lead_id AND l.deleted_at IS NULL
  LIMIT 1;

  IF v_pipeline_id IS NULL THEN
    RETURN QUERY SELECT 0::NUMERIC AS score, '[]'::jsonb AS breakdown;
    RETURN;
  END IF;

  -- Get ICP weights from pipeline
  SELECT p.icp_weights INTO v_weights
  FROM public.pipelines p
  WHERE p.id = v_pipeline_id;

  IF v_weights IS NULL OR jsonb_array_length(v_weights) = 0 THEN
    RETURN QUERY SELECT 0::NUMERIC, '[]'::jsonb;
    RETURN;
  END IF;

  v_total_score := 0;
  v_weight_sum := 0;

  -- Calculate weighted score for each ICP criterion
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_weights)
  LOOP
    v_field_key := v_item->>'field_key';
    v_weight := (v_item->>'weight')::NUMERIC;
    v_target := v_item->>'target_value';
    v_label := COALESCE(v_item->>'label', v_field_key);

    -- Get actual value from lead (check personal_custom_data first, then lead fields)
    v_actual := NULL;

    -- Check personal_custom_data
    SELECT COALESCE(l.personal_custom_data->>v_field_key,
                    CASE
                      WHEN v_field_key = 'email' THEN l.email
                      WHEN v_field_key = 'name' THEN l.name
                      WHEN v_field_key = 'phone' THEN l.phone
                      WHEN v_field_key = 'origin_category' THEN l.origin_category
                      WHEN v_field_key = 'channel' THEN l.channel
                      WHEN v_field_key = 'observations' THEN l.observations
                      ELSE NULL
                    END)
    INTO v_actual
    FROM public.leads l
    WHERE l.id = p_lead_id;

    -- Calculate Vi ∈ [0,1]: exact match = 1.0, partial/substring = 0.5, no match = 0
    IF v_actual IS NULL OR v_actual = '' OR v_target IS NULL OR v_target = '' THEN
      v_match := 0;
    ELSIF LOWER(v_actual) = LOWER(v_target) THEN
      v_match := 1.0;
    ELSIF POSITION(LOWER(v_target) IN LOWER(v_actual)) > 0
       OR POSITION(LOWER(v_actual) IN LOWER(v_target)) > 0 THEN
      v_match := 0.5;
    ELSE
      v_match := 0;
    END IF;

    v_weight_sum := v_weight_sum + v_weight;
    v_total_score := v_total_score + (v_weight * v_match);

    -- Append to breakdown
    v_breakdown := v_breakdown || jsonb_build_object(
      'field', v_field_key,
      'label', v_label,
      'weight', v_weight,
      'value', v_actual,
      'target', v_target,
      'match', v_match,
      'contribution', v_weight * v_match
    );
  END LOOP;

  -- Normalize weights and compute final score
  IF v_weight_sum > 0 THEN
    v_total_score := (v_total_score / v_weight_sum) * 100;
  ELSE
    v_total_score := 0;
  END IF;

  RETURN QUERY SELECT ROUND(v_total_score, 1)::NUMERIC AS score, v_breakdown::jsonb;
END;
$$;

COMMENT ON FUNCTION public.fn_calculate_icp_score IS
  'Sprint 6.7: ICP scoring. I = (Σ Wi×Vi) × 100, weights normalized. Returns score + field breakdown.';

COMMIT;
