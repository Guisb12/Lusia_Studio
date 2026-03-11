-- Migration 016: Calendar performance indexes
-- Supports the range and teacher-scoped queries used by /calendar.

CREATE INDEX IF NOT EXISTS idx_calendar_sessions_org_starts
  ON public.calendar_sessions(organization_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_calendar_sessions_org_teacher_starts
  ON public.calendar_sessions(organization_id, teacher_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_calendar_sessions_org_recurrence_idx
  ON public.calendar_sessions(organization_id, recurrence_group_id, recurrence_index)
  WHERE recurrence_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_sessions_session_id
  ON public.student_sessions(session_id);
