-- Add 'planning' and 'generating_slides' to document_jobs status check constraint.
-- These statuses are used by the presentation generation pipeline.

ALTER TABLE public.document_jobs
  DROP CONSTRAINT document_jobs_status_check;

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
    'completed',
    'failed'
  ));
