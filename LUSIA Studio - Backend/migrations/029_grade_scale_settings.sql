BEGIN;

ALTER TABLE student_grade_settings
  ADD COLUMN IF NOT EXISTS grade_scale text;

UPDATE student_grade_settings
SET grade_scale = CASE
  WHEN education_level = 'secundario' THEN 'scale_0_20'
  ELSE 'scale_0_100'
END
WHERE grade_scale IS NULL;

ALTER TABLE student_grade_settings
  ALTER COLUMN grade_scale SET NOT NULL;

ALTER TABLE student_grade_settings
  DROP CONSTRAINT IF EXISTS student_grade_settings_grade_scale_check;

ALTER TABLE student_grade_settings
  ADD CONSTRAINT student_grade_settings_grade_scale_check
  CHECK (grade_scale IN ('scale_0_20', 'scale_0_100'));

COMMENT ON COLUMN student_grade_settings.grade_scale IS
  'Displayed/input grade scale for the academic year. Legacy data keeps secundario on 0-20 and all other students on 0-100.';

COMMIT;
