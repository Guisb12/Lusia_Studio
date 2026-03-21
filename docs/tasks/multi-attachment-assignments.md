---
status: in-progress
created: 2026-03-21
updated: 2026-03-21
priority: p0
planned-by: planner-agent
---

## Goal

Enable assignments to support up to 3 attached documents instead of 1. The teacher chooses and orders documents when creating an assignment. Each attachment becomes a task for the student: "Abrir {name}" for non-quiz docs, "Resolver {name}" for quizzes. The assignment is complete when all tasks are done. Only quizzes get numeric grades; other document types are simply "done/not done." The teacher detail panel shows a global overview with tabs for switching between quiz results.

## User Intent

- Teachers can attach 1–3 documents to an assignment, in a chosen order
- Students see a task list matching that order and must complete all tasks
- Grades apply only to quiz-type attachments (one score per quiz); non-quiz attachments are tracked as opened/completed only
- Existing single-attachment assignments continue to work (data migration)
- The Kanban card shows artifact type icons + a count badge
- The teacher detail panel shows a global overview: quiz tabs for question-by-question view, completion tags for non-quiz docs
- Non-quiz assignments (even single-attachment) must NOT display grades

## Context

### Key files (executor must read before starting)

- Feature doc: `docs/features/assignments.md`
- Data doc: `docs/data/assignments.md`
- Standards: `docs/STANDARDS.md`
- Backend service: `LUSIA Studio - Backend/app/api/http/services/assignments_service.py`
- Backend schemas: `LUSIA Studio - Backend/app/api/http/schemas/assignments.py`
- Backend router: `LUSIA Studio - Backend/app/api/http/routers/assignments.py`
- Frontend types: `LUSIA Studio - Frontend/lib/assignments.ts`
- Frontend queries: `LUSIA Studio - Frontend/lib/queries/assignments.ts`
- Create dialog: `LUSIA Studio - Frontend/components/assignments/CreateAssignmentDialog.tsx`
- Kanban card: `LUSIA Studio - Frontend/components/assignments/KanbanCard.tsx`
- Teacher detail: `LUSIA Studio - Frontend/components/assignments/AssignmentDetailPanel.tsx`
- Student preview: `LUSIA Studio - Frontend/components/assignments/AssignmentPreviewPanel.tsx`
- Student quiz: `LUSIA Studio - Frontend/components/assignments/StudentQuizFullPage.tsx`
- Student page: `LUSIA Studio - Frontend/components/assignments/StudentAssignmentsPage.tsx`
- Assignments page: `LUSIA Studio - Frontend/components/assignments/AssignmentsPage.tsx`

### Current state

- DB `assignments` table has `artifact_id uuid` (single FK to `artifacts`)
- Backend schema `AssignmentCreateIn` accepts `artifact_id: Optional[str]`
- Hydration resolves single `artifact_id` → `artifact: {id, artifact_type, artifact_name, icon}`
- Auto-grading loads quiz questions from the single artifact
- `student_assignments.progress` stores flat quiz answers: `{ "q1": "A" }`
- `student_assignments.submission` stores flat: `{ "answers": {...}, "grading": {...} }`
- `student_assignments.grade` is a single numeric (0–100)

### Design decisions

**1. Data model: `artifact_id` → `artifact_ids uuid[]`**
Single column rename + migration. Array order encodes task sequence. Max 3 enforced at application layer (schema validation), not DB constraint.

**2. Per-task tracking via structured jsonb**
No new table. `student_assignments.progress` and `.submission` become keyed by artifact_id:
```json
// progress (work-in-progress)
{
  "<artifact_id_1>": { "opened": true },
  "<artifact_id_2>": { "answers": { "q1": "A" } }
}

// submission (final)
{
  "<artifact_id_1>": { "type": "view", "completed_at": "2026-03-21T..." },
  "<artifact_id_2>": { "type": "quiz", "answers": {...}, "grading": {...}, "grade": 85 }
}
```

**3. Backward compatibility for student_assignments**
Do NOT migrate `progress`/`submission` data. Service layer detects format:
- If parent assignment `artifact_ids` length == 1 AND progress/submission doesn't have that artifact_id as a key → legacy flat format → wrap on first update
- New writes always use keyed format

**4. Overall grade = average of quiz grades**
`student_assignments.grade` = mean of all quiz task grades in submission. Null if no quizzes are graded yet.

**5. Overall status derivation**
- `not_started` → no tasks touched
- `in_progress` → at least one task started, not all done
- `submitted` → all tasks completed (non-quiz opened, quiz submitted)
- `graded` → all quiz tasks auto-graded or teacher-graded

**6. Update endpoint: artifact_id param**
`StudentAssignmentUpdateIn` gains `artifact_id: Optional[str]` to specify which task is being updated. When provided, progress/submission are scoped to that task. When absent, legacy behavior.

**7. Teacher grading: per-quiz**
`TeacherGradeIn` gains `artifact_id: Optional[str]` to specify which quiz to grade/override.

---

## Plan

### Subtask 1: Database migration — `artifact_id` → `artifact_ids`

- **What:** Create migration to rename column, migrate data, update indexes
- **File:** `LUSIA Studio - Backend/migrations/021_assignment_multi_attachments.sql`
- **SQL:**
  ```sql
  -- Add new array column
  ALTER TABLE assignments ADD COLUMN IF NOT EXISTS artifact_ids uuid[] DEFAULT '{}';

  -- Migrate existing data
  UPDATE assignments SET artifact_ids = ARRAY[artifact_id] WHERE artifact_id IS NOT NULL;

  -- Drop old column
  ALTER TABLE assignments DROP COLUMN IF EXISTS artifact_id;

  -- GIN index for artifact membership queries (if we ever need "which assignments use this artifact?")
  CREATE INDEX IF NOT EXISTS idx_assignments_artifact_ids_gin ON assignments USING GIN (artifact_ids);
  ```
- **Acceptance:** Migration runs idempotently. Existing assignments have their artifact_id migrated to a 1-element array. Old column is removed.

### Subtask 2: Backend schemas — update Pydantic models

- **What:** Update all assignment schemas to use `artifact_ids` (list) instead of `artifact_id` (single)
- **File:** `LUSIA Studio - Backend/app/api/http/schemas/assignments.py`
- **Changes:**
  - `AssignmentCreateIn`: `artifact_id: Optional[str]` → `artifact_ids: Optional[list[str]] = None` with max length 3 validation
  - `AssignmentSummaryOut`: `artifact_id` → `artifact_ids: Optional[list[str]]`, `artifact` → `artifacts: Optional[list[dict]]`
  - `AssignmentOut`: same changes, extends summary
  - `StudentAssignmentUpdateIn`: add `artifact_id: Optional[str] = None` (which task is being updated)
  - `TeacherGradeIn`: add `artifact_id: Optional[str] = None` (which quiz to grade)
- **Pattern:** Follow existing schema conventions in `schemas/assignments.py`
- **Acceptance:** All schemas compile. Max 3 artifact_ids validated. New fields added.

### Subtask 3: Backend service — CRUD + hydration updates

- **What:** Update SELECT constants, hydration functions, and CRUD operations for `artifact_ids` array
- **File:** `LUSIA Studio - Backend/app/api/http/services/assignments_service.py`
- **Changes:**
  - `ASSIGNMENT_LIST_SELECT` and `ASSIGNMENT_DETAIL_SELECT`: replace `artifact_id` with `artifact_ids`
  - `_batch_hydrate_assignment_summaries()`: collect all artifact_ids from all assignments (flatten arrays), batch fetch, attach as `artifacts` list (preserving order from `artifact_ids` array)
  - `_batch_hydrate_assignment_details()`: same change
  - `create_assignment()`: accept `artifact_ids` list, store in DB
  - `get_my_assignments()`: update hydration to resolve `artifact_ids` → `artifacts` array on the nested assignment object
- **Pattern:** Same batch-hydrate pattern — collect IDs, batch fetch, map. Just flattening arrays of IDs instead of single IDs.
- **Acceptance:** List and detail endpoints return `artifact_ids` (array) and `artifacts` (array of metadata objects, ordered). Create accepts `artifact_ids` list. Max 3 enforced.

### Subtask 4: Backend service — per-task student assignment updates

- **What:** Update `update_student_assignment()` to support per-artifact task tracking
- **File:** `LUSIA Studio - Backend/app/api/http/services/assignments_service.py`
- **Changes:**
  - When `payload.artifact_id` is provided:
    - Read existing progress/submission
    - Detect format (legacy flat vs new keyed)
    - Update the specific artifact's task data within progress/submission
    - Compute overall status: check all artifact_ids from parent assignment, if all tasks done → "submitted"
  - When `payload.artifact_id` is NOT provided:
    - Legacy behavior (backward compat for existing clients)
  - Auto-grading: only triggered when the specific artifact is a quiz and submission is provided for it
  - Overall grade computation: after any quiz grading, recompute `grade` as average of all quiz task grades in submission
  - Helper function: `_compute_overall_status(submission, artifact_ids)` → returns derived status
  - Helper function: `_compute_overall_grade(submission)` → returns average of quiz grades
  - Legacy format detection: `_is_legacy_format(progress, submission, artifact_ids)` → True if single artifact and data isn't keyed
  - Legacy format upgrade: `_upgrade_to_keyed_format(progress, submission, artifact_id)` → wraps flat data under artifact_id key
- **Pattern:** The auto-grading pipeline (`_load_quiz_questions_for_student_assignment`) needs to accept the specific artifact_id to grade, not assume a single one
- **Acceptance:** Per-task updates work. Overall status auto-computes. Legacy single-artifact assignments still work. Auto-grading targets the specific quiz artifact.

### Subtask 5: Backend service — per-artifact teacher grading

- **What:** Update `teacher_grade_student_assignment()` to support grading a specific quiz artifact
- **File:** `LUSIA Studio - Backend/app/api/http/services/assignments_service.py`
- **Changes:**
  - When `payload.artifact_id` is provided: grade that specific quiz's submission
  - Load quiz questions for the specific artifact_id (not the first/only one)
  - Update the submission's task entry with grading results
  - Recompute overall grade (average of all quiz grades)
  - When not provided: legacy behavior (grade the single quiz)
- **Acceptance:** Teacher can grade individual quizzes within multi-attachment assignments. Overall grade recomputes correctly.

### Subtask 6: Backend router — adjust update endpoints

- **What:** Ensure router passes new `artifact_id` field through to service
- **File:** `LUSIA Studio - Backend/app/api/http/routers/assignments.py`
- **Changes:** Minimal — the Pydantic schemas handle parsing. Just verify the router delegates correctly with the updated schemas.
- **Acceptance:** Router compiles. New schema fields pass through to service.

### Subtask 7: Frontend types — update interfaces

- **What:** Update TypeScript interfaces for Assignment and related types
- **File:** `LUSIA Studio - Frontend/lib/assignments.ts`
- **Changes:**
  - `Assignment` interface: `artifact_id: string | null` → `artifact_ids: string[]`, `artifact?` → `artifacts?: Array<{id: string; artifact_type: string; artifact_name: string; icon: string | null}>`
  - `AssignmentCreate` interface: `artifact_id?: string` → `artifact_ids?: string[]`
  - `StudentAssignment` interface: no structural change (progress/submission are `Record<string, any>`), but add helper types/functions for per-task access
  - Add helper: `getTaskStatus(submission, progress, artifactId): "not_started" | "in_progress" | "completed" | "graded"`
  - Add helper: `getTaskGrade(submission, artifactId): number | null`
  - Add helper: `isAssignmentFullyCompleted(submission, artifactIds): boolean`
  - Update `createAssignment()` to send `artifact_ids`
  - Update `updateStudentAssignment()` to accept and send `artifact_id` (which task)
  - Update `gradeStudentAssignment()` to accept and send `artifact_id` (which quiz)
- **Acceptance:** All type changes compile. Helpers exist for per-task data access.

### Subtask 8: Frontend API routes — update proxies

- **What:** Verify API route proxies pass through new fields correctly
- **Files:** `LUSIA Studio - Frontend/app/api/assignments/route.ts`, `app/api/student-assignments/[id]/route.ts`, `app/api/student-assignments/[id]/grade/route.ts`
- **Changes:** These are thin proxies that forward JSON body unchanged — likely no changes needed. Verify the POST body for creating assignments passes `artifact_ids` correctly.
- **Acceptance:** API routes forward all new fields transparently.

### Subtask 9: Frontend query module — type + cache updates

- **What:** Update query module to reflect new types
- **File:** `LUSIA Studio - Frontend/lib/queries/assignments.ts`
- **Changes:**
  - All cache operations (`upsertAssignmentInQueries`, `removeAssignmentFromQueries`, etc.) work with the updated `Assignment` type (no logic changes needed — they operate on the whole object)
  - `mergeStudentAssignmentIntoQueries()` works unchanged (operates on `StudentAssignment` objects)
  - Verify `shouldIncludeAssignmentInQuery()` doesn't reference `artifact_id`
- **Acceptance:** Query module compiles with updated types. Cache operations work.

### Subtask 10: Create dialog — multi-select with ordering

- **What:** Replace single artifact picker with an ordered multi-select (max 3), "Add document" button pattern
- **File:** `LUSIA Studio - Frontend/components/assignments/CreateAssignmentDialog.tsx`
- **Changes:**
  - State: `artifactId: string | null` → `selectedArtifacts: Array<{id: string; artifact_type: string; artifact_name: string; icon: string | null}>` (max 3)
  - Remove single-select popover. Add "Adicionar documento" button that opens artifact picker popover
  - Picker popover filters out already-selected artifacts
  - Selected artifacts shown as numbered list (1, 2, 3) with:
    - Artifact icon + name
    - Remove (X) button
    - Drag handle for reordering (use existing dnd-kit from the project)
  - Submit sends `artifact_ids: selectedArtifacts.map(a => a.id)`
  - Auto-title: if any selected artifact is quiz/exercise_sheet, auto-fill title from the first one (only if title is empty)
  - `preselectedArtifact` prop: still works, pre-populates the list with one artifact
  - Validation: at least 1 student required, artifacts optional (can be 0–3)
- **Acceptance:** Teacher can add up to 3 documents. Documents appear numbered and ordered. Drag-to-reorder works. Remove button works. Picker excludes already-selected. Form submits `artifact_ids` array.

### Subtask 11: Kanban card — artifact count badge

- **What:** Replace single artifact name display with type icons + count badge
- **File:** `LUSIA Studio - Frontend/components/assignments/KanbanCard.tsx`
- **Changes:**
  - Where it currently shows `artifact.artifact_name`, show instead:
    - Row of artifact type icons (from `assignment.artifacts` array)
    - If `artifacts.length > 0`: text like "1 documento" / "2 documentos" / "3 documentos"
  - Both compact and normal views updated
- **Acceptance:** Card shows artifact type icons and count. No artifact names on cards (too long for multi).

### Subtask 12: Teacher detail panel — multi-artifact overview with quiz tabs

- **What:** Update detail panel header and content tabs to handle multiple artifacts
- **File:** `LUSIA Studio - Frontend/components/assignments/AssignmentDetailPanel.tsx`
- **Changes:**
  - **Header:** Show list of attached artifacts with icons/names (small, compact)
  - **Students tab:** For each student submission, show per-task completion status:
    - Non-quiz tasks: tag "Concluído" / "Pendente"
    - Quiz tasks: show grade (score %)
  - **Quiz tabs:** If multiple quizzes among artifacts, add sub-tabs to switch between quiz question views. Each tab loads that quiz's questions via `fetchArtifact(artifactId)` + `fetchQuizQuestions()`
  - **Insights tab (quiz stats):** If multiple quizzes, show stats per quiz with tab selector
  - **Non-quiz artifacts:** No question view needed — just completion tracking
  - `StudentSubmissionDialog`: Add `artifactId` prop to specify which quiz submission to review. Load questions for that specific quiz.
- **Also update:** `AssignmentsPage.tsx` — the `onCreated` callback now receives assignment with `artifact_ids`/`artifacts` instead of `artifact_id`/`artifact`
- **Acceptance:** Panel shows all attachments. Quiz tabs switch between different quiz questions/stats. Per-student view shows task-level completion. Teacher can review and grade each quiz separately.

### Subtask 13: Student preview panel — task list

- **What:** Replace single-artifact view with an ordered task list
- **File:** `LUSIA Studio - Frontend/components/assignments/AssignmentPreviewPanel.tsx`
- **Changes:**
  - Instead of a single "Fazer quiz" / "Ler nota" button, show an ordered task list:
    - Each task is a row with: number (1, 2, 3), icon, label, status indicator
    - Non-quiz: "Abrir {artifact_name}" — tag style, clickable → opens ArtifactViewerDialog → marks task as done on close
    - Quiz: "Resolver {artifact_name}" — tag style, clickable → opens StudentQuizFullPage for that specific quiz
    - Completed tasks: checkmark / strikethrough / muted style
  - Overall assignment status bar: "2 de 3 tarefas concluídas"
  - "Marcar como concluído" button only appears when there are non-quiz-only tasks that need manual completion. For quizzes, submission auto-completes the task.
  - Grade display: show per-quiz grades below completed quiz tasks (e.g., "85%")
  - When all tasks done: show completion state
- **Acceptance:** Student sees ordered task list. Can interact with each task independently. Completed tasks show as done. Quizzes show grades.

### Subtask 14: Student quiz page — per-artifact quiz flow

- **What:** Update StudentQuizFullPage to handle a specific artifact within a multi-attachment assignment
- **File:** `LUSIA Studio - Frontend/components/assignments/StudentQuizFullPage.tsx`
- **Changes:**
  - Add `artifactId` prop to specify which quiz to load (instead of reading from `assignment.artifact_id`)
  - Load questions from the specific artifact (not the assignment's single artifact)
  - Autosave: `updateStudentAssignment({ artifact_id: artifactId, progress: { answers } })`
  - Submit: `updateStudentAssignment({ artifact_id: artifactId, submission: { answers }, status: "submitted" })`
  - On submit success: callback to parent to refresh task list status
  - Review mode: load grading results from `submission[artifactId].grading`
- **Acceptance:** Quiz page works for a specific artifact within a multi-attachment assignment. Autosave and submit target the correct task.

### Subtask 15: Student assignments page — multi-artifact flow

- **What:** Update StudentAssignmentsPage to handle multi-artifact assignments
- **File:** `LUSIA Studio - Frontend/components/assignments/StudentAssignmentsPage.tsx`
- **Changes:**
  - Assignment card display: show task count (e.g., "3 tarefas")
  - When viewing artifact (ArtifactViewerDialog): pass specific `artifactId`, on close mark that task as done via `updateStudentAssignment({ artifact_id })`
  - When opening quiz: pass specific `artifactId` to `StudentQuizFullPage`
  - Mark-as-done toast: only for non-quiz individual tasks, not the whole assignment
  - Overall assignment completion: when the last task is completed, show completion state
  - Status filter (pending/completed): an assignment is "completed" when ALL tasks are done
- **Acceptance:** Multi-artifact assignments display task count. Each task can be completed independently. Overall completion works.

### Subtask 16: Fix non-quiz grade display

- **What:** Even for single-attachment assignments, do NOT display grades if the attachment is not a quiz
- **Files:** Multiple — anywhere grades are displayed for assignments
  - `KanbanCard.tsx` — if showing grade, only for quiz-type artifacts
  - `AssignmentDetailPanel.tsx` — grade column only for quiz submissions
  - `AssignmentPreviewPanel.tsx` — grade display only for quiz tasks
  - `StudentAssignmentsPage.tsx` — grade on cards only for quiz assignments
- **Changes:** Add check: only show grade/score UI when at least one artifact is a quiz type (`artifact_type === "quiz"` or `artifact_type === "exercise_sheet"`)
- **Acceptance:** Non-quiz assignments show no grade anywhere. Quiz assignments show per-quiz grades.

### Subtask 17: Doc updates

- **What:** Update feature and data documentation
- **Files:**
  - `docs/features/assignments.md` — update Architecture, Cache Contract, Payload Shapes, Database sections. Document task list model, per-artifact tracking, multi-attachment support.
  - `docs/data/assignments.md` — update `assignments` table: `artifact_id` → `artifact_ids uuid[]`. Add GIN index. Update access patterns and SELECT constants. Document progress/submission keyed format.
- **Acceptance:** Docs accurately reflect the new multi-attachment model.

## Doc Updates Required

- [ ] Update `docs/features/assignments.md` — multi-attachment architecture, task list model, per-artifact tracking
- [ ] Update `docs/data/assignments.md` — `artifact_ids` column, keyed progress/submission format, new index

## Verification

- [ ] Existing single-attachment assignments load and work correctly after migration
- [ ] Teacher can create assignment with 0, 1, 2, or 3 attachments
- [ ] Teacher can reorder attachments in create dialog
- [ ] Kanban card shows artifact icons + count badge
- [ ] Teacher detail panel shows all attachments, quiz tabs work, per-student task completion visible
- [ ] Student sees ordered task list in preview panel
- [ ] Student can open non-quiz docs and they mark as done
- [ ] Student can take each quiz independently, each gets its own grade
- [ ] Assignment is "completed" only when all tasks are done
- [ ] Auto-grading works per-quiz (not combined)
- [ ] Teacher can grade/override each quiz independently
- [ ] Non-quiz assignments show NO grade (even single-attachment)
- [ ] Legacy student_assignments (old flat format) still work
- [ ] Code compiles: `npx tsc --noEmit`
- [ ] Feature follows STANDARDS.md principles
