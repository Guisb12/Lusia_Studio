-- Migration 018: assignment list and classroom member performance indexes

CREATE INDEX IF NOT EXISTS idx_profiles_class_ids_gin
  ON public.profiles
  USING gin (class_ids);

CREATE INDEX IF NOT EXISTS idx_assignments_org_teacher_status_created_at
  ON public.assignments (organization_id, teacher_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignments_org_status_created_at
  ON public.assignments (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignments_student_ids_gin
  ON public.assignments
  USING gin (student_ids);

CREATE INDEX IF NOT EXISTS idx_student_assignments_student_org_created_at
  ON public.student_assignments (student_id, organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_assignments_assignment_org_created_at
  ON public.student_assignments (assignment_id, organization_id, created_at DESC);
