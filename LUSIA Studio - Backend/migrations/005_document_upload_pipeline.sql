-- 005_document_upload_pipeline.sql
-- Document upload pipeline: recreate artifacts, create questions, create document_jobs, storage buckets

-- ═══════════════════════════════════════════════════════════
-- 1. Drop and recreate artifacts table with full spec
-- ═══════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.artifacts CASCADE;

CREATE TABLE public.artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Identity
  artifact_type text NOT NULL CHECK (artifact_type IN (
    'quiz', 'note', 'exercise_sheet', 'uploaded_file'
  )),
  artifact_name text NOT NULL,
  icon text,

  -- Legacy subject linking (for quizzes)
  subject_ids uuid[],

  -- Quiz content (question_ids array, only for quiz type)
  content jsonb NOT NULL DEFAULT '{}',

  -- Source
  source_type text NOT NULL DEFAULT 'native' CHECK (source_type IN (
    'native', 'pdf', 'docx', 'md', 'txt'
  )),

  -- Upload pipeline inputs (uploaded_file only)
  document_category text CHECK (document_category IN (
    'study', 'exercises', 'study_exercises'
  )),
  conversion_requested boolean DEFAULT false,

  -- Storage (uploaded_file only, never mutated after upload)
  storage_path text,

  -- Editor content
  tiptap_json jsonb,
  markdown_content text,

  -- Pipeline state (uploaded_file only)
  is_processed boolean DEFAULT false,
  processing_failed boolean DEFAULT false,
  processing_error text,

  -- Curriculum
  subject_id uuid REFERENCES public.subjects(id),
  year_level text,
  subject_component text,
  curriculum_codes text[],

  -- Visibility
  is_public boolean NOT NULL DEFAULT false,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_artifacts_org        ON public.artifacts(organization_id);
CREATE INDEX idx_artifacts_user       ON public.artifacts(user_id);
CREATE INDEX idx_artifacts_type       ON public.artifacts(organization_id, artifact_type);
CREATE INDEX idx_artifacts_public     ON public.artifacts(organization_id, is_public);
CREATE INDEX idx_artifacts_content    ON public.artifacts USING GIN(content);
CREATE INDEX idx_artifacts_curriculum ON public.artifacts USING GIN(curriculum_codes);
CREATE INDEX idx_artifacts_subject    ON public.artifacts(subject_id, year_level);
CREATE INDEX idx_artifacts_processing ON public.artifacts(is_processed, processing_failed)
  WHERE source_type != 'native';

ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_full_access" ON public.artifacts
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "org_members_see_public" ON public.artifacts
  FOR SELECT USING (
    is_public = true
    AND organization_id = (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );


-- ═══════════════════════════════════════════════════════════
-- 2. Drop quiz_questions and create unified questions table
-- ═══════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.quiz_questions CASCADE;
DROP TABLE IF EXISTS public.quiz_question_types CASCADE;

CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id),

  -- Origin
  source_type text NOT NULL CHECK (source_type IN (
    'teacher_uploaded',
    'ai_created',
    'ai_created_teacher_edited',
    'national_exam'
  )),
  artifact_id uuid REFERENCES public.artifacts(id) ON DELETE SET NULL,

  -- Exam metadata (national_exam only)
  exam_year int,
  exam_phase text,
  exam_group int,
  exam_order_in_group int,

  -- Question structure
  type text NOT NULL CHECK (type IN (
    'multiple_choice',
    'true_false',
    'fill_blank',
    'matching',
    'short_answer',
    'multiple_response',
    'ordering',
    'open_extended',
    'context_group'
  )),
  parent_id uuid REFERENCES public.questions(id) ON DELETE CASCADE,
  order_in_parent int,
  label text,

  -- Content
  content jsonb NOT NULL,

  -- Curriculum
  subject_id uuid REFERENCES public.subjects(id),
  year_level text,
  subject_component text,
  curriculum_codes text[],

  is_public boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_questions_artifact   ON public.questions(artifact_id);
CREATE INDEX idx_questions_parent     ON public.questions(parent_id);
CREATE INDEX idx_questions_curriculum ON public.questions USING GIN(curriculum_codes);
CREATE INDEX idx_questions_subject    ON public.questions(subject_id, year_level);
CREATE INDEX idx_questions_exam       ON public.questions(exam_year, exam_phase, exam_group);
CREATE INDEX idx_questions_source     ON public.questions(source_type);
CREATE INDEX idx_questions_org        ON public.questions(organization_id);
CREATE INDEX idx_questions_creator    ON public.questions(created_by);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questions_owner_full_access" ON public.questions
  FOR ALL USING (created_by = auth.uid());

CREATE POLICY "questions_public_org_read" ON public.questions
  FOR SELECT USING (
    is_public = true
    AND organization_id = (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );


-- ═══════════════════════════════════════════════════════════
-- 3. Document processing jobs table
-- ═══════════════════════════════════════════════════════════

CREATE TABLE public.document_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES public.artifacts(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'parsing',
    'extracting_images',
    'categorizing',
    'extracting_questions',
    'converting_tiptap',
    'finalizing',
    'completed',
    'failed'
  )),
  current_step text,
  error_message text,
  retry_count integer DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_document_jobs_artifact ON public.document_jobs(artifact_id);
CREATE INDEX idx_document_jobs_status   ON public.document_jobs(status)
  WHERE status NOT IN ('completed', 'failed');

ALTER TABLE public.document_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_jobs_owner_access" ON public.document_jobs
  FOR ALL USING (user_id = auth.uid());


-- ═══════════════════════════════════════════════════════════
-- 4. Enable Supabase Realtime for status tracking
-- ═══════════════════════════════════════════════════════════

DO $$
BEGIN
  -- artifacts
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'artifacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.artifacts;
  END IF;

  -- document_jobs
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'document_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.document_jobs;
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════
-- 5. Storage buckets
-- ═══════════════════════════════════════════════════════════

-- Teacher documents bucket (private, 50MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'teacher-documents',
  'teacher-documents',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/markdown',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Document images bucket (public, 8MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-images',
  'document-images',
  true,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;


-- ═══════════════════════════════════════════════════════════
-- 6. Storage RLS policies
-- ═══════════════════════════════════════════════════════════

-- teacher-documents: read own org files
CREATE POLICY "teacher_docs_read_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'teacher-documents'
    AND (storage.foldername(name))[1] = (
      SELECT p.organization_id::text FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- teacher-documents: insert in own org/user folder
CREATE POLICY "teacher_docs_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'teacher-documents'
    AND (storage.foldername(name))[1] = (
      SELECT p.organization_id::text FROM public.profiles p WHERE p.id = auth.uid()
    )
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- document-images: public read
CREATE POLICY "document_images_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'document-images');

-- document-images: insert in own org/user folder
CREATE POLICY "document_images_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'document-images'
    AND (storage.foldername(name))[1] = (
      SELECT p.organization_id::text FROM public.profiles p WHERE p.id = auth.uid()
    )
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
