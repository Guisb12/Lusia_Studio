-- 012_classrooms_v2.sql
-- Evolve classrooms table: single values -> arrays, status -> active boolean, add is_primary flag
-- Run this in Supabase SQL editor

-- 1. Add new columns alongside old ones
ALTER TABLE public.classrooms
  ADD COLUMN IF NOT EXISTS subject_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS grade_levels text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS courses text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false;

-- 2. Migrate existing data from old single-value columns
UPDATE public.classrooms
SET subject_ids = CASE WHEN subject_id IS NOT NULL THEN ARRAY[subject_id] ELSE '{}' END,
    grade_levels = CASE WHEN grade_level IS NOT NULL THEN ARRAY[grade_level] ELSE '{}' END,
    active = (status = 'active');

-- 3. Drop old columns
ALTER TABLE public.classrooms
  DROP COLUMN IF EXISTS subject_id,
  DROP COLUMN IF EXISTS grade_level,
  DROP COLUMN IF EXISTS school_year,
  DROP COLUMN IF EXISTS status;

-- 4. Make teacher_id NOT NULL
ALTER TABLE public.classrooms
  ALTER COLUMN teacher_id SET NOT NULL;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_classrooms_active
  ON public.classrooms(organization_id, active);
CREATE INDEX IF NOT EXISTS idx_classrooms_primary
  ON public.classrooms(teacher_id, is_primary) WHERE is_primary = true;

DROP INDEX IF EXISTS idx_classrooms_status;

-- 6. RPC: Smart student recommendations based on subject overlap
CREATE OR REPLACE FUNCTION get_student_recommendations(
  p_org_id uuid,
  p_teacher_subject_ids uuid[]
)
RETURNS TABLE(
  student_id uuid,
  full_name text,
  display_name text,
  avatar_url text,
  grade_level text,
  course text,
  subject_ids uuid[],
  matching_subject_ids uuid[],
  score int
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS student_id,
    p.full_name,
    p.display_name,
    p.avatar_url,
    p.grade_level,
    p.course,
    p.subject_ids,
    (SELECT COALESCE(array_agg(s), '{}') FROM unnest(p.subject_ids) s WHERE s = ANY(p_teacher_subject_ids)) AS matching_subject_ids,
    (SELECT count(*)::int FROM unnest(p.subject_ids) s WHERE s = ANY(p_teacher_subject_ids)) AS score
  FROM profiles p
  WHERE p.organization_id = p_org_id
    AND p.role = 'student'
    AND p.status = 'active'
    AND p.subject_ids IS NOT NULL
    AND p.subject_ids && p_teacher_subject_ids  -- at least one overlap
  ORDER BY score DESC, p.full_name;
END;
$$ LANGUAGE plpgsql STABLE;
