---
last-updated: 2026-03-19
stability: frequently-updated
agent-routing: "Read before working on quiz generation, quiz questions, or quiz editor code. Cross-reference features/docs.md for the document processing pipeline that feeds quiz generation."
---

# Quiz

## 1. Overview

The quiz feature enables AI-powered quiz creation from curriculum content and/or uploaded documents. Teachers and admins select a subject, year level, and curriculum topics, then the system generates questions via an LLM (OpenRouter) streamed in real time via SSE. Generated questions are stored in a unified question bank (`questions` table) and linked to a quiz artifact. Teachers can then edit questions in a paginated dialog editor, reorder them, change question types, upload images, and save changes. Quizzes are surfaced through the docs feature — quiz artifacts appear alongside documents on the `/dashboard/docs` page. Students interact with quizzes through assignments (see `features/assignments.md`).

**Relationship to docs feature:** Quiz generation is tightly coupled to the docs/artifacts system. Quiz artifacts are stored in the same `artifacts` table as documents (with `artifact_type = "quiz"`). The quiz editor is launched from the docs page. For document upload, processing pipeline, and artifact CRUD, see `features/docs.md`. This doc covers only quiz-specific logic: generation, question bank, question editing, and image uploads.

## 2. Availability

| Attribute | Value |
|---|---|
| **Roles** | Admin (full — generate, edit, delete quizzes and questions), Teacher (full — generate, edit own questions, delete own questions) |
| **Center types** | All (trial included) |
| **Teacher route** | `/dashboard/docs` (quiz editor dialog opens from the docs page) |
| **Student route** | Students interact with quizzes via assignments at `/student/assignments`, not directly |

**Role-based access (enforced in backend):**
- **Admin:** Can edit/delete any question in the org (`_can_administer_question()` returns `True`)
- **Teacher:** Can edit/delete only own questions (filtered by `created_by == user_id`)
- **Student:** Can read questions when fetching by specific IDs (e.g., loading an assigned quiz); cannot create, update, or delete

## 3. Architecture

### 3.1 Frontend Entry Point

Quiz has no dedicated route page. It is accessed through the docs feature at `/dashboard/docs`. The `DocsPage` component manages a view state that can switch to `"quiz_editor"` mode with an `artifactId`, which renders the `QuizArtifactEditorDialog`.

Quiz generation is initiated from a generation flow within the docs UI. The generation process creates a new artifact and streams questions in real time.

### 3.2 Frontend Libraries

Two library modules provide the client-side logic:

**`lib/quiz-generation.ts`** — Types and API client for the generation pipeline:
- `startQuizGeneration(input)` — POST to `/api/quiz-generation/start`, returns `{ artifact_id, artifact_name }`
- `matchCurriculum(input)` — POST to `/api/quiz-generation/match-curriculum`, returns matched curriculum nodes
- `resolveCurriculumCodes(input)` — POST to `/api/quiz-generation/resolve-codes`, returns full node objects
- `streamQuizGeneration(artifactId, onEvent, onError, onComplete)` — Opens SSE stream via fetch + ReadableStream, returns `AbortController` for cleanup

**`lib/quiz.ts`** — Types, question bank API client, question normalization, grading, and type conversion:
- `fetchQuizQuestions(filters?)` — GET `/api/quiz-questions` with optional filters (ids, type, subject_id, etc.)
- `createQuizQuestion(payload)` — POST `/api/quiz-questions`
- `updateQuizQuestion(id, payload)` — PATCH `/api/quiz-questions/{id}`
- `deleteQuizQuestion(id)` — DELETE `/api/quiz-questions/{id}`
- `uploadQuizImage(file)` — POST `/api/quiz-images/upload` (FormData)
- `normalizeQuestionForEditor(question)` — Converts backend label-based schema to frontend UUID-based schema
- `convertQuestionContent(fromType, toType, content)` — Smart conversion between question types
- `evaluateQuizAttempt(questions, answers)` — Client-side grading (mirrors backend `_grade_question`)
- `extractQuizQuestionIds(content)` — Extracts question ID list from artifact content JSONB

### 3.3 UI Components — `components/quiz/`

**Component tree:**

```
QuizArtifactEditorDialog
├── QuizPagination
│   └── QuizQuestionRenderer
│       ├── QuestionImage (lightbox)
│       ├── QuestionImageEditorPanel (editor mode, with remove)
│       ├── ImageCropperDialog (react-image-crop)
│       └── Question type components (from question-types/)
│           ├── MultipleChoiceStudent / Editor / Review
│           ├── TrueFalseStudent / Editor / Review
│           ├── FillBlankStudent / Editor / Review
│           ├── MatchingStudent / Editor / Review
│           ├── ShortAnswerStudent / Editor / Review
│           ├── MultipleResponseStudent / Editor / Review
│           ├── OrderingStudent / Editor / Review
│           ├── OpenExtendedStudent / Editor / Review
│           └── ContextGroupEditor / Display
```

**QuizArtifactEditorDialog** (`components/quiz/QuizArtifactEditorDialog.tsx`):
- Full-screen dialog for editing a quiz's questions
- Loads artifact via `fetchArtifact()`, extracts question IDs from artifact content, fetches questions via `fetchQuizQuestions({ ids })`
- Normalizes each question via `normalizeQuestionForEditor()` for the UUID-based editor schema
- Tracks dirty state per question (`dirtyQuestionIds` Set) and artifact-level dirty state (`artifactDirty`)
- Supports: add question (any type), delete question, reorder (move up/down), change question type (with undo via toast), save all dirty questions in parallel + update artifact content
- Paginates questions via `QuizPagination`

**QuizPagination** (`components/quiz/QuizPagination.tsx`):
- Dot navigation with auto-scroll, keyboard navigation (arrow keys), swipe navigation (drag gesture via Framer Motion)
- Slide animation between questions (AnimatePresence)
- Optional progress bar (for student quiz-taking mode)
- Displays "Pergunta X de Y" counter

**QuizQuestionRenderer** (`components/quiz/QuizQuestionRenderer.tsx`):
- Renders a single question in one of three view modes: `"student"`, `"editor"`, `"review"`
- Handles question text (with MathJax support via `MathEditableText`/`MathBlockText`), optional tip/subtitle, question image (with lightbox), and type-specific body
- Editor mode: inline editable question text, image upload with cropping, MC/MR quick-switch toggle
- Delegates to type-specific sub-components based on `question.type`

**ImageCropperDialog** (`components/quiz/ImageCropperDialog.tsx`):
- Crop dialog using `react-image-crop`
- Free-crop or aspect-ratio-locked modes
- Returns cropped JPEG blob at 92% quality
- Exposed via `useImageCropper()` hook for state management

**Question type components** (`components/quiz/question-types/`):
Each question type has three variants — Student (answering), Editor (content editing), Review (showing correctness):
- `MultipleChoiceQuestion` — Single correct option, radio selection
- `TrueFalseQuestion` — Boolean toggle
- `FillBlankQuestion` — Text with `{{blank}}` markers, dropdown per blank
- `MatchingQuestion` — Left/right item association
- `ShortAnswerQuestion` — Free text input
- `MultipleResponseQuestion` — Multiple correct options, checkbox selection
- `OrderingQuestion` — Drag-to-reorder items
- `OpenExtendedQuestion` — Long-form text answer (editor only, not used in AI-generated quizzes)
- `ContextGroupQuestion` — Context text block grouping child questions (editor only)

### 3.4 Next.js API Routes

All routes are thin auth proxies following the standard pattern. See `STANDARDS.md` for the proxy contract.

**Quiz generation routes (`app/api/quiz-generation/`):**

| Route | Method | Backend Path | Notes |
|---|---|---|---|
| `start/route.ts` | POST | `/api/v1/quiz-generation/start` | Uses `proxyAuthedJson` |
| `[artifactId]/stream/route.ts` | GET | `/api/v1/quiz-generation/{artifactId}/stream` | SSE passthrough — pipes `ReadableStream` body directly, sets `text/event-stream` headers |
| `match-curriculum/route.ts` | POST | `/api/v1/quiz-generation/match-curriculum` | Uses `proxyAuthedJson` |
| `resolve-codes/route.ts` | POST | `/api/v1/quiz-generation/resolve-codes` | Uses `proxyAuthedJson` |

**Quiz question routes (`app/api/quiz-questions/`):**

| Route | Method | Backend Path |
|---|---|---|
| `route.ts` | GET | `/api/v1/quiz-questions/` — forwards `ids`, `type`, `subject_id`, `year_level`, `subject_component`, `curriculum_code` params |
| `route.ts` | POST | `/api/v1/quiz-questions/` |
| `[id]/route.ts` | GET | `/api/v1/quiz-questions/{id}` |
| `[id]/route.ts` | PATCH | `/api/v1/quiz-questions/{id}` |
| `[id]/route.ts` | DELETE | `/api/v1/quiz-questions/{id}` |

**Quiz image route (`app/api/quiz-images/`):**

| Route | Method | Backend Path | Notes |
|---|---|---|---|
| `upload/route.ts` | POST | `/api/v1/quiz-questions/images/upload` | Reads FormData file, sends raw bytes with `Content-Type` and `x-file-name` headers |

### 3.5 Backend Router — `routers/quiz_generation.py`

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| POST | `/start` | `require_teacher` | `create_quiz_artifact()` — validates generation possible, creates artifact row |
| GET | `/{artifact_id}/stream` | `require_teacher` | `generate_questions_stream()` — SSE via `StreamingResponse` |
| POST | `/match-curriculum` | `require_teacher` | `match_curriculum()` — LLM-based curriculum matching |
| POST | `/resolve-codes` | `require_teacher` | `resolve_curriculum_codes()` — DB lookup for curriculum nodes |

### 3.6 Backend Router — `routers/quiz_questions.py`

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| GET | `/` | `get_current_user` (all roles) | `list_quiz_questions()` — with optional filters |
| POST | `/` | `require_teacher` | `create_quiz_question()` |
| POST | `/images/upload` | `require_teacher` | `upload_quiz_image()` — raw body upload |
| GET | `/{question_id}` | `get_current_user` | `get_quiz_question()` |
| PATCH | `/{question_id}` | `require_teacher` | `update_quiz_question()` — role-aware (admin can edit any, teacher only own) |
| DELETE | `/{question_id}` | `require_teacher` | `delete_quiz_question()` — role-aware |

### 3.7 Backend Service — `services/quiz_generation_service.py`

**Core functions:**

- **`create_quiz_artifact()`** — Inserts an artifact row with `artifact_type = "quiz"`, `source_type = "native"`, `is_processed = False`. Stores generation parameters in `content.generation_params` JSONB. Inherits `subject_id`, `year_level`, `subject_component`, `curriculum_codes` from upload artifact when not provided. Auto-generates artifact name from subject name and year level.

- **`generate_questions_stream()`** — Async generator yielding SSE events:
  1. Fetches artifact metadata and generation parameters
  2. Assembles context via `assemble_generation_context()` (shared module for quiz/worksheet)
  3. Builds user prompt with content hierarchy: user instructions (highest priority) > document content (base material) > curriculum + bank questions (supplementary)
  4. Yields `started` event
  5. Streams questions from LLM via `chat_completion_stream()` with `GeneratedQuestion` response model
  6. For each generated question: normalizes content, inserts into DB via `insert_question_tree()`, yields `question` event
  7. On first question with `quiz_name` field: updates artifact name and yields `quiz_name` event
  8. On completion: updates artifact with `question_ids` and `is_processed = True`, yields `done` event
  9. On failure: marks artifact as `processing_failed = True`, yields `error` event

- **`match_curriculum()`** — Async. Fetches curriculum tree, serializes it, sends to LLM with a matching prompt (`temperature=0.1`), validates returned codes against the tree, fetches full node data from DB.

- **`resolve_curriculum_codes()`** — Simple DB lookup: fetches `id, code, title, full_path, level` from `curriculum` table for given codes.

**LLM configuration:**
- Generation: `temperature=0.3`, `max_tokens=32768`
- Curriculum matching: `temperature=0.1`, `max_tokens=1024`
- Both use `chat_completion_stream` / `chat_completion` from `app/pipeline/clients/openrouter.py`

### 3.8 Backend Service — `services/quiz_questions_service.py`

**SELECT constant:**

```
QUESTION_SELECT:
  id, organization_id, created_by, source_type, artifact_id,
  type, parent_id, order_in_parent, label, content,
  subject_id, year_level, subject_component, curriculum_codes,
  is_public, created_at, updated_at,
  exam_year, exam_phase, exam_group, exam_order_in_group
```

**Note:** This service does not use summary/detail split. All endpoints return the full `QUESTION_SELECT`. There is no batch hydration — questions are self-contained JSONB documents with no foreign key lookups needed for rendering.

**Key functions:**

- **`list_quiz_questions()`** — Filters by `organization_id`. When `ids` are provided (e.g., student loading assigned quiz), skips ownership filter. When browsing the bank, restricts to own questions + public ones via `.or_(f"created_by.eq.{user_id},is_public.eq.true")`. Supports filtering by type, subject_id, year_level, subject_component, curriculum_code (GIN containment).

- **`create_quiz_question()`** — Inserts into `questions` table with org_id, user_id, and payload fields.

- **`update_quiz_question()`** — Fetches existing question (with role-based ownership check), applies `model_dump(exclude_unset=True)` patch, sets `updated_at`.

- **`delete_quiz_question()`** — Fetches (with role check), deletes, returns the deleted question.

- **`upload_quiz_image()`** — Validates file size (8MB max), content type (JPEG/PNG/WebP/GIF). Ensures `quiz-images` storage bucket exists (creates if not). Uploads to Supabase Storage at path `{org_id}/{user_id}/{uuid}.{ext}`. Returns `{ bucket, path, public_url }`.

### 3.9 Backend Service — `services/generation_context.py` (shared)

Shared context assembly module used by both quiz and worksheet generation. Gathers:
- Subject metadata (name, status, has_national_exam)
- Curriculum tree (for categorizable subjects: `full`, `structure` status)
- Base content by curriculum code (for `full` status subjects)
- Bank questions from national exams (when subject has exams)
- Teacher document content (when `upload_artifact_id` is provided)

Subject type capabilities determine what context is available:
- `full` — curriculum tree + base content + bank questions
- `structure` — curriculum tree + bank questions (no base content)
- `viable` / `gpa_only` — document content only

## 4. Cache Contract

**The quiz feature does not use the custom query client cache system.** Unlike calendar and other CRUD features, quiz data flows are imperative rather than query-based:

- Quiz questions are fetched via direct `fetch()` calls in `lib/quiz.ts` (not via `useQuery` hooks)
- The quiz editor loads questions into local `useState` on dialog open, edits in-place, and saves via direct API calls
- Quiz generation streams data via SSE — there is no cached query to invalidate
- There is no `lib/queries/quiz.ts` module

**Why this differs from the standard pattern:** Quiz editing happens in a modal dialog that owns its own data lifecycle. Questions are loaded, edited, and saved within a single dialog session. There is no list view, navigation, or cross-feature cache coherence needed for quiz questions themselves. The quiz artifact (which appears in the docs list) is managed by the docs feature's cache contract (see `features/docs.md`).

## 5. Optimistic Update Strategy

**The quiz feature does not use optimistic updates.** All mutations are fire-and-wait:

- Creating a question: awaits `createQuizQuestion()`, then appends to local state
- Deleting a question: awaits `deleteQuizQuestion()`, then removes from local state
- Saving changes: awaits all dirty question updates in parallel via `Promise.all()`, then updates artifact content

**Why:** The quiz editor operates in a dialog with explicit "Save" semantics. Users accumulate edits and save in batch. The imperative save model with loading states is appropriate here — there is no need for instant visual feedback before server confirmation.

## 6. Payload Shapes

### Question Bank Record

Used by all `quiz_questions` endpoints. Single shape — no summary/detail split.

| Field | Type | Purpose |
|---|---|---|
| `id` | `string (uuid)` | Question ID |
| `organization_id` | `string (uuid)` | Org scope |
| `created_by` | `string (uuid)` | Author user ID |
| `source_type` | `string` | `"dge"` (national exam), `"teacher_uploaded"`, or pipeline source |
| `artifact_id` | `string \| null` | Linked quiz artifact (if generated for a specific quiz) |
| `type` | `string` | One of: `multiple_choice`, `true_false`, `fill_blank`, `matching`, `short_answer`, `multiple_response`, `ordering`, `open_extended`, `context_group` |
| `parent_id` | `string \| null` | Parent question ID (for `context_group` children) |
| `order_in_parent` | `int \| null` | Position within parent group |
| `label` | `string \| null` | Display label (e.g., "1.", "1.1.") |
| `content` | `JSONB` | Question content — structure varies by type (see below) |
| `subject_id` | `string \| null` | Linked subject |
| `year_level` | `string \| null` | Year level (e.g., "10", "11") |
| `subject_component` | `string \| null` | Subject component (e.g., "Geologia") |
| `curriculum_codes` | `string[] \| null` | Linked curriculum codes |
| `is_public` | `boolean` | Whether other teachers in the org can see this question |
| `created_at` | `string` | ISO timestamp |
| `updated_at` | `string` | ISO timestamp |
| `exam_year` | `int \| null` | National exam year (if sourced from DGE) |
| `exam_phase` | `string \| null` | Exam phase (e.g., "1", "2") |
| `exam_group` | `int \| null` | Exam question group |
| `exam_order_in_group` | `int \| null` | Position within exam group |

### Question Content JSONB — Backend (label-based) Schema

This is how the LLM generates questions and how they are stored in the DB:

```json
{
  "question": "Texto da pergunta",
  "image_url": null,
  "options": [
    {"label": "A", "text": "opção", "image_url": null}
  ],
  "solution": "B",
  "criteria": "Critérios de correção",
  "ai_generated_fields": ["solution", "criteria"]
}
```

The `solution` field varies by type:
- `multiple_choice` — label string (e.g., `"B"`)
- `true_false` — boolean
- `fill_blank` — `[{"answer": "...", "image_url": null}]` per blank
- `matching` — `[{"left": "A", "right": "1"}]`
- `ordering` — ordered label list `["C", "A", "B"]`
- `short_answer` — answer string
- `multiple_response` — label list `["A", "C"]`

### Question Content — Frontend (UUID-based) Editor Schema

`normalizeQuestionForEditor()` converts label-based to UUID-based at load time:

- `options` items get deterministic `id` fields (from `deterministicId()`)
- `solution` label is resolved to `correct_answer` ID (MC) or `correct_answers` ID list (MR)
- `fill_blank` options are flattened from per-blank arrays to a flat `[{id, text}]` list, and `blanks` array maps blank IDs to correct option IDs
- `matching` items are split into `left_items` and `right_items` with IDs, and `correct_pairs` maps left to right IDs
- `ordering` items get IDs, and `correct_order` maps to item IDs

The editor saves the UUID-based schema back to the DB. Both schemas are supported by the grading logic.

### SSE Stream Events

Events emitted by `GET /quiz-generation/{artifactId}/stream`:

| Event Type | Payload | When |
|---|---|---|
| `started` | `{ type: "started", num_questions }` | Stream begins |
| `quiz_name` | `{ type: "quiz_name", name }` | First question includes a quiz name; artifact is renamed |
| `question` | `{ type: "question", question: { id, type, label, content, order } }` | Each question generated and inserted into DB |
| `done` | `{ type: "done", artifact_id, total_questions }` | All questions generated; artifact finalized |
| `error` | `{ type: "error", message }` | Generation failed |

### Quiz Generation Start Input

| Field | Type | Default | Purpose |
|---|---|---|---|
| `subject_id` | `string \| null` | `null` | Subject to generate for |
| `year_level` | `string \| null` | `null` | Year level |
| `subject_component` | `string \| null` | `null` | Subject component |
| `curriculum_codes` | `string[]` | `[]` | Specific curriculum topics |
| `source_type` | `"dge" \| "upload"` | `"dge"` | Context source: curriculum DB or uploaded document |
| `upload_artifact_id` | `string \| null` | `null` | Document to base quiz on |
| `num_questions` | `int` | `10` | Number of questions (1-30) |
| `difficulty` | `"Facil" \| "Medio" \| "Dificil"` | `"Medio"` | Difficulty level |
| `extra_instructions` | `string \| null` | `null` | Teacher's extra instructions |
| `theme_query` | `string \| null` | `null` | Free-text theme description |

### Quiz Image Upload Response

```json
{
  "bucket": "quiz-images",
  "path": "{org_id}/{user_id}/{uuid}.jpg",
  "public_url": "https://..."
}
```

## 7. Database

### Tables Involved

| Table | Description |
|---|---|
| `questions` (originally `quiz_questions`) | Unified question bank — stores all question types, content as JSONB, curriculum metadata |
| `quiz_question_types` | Type catalog — lookup table for valid question type IDs and labels |
| `artifacts` | Quiz artifacts are stored here with `artifact_type = "quiz"` — see `features/docs.md` |
| `curriculum` | Curriculum tree — queried during generation for context and during match-curriculum |
| `subjects` | Subject catalog — queried for subject name during artifact naming |
| `storage.objects` (bucket: `quiz-images`) | Image uploads for questions |

Cross-reference: See `data/` docs for full schema (to be created).

### Indexes

| Index | Table | Columns | Serves |
|---|---|---|---|
| `idx_quiz_questions_org` | `questions` | `(organization_id)` | Org-scoped listing |
| `idx_quiz_questions_creator` | `questions` | `(created_by)` | Ownership-filtered queries |
| `idx_quiz_questions_type` | `questions` | `(organization_id, type)` | Type-filtered listing within org |
| `idx_quiz_questions_subject` | `questions` | `(subject_id, year_level)` | Subject + year filtering (generation context, bank browsing) |
| `idx_quiz_questions_component` | `questions` | `(subject_component)` WHERE NOT NULL | Component filtering |
| `idx_quiz_questions_curriculum` | `questions` | GIN on `curriculum_codes` | Curriculum code containment queries (finding bank questions for generation context) |
| `idx_quiz_questions_content` | `questions` | GIN on `content` | Full-text/structural search within question content JSONB |

### Read Patterns

| Pattern | Index Used | Query Shape |
|---|---|---|
| List questions by IDs (quiz loading) | `idx_quiz_questions_org` + PK | `.eq("organization_id", org_id).in_("id", ids)` |
| Browse own + public questions | `idx_quiz_questions_org` + `idx_quiz_questions_creator` | `.eq("organization_id", org_id).or_("created_by.eq.X,is_public.eq.true")` |
| Filter by subject + year (bank) | `idx_quiz_questions_subject` | `.eq("subject_id", sid).eq("year_level", yl)` |
| Filter by curriculum code | `idx_quiz_questions_curriculum` | `.contains("curriculum_codes", [code])` |
| Single question by ID | PK + org filter | `.eq("id", qid).or_("organization_id.eq.X,organization_id.is.null")` |

### Storage

**Bucket:** `quiz-images`
- **Public:** Yes (images are publicly readable)
- **Max file size:** 8MB
- **Allowed types:** `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- **Path convention:** `{organization_id}/{user_id}/{uuid}.{ext}`
- **RLS policies:** Public read; insert/update/delete restricted to user's own folder (`org_id/user_id/...`)

## 8. Edge Cases and Notes

### Schema Normalization Dual Schema

The question bank stores questions in a "label-based" schema (generated by the LLM pipeline), but the frontend editor operates on a "UUID-based" schema. `normalizeQuestionForEditor()` bridges this gap at load time, and the editor saves the UUID-based version back to the DB. Both schemas are supported by the grading logic (`gradeQuestion()` in `lib/quiz.ts` and `_grade_question()` in `assignments_service.py`). The `migrateAnswersToNewIds()` function handles student answers that reference old random UUIDs after a question is re-normalized.

### Deterministic IDs

`deterministicId(questionId, namespace, discriminator)` generates stable IDs for options/items/blanks using the format `{questionId}__{namespace}_{discriminator}`. This ensures the same DB row always produces the same IDs across page loads, unlike `crypto.randomUUID()`. This is critical for answer grading — student answers reference option IDs.

### Client-Side Grading Duplication

`gradeQuestion()` in `lib/quiz.ts` duplicates the backend `_grade_question()` logic in `assignments_service.py`. The comment explicitly warns: "Any changes here MUST be mirrored there, and vice-versa." This duplication exists to support instant client-side quiz evaluation without a round-trip.

### Question Type Restrictions During Generation

The LLM generation prompt explicitly forbids `open_extended` and `context_group` types for online quizzes — these types lack automatic grading. The system prompt instructs the LLM to only use the 7 auto-gradable types: `multiple_choice`, `true_false`, `fill_blank`, `matching`, `short_answer`, `multiple_response`, `ordering`.

### Quiz Name Auto-Generation

The first generated question can include a `quiz_name` field. When present, the service updates the artifact's `artifact_name` and emits a `quiz_name` SSE event. This allows the LLM to suggest a descriptive name for the quiz (e.g., "Quiz sobre a Revolucao Francesa").

### Artifact Lifecycle

1. `POST /start` creates artifact with `is_processed = False`, stores generation params in `content.generation_params`
2. `GET /{id}/stream` generates questions, inserts them, and updates artifact with `question_ids` and `is_processed = True`
3. If generation fails, artifact is marked `processing_failed = True` with `processing_error` message
4. Already-processed artifacts cannot be re-generated (guard in `_get_artifact_for_generation()`)

### No Custom Query Client Integration

Unlike other features, quiz does not integrate with `lib/query-client.ts`. There is no `lib/queries/quiz.ts` module. Question data is managed imperatively via direct fetch calls and local component state. The quiz artifact itself is cached as part of the docs feature's artifact queries.

### Image Cropping

Before uploading, question images go through `ImageCropperDialog` which uses `react-image-crop`. The cropped image is converted to JPEG at 92% quality before upload. The cropper supports both free-crop and fixed-aspect-ratio modes.

### MC/MR Quick Switch

In the editor, multiple choice and multiple response questions can be toggled between each other inline via a quick-switch toggle. This uses `convertQuestionContent()` to migrate the content between formats (wrapping/unwrapping the solution array).

### Compensating Tag Inheritance

When generating from an uploaded document, the quiz artifact inherits `subject_id`, `year_level`, `subject_component`, and `curriculum_codes` from the source document artifact if not explicitly provided by the teacher. This is handled in `create_quiz_artifact()`.

## 9. Reference Status

The quiz feature does **not** follow the standard cache/query pattern documented in `STANDARDS.md`. It is an AI-generation-centric feature with imperative data flow. Key deviations from the reference implementation:

| Standard Pattern | Quiz Implementation |
|---|---|
| Query module with cache contract | No query module — direct `fetch()` calls |
| Optimistic mutations with snapshot/restore | Fire-and-wait mutations with loading states |
| Summary/detail payload split | Single payload shape for questions |
| Feature shell with query orchestration | Dialog-based editor with local `useState` |
| Server-side initial data | No server-side fetch — dialog loads data on open |

These deviations are appropriate because:
1. Quiz editing happens in a modal with explicit save semantics, not an always-visible list
2. Question data is self-contained JSONB — no foreign key hydration needed
3. The primary data flow is SSE streaming (generation), not REST CRUD
4. Cross-feature cache coherence is handled at the artifact level by the docs feature
