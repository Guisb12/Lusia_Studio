---
last-updated: 2026-03-21
stability: semi-stable
agent-routing: "Read when working on assignments data layer."
---

# Assignments Domain Entities

Teacher-created assignments/homework and per-student submission tracking. Assignments link to up to 3 artifacts (documents/quizzes), each becoming a task for students, and track a lifecycle from draft through grading.

---

## Table: `assignments`

**Purpose:** A teacher-created assignment that distributes up to 3 artifacts (quizzes, exercise sheets, notes) to selected students with an optional due date and lifecycle status. Each attached artifact becomes a separate task for the student.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `organization_id` | uuid | Owning organization | FK → organizations(id), NOT NULL |
| `teacher_id` | uuid | Assigning teacher | FK → profiles(id), NOT NULL |
| `class_id` | uuid | Optional classroom scope | FK → classrooms(id) |
| `student_ids` | uuid[] | Students assigned to this assignment | Array of profile references |
| `artifact_ids` | uuid[] | Linked documents/quizzes (up to 3) | Array of FK → artifacts(id) |
| `title` | text | Assignment title | |
| `instructions` | text | Teacher instructions for students | |
| `due_date` | timestamptz | Optional submission deadline | |
| `status` | text | Assignment lifecycle status | CHECK: 'draft', 'published', 'closed' |
| `grades_released_at` | timestamptz | When grades were made visible to students | Set on close if not already set |
| `created_at` | timestamptz | Creation timestamp | DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | DEFAULT now() |

### Indexes

```
Index: idx_assignments_org_teacher_status_created_at
Columns: (organization_id, teacher_id, status, created_at DESC)
Type: btree composite
Purpose: Serves: teacher's assignment list — filtered by status, sorted by recency

Index: idx_assignments_org_status_created_at
Columns: (organization_id, status, created_at DESC)
Type: btree composite
Purpose: Serves: admin assignment list — all org assignments by status and recency

Index: idx_assignments_student_ids_gin
Columns: student_ids
Type: GIN
Purpose: Serves: student views — "show me assignments I'm included in" via .contains()

Index: idx_assignments_artifact_ids_gin
Columns: artifact_ids
Type: GIN
Purpose: Serves: artifact reference lookups — e.g., checking if an artifact is used in any assignment before deletion
```

### Relationships

- Each assignment belongs to one organization (`organization_id` → `organizations.id`).
- Each assignment is created by one teacher (`teacher_id` → `profiles.id`).
- Each assignment optionally belongs to a classroom (`class_id` → `classrooms.id`).
- Each assignment optionally links to up to 3 artifacts (`artifact_ids` uuid array → `artifacts.id`) — the content students work on. Each artifact becomes a separate task.
- Students are assigned via `student_ids` uuid array (same pattern as calendar sessions — queried via GIN index, not a join table).
- Each assignment has many student_assignments — one per assigned student.
- Deleting an artifact that is referenced by any assignment's `artifact_ids` array raises a FK constraint error (409 response with user-friendly message).

### Access Patterns

**Service:** `assignments_service.py`

```
SELECT constants:
ASSIGNMENT_LIST_SELECT =
    "id,organization_id,teacher_id,class_id,student_ids,
     artifact_ids,title,instructions,due_date,
     status,grades_released_at,created_at,updated_at"

ASSIGNMENT_DETAIL_SELECT = ASSIGNMENT_LIST_SELECT
(Currently identical — planned to diverge when detail needs more fields)
```

- **List by org (teacher):** `.eq("organization_id", org_id).eq("teacher_id", user_id).order("created_at", desc=True)` — optionally filtered by `.in_("status", status_filters)`.
- **List by org (admin):** `.eq("organization_id", org_id)` — no teacher filter. Optionally adds `.eq("teacher_id", teacher_filter)`.
- **List by org (student):** `.eq("organization_id", org_id).eq("status", "published").contains("student_ids", [user_id])` — students only see published assignments they're included in.
- **Archive feed:** Adds `.range(offset, offset + limit)` for pagination.
- **Detail by ID:** `.eq("organization_id", org_id).eq("id", assignment_id).limit(1)`.
- **Create:** `.insert({...})` followed by bulk creation of `student_assignments` for each student_id.
- **Update:** `.update({...}).eq("organization_id", org_id).eq("id", assignment_id)`.
- **Status transition:** `.update({"status": new_status, ...}).eq("id", assignment_id)` — auto-sets `grades_released_at` on close.
- **Delete:** Deletes `student_assignments` first (child rows), then deletes the assignment.
- **Summary hydration:** `_batch_hydrate_assignment_summaries()` resolves teacher_ids → names, flattens all `artifact_ids` arrays into a single batch fetch for artifact summaries, and counts submitted student_assignments per assignment.
- **Detail hydration:** `_batch_hydrate_assignment_details()` adds full student profiles on top of summary hydration.

---

## Table: `student_assignments`

**Purpose:** Per-student assignment tracking record. Created automatically when an assignment is published. Tracks each student's progress, submission, grade, and feedback through the assignment lifecycle.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `assignment_id` | uuid | Parent assignment | FK → assignments(id), NOT NULL |
| `student_id` | uuid | The student this record tracks | FK → profiles(id), NOT NULL |
| `organization_id` | uuid | Owning organization | NOT NULL |
| `progress` | jsonb | Student's work-in-progress state | DEFAULT {} |
| `submission` | jsonb | Final submission data | |
| `grade` | numeric | Numeric grade (0-100 scale) | |
| `feedback` | text | Teacher's feedback on the submission | |
| `status` | text | Submission lifecycle status | DEFAULT 'not_started', CHECK: 'not_started', 'in_progress', 'submitted', 'graded' |
| `auto_graded` | boolean | Whether grade was auto-generated | DEFAULT false |
| `started_at` | timestamptz | When student first opened the assignment | |
| `submitted_at` | timestamptz | When student submitted | |
| `graded_at` | timestamptz | When teacher graded | |
| `created_at` | timestamptz | Record creation timestamp | DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | DEFAULT now() |

### Indexes

```
Index: idx_student_assignments_student_org_created_at
Columns: (student_id, organization_id, created_at DESC)
Type: btree composite
Purpose: Serves: student's assignment history — all assignments for a specific student

Index: idx_student_assignments_assignment_org_created_at
Columns: (assignment_id, organization_id, created_at DESC)
Type: btree composite
Purpose: Serves: teacher viewing all submissions for a specific assignment
```

### Relationships

- Each student_assignment belongs to one assignment (`assignment_id` → `assignments.id`).
- Each student_assignment is for one student (`student_id` → `profiles.id`).
- Student_assignments are created in bulk when an assignment is published (one per student in `student_ids`).
- Student_assignments are deleted in bulk before parent assignment deletion (explicit cleanup, not cascade).

### Access Patterns

**Service:** `assignments_service.py`

```
SELECT constant:
STUDENT_ASSIGNMENT_SELECT =
    "id,assignment_id,student_id,organization_id,
     progress,submission,grade,feedback,
     status,auto_graded,started_at,submitted_at,
     graded_at,created_at,updated_at"
```

- **List by assignment:** `.eq("assignment_id", assignment_id).eq("organization_id", org_id)` — teacher views all student submissions.
- **Get by student + assignment:** `.eq("assignment_id", assignment_id).eq("student_id", student_id).limit(1)` — student's own submission view.
- **List by student:** `.eq("student_id", student_id).eq("organization_id", org_id).order("created_at", desc=True)` — student's assignment history.
- **Bulk create:** `.insert(sa_rows)` — one row per student when assignment is published.
- **Update progress:** `.update({"progress": progress_data, "status": "in_progress", "started_at": now}).eq("id", sa_id)`.
- **Submit:** `.update({"submission": submission_data, "status": "submitted", "submitted_at": now}).eq("id", sa_id)`.
- **Grade:** `.update({"grade": grade, "feedback": feedback, "status": "graded", "graded_at": now}).eq("id", sa_id)` — teacher grades a submission. Validates teacher owns the parent assignment.
- **Submission count (for hydration):** `.select("assignment_id", count="exact").eq("assignment_id", aid).eq("status", "submitted")` — used in summary hydration to show "X of Y submitted".

---

## Domain Relationships Summary

Assignments connect teachers to students through content (artifacts). The `assignments` table stores the assignment definition (who, what, when) and supports up to 3 attached artifacts via the `artifact_ids` uuid array — each becoming a separate task for students. The `student_assignments` table tracks each student's individual journey (progress → submit → grade), with progress and submission data keyed by `artifact_id` for per-task tracking; the overall grade is the average of individual quiz grades. The two-table design mirrors calendar's session/student_session split. Assignments reference artifacts from the documents domain (`data/documents.md`) — deleting an in-use artifact is blocked with a 409 error. Both `student_ids` and `artifact_ids` use the array + GIN index pattern. The assignment lifecycle (draft → published → closed) gates student visibility: students only see published assignments they're included in.
