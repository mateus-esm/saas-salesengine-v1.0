-- Sprint 5.3 T3: Task status migration
-- Change from pending/in_progress/done/completed to a_fazer/fazendo/feito/parado

-- First, update the CHECK constraint on tasks.status
-- The current constraint is: CHECK (status IN ('pending', 'done', 'overdue'))
-- We need to change it to: CHECK (status IN ('a_fazer', 'fazendo', 'feito', 'parado'))

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

-- Update existing statuses
UPDATE public.tasks SET status = 'a_fazer' WHERE status IN ('pending', 'overdue');
UPDATE public.tasks SET status = 'fazendo' WHERE status = 'in_progress';
UPDATE public.tasks SET status = 'feito' WHERE status IN ('done', 'completed');
-- 'parado' has no legacy mapping, so it starts with 0 rows

ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('a_fazer', 'fazendo', 'feito', 'parado'));

-- Sprint 5.3 T5: Add parent_task_id for subtasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON public.tasks(parent_task_id);

-- Sprint 5.3 T4: Add observations column
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS observations text;

COMMENT ON COLUMN public.tasks.status IS 'Task status: a_fazer, fazendo, feito, parado';
COMMENT ON COLUMN public.tasks.parent_task_id IS 'Self-referencing FK for subtask support (Sprint 5.3)';
COMMENT ON COLUMN public.tasks.observations IS 'Free-text observations/notes on the task (Sprint 5.3)';
