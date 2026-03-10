-- Add 'national_exam_adapted' to source_type CHECK constraint on questions table
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_source_type_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_source_type_check
  CHECK (source_type IN (
    'teacher_uploaded',
    'ai_created',
    'ai_created_teacher_edited',
    'national_exam',
    'national_exam_adapted'
  ));
