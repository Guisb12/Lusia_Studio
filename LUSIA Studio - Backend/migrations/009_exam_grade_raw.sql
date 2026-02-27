-- Add exam_grade_raw column to store the original IAVE score on the 0-200 scale.
-- This avoids precision loss from premature rounding (145 → 15 instead of 14.5).
-- The existing exam_grade column (0-20, rounded) is kept for display.
ALTER TABLE student_subject_cfd ADD COLUMN IF NOT EXISTS exam_grade_raw smallint;

COMMENT ON COLUMN student_subject_cfd.exam_grade_raw IS 'National exam score on 0-200 scale (raw IAVE result)';

-- Backfill from existing rounded data (exam_grade * 10). Not perfectly precise
-- for scores like 145 (stored as 15, backfilled as 150), but acceptable for
-- existing data. New scores will be stored correctly via the API.
UPDATE student_subject_cfd
SET exam_grade_raw = exam_grade * 10
WHERE exam_grade IS NOT NULL AND exam_grade_raw IS NULL;
