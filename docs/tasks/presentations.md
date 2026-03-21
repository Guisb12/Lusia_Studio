---
status: planned
created: 2026-03-21
updated: 2026-03-21
priority: p0
planned-by: planner-agent
---

## Goal

Build an AI-powered interactive educational presentation generator for LUSIA Studio. This task file covers the **full feature** but is divided into steps. **Step 1 (Foundation & Pipeline)** is what the first executor agent builds — everything from creation wizard to async generation pipeline to processing UI. The slide viewer itself is Step 2.

## User Intent

The teacher clicks "Criar com LUSIA" in docs, selects "Apresentação", goes through the same wizard steps as worksheets (with/without document, subject, year, curriculum, prompt, size), and kicks off generation. While generating, they see a full-page view with the glow effect (like quiz generation). If they navigate away, the generation continues in the backend and shows a ProcessingStepPill in the docs list (like document upload processing). When done, the artifact is ready.

---

# STEP 1: Foundation & Pipeline

**This is what the first executor agent builds.** Everything needed to go from "Criar com LUSIA" → "Apresentação" → wizard → async generation → completion, with proper processing UI on both the generation page and the docs list.

**NOT in Step 1:** Slide viewer, fragment system, quiz interaction, conditional navigation, slide CSS. The generated slides are stored in the artifact but not yet viewable — clicking a completed presentation in the docs list will navigate to the presentation route page showing a placeholder "viewer coming soon" state.

## Patterns to Follow (Read These First)

The first agent MUST read these files to understand the exact patterns to replicate:

### Creation Wizard Pattern (Worksheets)

| File | What to learn |
|------|---------------|
| `LUSIA Studio - Frontend/components/docs/CreateQuizWizard.tsx` | The wizard step machine. Lines 72-95 for step definitions. Lines 677-850 for worksheet-specific steps (`ws_prompt`, `ws_template`, `ws_difficulty`, `ws_summary`). Lines 811-828 for `startWorksheetGeneration()` call and `onWorksheetStart` callback. The with-document vs without-document paths are controlled by `preselectedArtifactId` and `source_selection` step. |
| `LUSIA Studio - Frontend/lib/worksheet-generation.ts` | `startWorksheetGeneration()` API client function and `WorksheetStartInput` type definition. |
| `LUSIA Studio - Frontend/app/api/worksheet-generation/start/route.ts` | Thin proxy for POST /start. |
| `LUSIA Studio - Backend/app/api/http/routers/worksheet_generation.py` | POST /start endpoint — validates, creates artifact, returns response. |
| `LUSIA Studio - Backend/app/api/http/services/worksheet_generation_service.py` | `create_worksheet_artifact()` — how the artifact is created with generation_params in content JSONB. |
| `LUSIA Studio - Backend/app/api/http/services/generation_context.py` | `assemble_generation_context()` — context assembly for with/without document. Reuse directly. |

**Worksheet wizard steps (what presentations should mirror):**

WITHOUT document:
1. `type_selection` → "Apresentação"
2. `source_selection` → Currículo DGE / Documento existente / Carregar ficheiro
3. `subject_year` → Subject picker + year level
4. `theme` → Teacher describes topic (curriculum matching runs in background)
5. `pres_prompt` → Teacher describes presentation content (like `ws_prompt`)
6. `pres_size` → Short (5-10 slides) / Long (15-25 slides) (replaces `ws_template` + `ws_difficulty`)
7. `pres_summary` → Confirmation card (like `ws_summary`)

WITH document (preselectedArtifactId):
1. `type_selection` → "Apresentação"
2. `pres_prompt` → Teacher describes presentation (subject/year inherited from doc)
3. `pres_size` → Short / Long
4. `pres_summary` → Confirmation card

### Quiz Generation View Pattern (Glow + SSE)

| File | What to learn |
|------|---------------|
| `LUSIA Studio - Frontend/components/docs/quiz/QuizGenerationFullPage.tsx` | Full-page generation view with SSE streaming, glow effect integration, and progress display. Status states: `streaming` → `done` / `error`. Uses `useGlowEffect()` to trigger/clear glow. |
| `LUSIA Studio - Frontend/components/providers/GlowEffectProvider.tsx` | `triggerGlow("streaming")` / `triggerGlow("error")` / `clearGlow()`. Context provider. |
| `LUSIA Studio - Frontend/components/dashboard/DashboardShell.tsx` | Lines 94-119 — renders the animated glow frame. Blue pulsing for streaming, red for error. Framer Motion `opacity: [0.6, 1, 0.6]` at 1.2s. |
| `LUSIA Studio - Frontend/lib/quiz-generation.ts` | `streamQuizGeneration()` — SSE stream handler using `fetch()` + `ReadableStream` (not EventSource). Returns `AbortController` for cleanup. Parses `data: {JSON}` lines. |
| `LUSIA Studio - Frontend/components/docs/DocsPage.tsx` | View state machine: `{ view: "quiz_generation", artifactId, numQuestions }`. `onGenerationStart` callback transitions from wizard to full-page view. `onDone` transitions to editor. |

### Document Background Processing Pattern (ProcessingStepPill)

| File | What to learn |
|------|---------------|
| `LUSIA Studio - Backend/app/pipeline/task_manager.py` | `PipelineTaskManager` — singleton with asyncio semaphore, subscriber queues per user, SSE broadcasting. `enqueue()` creates background task. `subscribe(user_id)` returns asyncio.Queue for SSE. `_broadcast()` sends events to all user subscribers. |
| `LUSIA Studio - Backend/app/api/http/routers/document_upload.py` | Lines 125-160 — `GET /status/stream` SSE endpoint. `subscribe()` → hydrate with active jobs → stream events as they arrive. 30s timeout with keepalive. |
| `LUSIA Studio - Frontend/lib/hooks/use-processing-documents.ts` | `useProcessingDocuments()` — SSE connection to `/api/documents/status/stream`, 10s polling fallback via `getProcessingDocuments()`, optimistic item tracking. Events: `hydrate`, `status`, `completed`, `failed`. |
| `LUSIA Studio - Frontend/components/docs/ProcessingStepPill.tsx` | Animated status pill with Framer Motion. Maps status strings to Portuguese labels with gradient backgrounds. |
| `LUSIA Studio - Frontend/components/docs/DocsDataTable.tsx` | Lines 1334-1416 — renders `processingItems` as a separate `<tbody>` at top of table with animated entry/exit. |
| `LUSIA Studio - Backend/app/api/http/services/document_upload_service.py` | How jobs are created and status is updated in `document_jobs` table. |

## Step 1 Architecture

### The Dual-Channel Processing Model

Presentation generation must work through TWO simultaneous channels:

**Channel A — Generation Page (like quiz generation):**
- Teacher stays on the generation page after clicking "Criar"
- Full-page view with glow effect (reuse `GlowEffectProvider`)
- Dedicated SSE connection to `GET /api/presentations/{artifactId}/stream`
- Shows detailed progress: "A planear estrutura pedagógica..." → "A gerar slides... (3/8)" → Done
- When done: transition to presentation view (Step 2 — for now, show placeholder)

**Channel B — Background Processing (like document upload):**
- If teacher navigates away from generation page, processing continues in backend
- `document_jobs` row tracks progress with step labels
- `PipelineTaskManager` broadcasts status changes via existing `/api/documents/status/stream` SSE
- `useProcessingDocuments` hook picks up presentation generation events
- `ProcessingStepPill` shows in docs list: "A gerar apresentação..." with animated pill
- On completion: artifact marked `is_processed=true`, pill shows green checkmark, row merges into normal docs list

**Both channels share the same backend async task.** The generation runs as a background asyncio task (via PipelineTaskManager or a similar manager). The dedicated SSE endpoint (Channel A) taps into the same task's progress. The document status SSE (Channel B) also broadcasts the same progress. If the teacher disconnects from Channel A, Channel B still works because the task runs independently.

### Backend Architecture

```
POST /api/v1/presentations/start
  → create artifact (artifact_type='presentation', is_processed=false)
  → create document_job (status='pending')
  → enqueue async task in PipelineTaskManager
  → return { artifact_id, artifact_name }

ASYNC TASK (runs in background):
  1. Load prompt files
  2. Assemble generation context (curriculum + optional document)
  3. Update job: status='planning', broadcast SSE
  4. Call chat_completion() → planner JSON
  5. Validate + store plan in artifact content
  6. Update job: status='generating_slides', broadcast SSE
  7. Call chat_completion_text() → executor HTML
  8. Parse HTML into slide blocks
  9. Store slides in artifact content
  10. Update artifact: is_processed=true
  11. Update job: status='completed', broadcast SSE

GET /api/v1/presentations/{id}/stream
  → SSE endpoint that subscribes to the task's progress
  → Returns detailed events (plan JSON, slide count, progress)
  → Falls back to polling artifact status if task already completed

GET /api/v1/presentations/{id}
  → Returns artifact with full content (plan + slides)
```

### Frontend Architecture

```
DocsPage view state machine (add new states):
  { view: "presentation_generation", artifactId }

CreateQuizWizard (extended):
  → Add "Apresentação" to type_selection
  → Add pres_prompt, pres_size, pres_summary steps
  → onPresentationStart(result) callback → transitions to generation view

PresentationGenerationFullPage (new, follows QuizGenerationFullPage):
  → SSE connection to /api/presentations/{id}/stream
  → Glow effect during streaming
  → Progress display: planning → generating slides → done
  → On done: navigate to /dashboard/docs/presentation/{id}

useProcessingDocuments (extended):
  → Already handles document_jobs SSE
  → ProcessingStepPill needs new step labels for presentation generation

DocsDataTable (extended):
  → Presentation processing items show in the processing rows
  → Click on completed presentation → navigate to presentation route
```

### Content JSONB Structure

```json
{
  "generation_params": {
    "prompt": "Teorema de Pitágoras para o 8.º ano",
    "size": "short",
    "upload_artifact_id": null,
    "curriculum_codes": ["MA8_1_2"]
  },
  "plan": null,
  "slides": null,
  "phase": "pending | planning | generating_slides | completed | failed"
}
```

After generation completes:
```json
{
  "generation_params": { ... },
  "plan": {
    "title": "Teorema de Pitágoras",
    "description": "...",
    "target_audience": "8.º ano — Matemática",
    "total_slides": 8,
    "size": "short",
    "slides": [
      { "id": "s1", "phase": "activate", "type": "static", "subtype": null, "title": "...", "intent": "...", "description": "...", "reinforcement_slide": null }
    ]
  },
  "slides": [
    { "id": "s1", "html": "<div data-slide-type='static' data-slide-id='s1'>...</div>" }
  ],
  "phase": "completed"
}
```

### SSE Events (Dedicated Stream — Channel A)

```
data: {"type": "planning", "message": "A planear estrutura pedagógica..."}

data: {"type": "plan_complete", "plan": {"title": "...", "total_slides": 8, ...}}

data: {"type": "generating_slides", "message": "A gerar slides...", "total": 8}

data: {"type": "slide_progress", "current": 3, "total": 8, "message": "A gerar slides... (3/8)"}

data: {"type": "done", "artifact_id": "..."}

data: {"type": "error", "message": "Erro na geração..."}
```

### SSE Events (Document Status Stream — Channel B)

Same format as document upload events, broadcast by PipelineTaskManager:
```json
{"type": "status", "artifact_id": "...", "status": "planning", "step_label": "A planear..."}
{"type": "status", "artifact_id": "...", "status": "generating_slides", "step_label": "A gerar slides..."}
{"type": "completed", "artifact_id": "..."}
{"type": "failed", "artifact_id": "...", "error": "..."}
```

---

## Step 1 Subtasks

### 1.1: Add 'presentation' to artifact_type CHECK constraint

- **What:** Migration adding `'presentation'` to the artifacts table CHECK constraint.
- **Files:** `LUSIA Studio - Backend/migrations/023_presentation_artifact_type.sql`
- **SQL:**
  ```sql
  ALTER TABLE artifacts DROP CONSTRAINT IF EXISTS artifacts_artifact_type_check;
  ALTER TABLE artifacts ADD CONSTRAINT artifacts_artifact_type_check
    CHECK (artifact_type IN ('quiz', 'note', 'exercise_sheet', 'uploaded_file', 'presentation'));
  ```
- **Acceptance:** Migration exists. `'presentation'` is a valid artifact_type.

### 1.2: Copy prompt files to backend

- **What:** Copy the 4 prompt files to a backend-accessible directory.
- **Files:** Create `LUSIA Studio - Backend/app/prompts/presentations/` with:
  - `planner_framework.md` ← `Slides Prompts/Planner_Framework.md`
  - `planner_slides.md` ← `Slides Prompts/Planner_Slides.md`
  - `executor_part1.md` ← `Slides Prompts/Executer_part1.md`
  - `executor_part2.md` ← `Slides Prompts/Executer_part2.md`
- **Acceptance:** Files exist and are readable by the service.

### 1.3: Create backend schemas

- **What:** Pydantic models for presentation generation.
- **Files:** `LUSIA Studio - Backend/app/api/http/schemas/presentation_generation.py`
- **Pattern:** Follow `schemas/worksheet_generation.py` — `WorksheetStartInput` → `PresentationStartInput`.
- **Models:**
  - `PresentationStartInput` — `prompt: str`, `size: Literal["short", "long"]`, `subject_id: Optional[str]`, `year_level: Optional[str]`, `subject_component: Optional[str]`, `curriculum_codes: list[str] = []`, `upload_artifact_id: Optional[str]`
  - `PresentationStartResponse` — `artifact_id: str`, `artifact_name: str`, `artifact_type: str`, `subject_id: Optional[str]`, `year_level: Optional[str]`, `curriculum_codes: list[str]`, `is_processed: bool`
- **Acceptance:** Schemas validate input/output shapes. Follow the exact same field pattern as `WorksheetStartInput`.

### 1.4: Create presentation generation service

- **What:** Core service with artifact creation + async generation pipeline.
- **Files:** `LUSIA Studio - Backend/app/api/http/services/presentation_generation_service.py`
- **Pattern:** Combine `worksheet_generation_service.py` (artifact creation) + `worksheet_planner.py` (LLM calls with context assembly) + `pipeline/tasks.py` (async step execution with status broadcasting).
- **Functions:**

  **`create_presentation_artifact(db, org_id, user_id, params: PresentationStartInput) → dict`**
  - Creates artifact: `artifact_type='presentation'`, `source_type='native'`, `is_processed=False`
  - Generates name: "Apresentação · {subject_name} · {year_level}" (like worksheet: "Ficha · {subject} · {year}")
  - Stores `generation_params` in content JSONB with `phase='pending'`
  - Inherits `subject_id`, `year_level`, `subject_component`, `curriculum_codes` from params (or from upload artifact if `upload_artifact_id` provided)
  - Creates `document_jobs` row with `status='pending'` (for background processing tracking)
  - Returns artifact data + job_id
  - **Pattern:** Follow `create_worksheet_artifact()` exactly for artifact creation. Follow `document_upload_service.py` for document_jobs creation.

  **`generate_presentation_task(artifact_id, org_id, user_id, job_id, on_step_change) → None`**
  - This is the async function that PipelineTaskManager runs in the background.
  - Steps:
    1. Load prompt files via `_load_prompt_file()`
    2. Fetch artifact to get generation_params
    3. Call `assemble_generation_context()` with subject/year/curriculum/upload_artifact_id (reuse the same function worksheets use)
    4. Build planner system prompt (concatenate framework + slides prompts)
    5. Build planner user prompt (teacher prompt + assembled context)
    6. `on_step_change('planning', 'A planear estrutura pedagógica...')`
    7. Update artifact content: `phase='planning'`
    8. Call `chat_completion(system_prompt=planner_system, user_prompt=planner_user, response_format={"type": "json_object"}, temperature=0.3, max_tokens=8192)`
    9. Parse and validate plan JSON
    10. Store plan in artifact content JSONB
    11. `on_step_change('generating_slides', 'A gerar slides...')`
    12. Update artifact content: `phase='generating_slides'`
    13. Build executor system prompt (concatenate part1 + part2 prompts)
    14. Build executor user prompt (full plan JSON as context)
    15. Call `chat_completion_text(system_prompt=executor_system, user_prompt=executor_user, temperature=0.2, max_tokens=32768)`
    16. Parse executor output into individual slide blocks (split by `<!-- SLIDE:sN -->` delimiters)
    17. Store slides array in artifact content JSONB
    18. Update artifact: `is_processed=True`, content `phase='completed'`
    19. Update document_job: `status='completed'`
  - Error handling: on any failure, update artifact `phase='failed'` + `processing_failed=True` + `processing_error=message`. Update document_job `status='failed'`.
  - **Pattern:** Follow `process_document_pipeline()` in `pipeline/tasks.py` for the step execution pattern with `on_step_change` callback.

  **`get_presentation(db, artifact_id, org_id) → dict`**
  - Fetch artifact by id + org_id, return full content (plan + slides).

  **`_load_prompt_file(filename) → str`**
  - Read from `app/prompts/presentations/{filename}`.

  **`_parse_executor_output(raw_html, plan_slides) → list[dict]`**
  - Split HTML by `<!-- SLIDE:sN -->` markers.
  - Return list of `{ "id": "s1", "html": "..." }` dicts.
  - Validate: number of parsed slides should match plan.

- **Acceptance:** Service creates artifact + document_job, runs planner + executor pipeline asynchronously, stores results, broadcasts step changes. Errors are handled and persisted.

### 1.5: Extend PipelineTaskManager for presentation generation

- **What:** Make PipelineTaskManager capable of running presentation generation tasks (not just document pipeline tasks).
- **Files:** `LUSIA Studio - Backend/app/pipeline/task_manager.py`
- **Changes:**
  - Add an optional `task_fn` parameter to `enqueue()`. If provided, run that function instead of `process_document_pipeline`. If not provided, run document pipeline as before (backwards compatible).
  - The `task_fn` signature: `async def task_fn(artifact_id, org_id, user_id, job_id, on_step_change)`
  - `on_step_change` callback remains the same: `(status: str, step_label: str) → None` — broadcasts to SSE subscribers and updates document_job.
- **Alternative:** If modifying PipelineTaskManager is too invasive, create a separate `PresentationTaskManager` with the same pattern (subscriber queues, broadcast, semaphore). But reuse is preferred.
- **Acceptance:** PipelineTaskManager can enqueue and run presentation generation tasks. SSE broadcasting works for both document and presentation tasks.

### 1.6: Create presentation generation router

- **What:** FastAPI endpoints for presentation generation.
- **Files:** `LUSIA Studio - Backend/app/api/http/routers/presentation_generation.py`
- **Pattern:** Follow `routers/worksheet_generation.py` (POST /start) + `routers/quiz_generation.py` (GET /stream SSE).
- **Endpoints:**

  **`POST /start`** — Auth: `require_teacher`.
  - Validates `PresentationStartInput`
  - Calls `create_presentation_artifact()` → gets artifact + job_id
  - Enqueues `generate_presentation_task` in PipelineTaskManager (background async task)
  - Returns `PresentationStartResponse` immediately (HTTP response returns before generation starts)
  - **This is different from quiz/worksheet** where SSE starts on a separate GET. Here, POST creates + enqueues, then the teacher either stays (Channel A) or leaves (Channel B).

  **`GET /{artifact_id}/stream`** — Auth: `require_teacher`.
  - SSE endpoint for detailed generation progress (Channel A).
  - Subscribes to PipelineTaskManager events for this artifact.
  - On connect: check if generation is already done → if so, send `done` event immediately.
  - On connect: check if generation is in progress → send current status + subscribe for updates.
  - Stream events until `done` or `error`.
  - 30s timeout with keepalive comments.
  - **Pattern:** Follow `document_upload.py` lines 125-160 for SSE endpoint structure.

  **`GET /{artifact_id}`** — Auth: `require_teacher`.
  - Returns full presentation artifact (plan + slides) for the viewer.

- **Registration:** Add to `app/api/http/router.py` with prefix `/api/v1/presentations`, tag `"presentations"`.
- **Acceptance:** Router registered. POST creates artifact + enqueues task. SSE streams progress. GET returns completed presentation.

### 1.7: Create Next.js API routes

- **What:** Thin auth proxy routes.
- **Files:**
  - `LUSIA Studio - Frontend/app/api/presentations/start/route.ts` — POST proxy
  - `LUSIA Studio - Frontend/app/api/presentations/[artifactId]/stream/route.ts` — GET SSE passthrough
  - `LUSIA Studio - Frontend/app/api/presentations/[artifactId]/route.ts` — GET proxy
- **Pattern:** Follow `app/api/worksheet-generation/start/route.ts` and `app/api/quiz-generation/[artifactId]/stream/route.ts`.
- **Acceptance:** Routes proxy transparently. SSE passthrough works.

### 1.8: Create presentation generation client functions

- **What:** Frontend API client and SSE stream handler.
- **Files:** `LUSIA Studio - Frontend/lib/presentation-generation.ts`
- **Pattern:** Follow `lib/worksheet-generation.ts` (for `startPresentationGeneration()`) + `lib/quiz-generation.ts` (for `streamPresentationGeneration()`).
- **Functions:**
  - `startPresentationGeneration(params: PresentationStartInput): Promise<PresentationStartResponse>` — POST to `/api/presentations/start`
  - `streamPresentationGeneration(artifactId: string, onEvent, onError, onComplete): AbortController` — SSE stream to `/api/presentations/{id}/stream` using fetch + ReadableStream (same pattern as `streamQuizGeneration`)
- **Types:**
  ```typescript
  interface PresentationStartInput {
    prompt: string;
    size: "short" | "long";
    subject_id?: string | null;
    year_level?: string | null;
    subject_component?: string | null;
    curriculum_codes: string[];
    upload_artifact_id?: string | null;
  }

  type PresentationStreamEvent =
    | { type: "planning"; message: string }
    | { type: "plan_complete"; plan: PresentationPlan }
    | { type: "generating_slides"; message: string; total: number }
    | { type: "slide_progress"; current: number; total: number; message: string }
    | { type: "done"; artifact_id: string }
    | { type: "error"; message: string };
  ```
- **Acceptance:** Functions exist. `startPresentationGeneration` creates artifact. `streamPresentationGeneration` handles SSE with proper cleanup.

### 1.9: Add "Apresentação" to CreateQuizWizard

- **What:** Extend the existing creation wizard to support presentation creation with the same with/without document paths as worksheets.
- **Files:** `LUSIA Studio - Frontend/components/docs/CreateQuizWizard.tsx`
- **Changes:**
  - Add `"presentation"` to the type selection step (alongside "Quiz" and "Ficha de Exercícios")
  - Add presentation-specific steps: `pres_prompt`, `pres_size`, `pres_summary`
  - `pres_prompt` — Same as `ws_prompt`: teacher describes what the presentation should cover. Auto-resizing textarea.
  - `pres_size` — Two buttons: "Curta (5-10 slides)" / "Longa (15-25 slides)". Replaces `ws_template` + `ws_difficulty`.
  - `pres_summary` — Confirmation card showing: type "Apresentação", subject, year, curriculum codes, prompt preview, size selection. Same layout as `ws_summary`.
  - Wire the same source_selection → subject_year → theme flow for the without-document path (identical to worksheets).
  - Wire the short path for with-document (preselectedArtifactId): type_selection → pres_prompt → pres_size → pres_summary.
  - On submit: call `startPresentationGeneration()` → fire `onPresentationStart(result)` callback.
  - Add `onPresentationStart?: (result: PresentationStartResponse) => void` prop.
- **Pattern:** Follow the worksheet steps exactly (lines 677-850 in CreateQuizWizard.tsx). The logic for navigating between steps, inheriting subject/year from document, curriculum matching on theme — all of this is identical. Only the final steps differ (pres_prompt + pres_size instead of ws_prompt + ws_template + ws_difficulty).
- **Acceptance:** "Apresentação" appears in type selection. Both with-document and without-document paths work. Summary shows correct info. Submission calls the API and fires callback.

### 1.10: Create PresentationGenerationFullPage

- **What:** Full-page generation view with glow effect and SSE progress display.
- **Files:** `LUSIA Studio - Frontend/components/presentations/PresentationGenerationFullPage.tsx`
- **Pattern:** Follow `components/docs/quiz/QuizGenerationFullPage.tsx` closely.
- **Behavior:**
  - Receives `artifactId` prop
  - On mount: calls `streamPresentationGeneration()` to connect to SSE
  - Uses `useGlowEffect()` to activate glow during streaming
  - Status states: `connecting` → `planning` → `generating_slides` → `done` / `error`
  - Display:
    - Planning phase: "A planear a estrutura pedagógica..." with animated indicator
    - Generating phase: "A gerar slides... (3/8)" with progress bar
    - Done: "Apresentação gerada com sucesso!" — button to open viewer (placeholder for Step 2)
    - Error: error message with retry option
  - Glow management:
    ```typescript
    useEffect(() => {
      if (status === "planning" || status === "generating_slides") triggerGlow("streaming");
      else if (status === "error") triggerGlow("error");
      else clearGlow();
      return () => clearGlow();
    }, [status]);
    ```
  - Cleanup: abort SSE connection on unmount via AbortController
  - On `onBack` callback: navigate back to docs table (generation continues in background via Channel B)
- **Acceptance:** Full-page view shows during generation. Glow activates. Progress updates. Back button returns to docs. SSE cleaned up on unmount.

### 1.11: Add presentation generation view state to DocsPage

- **What:** Wire DocsPage to transition to the presentation generation view when creation starts.
- **Files:** `LUSIA Studio - Frontend/components/docs/DocsPage.tsx`
- **Changes:**
  - Add to view state type: `{ view: "presentation_generation"; artifactId: string }`
  - Add `onPresentationStart` callback to CreateQuizWizard:
    ```typescript
    onPresentationStart={(result) => {
      setViewState({ view: "presentation_generation", artifactId: result.artifact_id });
    }}
    ```
  - Render `PresentationGenerationFullPage` when `view === "presentation_generation"`
  - On `onDone`: navigate to `/dashboard/docs/presentation/{artifactId}` (presentation route — placeholder viewer in Step 2)
  - On `onBack`: return to `{ view: "table" }`
  - Lazy-load `PresentationGenerationFullPage` with `dynamic()`
- **Pattern:** Follow the quiz generation integration exactly: `{ view: "quiz_generation", artifactId, numQuestions }` → `QuizGenerationFullPage`.
- **Acceptance:** Creating a presentation transitions to the full-page generation view. Back returns to table. Done navigates to presentation route.

### 1.12: Extend ProcessingStepPill for presentation generation

- **What:** Add presentation-specific step labels to ProcessingStepPill.
- **Files:** `LUSIA Studio - Frontend/components/docs/ProcessingStepPill.tsx`
- **Changes:** Add mappings for presentation generation statuses:
  - `'planning'` → "A planear apresentação..."
  - `'generating_slides'` → "A gerar slides..."
  - These statuses come from the `document_jobs.status` column, broadcast via the existing document status SSE.
- **Pattern:** Same as existing step labels (pending, parsing, categorizing, etc.) — just add new ones.
- **Acceptance:** ProcessingStepPill correctly shows labels for presentation generation steps.

### 1.13: Handle presentation artifacts in docs list

- **What:** Ensure presentation artifacts display correctly in the docs list and navigate to the right place.
- **Files:**
  - `LUSIA Studio - Frontend/components/docs/DocsDataTable.tsx`
  - `LUSIA Studio - Frontend/components/docs/DocsPage.tsx`
- **Changes:**
  - Add presentation icon to artifact type icon mapping (use a presentation/slides icon)
  - When clicking a completed presentation artifact: navigate to `/dashboard/docs/presentation/{id}`
  - When clicking a generating presentation: transition to `{ view: "presentation_generation", artifactId }` to reconnect to SSE
  - Presentation processing items appear in the processing rows via `useProcessingDocuments` (no changes needed — they use document_jobs which already integrates)
- **Acceptance:** Presentation artifacts show with correct icon. Click navigates correctly. Processing items show in docs list with animated pill.

### 1.14: Create placeholder presentation route page

- **What:** Minimal route page for completed presentations (viewer comes in Step 2).
- **Files:**
  - `LUSIA Studio - Frontend/app/(teacher)/dashboard/docs/presentation/[artifactId]/page.tsx`
  - `LUSIA Studio - Frontend/app/(teacher)/dashboard/docs/presentation/[artifactId]/loading.tsx`
- **Behavior:**
  - Server component that fetches presentation artifact
  - If not yet completed: redirect to docs page (or show generation progress)
  - If completed: show placeholder with presentation title, slide count, "Viewer coming in Step 2" message
  - Loading skeleton: 16:9 aspect ratio placeholder
- **Acceptance:** Route exists. Completed presentations show basic info. Loading skeleton renders.

---

## Step 1 Execution Order

```
Phase 1 — Backend Foundation
  1.1  Migration (artifact_type)
  1.2  Copy prompt files to backend
  1.3  Backend schemas

Phase 2 — Backend Pipeline
  1.4  Presentation generation service
  1.5  Extend PipelineTaskManager
  1.6  Presentation generation router + registration

Phase 3 — Frontend API Layer
  1.7  Next.js API routes
  1.8  Presentation generation client functions

Phase 4 — Frontend Creation Flow
  1.9  Add "Apresentação" to CreateQuizWizard

Phase 5 — Frontend Generation UI
  1.10 PresentationGenerationFullPage (glow + SSE)
  1.11 DocsPage view state integration
  1.12 Extend ProcessingStepPill
  1.13 Handle presentation artifacts in docs list
  1.14 Placeholder presentation route page
```

## Step 1 Verification

- [ ] Migration runs — 'presentation' is valid artifact_type
- [ ] POST /presentations/start creates artifact with `artifact_type='presentation'` and document_job
- [ ] Generation runs asynchronously in background (survives HTTP disconnect)
- [ ] GET /presentations/{id}/stream returns SSE events in correct order
- [ ] Planner LLM call returns valid plan JSON
- [ ] Executor LLM call returns parseable HTML with slide delimiters
- [ ] Plan + slides stored in artifact content JSONB
- [ ] Artifact marked `is_processed=true` on completion
- [ ] document_job status updates broadcast via existing document status SSE
- [ ] "Apresentação" appears in CreateQuizWizard type selection
- [ ] Both with-document and without-document wizard paths work
- [ ] PresentationGenerationFullPage shows with glow effect during streaming
- [ ] Back button during generation returns to docs table (generation continues)
- [ ] ProcessingStepPill shows presentation generation steps in docs list
- [ ] Completed presentation appears in docs list with correct icon
- [ ] Clicking completed presentation navigates to presentation route
- [ ] Code compiles: `npx tsc --noEmit`

---

# STEP 2: Slide Viewer

**This is what the second executor agent builds.** The complete slide viewing experience: CSS design system, 1280×720 scaled canvas, navigation, fragment reveals, quiz interaction, conditional navigation, and server-rendered route page.

## Patterns to Follow (Read These First)

### Executor Prompts (define the HTML contract)

The executor LLM generates HTML using specific CSS classes and data-attributes. The viewer MUST implement these exactly. Read both files:

| File | What to learn |
|------|---------------|
| `LUSIA Studio - Backend/app/prompts/presentations/executor_part1.md` | All `.sl-*` class names, `--sl-*` CSS variable names, layout rules, canvas specs |
| `LUSIA Studio - Backend/app/prompts/presentations/executor_part2.md` | HTML structure per slide type (static, reveal, quiz, interactive), data-attribute specs, conditional navigation, output format |

### LUSIA Design Tokens (map CSS variables to these)

The `--sl-*` CSS variables must map to the existing LUSIA design system:

| `--sl-*` Variable | LUSIA Value | Source |
|---|---|---|
| `--sl-color-primary` | `#15316b` | `--color-primary` (brand-primary) |
| `--sl-color-accent` | `#0a1bb6` | `--color-accent` (brand-accent) |
| `--sl-color-tertiary` | `#66c0ee` | brand-tertiary |
| `--sl-color-muted` | `#6b7a8d` | `--color-muted-foreground` |
| `--sl-color-background` | `#ffffff` | Slides are always white (NOT the app bg #f6f3ef) |
| `--sl-color-surface` | `#f8f7f4` | Close to app card bg, slightly warm |
| `--sl-color-border` | `rgba(21,49,107,0.12)` | brand-primary at 12% |
| `--sl-color-success` | `#10b981` | App success green |
| `--sl-color-error` | `#ef4444` | App destructive red |
| `--sl-color-accent-soft` | `rgba(10,27,182,0.06)` | accent at 6% |
| `--sl-color-success-soft` | `rgba(16,185,129,0.08)` | success at 8% |
| `--sl-color-error-soft` | `rgba(239,68,68,0.08)` | error at 8% |
| `--sl-font-family` | `'Satoshi', system-ui, sans-serif` | App font (Medium 500, Bold 700) |
| `--sl-font-family-serif` | `'InstrumentSerif', Georgia, serif` | App serif font |
| `--sl-radius` | `12px` | `--radius-lg` |
| `--sl-radius-sm` | `8px` | `--radius-sm` |
| `--sl-radius-lg` | `16px` | `--radius-xl` |

### Existing Code (built in Step 1)

| File | What to learn |
|------|---------------|
| `LUSIA Studio - Frontend/components/presentations/PresentationGenerationFullPage.tsx` | Already exists from Step 1. The generation view. |
| `LUSIA Studio - Frontend/lib/presentation-generation.ts` | `getPresentation()`, types, SSE stream handler. Already exists. |
| `LUSIA Studio - Frontend/app/(teacher)/dashboard/docs/presentation/[artifactId]/page.tsx` | Current placeholder page. Replace with server-rendered shell. |
| `LUSIA Studio - Frontend/components/docs/DocsPage.tsx` | Has `onOpenPresentation` handler and `presentation_generation` view state. Already wired. |

### Reference Patterns (from other features)

| File | What to learn |
|------|---------------|
| `LUSIA Studio - Frontend/lib/calendar.server.ts` | Server fetch pattern — `fetchBackendJsonServer()` |
| `LUSIA Studio - Frontend/lib/queries/calendar.ts` | Query module pattern — key builders, hooks, stale times |
| `LUSIA Studio - Frontend/app/(teacher)/dashboard/calendar/page.tsx` | Server component route pattern — fetch + pass initialData to shell |
| `LUSIA Studio - Frontend/components/calendar/CalendarShell.tsx` | Shell pattern — query orchestration, accepts initialData |

## Step 2 Architecture

### Component Tree

```
Route page (server component)
  → fetchPresentationServer(artifactId)
  → <PresentationShell initialData={data} artifactId={id}>
       if phase === generating → <PresentationGenerationFullPage> (already exists)
       if phase === completed  → <SlideViewer slides={slides} plan={plan}>
                                    ├── <SlideCanvas html={currentSlide.html} ... />
                                    ├── Navigation controls (arrows, keyboard, progress)
                                    └── <SlideThumbnailStrip slides={slides} current={idx} />
       if phase === failed     → Error state with retry
```

### SlideCanvas — The Rendering Core

A 1280×720 div scaled to fit the viewport via CSS `transform: scale()`.

```
┌─────────────────── parent container (any width) ──────────────────┐
│  ┌───────────── 1280×720 div, transform: scale(factor) ────────┐  │
│  │  80px margin (safe area)                                    │  │
│  │  ┌──────────── 1120×560 usable area ──────────────────┐     │  │
│  │  │  Slide HTML rendered here via dangerouslySetInnerHTML│     │  │
│  │  └────────────────────────────────────────────────────┘     │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

Scale factor = `parentWidth / 1280`. Height follows naturally. Use ResizeObserver on parent.

**Script execution:** Slide HTML may contain `<script>` tags (for interactive slides with JS, KaTeX, Chart.js). After injecting HTML via `dangerouslySetInnerHTML`, scripts do NOT execute. The component must:
1. After render, find all `<script>` tags in the slide container
2. Clone each script into a new `<script>` element and append it to the container
3. This triggers execution in the correct order
4. Clean up scripts on slide change

**Fragment visibility:** Elements with `data-fragment-index` start hidden (CSS: `.sl-fragment { opacity: 0; visibility: hidden }`). The component adds class `.visible` to fragments where `data-fragment-index <= visibleFragments`. CSS transition handles the animation.

### Navigation Model

```
Click/Space on slide:
  → Are there unrevealed fragments? → Reveal next fragment
  → All fragments revealed? → Go to next slide

ArrowRight / Swipe Left:
  → Go to next slide (show all fragments immediately)

ArrowLeft / Swipe Right:
  → Go to previous slide (show all fragments)

Quiz slide:
  → Forward navigation BLOCKED until quiz is answered
  → After answering: if incorrect AND data-reinforcement exists → insert reinforcement slide next
```

### Quiz Interaction Model

The viewer reads quiz data from the DOM (data-attributes on the HTML generated by the executor):

```
1. Slide has data-slide-type="quiz"
2. Find all .sl-quiz-option buttons
3. Read data-quiz-option (A/B/C/D), data-correct ("true" on correct), data-feedback (text)
4. On option click:
   a. Add .selected class to clicked option
   b. Add .correct class to the correct option
   c. Add .incorrect class if clicked option is wrong
   d. Show data-feedback text from the clicked option
   e. Show data-feedback-correct or data-feedback-wrong div
   f. Disable further option clicks
   g. Unblock forward navigation
5. Track score per quiz slide (for sl-quiz-score display)
```

For multi-question quiz slides (multiple `.sl-quiz[data-quiz-index]`):
- Questions can be fragments — second question appears after first is answered
- Score accumulates across questions within the slide

### Conditional Navigation Model

```
1. Quiz slide has data-reinforcement="s4b"
2. Teacher answers incorrectly
3. slideOrder is modified: insert "s4b" after current position
4. Reinforcement slide (data-conditional="true") shows once
5. After reinforcement slide, continue to next normal slide
6. If teacher answers correctly: skip reinforcement, continue normally
```

The `slideOrder` array is the source of truth for slide ordering. It starts as the natural order of all non-conditional slides. Conditional slides are inserted dynamically.

### Data Flow

```
Content JSONB → plan + slides
  ↓
PresentationShell receives initialData
  ↓
SlideViewer receives slides[] and plan
  ↓
SlideViewer manages:
  - currentSlideIndex (into slideOrder)
  - slideOrder: string[] (slide IDs, with conditionals inserted dynamically)
  - visibleFragments: Record<slideId, number>
  - quizStates: Record<slideId, { answered: boolean; correct: boolean; selectedOption: string }>
  ↓
SlideCanvas receives:
  - html (current slide's HTML)
  - visibleFragments (how many to show)
  - quizState (if quiz slide)
  - onQuizAnswer callback
  - onFragmentAdvance callback
```

---

## Step 2 Subtasks

### 2.1: Create slide viewer CSS

- **What:** Implement all `.sl-*` classes and `--sl-*` CSS variables that the executor LLM generates HTML against.
- **Files:** `LUSIA Studio - Frontend/components/presentations/slide-viewer.css`
- **Source of truth:** The class names and their descriptions are defined in `executor_part1.md` (lines 62-139). Implement exactly those classes.
- **CSS Variables:** Map to LUSIA tokens using the table in this task file's "LUSIA Design Tokens" section above.
- **Classes to implement:**

  **Text classes:**
  - `.sl-heading` — 36-40px, font-weight 700, color `var(--sl-color-primary)`. One per slide.
  - `.sl-subheading` — 26-28px, font-weight 500, color `var(--sl-color-primary)`.
  - `.sl-body` — 20-22px, font-weight 400, color `var(--sl-color-primary)`, line-height 1.6.
  - `.sl-caption` — 18px, color `var(--sl-color-muted)`.
  - `.sl-label` — 14px, uppercase, letter-spacing 0.08em, color `var(--sl-color-muted)`. Exception to 18px minimum — labels are structural, not reading text.
  - `.sl-math` — KaTeX container, font-size 24px+ for projection.

  **Structure classes:**
  - `.sl-callout` — background `var(--sl-color-surface)`, border 1px `var(--sl-color-border)`, border-radius `var(--sl-radius)`, padding 24px-32px.
  - `.sl-callout-accent` — Like callout but with 3-4px left border in `var(--sl-color-accent)`.
  - `.sl-card` — background `var(--sl-color-surface)`, border 1px `var(--sl-color-border)`, border-radius `var(--sl-radius)`, padding 20px.
  - `.sl-badge` — inline-block, small padding (4px 12px), border-radius `var(--sl-radius-sm)`, background `var(--sl-color-accent-soft)`, color `var(--sl-color-accent)`, font-size 14px, font-weight 500.
  - `.sl-divider` — height 1px, background `var(--sl-color-border)`, margin 16px 0.
  - `.sl-list` — display flex, flex-direction column, gap 12px.
  - `.sl-list-item` — display flex, align-items flex-start, gap 12px. With `::before` or icon for bullet.
  - `.sl-accent-shape` — decorative background shape, position absolute, background `var(--sl-color-accent-soft)`, border-radius 50% or large radius, z-index -1.

  **Layout classes:**
  - `.sl-layout-full` — display flex, flex-direction column, align-items center, justify-content center, width 100%, height 100%, padding 80px (safe area), max-width 900px for text content, margin 0 auto.
  - `.sl-layout-split` — display grid, grid-template-columns 1fr 1fr (or 3fr 2fr), gap 40px-60px, width 100%, height 100%, padding 80px, align-items center.
  - `.sl-col` — display flex, flex-direction column, gap 16px.

  **Fragment classes:**
  - `.sl-fragment` — opacity 0, visibility hidden, transform translateY(8px), transition all 0.4s ease.
  - `.sl-fragment.visible` — opacity 1, visibility visible, transform translateY(0).
  - `.sl-fragment-fade` — Same as `.sl-fragment` but only opacity transition (no translateY).
  - `.sl-fragment-fade.visible` — opacity 1, visibility visible.

  **Quiz classes:**
  - `.sl-quiz` — display flex, flex-direction column, gap 20px, width 100%.
  - `.sl-quiz-question` — font-size 24-28px, font-weight 500, color `var(--sl-color-primary)`.
  - `.sl-quiz-options` — display flex, flex-direction column, gap 12px.
  - `.sl-quiz-option` — display block, width 100%, text-align left, padding 16px 20px, background `var(--sl-color-surface)`, border 2px solid `var(--sl-color-border)`, border-radius `var(--sl-radius)`, font-size 20px, cursor pointer, transition all 0.2s.
  - `.sl-quiz-option:hover` — border-color `var(--sl-color-accent)`, background white.
  - `.sl-quiz-option.selected` — border-color `var(--sl-color-accent)`, background `var(--sl-color-accent-soft)`.
  - `.sl-quiz-option.correct` — border-color `var(--sl-color-success)`, background `var(--sl-color-success-soft)`.
  - `.sl-quiz-option.incorrect` — border-color `var(--sl-color-error)`, background `var(--sl-color-error-soft)`.
  - `.sl-quiz-option.disabled` — pointer-events none, opacity 0.7.
  - `.sl-quiz-feedback` — display none initially. Padding 16px, border-radius `var(--sl-radius-sm)`, font-size 18px, margin-top 8px.
  - `.sl-quiz-feedback.show` — display block.
  - `.sl-quiz-feedback[data-feedback-correct]` — background `var(--sl-color-success-soft)`, color `var(--sl-color-success)`.
  - `.sl-quiz-feedback[data-feedback-wrong]` — background `var(--sl-color-error-soft)`, color `var(--sl-color-error)`.
  - `.sl-quiz-score` — font-size 18px, font-weight 500, text-align center, color `var(--sl-color-muted)`.

  **Interactive classes:**
  - `.sl-interactive` — width 100%, flex 1, display flex, align-items center, justify-content center, min-height 200px.
  - `.sl-controls` — width 100%, display flex, flex-direction column, gap 12px, padding-top 16px.
  - `.sl-slider-row` — display flex, align-items center, gap 12px. Label takes min-width 80px.
  - `.sl-slider-row input[type="range"]` — flex 1, accent-color `var(--sl-color-accent)`.
  - `.sl-info-grid` — display grid, grid-template-columns repeat(auto-fit, minmax(120px, 1fr)), gap 12px.
  - `.sl-info-card` — background `var(--sl-color-surface)`, border-radius `var(--sl-radius-sm)`, padding 12px 16px, display flex, flex-direction column, gap 4px.

- **Acceptance:** CSS file implements all classes from the executor prompt. Variables map to LUSIA tokens. Fragment transitions work. Quiz states visually distinct. All font sizes ≥ 18px (except `.sl-label` at 14px).

### 2.2: Create SlideCanvas component

- **What:** The core rendering component. A 1280×720 container that scales to fit, injects slide HTML, manages fragment visibility, and executes scripts.
- **Files:** `LUSIA Studio - Frontend/components/presentations/SlideCanvas.tsx`
- **Props:**
  ```typescript
  interface SlideCanvasProps {
    html: string;
    slideId: string;
    visibleFragments: number;
    quizState?: {
      answered: boolean;
      correct: boolean;
      selectedOption: string | null;
      optionFeedback: Record<string, string>;
    };
    onQuizOptionClick?: (option: string) => void;
    onClick?: () => void;  // for fragment advance
  }
  ```
- **Scaling:** Use a ref on the parent container + ResizeObserver. Compute `scale = parentWidth / 1280`. Apply `transform: scale(${scale})` with `transform-origin: top left` on the 1280×720 inner div. Set parent height to `720 * scale`.
- **HTML injection:** `dangerouslySetInnerHTML={{ __html: html }}` on the inner div.
- **CSS injection:** Import `slide-viewer.css`. Set `--sl-*` CSS variables as inline styles on the inner div.
- **Fragment visibility:** After HTML injection, use `useEffect` to query all `[data-fragment-index]` elements. Add `.visible` class where `parseInt(el.dataset.fragmentIndex) <= visibleFragments`. Remove `.visible` from others.
- **Script execution:** After HTML injection, use `useEffect` to find all `<script>` tags in the container. For each, create a new `<script>` element, copy attributes and textContent, append to container (this triggers execution). Clean up on slide change by removing added scripts.
- **Quiz interaction:** If slide has `[data-quiz-option]` elements, attach click handlers that call `onQuizOptionClick(option)`. Apply `.selected`, `.correct`, `.incorrect`, `.disabled` classes based on `quizState`. Show/hide feedback divs.
- **Click handling:** Click on the slide (not on quiz options) triggers `onClick` for fragment advance.
- **Acceptance:** Slides render at correct scale. HTML displays correctly. Fragments show/hide with transitions. Scripts execute (KaTeX renders, Chart.js renders, interactive JS works). Quiz options respond to clicks.

### 2.3: Create SlideViewer component

- **What:** Full viewer orchestrating navigation, fragments, quizzes, conditional navigation, and thumbnails.
- **Files:** `LUSIA Studio - Frontend/components/presentations/SlideViewer.tsx`
- **Props:**
  ```typescript
  interface SlideViewerProps {
    slides: Array<{ id: string; html: string }>;
    plan: {
      title: string;
      slides: Array<{
        id: string;
        type: string;
        subtype: string | null;
        title: string;
        reinforcement_slide: string | null;
      }>;
    };
  }
  ```
- **State:**
  - `currentIndex: number` — index into `slideOrder`
  - `slideOrder: string[]` — ordered slide IDs. Initialized with non-conditional slide IDs. Conditional slides inserted dynamically.
  - `visibleFragments: Record<string, number>` — per slide, how many fragments are revealed
  - `fragmentCounts: Record<string, number>` — per slide, total fragment count (parsed from HTML)
  - `quizStates: Record<string, QuizState>` — per slide, quiz answer state
  - `showThumbnails: boolean` — thumbnail strip toggle
- **Navigation logic:**
  ```
  handleAdvance():
    currentSlide = slideOrder[currentIndex]
    if fragmentCounts[currentSlide] > visibleFragments[currentSlide]:
      visibleFragments[currentSlide]++  // reveal next fragment
    else if quizSlide && !quizStates[currentSlide]?.answered:
      // blocked — must answer quiz first
    else:
      currentIndex++  // next slide

  handlePrevious():
    if currentIndex > 0:
      currentIndex--
      // show all fragments for previous slide
      visibleFragments[prevSlide] = fragmentCounts[prevSlide]

  handleQuizAnswer(slideId, option):
    planSlide = plan.slides.find(s => s.id === slideId)
    correctOption = findCorrectOption(slideId)  // read from DOM data-correct
    correct = option matches correctOption
    quizStates[slideId] = { answered: true, correct, selectedOption: option }
    if !correct && planSlide?.reinforcement_slide:
      insert reinforcement_slide into slideOrder after current position (if not already there)
  ```
- **Keyboard:** `useEffect` with `keydown` listener. ArrowRight/Space → `handleAdvance()`. ArrowLeft → `handlePrevious()`. Escape → toggle thumbnails.
- **Touch:** Swipe detection on the slide area. Swipe left → advance. Swipe right → previous.
- **Progress:** Show `currentIndex + 1 / slideOrder.length` or dots.
- **Fragment count parsing:** On mount or when slides change, parse each slide's HTML to find max `data-fragment-index`. Store in `fragmentCounts`. Initialize `visibleFragments` to 0 for each slide.
- **Slide order initialization:** Filter plan.slides to exclude those with `data-conditional="true"` (reinforcement slides). These are only added to `slideOrder` when triggered by quiz failure.
- **Children:** Renders `<SlideCanvas>` for the current slide. Renders navigation arrows. Optionally renders `<SlideThumbnailStrip>`.
- **Acceptance:** Full navigation works (arrows, keyboard, touch). Fragments advance sequentially. Quizzes block navigation, show feedback, track score. Conditional slides appear on incorrect answers. Thumbnails work.

### 2.4: Create SlideThumbnailStrip component

- **What:** Lateral strip showing miniature previews of all slides for quick navigation.
- **Files:** `LUSIA Studio - Frontend/components/presentations/SlideThumbnailStrip.tsx`
- **Props:** `slides: Array<{ id: string; html: string }>`, `currentSlideId: string`, `slideOrder: string[]`, `onSelectSlide: (index: number) => void`
- **Behavior:**
  - Vertical strip on the right side of the viewer (or horizontal at bottom on mobile)
  - Each thumbnail is a tiny (160×90) scaled version of the slide (use the same CSS transform trick, or just show the slide title + type icon)
  - Current slide highlighted with accent border
  - Click jumps to that slide
  - Auto-scrolls to keep current slide visible
  - Conditional slides shown with a subtle indicator
- **Acceptance:** Thumbnails render for all slides in slideOrder. Click navigates. Current slide is highlighted.

### 2.5: Create server fetch function and query module

- **What:** Server-side fetch for SSR + client-side query module for caching.
- **Files:**
  - `LUSIA Studio - Frontend/lib/presentations.server.ts`
  - `LUSIA Studio - Frontend/lib/queries/presentations.ts`
- **Server fetch:** Follow `lib/calendar.server.ts`. `fetchPresentationServer(artifactId: string)` → calls `fetchBackendJsonServer()` directly against backend. Returns typed `Presentation | null`.
- **Query module:** Follow `lib/queries/calendar.ts` but simplified (read-only, no optimistic updates).
  - `PRESENTATION_DETAIL_PREFIX = "presentation:detail:"`
  - `buildPresentationDetailKey(artifactId: string): string`
  - `usePresentationDetailQuery(artifactId: string, initialData?): UseQueryResult<Presentation>`
  - `invalidatePresentationDetail(artifactId: string): void`
- **Types (in query module or a shared types file):**
  ```typescript
  interface PresentationPlanSlide {
    id: string; phase: string; type: string; subtype: string | null;
    title: string; intent: string; description: string;
    reinforcement_slide: string | null;
  }
  interface PresentationPlan {
    title: string; description: string; target_audience: string;
    total_slides: number; size: string; slides: PresentationPlanSlide[];
  }
  interface PresentationSlide { id: string; html: string; }
  interface Presentation {
    id: string; artifact_name: string; artifact_type: string;
    content: {
      phase: string; plan: PresentationPlan | null;
      slides: PresentationSlide[] | null;
      generation_params: Record<string, any>;
    };
    subject_id: string | null; year_level: string | null;
    is_processed: boolean;
  }
  ```
- **Pattern:** Follow STANDARDS.md §5 Feature Query Module Contract. Read-only features can skip snapshot/restore.
- **Acceptance:** Server fetch returns typed data. Query module exports key builder, hook, and invalidation. Uses custom query client (NOT React Query).

### 2.6: Create PresentationShell and replace placeholder route page

- **What:** Shell component for query orchestration + server-rendered route page.
- **Files:**
  - `LUSIA Studio - Frontend/components/presentations/PresentationShell.tsx` (new)
  - `LUSIA Studio - Frontend/app/(teacher)/dashboard/docs/presentation/[artifactId]/page.tsx` (replace)
  - `LUSIA Studio - Frontend/app/(teacher)/dashboard/docs/presentation/[artifactId]/loading.tsx` (update)
- **PresentationShell:**
  - `"use client"` directive
  - Props: `artifactId: string`, `initialData?: Presentation`
  - Calls `usePresentationDetailQuery(artifactId, initialData)` for data
  - If `phase === 'completed'` and slides exist: render `<SlideViewer>` (lazy-loaded via `dynamic()`)
  - If `phase` is generating: render `<PresentationGenerationFullPage>` (already exists, lazy-loaded)
  - If `phase === 'failed'`: render error state with back button
  - If data not loaded: render loading skeleton
  - Pattern: Follow `components/calendar/CalendarShell.tsx`
- **Route page (replace placeholder):**
  - Server component (remove `"use client"`)
  - Extract `artifactId` from params
  - Call `fetchPresentationServer(artifactId)`
  - Render `<PresentationShell artifactId={id} initialData={data} />`
  - Minimal file — no client logic
  - Pattern: Follow `app/(teacher)/dashboard/calendar/page.tsx`
- **Loading skeleton:**
  - 16:9 aspect ratio placeholder with shimmer
  - Navigation arrows placeholders
  - Matches the viewer layout
- **Acceptance:** Route page server-fetches. Shell orchestrates views. Completed presentations show the full viewer. Generating presentations show the generation page. Loading skeleton renders.

---

## Step 2 Execution Order

```
Phase 1 — CSS Foundation
  2.1  Slide viewer CSS (all .sl-* classes + --sl-* variables)

Phase 2 — Rendering Core
  2.2  SlideCanvas component (scaling, HTML injection, scripts, fragments, quiz DOM)

Phase 3 — Viewer Logic
  2.3  SlideViewer component (navigation, fragment system, quiz system, conditional nav)
  2.4  SlideThumbnailStrip component

Phase 4 — Data Layer + Route
  2.5  Server fetch + query module
  2.6  PresentationShell + replace placeholder route page
```

## Step 2 Verification

- [ ] CSS: all `.sl-*` classes produce correct visuals when applied to executor-generated HTML
- [ ] CSS: `--sl-*` variables map correctly to LUSIA design tokens
- [ ] CSS: fragment transitions animate smoothly (opacity + translateY)
- [ ] CSS: quiz option states are visually distinct (hover, selected, correct, incorrect)
- [ ] Canvas: slides render at 1280×720 scaled to fit viewport width
- [ ] Canvas: responsive — scales on window resize
- [ ] Canvas: `<script>` tags in slide HTML execute correctly (KaTeX, Chart.js, custom JS)
- [ ] Navigation: ArrowRight/Space advances fragment or slide
- [ ] Navigation: ArrowLeft goes to previous slide with all fragments visible
- [ ] Navigation: click on slide area advances fragment
- [ ] Navigation: progress indicator shows current position
- [ ] Fragments: elements with `data-fragment-index` start hidden
- [ ] Fragments: clicking reveals fragments sequentially (1, 2, 3...)
- [ ] Fragments: returning to a slide shows all fragments
- [ ] Quiz: options are clickable, show feedback per option
- [ ] Quiz: correct option gets green border, incorrect gets red
- [ ] Quiz: forward navigation blocked until answered
- [ ] Quiz: score displays correctly for the slide
- [ ] Conditional: incorrect quiz answer inserts reinforcement slide
- [ ] Conditional: correct quiz answer skips reinforcement slide
- [ ] Conditional: reinforcement slide shows only once
- [ ] Thumbnails: miniatures display for all slides
- [ ] Thumbnails: click navigates to slide
- [ ] Thumbnails: current slide highlighted
- [ ] Shell: completed presentations show viewer
- [ ] Shell: generating presentations show generation page
- [ ] Route: server-fetches data, passes to shell
- [ ] Code compiles: `npx tsc --noEmit`

---

# STEP 3: Documentation (Future)

- Create `docs/features/presentations.md`
- Update `docs/ARCHITECTURE.md` feature inventory
- Update `docs/README.md` navigation index
- Update `docs/data/documents.md` artifact_type docs
