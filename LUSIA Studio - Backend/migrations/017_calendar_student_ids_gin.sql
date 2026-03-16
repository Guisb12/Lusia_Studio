-- Migration 017: Calendar student membership index
-- Helps student-scoped calendar reads that filter with `student_ids @> ARRAY[user_id]`.

CREATE INDEX IF NOT EXISTS idx_calendar_sessions_student_ids_gin
  ON public.calendar_sessions
  USING GIN (student_ids);
