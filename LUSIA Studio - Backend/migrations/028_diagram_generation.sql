-- Add 'diagram' to artifacts and 'generating_diagram' to document_jobs statuses.

ALTER TABLE artifacts DROP CONSTRAINT IF EXISTS artifacts_artifact_type_check;
ALTER TABLE artifacts ADD CONSTRAINT artifacts_artifact_type_check
  CHECK (artifact_type IN ('quiz', 'note', 'exercise_sheet', 'uploaded_file', 'presentation', 'diagram'));

ALTER TABLE public.document_jobs
  DROP CONSTRAINT IF EXISTS document_jobs_status_check;

ALTER TABLE public.document_jobs
  ADD CONSTRAINT document_jobs_status_check CHECK (status IN (
    'pending',
    'parsing',
    'extracting_images',
    'structuring',
    'categorizing',
    'extracting_questions',
    'categorizing_questions',
    'converting_tiptap',
    'planning',
    'generating_slides',
    'generating_note',
    'generating_diagram',
    'completed',
    'failed'
  ));
