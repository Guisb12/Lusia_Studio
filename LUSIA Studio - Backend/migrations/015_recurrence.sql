-- Migration 015: Recurrent Sessions
-- Adds recurrence columns directly to calendar_sessions — no new table needed.

ALTER TABLE public.calendar_sessions
  ADD COLUMN IF NOT EXISTS recurrence_group_id uuid    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recurrence_index    integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recurrence_rule     jsonb   DEFAULT NULL;
  -- recurrence_group_id: shared uuid for all sessions in a batch (gen_random_uuid() at creation)
  -- recurrence_index: 0-based position in the group (0 = first occurrence)
  -- recurrence_rule: the full rule object stored on every session for self-contained access
  --   shape: { freq, interval, days_of_week, month_day, month_nth, month_weekday, end_date }

CREATE INDEX IF NOT EXISTS idx_sessions_recurrence_group
  ON public.calendar_sessions(recurrence_group_id)
  WHERE recurrence_group_id IS NOT NULL;
