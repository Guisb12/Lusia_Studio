---
last-updated: 2026-03-19
stability: frequently-updated
agent-routing: "Read before working on docs/artifacts feature code. Covers document management, upload pipeline, quiz generation, worksheet generation, presentation generation, note generation, and TipTap editor integration."
---

# Docs (Document & Artifact Management)

## 1. Overview

The docs feature is the document and artifact management system for LUSIA Studio. It spans six major subsystems: **document management** (list, upload, edit, delete artifacts), **document processing pipeline** (upload -> OCR -> categorize -> extract questions -> convert), **quiz generation** (AI-powered question generation from curriculum or uploaded documents), **worksheet generation** (two-phase blueprint -> resolution flow), **presentation generation** (background planner/executor pipeline), and **note generation** (direct structured block streaming into TipTap). Teachers create, upload, and manage educational artifacts — notes, exercise sheets, quizzes, presentations, and uploaded files — which are stored per-organization and optionally tagged with curriculum metadata. The TipTap rich-text editor provides inline editing for notes and exercise sheets, with custom extensions for embedded quiz questions, math notation, callouts, and multi-column layout.

## 2. Availability

| Attribute | Value |
|---|---|
| **Roles** | Admin (full CRUD on org artifacts), Teacher (full CRUD on own artifacts), Student (no direct access — artifacts are consumed via assignments) |
| **Center types** | All (trial included) |
| **Teacher route** | `/dashboard/docs` |
| **Sub-routes** | `/dashboard/docs/worksheet/[artifactId]/blueprint` (blueprint editor), `/dashboard/docs/worksheet/[artifactId]/resolve` (worksheet resolution) |

**Artifact types:**

| Type | Icon | Description |
|---|---|---|
| `quiz` | :question: | AI-generated or manually created quiz with embedded questions |
| `note` | :memo: | Rich-text note (native or promoted from DOCX upload) |
| `exercise_sheet` | :pencil2: | Exercise worksheet (native or AI-generated via worksheet pipeline) |
| `presentation` | :bar_chart: | AI-generated presentation artifact |
| `uploaded_file` | :page_facing_up: | PDF or other uploaded document (stays as-is after processing) |

## 3. Architecture

### 3.1 Route — `app/(teacher)/dashboard/docs/page.tsx`

Server component. Fetches artifacts and subject catalog in parallel via `fetchArtifactsServer()` and `fetchSubjectCatalogServer()`, both direct backend calls skipping the Next API proxy. Passes both as `initialArtifacts` and `initialCatalog` to `DocsPage`.

**Key behavior:** All artifacts are fetched server-side (no date range filter). The subject catalog is fetched in parallel. No pagination — the full artifact list is loaded at first paint.

### 3.2 Server Fetch — `lib/artifacts.server.ts` + `lib/materials.server.ts`

`fetchArtifactsServer()` calls the FastAPI backend directly with the authenticated Supabase session. `fetchSubjectCatalogServer()` fetches the curriculum catalog the same way. Both skip the Next.js API route proxy for faster SSR.

### 3.3 Feature Shell — `components/docs/DocsPage.tsx`

Client component (`"use client"`). This is the orchestration layer for the entire docs feature.

**State managed:**
- `viewState` — discriminated union controlling what the page renders:
  - `{ view: "table" }` — default split view with data table + preview panel
  - `{ view: "quiz_editor"; artifactId }` — full-page quiz editor
  - `{ view: "quiz_generation"; artifactId; numQuestions }` — full-page quiz generation stream
  - `{ view: "doc_editor"; artifactId; resolveWorksheet? }` — full-page note/worksheet editor
  - `{ view: "worksheet_blueprint"; artifactId }` — full-page blueprint editor
- `filterType` — artifact type filter (`null` = all)
- `searchQuery` — text search across artifact names
- `previewArtifactId` — right-panel preview selection
- `tpcArtifact` — artifact for "Enviar TPC" (send homework) flow
- `lusiaArtifactId` — artifact for "Criar com Lusia" shortcut

**Query orchestration:**
- Calls `useDocArtifactsQuery()` with `initialArtifacts` from server props
- Calls `useDocsSubjectCatalogQuery()` with deferred enabling via `useDeferredQueryEnabled()` — catalog query only fires after first paint if not server-provided
- Calls `useProcessingDocuments()` for SSE-based real-time upload status

**URL param handling:**
- `?edit={id}` — auto-opens the doc editor for the specified artifact on mount, then cleans the URL

**Mutations exposed:**
- `createDocArtifact` — create new artifact with immediate cache insertion
- `updateDocArtifact` — update with cache sync
- `deleteDocArtifact` — optimistic remove with rollback on failure
- `updateDocsSubjectPreferences` — persist subject selections

**Lazy-loaded components (dynamic imports, `ssr: false`):**
- `CreateQuizWizard`, `UploadDocDialog`, `ArtifactViewerDialog`, `ArtifactPreviewPanel`, `SubjectSelector`, `QuizFullPageView`, `QuizGenerationFullPage`, `CreateAssignmentDialog`, `DocEditorFullPage`, `BlueprintPage`

### 3.4 UI Components

**Component tree (table view):**

```
DocsPage
├── SubjectsGallery (subject filter bar)
├── DocsDataTable
│   ├── ProcessingStatusBar (inline SSE status)
│   └── [per-row] inline rename, subject pills, year selector, curriculum codes
├── ArtifactPreviewPanel (right split)
│   ├── TipTapEditor (for notes)
│   ├── PdfViewer (for PDFs)
│   └── Floating toolbar
├── UploadDocDialog (lazy)
│   ├── File metadata form (category, subject, year)
│   └── Multi-file bulk edit
├── CreateQuizWizard (lazy)
│   ├── Step: type selection (quiz vs worksheet)
│   ├── Step: source selection (DGE curriculum vs upload)
│   ├── Step: subject + year level
│   ├── Step: theme/curriculum matching
│   ├── Step: question count + difficulty
│   ├── Step: extra instructions
│   └── Step: summary review
├── ArtifactViewerDialog (lazy, PDF full-page)
└── CreateAssignmentDialog (lazy, "Enviar TPC")
```

**Full-page views (replace table when active):**

```
DocsPage [viewState = "quiz_editor"]
└── QuizFullPageView

DocsPage [viewState = "quiz_generation"]
└── QuizGenerationFullPage

DocsPage [viewState = "doc_editor"]
└── DocEditorFullPage
    ├── TipTapEditor
    ├── Inline artifact name editor
    ├── Save status indicator (saved | saving | unsaved)
    ├── Resolution progress tracker
    └── Print preview dialog

DocsPage [viewState = "worksheet_blueprint"]
└── BlueprintPage
    ├── Blueprint block tree editor
    ├── Chat panel (AI-assisted editing)
    └── Context summary display
```

**DocsDataTable** (`components/docs/DocsDataTable.tsx`):
- TanStack React Table with sorting, filtering, column hiding
- Responsive columns via `ResizeObserver` breakpoints
- Module-level LRU curriculum title cache
- Columns: select (checkbox), artifact_name (inline rename), subjects (editable pills), year_level (selector), curriculum_codes (lazy-loaded titles), creators (avatar + LUSIA symbol), updated_at, actions (three-dots menu + quick actions)
- Quick-action buttons: "Enviar TPC", "Criar com Lusia"
- Processing status pills inline for in-progress uploads
- "Novo" badge for recently uploaded items

**ProcessingStatusBar** (`components/docs/ProcessingStatusBar.tsx`):
- Shows documents currently being processed via SSE stream
- Displays current step label (parsing, extracting images, converting, etc.)
- Supabase Realtime subscriptions on `artifacts` and `document_jobs` tables for fallback updates
- Retry button for failed documents
- Auto-removal when processing completes

**ArtifactPreviewPanel** (`components/docs/ArtifactPreviewPanel.tsx`):
- View states: `loading | processing | error | tiptap | converting | pdf | empty`
- Notes: rendered with `TipTapEditor`, 2-second debounced autosave
- PDFs: rendered with `PdfViewer`, page navigation, zoom controls
- Markdown -> TipTap conversion for uploaded DOCX files
- Floating toolbar with editor/PDF controls

### 3.5 Document Processing Pipeline

The document upload pipeline is a backend-driven async flow that processes uploaded files through a series of steps. Three flows exist based on `document_category`:

| Flow | Category | Steps |
|---|---|---|
| **A** (study) | `study` | Parse -> Extract Images -> Categorize -> [Convert TipTap] -> Finalize |
| **B** (mixed) | `study_exercises` | Parse -> Extract Images -> Categorize -> Extract Questions -> [Convert TipTap] -> Finalize |
| **C** (exercises) | `exercises` | Parse -> Extract Images -> Extract Questions -> Categorize Questions -> [Convert TipTap] -> Finalize |

**[Convert TipTap]** only runs for DOCX files (`source_type == "docx"`). DOCX files are promoted to native notes after conversion; PDF files stay as `uploaded_file`.

**Pipeline steps:**

| Step | File | Description |
|---|---|---|
| Parse | `pipeline/steps/parse_document.py` | PDF -> Mistral OCR, DOCX -> Pandoc, MD/TXT -> passthrough |
| Extract Images | `pipeline/steps/extract_images.py` | Scans markdown for base64 images, uploads to `document-images` bucket, replaces with `artifact-image://` URIs |
| Categorize | `pipeline/steps/categorize_document.py` | LLM maps document content to curriculum codes. Non-fatal — failures don't stop the pipeline |
| Extract Questions | `pipeline/steps/extract_questions.py` | LLM extracts questions as flat JSON, rebuilds parent-child tree, inserts into `questions` table. Fatal — failures stop the pipeline |
| Categorize Questions | `pipeline/steps/categorize_document.py` | (Flow C only) LLM categorizes individual questions. Non-fatal |
| Convert TipTap | `pipeline/steps/convert_tiptap.py` | Pure Python markdown -> TipTap JSON converter using `markdown-it-py`. Handles headings, lists, tables, math ($...$, $$...$$), Obsidian-style callouts, note column fences, and image tokens |
| Finalize | `pipeline/tasks.py` | Sets `is_processed=True`, stores `markdown_content`, `tiptap_json`, `curriculum_codes` on the artifact |

**Task Manager** (`pipeline/task_manager.py`):
- Singleton managing background pipeline tasks with semaphore-based concurrency
- Broadcasts status events to per-user SSE subscriber queues
- SSE event types: `hydrate` (initial state), `status` (step change), `completed`, `failed`

**Upload flow (end-to-end):**
1. Frontend: `uploadDocument(file, metadata)` sends file bytes with `x-upload-metadata` header
2. Next API route: proxies to backend `POST /api/v1/documents/upload`
3. Backend router: validates file, uploads to `teacher-documents` bucket, creates artifact row, creates `document_jobs` row, enqueues pipeline task
4. Pipeline: runs async steps, broadcasts SSE events per step change
5. Frontend: `streamDocumentStatus()` opens SSE connection, receives real-time updates, shows in `ProcessingStatusBar`
6. On completion: Supabase Realtime fires artifact update, frontend refreshes artifact list

### 3.6 Quiz Generation

Quiz generation creates a quiz artifact with AI-generated questions, either from curriculum codes (DGE source) or from an uploaded document.

**Flow:**
1. Teacher selects source (DGE or upload), subject, year level, curriculum codes/theme, question count, difficulty via `CreateQuizWizard`
2. `POST /quiz-generation/start` creates the quiz artifact, returns `artifact_id`
3. Frontend navigates to `quiz_generation` view, connects to `GET /quiz-generation/{artifactId}/stream` (SSE)
4. Backend streams generated questions one at a time — each question is inserted into the `questions` table and yielded as an SSE event
5. Frontend renders questions as they arrive in `QuizGenerationFullPage`
6. After stream completes, teacher can edit questions in `QuizFullPageView`

**Supporting endpoints:**
- `POST /quiz-generation/match-curriculum` — matches free-text theme to curriculum nodes via LLM
- `POST /quiz-generation/resolve-codes` — resolves curriculum codes to full node objects

**Backend service** (`quiz_generation_service.py`):
- `create_quiz_artifact()` — creates artifact with `artifact_type="quiz"`, stores generation params in `content`
- `generate_questions_stream()` — loads context (curriculum tree, optional document content), calls LLM via `instructor` streaming, inserts each question with parent-child hierarchy, yields SSE events
- `match_curriculum()` — queries curriculum tree, sends to LLM for semantic matching

### 3.7 Worksheet Generation (Blueprint -> Resolve)

Worksheet generation is a two-phase process: **blueprint planning** (LLM creates a structured plan of question slots) followed by **resolution** (each slot is filled with either a bank question or an AI-generated question).

**Phase 1: Blueprint**

1. Teacher provides prompt, selects template, subject, year level, difficulty via `CreateQuizWizard` (worksheet path)
2. `POST /worksheet-generation/start` creates the artifact with `artifact_type="exercise_sheet"`, stores generation params
3. Frontend navigates to `/dashboard/docs/worksheet/[artifactId]/blueprint`, connects to `GET /worksheet-generation/{artifactId}/blueprint/stream` (SSE)
4. Backend planner (`worksheet_planner.py`) assembles context (teacher prompt, document content, curriculum tree, bank question inventory), expands template skeleton, calls LLM via `instructor` streaming
5. Each `BlueprintBlock` is streamed as an SSE event, rendered live in `BlueprintPage`
6. Teacher reviews blueprint, can chat with AI to modify blocks via `POST /worksheet-generation/{artifactId}/blueprint/chat`

**Blueprint chat agent** (`worksheet_blueprint_agent.py`):
- LangChain-based tool-calling agent with four tools: `update_block`, `create_block`, `delete_block`, `move_block`
- Streams tool call events as SSE, applies mutations to blueprint, persists after stream completes
- Conversation history maintained in artifact `content.conversation_history`

**Blueprint block structure:**

```
BlueprintBlock {
  id, order, source ("bank" | "ai_generated"),
  question_id (for bank questions), curriculum_code, type,
  goal, difficulty, group_label, reference_question_ids,
  comments, children (nested blocks for context_group)
}
```

**Direct edits:** `PATCH /worksheet-generation/{artifactId}/blueprint` — called on debounce for drag-reorder and manual block edits without AI involvement.

**Phase 2: Resolution**

1. Teacher clicks "Resolver" in the blueprint editor
2. Frontend navigates to `/dashboard/docs/worksheet/[artifactId]/resolve`, renders `DocEditorFullPage` with `resolveWorksheet=true`
3. Connects to `GET /worksheet-generation/{artifactId}/resolve/stream` (SSE)
4. Backend resolution (`worksheet_resolution.py`):
   - **Bank blocks:** fetched immediately from the `questions` table
   - **AI blocks:** grouped by L1 curriculum ancestor, generated in parallel via LLM
   - Results interleaved as SSE events with `block_id` references
5. Frontend: `DocEditorFullPage` receives events, inserts `QuestionBlock` nodes into TipTap editor, populates question cache for instant rendering
6. After resolution completes, the worksheet is a fully editable TipTap document with embedded question blocks

### 3.8 TipTap Editor Integration

The rich-text editor is built on TipTap (ProseMirror) with extensive custom extensions.

**Editor component** (`components/docs/editor/TipTapEditor.tsx`):
- Ref-forwarded with `getEditor()` method
- Image upload with live preview + background optimization
- Paste/drop handling for images
- `BubbleMenu` for text formatting, `FloatingMenu` for slash commands
- Image selection tracking for contextual menu visibility

**Extensions** (`lib/tiptap/extensions.ts`):

| Extension | Purpose |
|---|---|
| StarterKit | Headings, lists, code blocks, blockquotes, horizontal rules |
| Tables | Table editing with column resizing |
| Images | Image nodes with optional resize handles |
| Links | Auto-linking URLs |
| QuestionBlock | Custom atom node for embedded quiz questions |
| MathInline | Inline math notation (`$...$` and `$$...$$`) with KaTeX rendering |
| MathBlock | Block-level math (deprecated, backward compatibility) |
| Markdown | Markdown paste support |
| Columns | Multi-column layout |
| Callout | Obsidian-style note callouts with typed styling |
| TaskLists | Interactive checkboxes |
| Typography | Smart quotes, em-dashes |
| CharacterCount | Document statistics |

### 3.9 Presentation Generation

Presentations use a background job pattern similar to document processing, but with a dedicated planner/executor stream. `POST /presentations/start` creates an artifact plus `document_jobs` row, `PipelineTaskManager` runs the generation task, and `GET /presentations/{artifactId}/stream` forwards plan/slide events to the full-page generation view. Processing rows in the docs table are now driven by active `document_jobs`, so presentations and uploads share the same visibility path.

### 3.10 Note Generation

Notes now have a dedicated AI creation pipeline:

1. `POST /notes/start` creates a native `note` artifact with `content.generation_params`, `content.blocks=[]`, `content.phase="pending"`, and a `document_jobs` row.
2. `PipelineTaskManager` runs `generate_note_task()`, which reuses `assemble_generation_context()` and streams NDJSON note blocks from Kimi 2.5.
3. The backend persists partial `content.blocks` as blocks arrive, emits typed SSE events (`heading`, `paragraph`, `list`, `callout`, `columns`, `image`, `svg`, `asset_ready`, `done`, `error`), and materializes raster/SVG assets into the artifact image path.
4. `DocEditorFullPage` reconnects directly to `GET /notes/{artifactId}/stream`, hydrates any saved partial blocks, renders them live into TipTap, keeps the editor read-only during generation, then switches back to normal editing when `done` arrives.

Structured note blocks intentionally exclude wikilinks/embeds in v1. Custom markdown round-trip rules are:
- Callouts: `> [!type] Title`
- Columns: fenced `note-columns` JSON blocks
- Images/SVGs: `![[url|width|align]]`
| Underline, TextColor, Highlight, TextAlign | Rich formatting |
| Placeholder | Empty editor hint text |

**QuestionBlock node** (`lib/tiptap/question-block-node.ts`):
- Custom TipTap Node: `atom: true, selectable: false` — treated as an opaque block
- Protects against accidental deletion via keydown filter
- Renders via `ReactNodeViewRenderer(QuestionBlockView)`
- Stores `artifactId` in extension storage for image URL resolution

**QuestionBlockView** (`lib/tiptap/QuestionBlockView.tsx`):
- `NodeViewWrapper` rendering embedded questions
- Caches questions in module-level `questionCache` Map with LRU eviction
- Skeleton reveal animation for streaming questions (during worksheet resolution)
- Lazy-loads question content on mount
- Three rendering modes: `student` (view-only), `editor` (full controls), `review` (with feedback)
- Math rendering via KaTeX, image support with cropping UI

**QuizQuestionRenderer** (`components/quiz/QuizQuestionRenderer.tsx`):
- Renders 9 question types: MultipleChoice, MultipleResponse, TrueFalse, FillBlank, Matching, ShortAnswer, Ordering, OpenExtended, ContextGroup
- Image lightbox with zoom, image cropper for editor mode
- Type switching (MC <-> MR with content conversion)

### 3.9 Next.js API Routes

All routes are thin auth proxies between the frontend and backend. SSE streams use direct `fetch()` with passthrough piping.

**Artifacts — `app/api/artifacts/`:**

| Method | Path | Proxies to |
|---|---|---|
| `GET` | `/api/artifacts?artifact_type=` | `GET /api/v1/artifacts/` |
| `POST` | `/api/artifacts` | `POST /api/v1/artifacts/` |
| `GET` | `/api/artifacts/[id]` | `GET /api/v1/artifacts/{id}` |
| `PATCH` | `/api/artifacts/[id]` | `PATCH /api/v1/artifacts/{id}` |
| `DELETE` | `/api/artifacts/[id]` | `DELETE /api/v1/artifacts/{id}` |
| `GET` | `/api/artifacts/[id]/file?stream=` | `GET /api/v1/artifacts/{id}/file` (optionally streams file bytes) |
| `POST` | `/api/artifacts/[id]/images/upload` | `POST /api/v1/artifacts/{id}/images/upload` (FormData -> raw bytes) |
| `GET` | `/api/artifacts/[id]/images/[...path]` | `GET /api/v1/artifacts/{id}/images/{path}` (follows redirect, streams bytes) |

**Documents — `app/api/documents/`:**

| Method | Path | Proxies to |
|---|---|---|
| `POST` | `/api/documents/upload` | `POST /api/v1/documents/upload` (raw bytes + headers) |
| `GET` | `/api/documents/processing` | `GET /api/v1/documents/processing` |
| `POST` | `/api/documents/[id]/retry` | `POST /api/v1/documents/{id}/retry` |
| `GET` | `/api/documents/status/stream` | `GET /api/v1/documents/status/stream` (SSE passthrough) |

**Quiz Generation — `app/api/quiz-generation/`:**

| Method | Path | Proxies to |
|---|---|---|
| `POST` | `/api/quiz-generation/start` | `POST /api/v1/quiz-generation/start` |
| `GET` | `/api/quiz-generation/[artifactId]/stream` | `GET /api/v1/quiz-generation/{artifactId}/stream` (SSE passthrough) |
| `POST` | `/api/quiz-generation/match-curriculum` | `POST /api/v1/quiz-generation/match-curriculum` |
| `POST` | `/api/quiz-generation/resolve-codes` | `POST /api/v1/quiz-generation/resolve-codes` |

**Quiz Questions — `app/api/quiz-questions/`:**

| Method | Path | Proxies to |
|---|---|---|
| `GET` | `/api/quiz-questions?ids=&type=&subject_id=&year_level=&subject_component=&curriculum_code=` | `GET /api/v1/quiz-questions/` |
| `POST` | `/api/quiz-questions` | `POST /api/v1/quiz-questions/` |
| `GET` | `/api/quiz-questions/[id]` | `GET /api/v1/quiz-questions/{id}` |
| `PATCH` | `/api/quiz-questions/[id]` | `PATCH /api/v1/quiz-questions/{id}` |
| `DELETE` | `/api/quiz-questions/[id]` | `DELETE /api/v1/quiz-questions/{id}` |

**Worksheet Generation — `app/api/worksheet-generation/`:**

| Method | Path | Proxies to |
|---|---|---|
| `POST` | `/api/worksheet-generation/start` | `POST /api/v1/worksheet-generation/start` |
| `GET` | `/api/worksheet-generation/templates` | `GET /api/v1/worksheet-generation/templates` |
| `GET` | `/api/worksheet-generation/[artifactId]/blueprint` | `GET /api/v1/worksheet-generation/{artifactId}/blueprint` |
| `PATCH` | `/api/worksheet-generation/[artifactId]/blueprint` | `PATCH /api/v1/worksheet-generation/{artifactId}/blueprint` |
| `GET` | `/api/worksheet-generation/[artifactId]/blueprint/stream` | `GET /api/v1/worksheet-generation/{artifactId}/blueprint/stream` (SSE) |
| `POST` | `/api/worksheet-generation/[artifactId]/blueprint/chat` | `POST /api/v1/worksheet-generation/{artifactId}/blueprint/chat` (SSE) |
| `GET` | `/api/worksheet-generation/[artifactId]/resolve/stream` | `GET /api/v1/worksheet-generation/{artifactId}/resolve/stream` (SSE) |

### 3.10 Backend Router — `routers/artifacts.py`

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| `GET` | `/` | `get_current_user` | `list_artifacts()` — filtered by org_id + user_id |
| `POST` | `/` | `require_teacher` | `create_artifact()` |
| `GET` | `/{artifact_id}` | `get_current_user` | `get_artifact()` |
| `PATCH` | `/{artifact_id}` | `require_teacher` | `update_artifact()` — owner only |
| `DELETE` | `/{artifact_id}` | `require_teacher` | `delete_artifact()` — owner only |
| `GET` | `/{artifact_id}/file` | `get_current_user` | Signs URL from `teacher-documents` bucket (1hr expiry) |
| `POST` | `/{artifact_id}/images/upload` | `require_teacher` | `upload_artifact_image()` — to `document-images` bucket |
| `GET` | `/{artifact_id}/images/{path}` | `get_current_user` | Signs URL from `document-images` bucket, returns redirect |

### 3.11 Backend Router — `routers/document_upload.py`

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| `POST` | `/upload` | `require_teacher` | Upload file -> create artifact -> create job -> enqueue pipeline |
| `GET` | `/jobs/{job_id}` | `require_teacher` | `get_job_status()` |
| `GET` | `/processing` | `require_teacher` | `list_processing_artifacts()` |
| `POST` | `/{artifact_id}/retry` | `require_teacher` | `retry_failed_artifact()` -> re-enqueue pipeline |
| `GET` | `/status/stream` | `require_teacher` | SSE endpoint for processing status (subscribe -> hydrate -> stream) |

### 3.12 Backend Router — `routers/quiz_generation.py`

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| `POST` | `/start` | `require_teacher` | `create_quiz_artifact()` |
| `GET` | `/{artifact_id}/stream` | `require_teacher` | `generate_questions_stream()` (SSE) |
| `POST` | `/match-curriculum` | `require_teacher` | `match_curriculum()` — LLM semantic matching |
| `POST` | `/resolve-codes` | `require_teacher` | `resolve_curriculum_codes()` |

### 3.13 Backend Router — `routers/quiz_questions.py`

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| `GET` | `/` | `require_teacher` | List questions with filters (ids, type, subject_id, year_level, subject_component, curriculum_code) |
| `POST` | `/` | `require_teacher` | Create question |
| `GET` | `/{question_id}` | `require_teacher` | Get single question |
| `PATCH` | `/{question_id}` | `require_teacher` | Update question |
| `DELETE` | `/{question_id}` | `require_teacher` | Delete question |
| `POST` | `/{question_id}/images/upload` | `require_teacher` | Upload question image |

### 3.14 Backend Router — `routers/worksheet_generation.py`

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| `GET` | `/templates` | (none) | List available worksheet templates |
| `POST` | `/start` | `require_teacher` | `create_worksheet_artifact()` |
| `GET` | `/{artifact_id}/blueprint` | `require_teacher` | `get_worksheet_artifact()` — returns blueprint, conversation, context |
| `GET` | `/{artifact_id}/blueprint/stream` | `require_teacher` | `stream_initial_blueprint()` (SSE) |
| `POST` | `/{artifact_id}/blueprint/chat` | `require_teacher` | `stream_blueprint_chat_turn()` (SSE) — persists after stream |
| `PATCH` | `/{artifact_id}/blueprint` | `require_teacher` | Direct UI blueprint update (debounced) |
| `GET` | `/{artifact_id}/resolve/stream` | `require_teacher` | `resolve_worksheet_stream()` (SSE) — parallel resolution |

## 4. Cache Contract

| Attribute | Value |
|---|---|
| **Query namespace** | `docs:artifacts` (list), `docs:artifact:` (detail), `docs:subject-catalog` (catalog) |
| **List staleTime** | 60,000ms (1 minute) |
| **Detail staleTime** | 60,000ms (1 minute) |
| **Catalog staleTime** | 300,000ms (5 minutes) |

**List query keys:**

Pattern: `buildArtifactsQueryKey(artifactType?)`

Shape: `docs:artifacts` (all) or `docs:artifacts?type={artifactType}` (filtered)

**Detail query keys:**

Pattern: `buildArtifactDetailKey(artifactId)`

Shape: `docs:artifact:{artifactId}`

**Catalog query key:** `docs:subject-catalog`

**Cache mutation helpers:**

| Function | Behavior |
|---|---|
| `syncArtifactToCaches(updated)` | Sets detail cache; updates or inserts into all list queries (sorted by `created_at` desc) |
| `removeArtifactFromCaches(artifactId)` | Sets detail to `undefined`; filters out of all list queries |
| `insertArtifactIntoCaches(artifact)` | Alias for `syncArtifactToCaches` |
| `patchArtifactCaches(artifactId, patch)` | Merges patch into detail + all list entries (preserves `subjects` field) |
| `patchDocsSubjectCatalog(updater)` | Applies updater function to the catalog cache |

**Invalidation rules:**

| Trigger | What is invalidated |
|---|---|
| `deleteDocArtifact` failure | Restores removed artifact via `syncArtifactToCaches(existing)` + `invalidateQueries(DOC_ARTIFACTS_QUERY_KEY)` |
| `invalidateDocsQueries()` | All queries starting with `docs:artifacts` or `docs:artifact:` |
| `updateDocsSubjectPreferences()` | `docs:subject-catalog` |

**Snapshot/restore:**

`snapshotDocsQueries()` captures all list queries matching `docs:artifacts`. `restoreDocsQueries(snapshots)` writes each snapshot's data back via `setQueryData()`.

**Prefetch behavior:**

| What | When | Mechanism |
|---|---|---|
| Subject catalog | After first paint (deferred) | `useDeferredQueryEnabled()` gates the catalog query |
| Artifact detail | On row click in data table | `prefetchArtifactDetailQuery(artifactId)` |

## 5. Optimistic Update Strategy

### Create Artifact (native)

1. `createDocArtifact(payload)` calls API
2. **Success:** `insertArtifactIntoCaches(created)` — inserts into all list queries sorted by `created_at`
3. **Failure:** error thrown (no optimistic pre-insertion for creates)

### Update Artifact

1. `updateDocArtifact(artifactId, payload)` calls API
2. **Success:** `syncArtifactToCaches(updated)` — replaces in detail + list caches
3. **Failure:** error thrown

### Delete Artifact

1. Capture existing artifact from detail cache or list cache (fallback)
2. `removeArtifactFromCaches(artifactId)` — optimistic removal from all caches
3. `deleteArtifact(artifactId)` API call
4. **Success:** (nothing extra — cache already reflects deletion)
5. **Failure:** `syncArtifactToCaches(existingArtifact)` — restore + `invalidateQueries(DOC_ARTIFACTS_QUERY_KEY)`

### Inline Field Edits (name, subject, year level, curriculum)

Handled via `patchArtifactCaches(artifactId, patch)` for instant UI feedback, followed by `updateDocArtifact()` for persistence. On failure, the list query is invalidated to resync.

### Upload Processing Status

Not optimistic — real-time SSE stream drives UI updates. `ProcessingStatusBar` shows live step progression. On completion, `insertArtifactIntoCaches()` adds the processed artifact to the list.

## 6. Payload Shapes

### Artifact Summary (list endpoint)

Used by `GET /api/v1/artifacts/` with `ArtifactSummaryOut`.

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Artifact ID |
| `organization_id` | `string` | Org scope |
| `user_id` | `string` | Creator |
| `artifact_type` | `string` | `quiz \| note \| exercise_sheet \| uploaded_file` |
| `artifact_name` | `string` | Display name |
| `icon` | `string \| null` | Emoji icon |
| `subject_ids` | `string[] \| null` | Linked subjects |
| `source_type` | `string` | `native \| pdf \| docx \| md \| txt` |
| `conversion_requested` | `boolean` | Whether TipTap conversion was requested |
| `storage_path` | `string \| null` | Supabase storage path (uploaded files only) |
| `is_processed` | `boolean` | Pipeline completed |
| `processing_failed` | `boolean` | Pipeline failed |
| `processing_error` | `string \| null` | Error message |
| `subject_id` | `string \| null` | Primary curriculum subject |
| `year_level` | `string \| null` | Target year level |
| `year_levels` | `string[] \| null` | Multiple year levels (exercises) |
| `subject_component` | `string \| null` | Curriculum sub-component |
| `curriculum_codes` | `string[] \| null` | Matched curriculum codes |
| `is_public` | `boolean` | Visible to org members |
| `created_at` | `string \| null` | Creation timestamp |
| `updated_at` | `string \| null` | Last update timestamp |
| **Hydrated:** | | |
| `subjects` | `list[dict] \| null` | `id, name, color, icon` |

### Artifact Detail (single endpoint)

Used by `GET /api/v1/artifacts/{id}` with `ArtifactOut` (extends `ArtifactSummaryOut`).

| Field | Type | Differs from summary |
|---|---|---|
| `content` | `dict` | Full content JSONB (question_ids for quizzes, generation params for worksheets) |
| `tiptap_json` | `dict \| null` | TipTap editor JSON (notes, converted DOCX) |
| `markdown_content` | `string \| null` | Markdown source content |

### Document Upload Response

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Artifact ID |
| `artifact_name` | `string` | Name (from metadata or filename) |
| `artifact_type` | `string` | Always `uploaded_file` |
| `source_type` | `string` | `pdf \| docx \| md \| txt` |
| `storage_path` | `string \| null` | Bucket path |
| `is_processed` | `boolean` | Always `false` at upload time |
| `processing_failed` | `boolean \| null` | Always `null` |
| `created_at` | `string \| null` | |
| `job_id` | `string \| null` | Processing job ID |
| `job_status` | `string \| null` | Initial job status |
| `error_message` | `string \| null` | |

### Question

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Question ID |
| `organization_id` | `string` | Org scope |
| `created_by` | `string \| null` | Creator |
| `source_type` | `string` | `teacher_uploaded \| ai_created \| ai_created_teacher_edited \| national_exam` |
| `artifact_id` | `string \| null` | Parent artifact |
| `type` | `string` | One of 9 types (see below) |
| `parent_id` | `string \| null` | Parent question (for context_group children) |
| `order_in_parent` | `int \| null` | Position within parent |
| `label` | `string \| null` | Display label (e.g. "1.", "a)") |
| `content` | `dict` | Full question content (stem, options, solution, images, etc.) |
| `subject_id` | `string \| null` | Curriculum subject |
| `year_level` | `string \| null` | Target year level |
| `subject_component` | `string \| null` | Curriculum sub-component |
| `curriculum_codes` | `string[] \| null` | Matched curriculum codes |
| `is_public` | `boolean` | |
| `created_at` | `string` | |
| `updated_at` | `string` | |

**Question types:** `multiple_choice`, `true_false`, `fill_blank`, `matching`, `short_answer`, `multiple_response`, `ordering`, `open_extended`, `context_group`

## 7. Database

### Tables Involved

| Table | Description |
|---|---|
| `artifacts` | All document/artifact types — quiz, note, exercise_sheet, uploaded_file. Stores editor content (tiptap_json, markdown_content), pipeline state, curriculum metadata |
| `questions` | Unified question bank — supports hierarchy via `parent_id` for context_group children. Linked to artifacts via `artifact_id` |
| `document_jobs` | Tracks processing pipeline jobs — status, current step, error, retry count |
| `subjects` | Subject catalog — queried for subject names/colors during hydration |
| `profiles` | User profiles — queried for creator info |

Cross-reference: See `data/documents.md` for full entity schemas.

### Indexes

**artifacts:**

| Index | Columns | Serves |
|---|---|---|
| `idx_artifacts_org` | `(organization_id)` | Fetching all artifacts for an org |
| `idx_artifacts_user` | `(user_id)` | Fetching artifacts by creator |
| `idx_artifacts_type` | `(organization_id, artifact_type)` | Filtering by type within org |
| `idx_artifacts_public` | `(organization_id, is_public)` | Visibility filtering |
| `idx_artifacts_content` | GIN on `content` | Content JSONB queries |
| `idx_artifacts_curriculum` | GIN on `curriculum_codes` | Curriculum code lookups |
| `idx_artifacts_subject` | `(subject_id, year_level)` | Subject + year filtering |
| `idx_artifacts_processing` | `(is_processed, processing_failed)` WHERE `source_type != 'native'` | Pipeline status filtering |
| `idx_artifacts_org_user_processed` | `(organization_id, user_id, is_processed)` | User's processing status (added in migration 010) |

**questions:**

| Index | Columns | Serves |
|---|---|---|
| `idx_questions_artifact` | `(artifact_id)` | Fetching questions for an artifact |
| `idx_questions_parent` | `(parent_id)` | Child question lookups |
| `idx_questions_curriculum` | GIN on `curriculum_codes` | Curriculum code queries |
| `idx_questions_subject` | `(subject_id, year_level)` | Subject + year filtering |
| `idx_questions_exam` | `(exam_year, exam_phase, exam_group)` | National exam lookups |
| `idx_questions_source` | `(source_type)` | Filtering by origin |
| `idx_questions_org` | `(organization_id)` | Org-scoped queries |
| `idx_questions_creator` | `(created_by)` | Creator queries |

**document_jobs:**

| Index | Columns | Serves |
|---|---|---|
| `idx_document_jobs_artifact` | `(artifact_id)` | Polling by artifact (added in migration 010) |
| `idx_document_jobs_artifact_status` | `(artifact_id, status)` | Composite for artifact + status queries (added in migration 010) |
| `idx_document_jobs_status` | `(status)` WHERE `status NOT IN ('completed', 'failed')` | Active job monitoring |

### Storage Buckets

| Bucket | Access | Size Limit | MIME Types | Purpose |
|---|---|---|---|---|
| `teacher-documents` | Private (org-scoped RLS) | 50MB | PDF, DOCX, MD, TXT | Original uploaded files |
| `document-images` | Public (read), authenticated (write) | 8MB | JPEG, PNG, WebP, GIF | Extracted and uploaded images |

### Read Patterns

| Pattern | Table | Index Used |
|---|---|---|
| List user's artifacts by org | `artifacts` | `idx_artifacts_org` + `idx_artifacts_user` |
| Filter by type | `artifacts` | `idx_artifacts_type` |
| Get single artifact | `artifacts` | Primary key |
| List questions for artifact | `questions` | `idx_questions_artifact` |
| Get child questions | `questions` | `idx_questions_parent` |
| Filter questions by curriculum | `questions` | `idx_questions_curriculum` (GIN) |
| Active pipeline jobs | `document_jobs` | `idx_document_jobs_status` |
| Job status for artifact | `document_jobs` | `idx_document_jobs_artifact_status` |

### RLS Policies

**artifacts:** Owner has full access (`user_id = auth.uid()`). Org members can read public artifacts (`is_public = true AND organization_id matches`).

**questions:** Creator has full access (`created_by = auth.uid()`). Org members can read public questions.

**document_jobs:** Owner access only (`user_id = auth.uid()`).

### Realtime Subscriptions

Both `artifacts` and `document_jobs` tables are added to the `supabase_realtime` publication. The frontend uses Supabase Realtime subscriptions in `ProcessingStatusBar` as a fallback alongside the SSE stream for detecting processing completions and artifact updates.

## 8. Edge Cases and Notes

### DOCX Promotion

When a DOCX file completes processing, it is "promoted" to a native note: `artifact_type` is changed from `uploaded_file` to `note`, `source_type` is set to `native`, and `storage_path` is cleared. The original DOCX file is deleted from storage. This promotion happens **before** `_finalize_artifact` sets `is_processed=True`, avoiding a race condition where Realtime would push the artifact to the frontend before the type change is visible.

### Image URL Resolution

Extracted images use `artifact-image://{org_id}/{artifact_id}/images/{filename}` URIs in markdown. These are rewritten to `/api/artifacts/{artifactId}/images/{filename}` for browser rendering via `resolveArtifactImageUrls()`. The backend image endpoint validates the storage path belongs to the requesting user's org, signs the URL (1hr expiry), and returns a redirect.

### File Validation

The upload service validates files using magic bytes (not just MIME type/extension):
- PDF: checks for `%PDF` header
- DOCX: checks for PK zip header
- PDF page limit: 25 pages maximum
- File size limit: 50MB

### Question Hierarchy

Questions support parent-child relationships via `parent_id` + `order_in_parent`. The `context_group` question type acts as a container — its children are the actual sub-questions. During extraction, the LLM produces a flat array with `parent_label` references which are rebuilt into a tree before DB insertion.

### Pipeline Error Handling

- **Categorization failure:** Non-fatal. The pipeline continues without curriculum tags. A warning is logged.
- **Question extraction failure:** Fatal. The job is marked as failed, the artifact gets `processing_failed=true` with the error message.
- **Image extraction failure:** Non-fatal per image. Failed downloads keep the URL as plain text.
- **TipTap conversion:** Only runs for DOCX. Handles math notation ($/$$ delimiters), tables, images, ordered lists with custom start numbers.

### Pipeline Concurrency

`PipelineTaskManager` uses a semaphore to limit concurrent pipeline executions. Jobs are tracked in-memory with per-user SSE subscriber queues. The SSE stream sends a `hydrate` event on connection with all active jobs, then streams individual `status`/`completed`/`failed` events.

### Retry Logic

Failed documents can be retried via `POST /documents/{artifact_id}/retry`. This creates a new `document_jobs` row (incrementing `retry_count`), resets `processing_failed`/`processing_error` on the artifact, and re-enqueues the pipeline. The original `document_category` and `year_levels` are recovered from job metadata.

### OpenRouter LLM Client

The pipeline uses OpenRouter API for all LLM calls (categorization, question extraction, structuring). The client has:
- Retry logic: 3 attempts with exponential backoff
- JSON parsing with fallback sanitization for LaTeX escaping issues
- Self-correction retry: if JSON parse fails, asks the model to fix its own output
- `instructor` integration for structured streaming output

### Blueprint Persistence

The worksheet blueprint, conversation history, generation params, and assembled context summary are all stored in the artifact's `content` JSONB field. The `phase` field tracks progress: `generating_blueprint` -> `blueprint_review` -> `resolving`. Direct UI edits (drag-reorder) are persisted on debounce without AI involvement.

### Worksheet Resolution Parallelism

During resolution, bank blocks are fetched immediately from the database (no LLM call needed). AI blocks are grouped by their L1 curriculum ancestor and generated in parallel — multiple LLM calls run concurrently with results interleaved as SSE events. This reduces total resolution time for worksheets spanning multiple curriculum areas.

### Multi-File Upload

`uploadDocuments()` uploads files sequentially (not in parallel) to avoid overwhelming the backend. Each file gets its own artifact name derived from the filename (extension stripped). Errors per file are collected and returned alongside successful results.

### Subject Catalog Deferred Loading

The subject catalog (`useDocsSubjectCatalogQuery`) uses `useDeferredQueryEnabled()` to gate its query — if the catalog was server-provided via `initialCatalog`, it's used immediately; otherwise, the query fires only after first paint to avoid blocking the initial render.

## 9. Reference Status

This feature is **not** the reference implementation — see `calendar.md` for the reference. However, the docs feature demonstrates patterns beyond the calendar scope:

| Pattern | Docs Implementation |
|---|---|
| **SSE streaming** | Three SSE channels: document processing status, quiz generation, worksheet resolution + blueprint chat |
| **Background pipeline** | `PipelineTaskManager` with async task orchestration, per-user event broadcasting |
| **LLM integration** | OpenRouter client with retry, structured streaming via `instructor`, tool-calling agent |
| **Custom TipTap nodes** | `QuestionBlock` atom node with `ReactNodeViewRenderer`, math extensions with KaTeX |
| **Two-phase generation** | Blueprint planning (structured output) -> resolution (parallel execution) |
| **Content format duality** | Artifacts store both `tiptap_json` and `markdown_content`, with bidirectional conversion |
| **File upload proxy** | Raw byte proxying with metadata in headers (`x-upload-metadata`, `x-file-name`) |
| **Realtime + SSE fallback** | Supabase Realtime for DB change detection + custom SSE for pipeline progress |
