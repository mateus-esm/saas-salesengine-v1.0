BEGIN;
ALTER TABLE public.pipelines
  ADD COLUMN IF NOT EXISTS revenue_config jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.pipelines.revenue_config IS
  'Sprint 6.7: revenue config. { goal_deals: int, period: "month"|"quarter", conversion_overrides: { [stage_id]: number } }.';
COMMIT;
