-- Migration 017: Student search indexes for query-driven pickers

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_profiles_active_students_org_name
  ON public.profiles(organization_id, full_name)
  WHERE role = 'student' AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_profiles_active_students_full_name_trgm
  ON public.profiles
  USING gin (full_name gin_trgm_ops)
  WHERE role = 'student' AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_profiles_active_students_display_name_trgm
  ON public.profiles
  USING gin (display_name gin_trgm_ops)
  WHERE role = 'student' AND status = 'active';
