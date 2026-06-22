BEGIN;
CREATE OR REPLACE FUNCTION public.fn_stage_conversion_rates(p_pipeline_id UUID)
RETURNS TABLE(stage_id UUID, stage_name TEXT, stage_position INT, conversion_rate NUMERIC)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_equipe_id UUID;
BEGIN
  -- Get the pipeline's equipe_id for tenant-scoping
  SELECT equipe_id INTO v_equipe_id
  FROM public.pipelines
  WHERE id = p_pipeline_id AND deleted_at IS NULL;

  IF v_equipe_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.id AS stage_id,
    s.name::TEXT AS stage_name,
    s.position::INT AS stage_position,
    CASE
      WHEN entered.count = 0 THEN 1.0
      ELSE ROUND(COALESCE(advanced.count, 0)::NUMERIC / entered.count, 4)
    END AS conversion_rate
  FROM public.pipeline_stages_v2 s
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT osh.opportunity_id) AS count
    FROM public.opportunity_stage_history osh
    WHERE osh.to_stage_id = s.id
  ) entered ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT osh.opportunity_id) AS count
    FROM public.opportunity_stage_history osh
    WHERE osh.from_stage_id = s.id
  ) advanced ON true
  WHERE s.pipeline_id = p_pipeline_id AND s.deleted_at IS NULL
  ORDER BY s.position ASC;
END;
$$;
COMMENT ON FUNCTION public.fn_stage_conversion_rates IS
  'Sprint 6.7: per-stage conversion rate = advanced / entered; 1.0 when no history.';
COMMIT;
