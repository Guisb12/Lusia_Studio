-- Add 'structuring' and 'categorizing_questions' to document_jobs status check constraint.
-- These statuses were added to support the new LLM structurer pipeline step.

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
    'completed',
    'failed'
  ));
