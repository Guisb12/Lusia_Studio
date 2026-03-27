---
last-updated: 2026-03-19
stability: semi-stable
agent-routing: "Read when working on documents, artifacts, questions, or document pipeline data layer."
---

# Documents Domain Entities

Artifacts (documents, quizzes, notes), the document processing pipeline (document_jobs), and the question bank. Artifacts are the central content entity — they can be natively created or uploaded and processed through an AI pipeline.

---

## Table: `artifacts`

**Purpose:** A document, quiz, exercise sheet, or note. Can be natively created (TipTap editor) or uploaded (PDF/DOCX) and processed through the AI document pipeline. Stores content in multiple formats and tracks processing state.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `organization_id` | uuid | Owning organization | FK → organizations(id) ON DELETE CASCADE, NOT NULL |
| `user_id` | uuid | Creator/owner | FK → profiles(id) ON DELETE CASCADE, NOT NULL |
| `artifact_type` | text | Content type category | NOT NULL, CHECK: 'quiz', 'note', 'exercise_sheet', 'uploaded_file', 'presentation' |
| `artifact_name` | text | Display name | NOT NULL |
| `icon` | text | Display icon identifier | |
| `subject_ids` | uuid[] | Associated subjects | Array of subject references |
| `content` | jsonb | Structured content (questions, sections, generation params, streamed note blocks, etc.) | NOT NULL, DEFAULT '{}' |
| `source_type` | text | How the artifact was created | DEFAULT 'native', CHECK: 'native', 'pdf', 'docx', 'md', 'txt' |
| `conversion_requested` | boolean | Whether TipTap conversion has been requested | DEFAULT false |
| `storage_path` | text | Supabase storage path for uploaded files | |
| `tiptap_json` | jsonb | TipTap editor representation | |
| `markdown_content` | text | Markdown representation | |
| `is_processed` | boolean | Whether pipeline processing is complete | DEFAULT false |
| `processing_failed` | boolean | Whether pipeline processing failed | DEFAULT false |
| `processing_error` | text | Error message if processing failed | |
| `subject_id` | uuid | Primary subject (single) | FK → subjects(id) |
| `year_level` | text | Target year level | |
| `subject_component` | text | Subject sub-area (e.g., 'Física') | |
| `curriculum_codes` | text[] | Linked curriculum codes | Array of curriculum.code references |
| `is_public` | boolean | Whether artifact is visible to all org members | NOT NULL, DEFAULT false |
| `created_at` | timestamptz | Creation timestamp | DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | DEFAULT now() |

### Indexes

```
Index: idx_artifacts_org
Columns: (organization_id)
Type: btree
Purpose: Serves: listing all artifacts in an org

Index: idx_artifacts_user
Columns: (user_id)
Type: btree
Purpose: Serves: listing artifacts by creator

Index: idx_artifacts_type
Columns: (organization_id, artifact_type)
Type: btree composite
Purpose: Serves: filtering artifacts by type within an org

Index: idx_artifacts_public
Columns: (organization_id, is_public)
Type: btree composite
Purpose: Serves: listing public artifacts in an org

Index: idx_artifacts_content
Columns: content
Type: GIN (jsonb)
Purpose: Serves: content search within artifact JSON

Index: idx_artifacts_curriculum
Columns: curriculum_codes
Type: GIN
Purpose: Serves: finding artifacts tagged with specific curriculum codes

Index: idx_artifacts_subject
Columns: (subject_id, year_level)
Type: btree composite
Purpose: Serves: filtering by subject and year level

Index: idx_artifacts_processing
Columns: (is_processed, processing_failed)
Type: btree partial (WHERE source_type != 'native')
Purpose: Originally added for uploaded artifacts; runtime processing visibility is now driven by active `document_jobs` for uploads, presentations, and generated notes

Index: idx_artifacts_org_user_processed
Columns: (organization_id, user_id, is_processed)
Type: btree composite
Purpose: Serves: user's artifact list filtered by processing status
```

### Relationships

- Each artifact belongs to one organization (`organization_id` → `organizations.id`).
- Each artifact is owned by one user (`user_id` → `profiles.id`).
- Artifacts can reference a primary subject (`subject_id` → `subjects.id`) and multiple subjects via `subject_ids` array.
- Artifacts can have many questions (`questions.artifact_id` → `artifacts.id`, SET NULL on artifact deletion).
- Artifacts can have document processing jobs (`document_jobs.artifact_id` → `artifacts.id`, CASCADE on artifact deletion).
- Assignments reference artifacts via `assignments.artifact_id` → `artifacts.id` — deleting an in-use artifact is blocked (FK constraint, 409 error).
- Calendar sessions can reference artifacts via `teacher_artifact_ids` and `student_sessions.student_artifact_ids` arrays.
- Curriculum codes on artifacts are text references to `curriculum.code`, not formal FKs.

### Access Patterns

**Service:** `artifacts_service.py`

```
SELECT constants:
ARTIFACT_SUMMARY_SELECT =
    "id,organization_id,user_id,artifact_type,artifact_name,
     icon,subject_ids,source_type,
     conversion_requested,storage_path,
     is_processed,processing_failed,processing_error,
     subject_id,year_level,subject_component,curriculum_codes,
     is_public,created_at,updated_at"
    (Excludes: content, tiptap_json, markdown_content)

ARTIFACT_DETAIL_SELECT =
    "id,organization_id,user_id,artifact_type,artifact_name,
     icon,subject_ids,content,source_type,
     conversion_requested,storage_path,tiptap_json,markdown_content,
     is_processed,processing_failed,processing_error,
     subject_id,year_level,subject_component,curriculum_codes,
     is_public,created_at,updated_at"
    (Includes: content, tiptap_json, markdown_content)
```

- **List by org (teacher):** `.eq("organization_id", org_id).or_(f"user_id.eq.{user_id},is_public.eq.true").order("created_at", desc=True)` — teachers see own + public artifacts.
- **Filter by type:** Adds `.eq("artifact_type", type_filter)`.
- **Filter by processing status:** Adds `.eq("is_processed", True/False)`.
- **Detail by ID:** `.eq("id", artifact_id).limit(1)` with `ARTIFACT_DETAIL_SELECT`.
- **Create:** `.insert({...})` — returns hydrated artifact.
- **Update:** `.update({...}).eq("id", artifact_id)` — updates `updated_at` explicitly.
- **Delete with FK check:** Attempts delete, catches FK constraint 23503 error, returns 409 with assignment count.
- **Hydration:** `_hydrate_artifacts()` resolves `subject_ids` → subject names/colors in one batch query.

### RLS Policies

- `owner_full_access`: FOR ALL — artifact owner has full access.
- `org_members_see_public`: FOR SELECT — org members can read public artifacts.

---

## Table: `document_jobs`

**Purpose:** Tracks background document/generation work for uploaded files and generated artifacts. Jobs back the upload pipeline, presentation generation, and note generation.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `artifact_id` | uuid | Artifact being processed | FK → artifacts(id) ON DELETE CASCADE, NOT NULL |
| `organization_id` | uuid | Owning organization | FK → organizations(id) ON DELETE CASCADE, NOT NULL |
| `user_id` | uuid | User who triggered processing | FK → auth.users(id) |
| `status` | text | Current pipeline stage | NOT NULL, DEFAULT 'pending', CHECK: see below |
| `current_step` | text | Current step counter (numeric string) | DEFAULT '0' |
| `total_steps` | integer | Total number of pipeline steps | DEFAULT 0 |
| `step_label` | text | Human-readable description of current step | |
| `error_message` | text | Error details if failed | |
| `started_at` | timestamptz | When processing started | |
| `completed_at` | timestamptz | Pipeline completion timestamp | |
| `created_at` | timestamptz | Job creation timestamp | DEFAULT now() |
| `updated_at` | timestamptz | Last status update | DEFAULT now() |
| `metadata` | jsonb | Pipeline metadata (step results, timings) | DEFAULT '{}' |
| `retry_count` | integer | Number of retry attempts | DEFAULT 0 |

**Status values in current code:** upload pipeline stages (`'pending'`, `'parsing'`, `'extracting_images'`, `'structuring'`, `'categorizing'`, `'extracting_questions'`, `'categorizing_questions'`, `'converting_tiptap'`) plus generator stages such as `'planning'`, `'generating_slides'`, and `'generating_note'`, followed by `'completed'` or `'failed'`.

### Indexes

```
Index: idx_document_jobs_artifact
Columns: (artifact_id)
Type: btree
Purpose: Serves: finding jobs for a specific artifact

Index: idx_document_jobs_artifact_id
Columns: (artifact_id)
Type: btree
Purpose: Serves: same as above (duplicate, exists from different migration)

Index: idx_document_jobs_artifact_status
Columns: (artifact_id, status)
Type: btree composite
Purpose: Serves: checking processing status for an artifact

Index: idx_document_jobs_status
Columns: (status)
Type: btree partial (WHERE status NOT IN ('completed', 'failed'))
Purpose: Serves: finding active/pending jobs across all artifacts (pipeline monitoring)
```

### Relationships

- Each job belongs to one artifact (`artifact_id` → `artifacts.id`, CASCADE on deletion).
- Each job is scoped to one organization and one user for access control.
- A single artifact can have multiple jobs (e.g., if reprocessed after failure).
- When a job completes, it updates the parent artifact's `is_processed`, `content`, `tiptap_json`, and `markdown_content` fields.

### Access Patterns

**Service:** `document_upload_service.py`

- **Get active job for artifact:** `.eq("artifact_id", artifact_id).not_.in_("status", ["completed", "failed"]).order("created_at", desc=True).limit(1)`.
- **Get latest job for artifact:** `.eq("artifact_id", artifact_id).order("created_at", desc=True).limit(1)`.
- **Create job:** `.insert({"artifact_id": aid, "organization_id": org_id, "user_id": uid, "status": "pending"})`.
- **Update status:** `.update({"status": new_status, "current_step": step, "updated_at": now}).eq("id", job_id)`.
- **Complete job:** `.update({"status": "completed", "completed_at": now}).eq("id", job_id)` — also updates the parent artifact.
- **Fail job:** `.update({"status": "failed", "error_message": error}).eq("id", job_id)` — also sets `processing_failed` on the artifact.

### RLS Policies

- `document_jobs_owner_access`: FOR ALL — job owner has full access.

---

## Table: `questions`

**Purpose:** Question bank for quizzes and exercises. Each question has a type (multiple choice, fill-blank, matching, etc.), structured content, and optional curriculum tagging and national exam metadata.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `organization_id` | uuid | Owning organization | FK → organizations(id) ON DELETE CASCADE, NOT NULL |
| `created_by` | uuid | Question creator | FK → profiles(id) |
| `source_type` | text | How the question was created | NOT NULL, CHECK: 'teacher_uploaded', 'ai_created', 'ai_created_teacher_edited', 'national_exam', 'national_exam_adapted' |
| `artifact_id` | uuid | Parent artifact (if part of a quiz) | FK → artifacts(id) ON DELETE SET NULL |
| `exam_year` | integer | National exam year (if exam question) | |
| `exam_phase` | text | Exam phase (e.g., '1ª fase', '2ª fase') | |
| `exam_group` | integer | Exam group number | |
| `exam_order_in_group` | integer | Order within exam group | |
| `type` | text | Question type | NOT NULL, CHECK: see below |
| `parent_id` | uuid | Parent question (for context groups) | Self-ref FK → questions(id) ON DELETE CASCADE |
| `order_in_parent` | integer | Order within parent context group | |
| `label` | text | Question label (e.g., '1.a', 'Q3') | |
| `content` | jsonb | Full question content (prompt, options, answer, explanation) | NOT NULL |
| `subject_id` | uuid | Primary subject | FK → subjects(id) |
| `year_level` | text | Target year level | |
| `subject_component` | text | Subject sub-area | |
| `curriculum_codes` | text[] | Linked curriculum codes | Array of curriculum.code references |
| `is_public` | boolean | Whether question is visible to org | DEFAULT false |
| `created_at` | timestamptz | Creation timestamp | DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | DEFAULT now() |

**Question types:** `'multiple_choice'`, `'true_false'`, `'fill_blank'`, `'matching'`, `'short_answer'`, `'multiple_response'`, `'ordering'`, `'open_extended'`, `'context_group'`.

**Source types (after migration 013):** `'teacher_uploaded'`, `'ai_created'`, `'ai_created_teacher_edited'`, `'national_exam'`, `'national_exam_adapted'`.

### Indexes

```
Index: idx_questions_artifact
Columns: (artifact_id)
Type: btree
Purpose: Serves: listing all questions for a specific artifact/quiz

Index: idx_questions_parent
Columns: (parent_id)
Type: btree
Purpose: Serves: loading sub-questions within a context group

Index: idx_questions_curriculum
Columns: curriculum_codes
Type: GIN
Purpose: Serves: finding questions tagged with specific curriculum codes

Index: idx_questions_subject
Columns: (subject_id, year_level)
Type: btree composite
Purpose: Serves: filtering questions by subject and year level

Index: idx_questions_exam
Columns: (exam_year, exam_phase, exam_group)
Type: btree composite
Purpose: Serves: browsing national exam questions by year/phase/group

Index: idx_questions_source
Columns: (source_type)
Type: btree
Purpose: Serves: filtering by question origin (AI-created vs teacher-uploaded vs exam)

Index: idx_questions_org
Columns: (organization_id)
Type: btree
Purpose: Serves: listing all questions in an org

Index: idx_questions_creator
Columns: (created_by)
Type: btree
Purpose: Serves: listing questions created by a specific user

Index: idx_questions_content
Columns: content
Type: GIN (jsonb)
Purpose: Serves: content search within question JSON
```

### Relationships

- Each question belongs to one organization (`organization_id` → `organizations.id`).
- Each question is created by one user (`created_by` → `profiles.id`).
- Questions optionally belong to an artifact/quiz (`artifact_id` → `artifacts.id`, SET NULL on artifact deletion) — standalone questions exist in the question bank without an artifact.
- Questions can form hierarchies via `parent_id` self-reference — `context_group` questions have child sub-questions. Deleting a parent cascades to delete children.
- Questions reference a subject (`subject_id` → `subjects.id`) and curriculum codes (text array, not FK).

### Access Patterns

**Service:** `quiz_questions_service.py`

```
SELECT constant:
QUESTION_SELECT =
    "id,organization_id,created_by,source_type,artifact_id,
     type,parent_id,order_in_parent,label,content,
     subject_id,year_level,subject_component,curriculum_codes,
     is_public,created_at,updated_at,
     exam_year,exam_phase,exam_group,exam_order_in_group"
```

- **List by artifact:** `.eq("artifact_id", artifact_id).is_("parent_id", "null").order("order_in_parent")` — root questions for a quiz, ordered.
- **List with ownership filter:** `.eq("organization_id", org_id).or_(f"created_by.eq.{user_id},is_public.eq.true")` — teachers see own + public. Admins see all.
- **List by IDs:** `.in_("id", ids)` — direct fetch for specific questions.
- **Get children of context group:** `.eq("parent_id", parent_id).order("order_in_parent")`.
- **Create:** `.insert({...})` — includes all question content and metadata.
- **Bulk create (from quiz generation):** `.insert(question_rows)` — multiple questions created at once.
- **Update:** `.update({content, ...}).eq("id", question_id)`.
- **Delete:** `.delete().eq("id", question_id)` — cascades to child questions.

### RLS Policies

- `questions_owner_full_access`: FOR ALL — question creator has full access.
- `questions_public_org_read`: FOR SELECT — org members can read public questions.

---

## Domain Relationships Summary

The documents domain stores all user-created and AI-processed content. Artifacts are the container entity — a quiz artifact references its questions, while note and exercise sheet artifacts store content directly. The document pipeline (`document_jobs`) processes uploaded files through AI stages (OCR → categorize → extract → convert) and writes results back to the artifact. Questions can exist independently in the question bank or belong to a quiz artifact. The `content` jsonb column on both artifacts and questions stores the structured content in a flexible schema that varies by type. Curriculum codes connect content to the national curriculum (`data/curriculum.md`), and assignments (`data/assignments.md`) reference artifacts to distribute content to students.
