---
last-updated: 2026-03-19
stability: frequently-updated
agent-routing: "Read before working on assignments feature code."
---

# Assignments

## 1. Overview

Assignments (internally called "TPC") allow teachers and admins to create homework tasks, attach artifacts (quizzes, notes, exercise sheets, uploaded files), assign them to students, and track submissions. Teachers manage assignments through a Kanban board with three virtual columns (Active, To Review, Closed) and can publish, close, grade, and delete assignments. Students see their assigned work in a card-based list, can take quizzes inline, submit progress, and view grades once released. The system supports auto-grading for quiz-type assignments (multiple choice, true/false, fill-blank, matching, ordering, short answer, multiple response) with teacher override capability.

## 2. Availability

| Attribute | Value |
|---|---|
| **Roles** | Admin (full — all org assignments, can filter by teacher), Teacher (full CRUD on own assignments), Student (view assigned + submit + view grades) |
| **Center types** | All (trial included) |
| **Teacher route** | `/dashboard/assignments` |
| **Student route** | `/student/assignments` |

**Role-based query filtering** (enforced in `assignments_service.list_assignments()`):
- **Admin:** sees all org assignments; optionally filtered by `teacher_id`
- **Teacher:** sees only assignments where `teacher_id == user.id`
- **Student:** sees only published assignments where `student_ids @> [user.id]`

## 3. Architecture

### 3.1 Route — Teacher: `app/(teacher)/dashboard/assignments/page.tsx`

Thin wrapper — renders `<TeacherAssignmentsEntryPage />`. No server-side data fetch.

### 3.1b Route — Student: `app/(student)/student/assignments/page.tsx`

Thin wrapper — renders `<StudentAssignmentsEntryPage />`. No server-side data fetch.

**Note:** Unlike the calendar, the assignments routes do not use server-side initial data fetching. Both entry pages use `useSessionStorageQuerySeed()` to persist query data in sessionStorage across client-side navigations, serving as a fast-paint cache seed.

### 3.2 Server Fetch — `lib/assignments.server.ts`

Two server-side fetch functions exist for potential SSR use:

- `fetchAssignmentsServer(status?, teacherId?)` — calls `GET /api/v1/assignments/` via `fetchBackendJsonServer()`, returns `Assignment[]`
- `fetchMyAssignmentsServer()` — calls `GET /api/v1/assignments/student-assignments/mine` via `fetchBackendJsonServer()`, returns `StudentAssignment[]`

These are available but **not currently used by the route pages** — the entry pages use client-side fetching with sessionStorage seeding instead.

### 3.3 Entry Pages (Shell-equivalent)

The assignments feature uses two entry-page components that serve as the shell layer:

**`TeacherAssignmentsEntryPage`** (`components/assignments/TeacherAssignmentsEntryPage.tsx`):
- Uses `useSessionStorageQuerySeed()` to persist/restore assignment data across navigations
- Calls `useAssignmentsQuery(null, seededData, true, undefined, seededUpdatedAt, ["draft", "published"])` to fetch draft + published assignments
- Persists snapshot to sessionStorage on data change
- Renders `<AssignmentsPage initialAssignments={data} />`

**`StudentAssignmentsEntryPage`** (`components/assignments/StudentAssignmentsEntryPage.tsx`):
- Uses `useSessionStorageQuerySeed()` for the student's assignments
- Calls `useMyAssignmentsQuery(seededData, seededUpdatedAt)`
- Renders `<StudentAssignmentsPage initialAssignments={data} />`

### 3.4 UI Components

**Component tree (Teacher):**

```
TeacherAssignmentsEntryPage
└── AssignmentsPage
    ├── KanbanBoard (dnd-kit DnD context)
    │   ├── KanbanColumn (Active / To Review / Closed)
    │   │   └── KanbanCard (sortable, draggable)
    │   └── DragOverlay → KanbanCardOverlay
    ├── CreateAssignmentDialog (lazy: dynamic import)
    │   └── StudentPicker (reused from calendar)
    ├── AssignmentDetailPanel (lazy: dynamic import)
    │   ├── StudentSubmissionDialog
    │   └── QuizStatsView
    └── ArchivedAssignmentsPanel
```

**Component tree (Student):**

```
StudentAssignmentsEntryPage
└── StudentAssignmentsPage
    ├── AssignmentPreviewPanel (lazy: dynamic import)
    ├── StudentQuizFullPage (lazy: dynamic import)
    └── ArtifactViewerDialog (lazy: dynamic import)
```

**Lazy-loaded components:**
- `CreateAssignmentDialog` — via `dynamic()` in `AssignmentsPage.tsx`
- `AssignmentDetailPanel` — via `dynamic()` in `AssignmentsPage.tsx`
- `AssignmentPreviewPanel` — via `dynamic()` in `StudentAssignmentsPage.tsx`
- `StudentQuizFullPage` — via `dynamic()` in `StudentAssignmentsPage.tsx`
- `ArtifactViewerDialog` — via `dynamic()` in `StudentAssignmentsPage.tsx`

**Key component responsibilities:**

**AssignmentsPage** (`components/assignments/AssignmentsPage.tsx`):
- Owns `adminMode` state (`"centro"` = all org, `"eu"` = own assignments)
- Owns `selectedId` for the detail panel
- Owns `closedArchiveState` for paginated closed assignments archive
- Calls `useAssignmentsQuery()` for board data and `useAssignmentArchiveQuery()` for closed archive
- Handles status changes (publish/close) with optimistic updates: `snapshotAssignmentsQueries()` → `upsertAssignmentInQueries()` → API call → success/restore
- Handles deletion with `removeAssignmentFromQueries()`
- Prefetches submissions on assignment hover via `prefetchAssignmentSubmissionsQuery()`

**KanbanBoard** (`components/assignments/KanbanBoard.tsx`):
- Uses `@dnd-kit/core` for drag-and-drop between columns
- Three virtual columns: Active (draft + published not ready for review), To Review (published + deadline passed or all submitted), Closed
- `isReadyToReview()` determines column placement: deadline passed OR all students submitted
- Drop validation via `canDropIntoColumn()` — prevents invalid transitions

**AssignmentDetailPanel** (`components/assignments/AssignmentDetailPanel.tsx`):
- Side panel showing assignment detail, student submissions, quiz stats
- Calls `useAssignmentSubmissionsQuery(assignmentId)` to fetch student submissions
- Tabs: students (leaderboard/status views), insights (quiz stats chart), questions
- Handles teacher grading via `gradeStudentAssignment()` + `mergeStudentAssignmentIntoQueries()`
- Handles status change and deletion with optimistic cache sync

**StudentAssignmentsPage** (`components/assignments/StudentAssignmentsPage.tsx`):
- Card-based list with status filter (all / pending / completed)
- Calls `useMyAssignmentsQuery()` for student's assignments
- Opens quiz full page for quiz-type assignments
- Opens artifact viewer for non-quiz artifacts
- Handles autosave of progress via `updateStudentAssignment()` + `mergeStudentAssignmentIntoQueries()`

### 3.5 Next.js API Routes

All thin auth proxies:

**`app/api/assignments/route.ts`:**
- `GET` → `GET /api/v1/assignments/` with `status`, `teacher_id`, `statuses` params
- `POST` → `POST /api/v1/assignments/`

**`app/api/assignments/[id]/route.ts`:**
- `GET` → `GET /api/v1/assignments/{id}`
- `DELETE` → `DELETE /api/v1/assignments/{id}`
- `PATCH` → `PATCH /api/v1/assignments/{id}/status` (status update)

**`app/api/assignments/[id]/students/route.ts`:**
- `GET` → `GET /api/v1/assignments/{id}/students`

**`app/api/assignments/archive/route.ts`:**
- `GET` → `GET /api/v1/assignments/archive` with `teacher_id`, `closed_after`, `offset`, `limit` params

**`app/api/assignments/mine/route.ts`:**
- `GET` → `GET /api/v1/assignments/student-assignments/mine`

**`app/api/student-assignments/[id]/route.ts`:**
- `PATCH` → `PATCH /api/v1/assignments/student-assignments/{id}`

**`app/api/student-assignments/[id]/grade/route.ts`:**
- `PATCH` → `PATCH /api/v1/assignments/student-assignments/{id}/grade`

### 3.6 Backend Router — `routers/assignments.py`

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| `GET` | `/` | `get_current_user` | `list_assignments()` — role-aware |
| `GET` | `/archive` | `get_current_user` | `list_assignment_archive()` — paginated closed assignments |
| `POST` | `/` | `require_teacher` | `create_assignment()` |
| `GET` | `/{assignment_id}` | `get_current_user` | `get_assignment_detail()` |
| `DELETE` | `/{assignment_id}` | `require_teacher` | `delete_assignment()` — 204 no content |
| `PATCH` | `/{assignment_id}/status` | `require_teacher` | `update_assignment_status()` |
| `GET` | `/{assignment_id}/students` | `require_teacher` | `list_student_assignments()` |
| `GET` | `/student-assignments/mine` | `get_current_user` | `get_my_assignments()` |
| `PATCH` | `/student-assignments/{sa_id}` | `get_current_user` | `update_student_assignment()` |
| `PATCH` | `/student-assignments/{sa_id}/grade` | `require_teacher` | `teacher_grade_student_assignment()` |

### 3.7 Backend Service — `services/assignments_service.py`

**SELECT constants:**

```
ASSIGNMENT_LIST_SELECT:
  id, organization_id, teacher_id, class_id, student_ids,
  artifact_id, title, instructions, due_date,
  status, grades_released_at, created_at, updated_at

ASSIGNMENT_DETAIL_SELECT:
  (currently identical to ASSIGNMENT_LIST_SELECT)

STUDENT_ASSIGNMENT_SELECT:
  id, assignment_id, student_id, organization_id,
  progress, submission, grade, feedback,
  status, auto_graded, started_at, submitted_at,
  graded_at, created_at, updated_at
```

**`_batch_hydrate_assignment_summaries(db, assignments)`:**
Lightweight hydration for list/card views. Batch-fetches:
1. **Teacher names** — from `profiles` by `teacher_ids`
2. **Artifact metadata** — from `artifacts` by `artifact_ids` (fields: `id, artifact_type, artifact_name, icon`)
3. **Submitted counts** — from `student_assignments` by `assignment_ids`, counting rows with status `submitted` or `graded`

Attaches: `teacher_name`, `artifact`, `student_count` (from `len(student_ids)`), `submitted_count`.

**`_batch_hydrate_assignment_details(db, assignments)`:**
Full hydration. Calls `_batch_hydrate_assignment_summaries()` first, then additionally batch-fetches full student profiles (`id, full_name, display_name, avatar_url`) and attaches `students` array.

**Key business logic:**

- **Assignment lifecycle:** `draft` → `published` → `closed`. On close, `grades_released_at` is set to current UTC time.
- **Student assignment auto-creation:** `create_assignment()` auto-creates `student_assignments` rows for all `student_ids` after inserting the assignment.
- **Auto-grading:** When a student submits (`update_student_assignment()` with submission payload), the service loads quiz questions via `_load_quiz_questions_for_student_assignment()`, normalizes them via `_normalize_question_for_grading()`, and grades via `_grade_quiz_attempt()`. Grading supports 8 question types: `multiple_choice`, `true_false`, `fill_blank`, `matching`, `short_answer`, `multiple_response`, `ordering`. Auto-graded submissions are promoted to `"graded"` status.
- **Question normalization:** `_normalize_question_for_grading()` converts DB-stored label-based schemas (e.g., `solution: "B"`) to deterministic-ID-based schemas matching the frontend's format. This ensures consistent grading between server and client.
- **Teacher grading override:** `teacher_grade_student_assignment()` allows teachers to override individual question grades via `question_overrides: {question_id: bool}`, recompute the score, and set a manual grade/feedback.
- **Autosave guard:** `update_student_assignment()` rejects `409 Conflict` if a slow autosave tries to revert a `submitted` or `graded` assignment back to `in_progress`.
- **Ownership verification:** Delete and status-update verify `teacher_id` ownership. Teacher grading verifies the teacher owns the parent assignment.

**Student's own view (`get_my_assignments()`):**
Fetches `student_assignments` for the student, then batch-hydrates the parent `assignments` (only published/closed) with artifact info.

### 3.8 Backend Schemas — `schemas/assignments.py`

**AssignmentCreateIn:**
```
title: str | null
instructions: str | null
artifact_id: str | null
class_id: str | null
student_ids: list[str] | null
due_date: datetime | null
status: "draft" | "published" (default "draft")
```

**AssignmentStatusUpdate:**
```
status: "draft" | "published" | "closed"
```

**AssignmentSummaryOut (list view):**
```
id, organization_id, teacher_id, class_id, student_ids
artifact_id, title, instructions, due_date
status, grades_released_at, created_at, updated_at
# Hydrated:
teacher_name, artifact (dict), student_count, submitted_count
```

**AssignmentOut (detail view — extends AssignmentSummaryOut):**
```
# Additional hydrated:
students: list[dict] (full student profiles)
```

**StudentAssignmentOut:**
```
id, assignment_id, student_id, organization_id
progress (dict), submission (dict | null)
grade (float | null), feedback (str | null)
status: "not_started" | "in_progress" | "submitted" | "graded"
auto_graded (bool)
started_at, submitted_at, graded_at, created_at, updated_at
# Hydrated:
student_name, student_avatar
```

**StudentAssignmentUpdateIn:**
```
progress: dict | null
submission: dict | null
status: "in_progress" | "submitted" | null
```

**TeacherGradeIn:**
```
grade: float | null
feedback: str | null
question_overrides: dict[str, bool] | null
```

**AssignmentSummaryArchivePageOut:**
```
items: list[AssignmentSummaryOut]
next_offset: int | null
has_more: bool
```

## 4. Cache Contract

| Attribute | Value |
|---|---|
| **Query namespace** | `assignments:list:` (teacher list), `assignments:mine` (student list), `assignments:submissions:` (per-assignment submissions), `assignments:archive:` (closed archive) |
| **staleTime** | 60,000ms (1 minute) for all |

**List query keys (teacher):**

Pattern: `buildAssignmentsQueryKey(status?, teacherId?, statuses?)`

Shape: `assignments:list:{status ?? "*"}:{teacherId ?? "*"}:{statuses?.join(",") ?? "*"}`

Example: `assignments:list:*:*:draft,published`

**Student query key:**

Fixed key: `assignments:mine`

**Submissions query keys:**

Pattern: `buildAssignmentSubmissionsQueryKey(assignmentId)`

Shape: `assignments:submissions:{assignmentId}`

**Archive query keys:**

Pattern: `buildAssignmentArchiveQueryKey(teacherId?, closedAfter?, offset, limit)`

Shape: `assignments:archive:{teacherId ?? "*"}:{closedAfter ?? "*"}:{offset}:{limit}`

**Invalidation rules:**

| Trigger | Action |
|---|---|
| Optimistic failure (status change, delete) | `restoreAssignmentsQueries(snapshots)` |
| After any mutation | `invalidateAssignmentsQueries()` forces refetch of all list queries |

**Mutation sync:**
- `upsertAssignmentInQueries(assignment)` — updates or inserts assignment into all matching list queries. Uses `shouldIncludeAssignmentInQuery()` to check if the assignment matches a query's status/teacher filters — removes it if it no longer belongs.
- `removeAssignmentFromQueries(assignmentId)` — removes from all list queries.
- `prependAssignmentToQuery(status, assignment, teacherId?, statuses?)` — inserts at the beginning of a specific query key.
- `mergeStudentAssignmentIntoQueries(updated)` — updates a student assignment in both `assignments:mine` and `assignments:submissions:{assignmentId}` caches.
- `patchAssignmentSubmissionsQuery(assignmentId, updater)` — directly updates submissions cache for a specific assignment.
- `patchMyAssignmentsQuery(updater)` — directly updates the student's "mine" cache.

**Prefetch behavior:**
- Submissions are prefetched on assignment hover/select via `prefetchAssignmentSubmissionsQuery(assignmentId)` in `AssignmentsPage`.
- Student assignments are prefetched via `prefetchMyAssignmentsQuery()`.

**SessionStorage seed:**
- Teacher entry page uses `useSessionStorageQuerySeed("assignments:teacher", scope, v2)` to persist/restore board data across navigations.
- Student entry page uses `useSessionStorageQuerySeed("assignments:student", "mine", v1)`.

**Snapshot/restore:**
- `snapshotAssignmentsQueries()` captures all entries under the `assignments:list:` prefix using `queryClient.getMatchingQueries()`.
- `restoreAssignmentsQueries(snapshots)` writes each snapshot back via `queryClient.setQueryData()`.

## 5. Optimistic Update Strategy

### Status Change (publish/close)

1. `snapshotAssignmentsQueries()`
2. `upsertAssignmentInQueries(optimisticAssignment)` — updates the assignment with new status in all matching list queries; `shouldIncludeAssignmentInQuery()` moves it out of queries it no longer matches
3. `PATCH /api/assignments/{id}` with `{ status }`
4. **Success:** `upsertAssignmentInQueries(serverResult)` — replaces optimistic with server data
5. **Failure:** `restoreAssignmentsQueries(snapshots)` + error toast

### Delete Assignment

1. `snapshotAssignmentsQueries()`
2. `removeAssignmentFromQueries(assignmentId)` — removes from all list queries
3. `DELETE /api/assignments/{id}`
4. **Success:** (cache already reflects deletion)
5. **Failure:** `restoreAssignmentsQueries(snapshots)` + error toast

### Create Assignment

1. `POST /api/assignments/` with payload
2. **Success:** `prependAssignmentToQuery(null, created, teacherId, statuses)` — adds to the relevant query
3. No optimistic pre-insertion (creation requires server to assign ID and hydrate)

### Student Submission / Progress Save

1. `PATCH /api/student-assignments/{id}` with `{ progress?, submission?, status? }`
2. **Success:** `mergeStudentAssignmentIntoQueries(updated)` — updates both `assignments:mine` and `assignments:submissions:{assignmentId}`
3. No pre-mutation snapshot (autosave is fire-and-forget; submission updates use server response)

### Teacher Grade

1. `PATCH /api/student-assignments/{id}/grade` with `{ grade?, feedback?, question_overrides? }`
2. **Success:** `mergeStudentAssignmentIntoQueries(updated)` + `patchAssignmentSubmissionsQuery()`
3. No pre-mutation snapshot

## 6. Payload Shapes

### Summary Payload (Kanban board / card view)

Used by `list_assignments()` with `ASSIGNMENT_LIST_SELECT` + `_batch_hydrate_assignment_summaries()`.

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Assignment ID |
| `organization_id` | `string` | Org scope |
| `teacher_id` | `string` | Owning teacher |
| `class_id` | `string \| null` | Optional class association |
| `student_ids` | `string[] \| null` | Raw student ID array |
| `artifact_id` | `string \| null` | Linked artifact (quiz, note, etc.) |
| `title` | `string \| null` | Assignment title |
| `instructions` | `string \| null` | Teacher instructions |
| `due_date` | `string \| null` | ISO datetime deadline |
| `status` | `string` | `draft`, `published`, or `closed` |
| `grades_released_at` | `string \| null` | When grades were released (set on close) |
| `created_at` | `string \| null` | Creation timestamp |
| `updated_at` | `string \| null` | Last update timestamp |
| **Hydrated:** | | |
| `teacher_name` | `string \| null` | Display name from profiles |
| `artifact` | `dict \| null` | `id, artifact_type, artifact_name, icon` |
| `student_count` | `int` | `len(student_ids)` — no profile fetch needed |
| `submitted_count` | `int` | Count of student_assignments with status submitted/graded |

### Detail Payload (assignment detail panel)

Used by `get_assignment_detail()` with `ASSIGNMENT_DETAIL_SELECT` + `_batch_hydrate_assignment_details()`. Extends summary with:

| Field | Type | Differs from summary |
|---|---|---|
| `students` | `list[dict]` | Full student profiles (`id, full_name, display_name, avatar_url`) |

**Note:** `ASSIGNMENT_DETAIL_SELECT` is currently identical to `ASSIGNMENT_LIST_SELECT`. The summary/detail split is purely in hydration — summary uses `_batch_hydrate_assignment_summaries()` (no student profiles), detail uses `_batch_hydrate_assignment_details()` (includes student profiles).

### Student Assignment Payload

Used by `list_student_assignments()` and `get_my_assignments()`:

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Student assignment ID |
| `assignment_id` | `string` | Parent assignment |
| `student_id` | `string` | Student |
| `progress` | `dict` | Saved in-progress answers |
| `submission` | `dict \| null` | Final submission (may include `grading` sub-object with per-question results) |
| `grade` | `float \| null` | 0–100 score |
| `feedback` | `string \| null` | Teacher feedback text |
| `status` | `string` | `not_started`, `in_progress`, `submitted`, `graded` |
| `auto_graded` | `bool` | Whether grade was computed by auto-grading |
| **Hydrated (teacher view):** | | |
| `student_name` | `string \| null` | Student display name |
| `student_avatar` | `string \| null` | Student avatar URL |
| **Hydrated (student view):** | | |
| `assignment` | `dict \| null` | Parent assignment with artifact info |

## 7. Database

### Tables Involved

| Table | Description |
|---|---|
| `assignments` | Core assignment records — title, instructions, status, linked artifact, student list, due date |
| `student_assignments` | Per-student assignment state — progress, submission, grade, feedback, auto-grading results |
| `artifacts` | Linked documents/quizzes — queried for metadata during hydration |
| `questions` | Quiz questions — loaded during auto-grading |
| `profiles` | User profiles — queried for teacher/student names during hydration |

Cross-reference: See `data/assignments.md` for full entity schemas.

### Indexes

| Index | Table | Columns | Serves |
|---|---|---|---|
| `idx_assignments_org_teacher_status_created_at` | `assignments` | `(organization_id, teacher_id, status, created_at DESC)` | Teacher's assignments filtered by status, ordered by recency |
| `idx_assignments_org_status_created_at` | `assignments` | `(organization_id, status, created_at DESC)` | Admin's all-org assignments filtered by status |
| `idx_assignments_student_ids_gin` | `assignments` | GIN on `student_ids` | Student membership lookups (`student_ids @> [user_id]` for student assignment view) |
| `idx_student_assignments_student_org_created_at` | `student_assignments` | `(student_id, organization_id, created_at DESC)` | Student's own assignments list |
| `idx_student_assignments_assignment_org_created_at` | `student_assignments` | `(assignment_id, organization_id, created_at DESC)` | Per-assignment submission list (teacher review) |
| `idx_profiles_class_ids_gin` | `profiles` | GIN on `class_ids` | Class member lookups (shared index, used by student picker) |

### Read Patterns

| Pattern | Index Used | Query Shape |
|---|---|---|
| Teacher's assignments by status | `idx_assignments_org_teacher_status_created_at` | `.eq("organization_id", org_id).eq("teacher_id", uid).in_("status", statuses).order("created_at", desc=True)` |
| Admin's all assignments by status | `idx_assignments_org_status_created_at` | `.eq("organization_id", org_id).in_("status", statuses).order("created_at", desc=True)` |
| Student's visible assignments | `idx_assignments_student_ids_gin` | `.eq("organization_id", org_id).eq("status", "published").contains("student_ids", [uid])` |
| Closed archive (paginated) | `idx_assignments_org_status_created_at` | `.eq("status", "closed").order("grades_released_at", desc=True).range(offset, offset+limit)` |
| Student's own submissions | `idx_student_assignments_student_org_created_at` | `.eq("student_id", uid).eq("organization_id", org_id).order("created_at", desc=True)` |
| Per-assignment submissions | `idx_student_assignments_assignment_org_created_at` | `.eq("assignment_id", aid).eq("organization_id", org_id).order("created_at")` |

## 8. Edge Cases and Notes

### Auto-Grading Pipeline

When a student submits, the service:
1. Loads the parent assignment's artifact
2. Extracts question IDs from artifact content (`_extract_question_ids()`)
3. Fetches questions from the `questions` table
4. Normalizes each question to deterministic-ID format (`_normalize_question_for_grading()`)
5. Grades each answer (`_grade_question()`)
6. Computes score as `(correct / total) * 100`
7. Enriches the submission with a `grading` object containing per-question results

**This grading logic is duplicated** — a client-side version exists in `lib/quiz.ts` (`gradeQuestion`). Changes must be mirrored in both places.

### Autosave vs Submission Race Condition

`update_student_assignment()` guards against a slow autosave PATCH reverting a submitted assignment back to `in_progress`. If the existing status is `submitted` or `graded` and the incoming status is `in_progress`, a `409 Conflict` is returned. This prevents data loss from concurrent autosave requests.

### Autosave Skips Grading

When `update_student_assignment()` receives only `progress` (no `submission`), it skips the auto-grading pipeline entirely. This avoids 3 unnecessary DB queries per autosave tick and prevents fluctuating grades during in-progress work.

### Kanban Column Logic

Assignments are distributed across three virtual columns based on computed state:
- **Active:** draft or published assignments that are NOT ready for review
- **To Review:** published assignments where deadline has passed OR all students have submitted
- **Closed:** assignments with status `closed`

The `isReadyToReview()` function checks: `due_date < now OR submitted_count >= student_count`.

### Closed Archive Pagination

Closed assignments use a separate paginated endpoint (`/archive`) with `offset`/`limit` pagination and optional `closed_after` filter for time-range scoping. The archive fetches `limit + 1` rows to determine `has_more`.

### SessionStorage Seeding

Both teacher and student entry pages use `useSessionStorageQuerySeed()` to persist query data in sessionStorage. This provides instant paint on client-side navigation without a server round-trip. The seed is versioned (`TEACHER_ASSIGNMENTS_STORAGE_VERSION = 2`, `STUDENT_ASSIGNMENTS_STORAGE_VERSION = 1`) to invalidate stale cached structures.

### No Server-Side Initial Data

Unlike the calendar (which server-fetches current week), assignment routes render client components that fetch on mount. The sessionStorage seed partially compensates for this by providing cached data on repeat visits within the same browser session.

### Question Normalization Complexity

`_normalize_question_for_grading()` handles 8 question types and must convert between label-based DB schemas (`solution: "B"`) and deterministic-ID-based schemas (`correct_answer: "qid__opt_B"`). This normalization includes generating stable IDs via `_deterministic_id(question_id, namespace, discriminator)` to match the frontend's `normalizeQuestionForEditor()`.

## 9. Reference Status

The assignments feature follows the calendar reference patterns with some notable differences:

| Pattern | Calendar (Reference) | Assignments |
|---|---|---|
| **Route bootstrap** | Server-side fetch → shell prop | Client-side fetch with sessionStorage seed |
| **Server fetch** | Used by route `page.tsx` | Available but unused — entry pages fetch client-side |
| **Shell orchestration** | `CalendarShell` owns all queries/mutations | `AssignmentsPage` + `TeacherAssignmentsEntryPage` split the role |
| **Summary/detail split** | Different SELECT constants | Same SELECT constant, split is in hydration functions |
| **Cache contract** | Complete (snapshot, restore, sync, invalidate) | Complete (snapshot, restore, upsert, remove, invalidate, merge) |
| **Optimistic mutations** | Full snapshot → apply → restore on all mutations | Snapshot → restore on status change and delete; fire-and-forget on create, submit, grade |
| **Prefetch** | Adjacent weeks, admin toggle | Submissions on hover/select |
| **Batch hydration** | Teacher, students (capped), subjects, session types | Teacher, artifacts, submitted counts (summary); + students (detail) |
| **Aligned indexes** | 5 indexes + GIN | 4 indexes + 2 GIN |
| **Lazy-loaded dialogs** | SessionFormDialog, SessionTypeManagerDialog | CreateAssignmentDialog, AssignmentDetailPanel, StudentQuizFullPage, ArtifactViewerDialog |

**Where assignments diverge from the reference:**
- No server-side initial data — uses sessionStorage seeding instead
- `ASSIGNMENT_DETAIL_SELECT` is identical to `ASSIGNMENT_LIST_SELECT` (split is hydration-only)
- Auto-grading adds significant backend complexity not present in calendar
- Two distinct user experiences (teacher Kanban board vs student card list) with separate entry pages
