---
last-updated: 2026-03-19
stability: semi-stable
agent-routing: "Read when working on calendar/sessions data layer."
---

# Calendar Domain Entities

Scheduled tutoring sessions, per-student session records, and session type reference data. This is the reference implementation domain — its patterns (batch hydration, role-aware filtering, summary/detail split) are the standard for all other domains.

---

## Table: `calendar_sessions`

**Purpose:** A scheduled tutoring session between a teacher and one or more students at a specific time, optionally recurring.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `organization_id` | uuid | Owning organization | FK → organizations(id), NOT NULL |
| `teacher_id` | uuid | Session teacher | FK → profiles(id), NOT NULL |
| `student_ids` | uuid[] | Students attending this session | Array of profile references |
| `class_id` | uuid | Optional classroom grouping | FK → classrooms(id) |
| `session_type_id` | uuid | Session type for pricing/categorization | FK → session_types(id) ON DELETE SET NULL |
| `starts_at` | timestamptz | Session start time | NOT NULL |
| `ends_at` | timestamptz | Session end time | NOT NULL |
| `title` | text | Session title/label | |
| `subject_ids` | uuid[] | Subjects covered in this session | Array of subject references |
| `teacher_notes` | text | Teacher's private notes | |
| `teacher_summary` | text | Teacher's post-session summary | |
| `teacher_artifact_ids` | uuid[] | Artifacts linked by teacher | Array of artifact references |
| `summary_generated_at` | timestamptz | When summary was generated | |
| `summary_status` | text | Summary generation status | DEFAULT 'pending', CHECK: 'pending', 'generating', 'done', 'failed' |
| `snapshot_student_price` | numeric(8,2) | Frozen student price at session creation | From session_type, migration 014 |
| `snapshot_teacher_cost` | numeric(8,2) | Frozen teacher cost at session creation | From session_type, migration 014 |
| `recurrence_group_id` | uuid | Groups recurring sessions together | Migration 015, nullable |
| `recurrence_index` | integer | Position in recurrence series (0-based) | Migration 015, nullable |
| `recurrence_rule` | jsonb | Recurrence definition (frequency, until, etc.) | Migration 015, nullable |
| `created_at` | timestamptz | Creation timestamp | DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | DEFAULT now() |

### Indexes

```
Index: idx_calendar_sessions_org_starts
Columns: (organization_id, starts_at)
Type: btree composite
Purpose: Serves: calendar week/month range queries — the primary list access pattern

Index: idx_calendar_sessions_org_teacher_starts
Columns: (organization_id, teacher_id, starts_at)
Type: btree composite
Purpose: Serves: teacher-scoped calendar view (teacher sees only their sessions)

Index: idx_calendar_sessions_org_recurrence_idx
Columns: (organization_id, recurrence_group_id, recurrence_index)
Type: btree composite partial (WHERE recurrence_group_id IS NOT NULL)
Purpose: Serves: recurrence group queries — "update this and all future" operations

Index: idx_sessions_type
Columns: (session_type_id)
Type: btree
Purpose: Serves: lookup by session type

Index: idx_sessions_recurrence_group
Columns: (recurrence_group_id)
Type: btree partial (WHERE recurrence_group_id IS NOT NULL)
Purpose: Serves: finding all sessions in a recurrence group

Index: idx_calendar_sessions_student_ids_gin
Columns: student_ids
Type: GIN
Purpose: Serves: student views — "show me sessions I'm in" via .contains()
```

### Relationships

- Each session belongs to one organization (`organization_id` → `organizations.id`).
- Each session has one teacher (`teacher_id` → `profiles.id`).
- Each session can have many students (stored as `student_ids` uuid array, not a join table — queried via GIN index).
- Each session optionally belongs to a classroom (`class_id` → `classrooms.id`).
- Each session optionally has a session type (`session_type_id` → `session_types.id`) — SET NULL on type deletion.
- Sessions with the same `recurrence_group_id` were created together as a recurring series. The `recurrence_index` orders them within the series.
- Each session can have per-student detail records in `student_sessions`.
- Price snapshots (`snapshot_student_price`, `snapshot_teacher_cost`) freeze the session type's pricing at creation time for financial accuracy.

### Access Patterns

**Service:** `calendar_service.py` (reference implementation)

```
SELECT constants:
SESSION_LIST_SELECT =
    "id,organization_id,teacher_id,student_ids,class_id,
     session_type_id,
     starts_at,ends_at,title,subject_ids,
     teacher_notes,teacher_summary,summary_status,
     recurrence_group_id,recurrence_index,recurrence_rule"

SESSION_DETAIL_SELECT =
    "id,organization_id,teacher_id,student_ids,class_id,
     session_type_id,snapshot_student_price,snapshot_teacher_cost,
     starts_at,ends_at,title,subject_ids,
     teacher_notes,teacher_summary,teacher_artifact_ids,
     summary_status,recurrence_group_id,recurrence_index,
     recurrence_rule,created_at,updated_at"
```

- **List by org + date range:** `.eq("organization_id", org_id).gte("starts_at", start).lte("ends_at", end).order("starts_at")` — calendar week/month view.
- **Teacher-scoped list:** Adds `.eq("teacher_id", user_id)` for teacher role.
- **Student-scoped list:** Uses `.contains("student_ids", [user_id])` for student role.
- **Admin list:** No teacher/student filter — sees all org sessions. Optionally filters by `teacher_id`.
- **Detail by ID:** `.eq("organization_id", org_id).eq("id", session_id).limit(1)` with `SESSION_DETAIL_SELECT`.
- **Recurrence group fetch:** `.eq("organization_id", org_id).eq("recurrence_group_id", group_id).gte("recurrence_index", cutoff)` — for "this and future" operations.
- **Create single:** `.insert({...})` followed by `student_sessions` insert for each student.
- **Create batch (recurrence):** Bulk `.insert(session_rows)` then bulk `.insert(student_session_rows)` with compensating rollback.
- **Update single:** `.update({...}).eq("organization_id", org_id).eq("id", session_id)`.
- **Update recurrence group:** `.update({...}).eq("organization_id", org_id).eq("recurrence_group_id", group_id).gte("recurrence_index", cutoff)`.
- **Delete single:** `.delete().eq("organization_id", org_id).eq("id", session_id)` — preceded by `student_sessions` cleanup.
- **Delete future in group:** `.delete().in_("id", future_ids)` — batch delete future recurring sessions.
- **Batch hydration:** `_batch_hydrate_sessions()` resolves teacher_ids → profiles, student_ids → profiles, subject_ids → subjects, session_type_ids → session_types in 4 batch queries.
- **Summary hydration:** `_batch_hydrate_session_summaries()` — same but caps students to 4 preview entries.
- **Result limit:** 500 for admin, 200 for others — guarded by `.limit(max_results)`.

---

## Table: `student_sessions`

**Purpose:** Per-student detail record for a calendar session. Stores individual student summaries and artifact links that are specific to one student's experience of the session.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `session_id` | uuid | Parent calendar session | FK → calendar_sessions(id), NOT NULL |
| `student_id` | uuid | The student this record is for | FK → profiles(id), NOT NULL |
| `organization_id` | uuid | Owning organization | NOT NULL |
| `student_summary` | text | AI-generated or teacher-written summary for this student | |
| `student_artifact_ids` | uuid[] | Artifacts linked to this student's session | |
| `summary_generated_at` | timestamptz | When summary was generated | |
| `summary_status` | text | Summary generation status for this student | DEFAULT 'pending', CHECK: 'pending', 'generating', 'done', 'failed' |
| `created_at` | timestamptz | Creation timestamp | DEFAULT now() |

### Indexes

```
Index: idx_student_sessions_session_id
Columns: (session_id)
Type: btree
Purpose: Serves: loading all student records for a given session
```

### Relationships

- Each student_session belongs to one calendar_session (`session_id` → `calendar_sessions.id`).
- Each student_session is for one student (`student_id` → `profiles.id`).
- Student_sessions are created in bulk when a session is created and deleted in bulk when a session is deleted (compensating pattern, not FK cascade from calendar_sessions).

### Access Patterns

**Service:** `calendar_service.py`

- **List by session:** `.eq("session_id", session_id)` — fetched when loading session detail.
- **Bulk create:** `.insert(student_rows)` — one row per student when a session is created.
- **Bulk delete by session:** `.delete().in_("session_id", session_ids)` — cleanup before session deletion.
- **Update student summary:** `.update({"student_summary": summary, "summary_status": status}).eq("session_id", session_id).eq("student_id", student_id)`.

---

## Table: `session_types`

**Purpose:** Org-scoped reference data for categorizing sessions with pricing information and visual styling. Each org can define their own session types (e.g., "Individual", "Group", "Exam Prep").

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `organization_id` | uuid | Owning organization | FK → organizations(id) ON DELETE CASCADE, NOT NULL |
| `name` | text | Session type display name | NOT NULL |
| `description` | text | Optional description | |
| `student_price_per_hour` | numeric(8,2) | Price charged to student per hour | NOT NULL, DEFAULT 0 |
| `teacher_cost_per_hour` | numeric(8,2) | Cost paid to teacher per hour | NOT NULL, DEFAULT 0 |
| `color` | text | Display color (hex or named) | |
| `icon` | text | Display icon identifier | |
| `is_default` | boolean | Whether this is the org's default type | DEFAULT false |
| `active` | boolean | Whether this type is available for new sessions | DEFAULT true |
| `created_at` | timestamptz | Creation timestamp | DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | DEFAULT now() |

### Indexes

```
Index: idx_session_types_org
Columns: (organization_id, active)
Type: btree composite
Purpose: Serves: listing active session types for an organization

Index: idx_session_types_default (UNIQUE)
Columns: (organization_id)
Type: btree partial (WHERE is_default = true)
Purpose: Serves: enforcing exactly one default session type per org
```

### Relationships

- Each session type belongs to one organization (`organization_id` → `organizations.id`).
- Calendar sessions reference a session type via `calendar_sessions.session_type_id` → `session_types.id` (SET NULL on delete).
- When a session is created, the session type's pricing is snapshot into `snapshot_student_price` and `snapshot_teacher_cost` on the session — decoupling session pricing from future type changes.

### Access Patterns

**Service:** `session_types_service.py`

```
SELECT constant:
SESSION_TYPE_SELECT =
    "id,organization_id,name,description,
     student_price_per_hour,teacher_cost_per_hour,
     color,icon,is_default,active,created_at,updated_at"
```

- **List by org:** `.eq("organization_id", org_id).order("is_default", desc=True).order("name")` — default type listed first.
- **List active only:** Adds `.eq("active", True)`.
- **Get by ID:** `.eq("organization_id", org_id).eq("id", type_id).limit(1)`.
- **Create:** `.insert({...})` — if `is_default`, clears default on all other types first via `_clear_default()`.
- **Update:** `.update({...}).eq("organization_id", org_id).eq("id", type_id)`.
- **Soft delete:** `.update({"active": False, "is_default": False}).eq("id", type_id)`.
- **Batch hydration (from calendar):** `.select("id,name,color,icon,student_price_per_hour,teacher_cost_per_hour").in_("id", type_ids)` — called by calendar service during session hydration.

### RLS Policies

- `session_types_org_read`: FOR SELECT — org members can read their org's session types.
- `session_types_org_write`: FOR ALL — admin and teacher roles can manage session types.

---

## Domain Relationships Summary

The calendar domain has three tightly coupled tables. `calendar_sessions` is the primary entity, storing the scheduled event with teacher, students (as uuid array), time range, and optional recurrence. `student_sessions` provides per-student detail (summaries, artifacts) as a child table — one row per student per session. `session_types` is reference data that provides categorization and pricing, with prices snapshot onto sessions at creation time for financial immutability. The calendar service (`calendar_service.py`) is the reference implementation for the batch hydration, role-aware filtering, and summary/detail split patterns used across the codebase. See `features/calendar.md` for the full feature architecture.
