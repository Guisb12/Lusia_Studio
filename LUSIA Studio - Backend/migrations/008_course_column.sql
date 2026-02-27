-- Add course column to student_grade_settings
-- Stores the Secundário course key (e.g. 'ciencias_tecnologias')
-- NULL for non-Secundário students or settings created before this migration
ALTER TABLE student_grade_settings ADD COLUMN IF NOT EXISTS course text;
