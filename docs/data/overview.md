---
last-updated: 2026-03-19
stability: stable
agent-routing: "Read before working on any data layer changes. Read before creating or updating entity docs."
---

# Database Architecture & Conventions

Single source of truth for how the LUSIA Studio data layer works: connection patterns, PostgREST access methods, naming conventions, index strategy, migration rules, and common query patterns. Individual table schemas are documented in domain-grouped entity files under `data/`.

---

## 1. Database Architecture

### Single Supabase PostgreSQL Instance (B2B)

The application uses one Supabase PostgreSQL instance (`SUPABASE_URL_B2B`) for all data. A second B2C instance existed historically for a content library but is now deprecated — `get_content_db()` redirects to the B2B client.

**Connection setup:** `app/core/database.py`
- Lazily initialized singleton clients via `get_b2b_db()`.
- Uses `supabase-py` (`create_client`) with the service key (`SUPABASE_SERVICE_KEY_B2B`), not the anon key.
- The service key bypasses RLS, which is correct for backend-to-DB access.

**Configuration:** `app/core/config.py`
- `SUPABASE_URL_B2B` and `SUPABASE_SERVICE_KEY_B2B` are required.
- `SUPABASE_KEY_B2B` (anon key) is optional and unused by the backend.
- B2C settings are optional and deprecated.

### Dependency Injection

`app/api/deps.py` defines role-based FastAPI dependencies:

| Dependency | Allowed Roles | Usage |
|------------|--------------|-------|
| `require_admin` | admin | Admin-only endpoints |
| `require_teacher` | admin, teacher | Teacher + admin endpoints |
| `require_student` | student | Student-only endpoints |
| `require_role([...])` | custom | Custom role combinations |

Services receive the Supabase `Client` directly from `get_b2b_db()` — there is no DI for the database client itself. Auth is handled by `get_current_user()` from `app/core/security.py`, which extracts and validates the JWT.

### Multi-Tenancy Model

Almost every table has an `organization_id` column (uuid, FK to `organizations`). All queries scope by organization, usually as the first filter:

```python
query = db.table("calendar_sessions").select(SELECT).eq("organization_id", org_id)
```

Exceptions: `chat_conversations` and `chat_messages` scope by `user_id` (FK to `auth.users`), not organization.

---

## 2. PostgREST Access Pattern Reference

The backend accesses PostgreSQL exclusively through the Supabase PostgREST client (`supabase-py`). No raw SQL is executed from application code.

### Read Operations

#### `.select(columns)`
Column selection. Supports nested selects via PostgREST syntax.

```python
# Star-less explicit columns (standard pattern)
db.table("assignments").select(ASSIGNMENT_LIST_SELECT).eq(...)

# Nested select (join via FK)
db.table("student_subject_enrollments").select(
    "id,student_id,subject_id,...,subjects(name,slug,color,icon,affects_cfs,has_national_exam)"
)

# Select with count
db.table("profiles").select(MEMBER_DETAIL_SELECT, count="exact")
```

**Services:** All services define explicit `SELECT` constants. See `calendar_service.py`, `assignments_service.py`, `artifacts_service.py`, `members_service.py`, `grades_service.py`.

#### `.eq(column, value)`
Equality filter. The most common filter — used on every query.

```python
# Organization scoping (calendar_service.py)
query.eq("organization_id", org_id)

# Role filtering (calendar_service.py)
query.eq("teacher_id", user_id)

# Status filtering (assignments_service.py)
query.eq("status", "published")
```

#### `.in_(column, values)`
IN filter. Used for batch lookups and multi-value filtering.

```python
# Batch fetch profiles for hydration (calendar_service.py)
db.table("profiles").select("id,full_name,display_name").in_("id", teacher_ids)

# Multi-status filtering (assignments_service.py)
query.in_("status", status_filters)

# Multi-role filtering (members_service.py)
query.in_("role", roles)
```

#### `.contains(column, value)`
Array containment (uses GIN indexes). Used for membership lookups on array columns.

```python
# Student sees sessions they're in (calendar_service.py)
query.contains("student_ids", [user_id])

# Class membership filtering (members_service.py)
query.contains("class_ids", [class_id_filter])

# Student sees published assignments they're included in (assignments_service.py)
query.contains("student_ids", [user_id])
```

#### `.gte(column, value)` / `.lte(column, value)`
Range filters. Used for date ranges and scope filtering.

```python
# Date range (calendar_service.py)
query.gte("starts_at", start_date)
query.lte("ends_at", end_date)

# Recurrence scope (calendar_service.py)
query.gte("recurrence_index", cutoff_index)
```

#### `.or_(filter_string)`
OR conditions using PostgREST filter syntax.

```python
# Own artifacts + public artifacts (artifacts_service.py)
query.or_(f"user_id.eq.{user_id},is_public.eq.true")

# Name search (calendar_service.py)
q.or_(f"full_name.ilike.%{safe_query}%,display_name.ilike.%{safe_query}%")
```

#### `.is_(column, value)`
IS filter for null checks and boolean equality.

```python
# Used in paginated_query helper (utils/db.py)
query.is_(col, val)  # e.g., is_("deleted_at", "null")
```

#### `.order(column, desc=)`
Result ordering.

```python
# Chronological (calendar_service.py)
query.order("starts_at", desc=False)

# Reverse chronological (assignments_service.py)
query.order("created_at", desc=True)
```

#### `.range(start, end)`
Offset-based pagination. Used via the `paginated_query` helper and directly.

```python
# Pagination helper (utils/db.py)
start = pagination.offset
end = start + pagination.per_page - 1
query.range(start, end)

# Archive feed (assignments_service.py)
query.range(safe_offset, safe_offset + safe_limit)
```

#### `.limit(n)`
Limit result count. Used for single-entity lookups and unbounded query guards.

```python
# Single entity (calendar_service.py)
query.limit(1)

# Guard unbounded requests (calendar_service.py)
query.limit(max_results)  # 500 for admin, 200 for others
```

### Write Operations

#### `.insert(data)`
Single and bulk insert. Bulk insert passes a list of dicts.

```python
# Single insert (calendar_service.py)
db.table("calendar_sessions").insert(insert_data)

# Bulk insert (calendar_service.py — batch creation)
db.table("calendar_sessions").insert(session_rows)  # list of dicts

# Bulk student_sessions (calendar_service.py)
db.table("student_sessions").insert(student_rows)
```

#### `.upsert(data)`
Not currently used in the codebase. Inserts with conflict resolution would use this.

#### `.update(data)`
Update with filters. Always paired with `.eq()` filters.

```python
# Single entity update (calendar_service.py)
db.table("calendar_sessions").update(update_data).eq("organization_id", org_id).eq("id", session_id)

# Scoped batch update (calendar_service.py — recurring sessions)
db.table("calendar_sessions").update(common_update_data)
    .eq("organization_id", org_id)
    .eq("recurrence_group_id", group_id)

# Soft-delete by status (members_service.py)
db.table("profiles").update({"status": "suspended"}).eq("organization_id", org_id).eq("id", member_id)
```

#### `.delete()`
Delete with filters. Always scoped by organization or ownership.

```python
# Single delete (calendar_service.py)
db.table("calendar_sessions").delete().eq("organization_id", org_id).eq("id", session_id)

# Batch delete by FK (calendar_service.py)
db.table("student_sessions").delete().in_("session_id", session_ids)

# Batch delete by ID list (calendar_service.py)
db.table("calendar_sessions").delete().in_("id", future_ids)
```

### Execution

#### `.execute()`
Executes the query. Used directly or via the `supabase_execute()` wrapper.

```python
# Direct (for non-critical secondary queries)
resp = db.table("profiles").select("id,full_name").in_("id", ids).execute()

# Via wrapper (for primary queries — raises HTTPException on failure)
response = supabase_execute(query, entity="calendar_session")
```

#### Error Handling

**`supabase_execute(query, entity=)`** — `app/utils/db.py`
- Wraps `.execute()` with try/except.
- Raises `HTTPException(500)` with a descriptive message on any failure.
- Used by all primary CRUD operations.

**`parse_single_or_404(response, entity=)`** — `app/utils/db.py`
- Returns `response.data[0]` or raises `HTTPException(404)`.
- Used for single-entity lookups (get by ID).

**`paginated_query()`** — `app/utils/db.py`
- Reusable helper for paginated list endpoints.
- Supports `eq` filters, `is_` filters, `contains` filters.
- Returns `PaginatedResponse(data, page, per_page, total)`.

### RPC

#### `.rpc(function_name, params)`
Not used directly in Python service code. RPC functions exist in the database (e.g., `get_student_recommendations` from migration 012) but are called from the frontend or are unused.

---

## 3. Table Naming Conventions

Derived from the live schema (24 tables in `public` schema).

### Table Names

- **snake_case**, always lowercase.
- **Plural** for entity tables: `profiles`, `classrooms`, `artifacts`, `assignments`, `subjects`, `questions`.
- **Compound names** use `{entity}_{qualifier}` pattern: `calendar_sessions`, `student_sessions`, `student_assignments`, `chat_conversations`, `chat_messages`, `document_jobs`.
- **Grades domain** uses a longer prefix pattern: `student_grade_settings`, `student_subject_enrollments`, `student_subject_periods`, `student_subject_cfd`, `student_annual_subject_grades`, `student_cfs_snapshot`, `subject_evaluation_elements`, `subject_evaluation_domains`.
- **Reference tables**: `session_types` (no entity prefix — org-scoped reference data).

### Column Naming

- **snake_case** throughout.
- **Primary key**: always `id uuid DEFAULT gen_random_uuid()`.
- **Foreign keys**: `{referenced_table_singular}_id` — e.g., `organization_id`, `teacher_id`, `student_id`, `session_id`, `artifact_id`, `enrollment_id`, `period_id`, `domain_id`, `settings_id`, `subject_id`, `parent_id`.
- **Array foreign keys**: `{referenced_table_singular}_ids` — e.g., `student_ids uuid[]`, `subject_ids uuid[]`, `class_ids uuid[]`, `teacher_artifact_ids uuid[]`.
- **Timestamps**: `created_at timestamptz DEFAULT now()`, `updated_at timestamptz DEFAULT now()`. Some tables add `deleted_at`, `started_at`, `completed_at`, `submitted_at`, `graded_at`, `grades_released_at`, `last_login_at`, `summary_generated_at`.
- **Booleans**: `is_` prefix for state flags (`is_active`, `is_locked`, `is_public`, `is_processed`, `is_default`, `is_overridden`, `is_finalized`, `is_exam_candidate`, `is_primary`). Exception: `active` (without prefix) on `classrooms`, `subjects`, `session_types`. Also `onboarding_completed`, `auto_graded`, `conversion_requested`, `processing_failed`.
- **Status columns**: `status text` with CHECK constraints for allowed values.
- **JSON columns**: `jsonb` type — `content`, `metadata`, `tiptap_json`, `recurrence_rule`, `progress`, `submission`, `tool_calls`, `cfd_snapshot`, `cumulative_weights`.
- **Numeric precision**: `numeric(8,2)` for monetary values (`hourly_rate`, `student_price_per_hour`), `numeric(6,4)` for grade calculations (`raw_calculated`, `cif_raw`), `numeric(5,2)` for weight percentages, `numeric(3,1)` for CFS.

### Soft Delete Patterns

Two patterns coexist:
1. **Status-based**: `profiles.status` set to `'suspended'` (via `remove_member()`). No `deleted_at` column on profiles.
2. **Timestamp-based**: `organizations.deleted_at` column exists but is not widely used.
3. **Hard delete**: Most entities use hard deletes (`DELETE` queries). Calendar sessions, assignments, artifacts, and their children are hard-deleted with cascading FK cleanup.

---

## 4. Index Strategy

### Composite Indexes

Used for multi-column filter patterns that match UI access patterns.

| Index | Table | Columns | Purpose |
|-------|-------|---------|---------|
| `idx_calendar_sessions_org_starts` | calendar_sessions | (organization_id, starts_at) | Calendar range queries |
| `idx_calendar_sessions_org_teacher_starts` | calendar_sessions | (organization_id, teacher_id, starts_at) | Teacher-scoped calendar |
| `idx_calendar_sessions_org_recurrence_idx` | calendar_sessions | (organization_id, recurrence_group_id, recurrence_index) | Recurrence group queries (partial: WHERE recurrence_group_id IS NOT NULL) |
| `idx_assignments_org_teacher_status_created_at` | assignments | (organization_id, teacher_id, status, created_at DESC) | Teacher assignment list |
| `idx_assignments_org_status_created_at` | assignments | (organization_id, status, created_at DESC) | Admin assignment list |
| `idx_classrooms_active` | classrooms | (organization_id, active) | Active classroom list |
| `idx_session_types_org` | session_types | (organization_id, active) | Session type list |
| `idx_document_jobs_artifact_status` | document_jobs | (artifact_id, status) | Pipeline polling |
| `idx_artifacts_org_user_processed` | artifacts | (organization_id, user_id, is_processed) | Processing status list |
| `idx_see_domain_period` | subject_evaluation_elements | (domain_id, period_number) | Domain element lookup (partial: WHERE domain_id IS NOT NULL) |
| `idx_periods_enrollment_number` | student_subject_periods | (enrollment_id, period_number) | Period lookup |
| `idx_profiles_active_students_org_name` | profiles | (organization_id, full_name) | Student search (partial: WHERE role='student' AND status='active') |

### GIN Indexes

For array containment queries (`@>` operator, `.contains()` in PostgREST).

| Index | Table | Column | Purpose |
|-------|-------|--------|---------|
| `idx_calendar_sessions_student_ids_gin` | calendar_sessions | student_ids | Student sees their sessions |
| `idx_assignments_student_ids_gin` | assignments | student_ids | Student sees their assignments |
| `idx_profiles_class_ids_gin` | profiles | class_ids | Class member filtering |
| `idx_artifacts_content` | artifacts | content (jsonb) | Content search |
| `idx_artifacts_curriculum` | artifacts | curriculum_codes | Curriculum code search |
| `idx_questions_curriculum` | questions | curriculum_codes | Curriculum code search |
| `idx_questions_content` | questions | content (jsonb) | Content search |
| `idx_profiles_active_students_full_name_trgm` | profiles | full_name (pg_trgm) | Fuzzy name search (partial) |
| `idx_profiles_active_students_display_name_trgm` | profiles | display_name (pg_trgm) | Fuzzy name search (partial) |

### Partial Indexes

Used to narrow index scope to relevant rows only.

| Index | WHERE clause | Purpose |
|-------|-------------|---------|
| `idx_calendar_sessions_org_recurrence_idx` | `recurrence_group_id IS NOT NULL` | Only recurring sessions |
| `idx_sessions_recurrence_group` | `recurrence_group_id IS NOT NULL` | Recurrence group lookup |
| `idx_artifacts_processing` | `source_type != 'native'` | Only uploaded files |
| `idx_classrooms_primary` | `is_primary = true` | Primary classroom lookup |
| `idx_document_jobs_status` | `status NOT IN ('completed','failed')` | Active jobs only |
| `idx_see_domain_period` | `domain_id IS NOT NULL` | Domain-based elements only |
| `idx_profiles_active_students_*` | `role='student' AND status='active'` | Active students only |
| `idx_session_types_default` | `is_default = true` | Unique default per org |

### Unique Indexes

| Index/Constraint | Columns | Purpose |
|-----------------|---------|---------|
| `idx_session_types_default` | (organization_id) WHERE is_default | One default session type per org |
| UNIQUE constraint | (student_id, academic_year) on student_grade_settings | One settings row per student per year |
| UNIQUE constraint | (student_id, subject_id, academic_year) on enrollments | One enrollment per subject per year |
| UNIQUE constraint | (enrollment_id, period_number) on periods | One period row per enrollment per period |
| UNIQUE constraint | (enrollment_id) on annual grades | One annual grade per enrollment |
| UNIQUE constraint | (student_id, subject_id, academic_year) on cfd | One CFD per subject per year |
| UNIQUE constraint | (student_id, academic_year) on cfs_snapshot | One CFS snapshot per year |

### Naming Convention

Index names follow the pattern `idx_{table_abbreviation}_{columns}`:
- Full table name: `idx_classrooms_org`, `idx_artifacts_type`
- Abbreviated: `idx_sgs_student` (student_grade_settings), `idx_sse_student_year` (student_subject_enrollments), `idx_ssp_enrollment` (student_subject_periods), `idx_see_period` (subject_evaluation_elements), `idx_sasg_enrollment` (student_annual_subject_grades), `idx_scfd_student` (student_subject_cfd), `idx_scs_student` (student_cfs_snapshot), `idx_sed_enrollment` (subject_evaluation_domains)

---

## 5. Migration Conventions

### Location

All migrations live in `LUSIA Studio - Backend/migrations/`.

### Numbering Scheme

Sequential three-digit prefix: `001_`, `002_`, ..., `020_`.

### File Naming

`{number}_{description}.sql` — description uses snake_case.

Examples: `001_classrooms.sql`, `007_grade_calculator.sql`, `016_calendar_perf_indexes.sql`.

### Known Numbering Issues

Two duplicate number prefixes exist:
- **Two `009_` files:** `009_teacher_hourly_rate.sql` and `009_exam_grade_raw.sql`
- **Two `017_` files:** `017_student_search_indexes.sql` and `017_calendar_student_ids_gin.sql`

Both pairs are independent (no conflicts), but new migrations should continue from `021_`.

### What Migrations Contain

| Operation | Examples |
|-----------|---------|
| `CREATE TABLE` | Most migrations (001-007, 014, 019) |
| `CREATE INDEX` | Standalone index migrations (010, 016, 017, 018, 020) and inline with table creation |
| `ALTER TABLE` | Column additions (003, 008, 009, 015, 019), constraint changes (011, 013) |
| `CREATE POLICY` | RLS policies (001, 004, 005, 006, 007, 014, 019) |
| `CREATE OR REPLACE FUNCTION` | RPC functions (012 — `get_student_recommendations`) |
| `INSERT INTO storage.buckets` | Storage bucket setup (004, 005) |
| `DROP TABLE CASCADE` | Table replacement (005 — artifacts/questions rebuild) |

### How to Create a New Migration

1. Create `migrations/{next_number}_{description}.sql` (next is `021_`).
2. Use `CREATE TABLE IF NOT EXISTS` or `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for idempotency.
3. Use `CREATE INDEX IF NOT EXISTS` for index creation.
4. Include RLS policies if the table stores user data.
5. Wrap multi-statement migrations in `BEGIN; ... COMMIT;` when atomicity is needed (see 007, 019).
6. Add `COMMENT ON COLUMN` for non-obvious columns.
7. Apply via Supabase SQL editor or `supabase db push`.

---

## 6. Common Query Patterns

### Organization-Scoped Queries

Almost every query starts with `.eq("organization_id", org_id)`. This is the first filter applied, matching composite indexes that lead with `organization_id`.

```python
query = db.table("calendar_sessions").select(SELECT).eq("organization_id", org_id)
```

**Exception:** Chat tables scope by `user_id`. Grades tables scope via ownership chains (enrollment → student_id).

### Batch Hydration Pattern

The standard pattern for avoiding N+1 queries when resolving foreign keys. Every service that returns lists follows this:

1. **Fetch primary entities** with explicit SELECT constants.
2. **Collect unique foreign IDs** across all results (teacher_ids, student_ids, subject_ids, etc.).
3. **Batch-fetch each type** with one `.in_("id", ids)` query per type.
4. **Build lookup maps** (`{id: row}`).
5. **Merge** hydrated data into the primary results.

```python
# Collect IDs
teacher_ids = list({s["teacher_id"] for s in sessions if s.get("teacher_id")})
# Batch fetch
teacher_map = {}
if teacher_ids:
    resp = db.table("profiles").select("id,full_name,display_name").in_("id", teacher_ids).execute()
    teacher_map = {row["id"]: row for row in (resp.data or [])}
# Merge
for session in sessions:
    session["teacher_name"] = teacher_map.get(session.get("teacher_id", ""))
```

**Services using this pattern:** `calendar_service.py` (sessions), `assignments_service.py` (assignments), `artifacts_service.py` (artifacts), `members_service.py` (member sessions/assignments).

### Summary vs Detail SELECT Constants

Every service defines two (or more) SELECT constant strings that control payload size:

| Service | Summary | Detail |
|---------|---------|--------|
| Calendar | `SESSION_LIST_SELECT` (no snapshots, no audit) | `SESSION_DETAIL_SELECT` (+ snapshots, created_at, updated_at) |
| Assignments | `ASSIGNMENT_LIST_SELECT` | `ASSIGNMENT_DETAIL_SELECT` (currently same, planned to diverge) |
| Artifacts | `ARTIFACT_SUMMARY_SELECT` (no content/tiptap/markdown) | `ARTIFACT_DETAIL_SELECT` (+ content, tiptap_json, markdown_content) |
| Members | `MEMBER_LIST_SELECT` (no parent info, no phone) | `MEMBER_DETAIL_SELECT` (+ parent_*, phone, school_name, subjects_taught) |
| Grades | `ENROLLMENT_BOARD_SELECT` (with nested subject join) | N/A (uses per-entity detail endpoints) |

### Pagination Pattern

Two approaches coexist:

**1. `paginated_query()` helper** — for endpoints with page/per_page params:
```python
paginated_query(db, "profiles", select=SELECT, filters={...}, pagination=pagination)
# Returns PaginatedResponse(data, page, per_page, total)
```

**2. Manual `.range()` / `.limit()`** — for cursor-style or simpler pagination:
```python
query.range(offset, offset + limit)
```

### Role-Aware Filtering

Services apply different filters based on the user's role:

```python
if role == "student":
    query = query.contains("student_ids", [user_id])     # array membership
elif role == "teacher":
    query = query.eq("teacher_id", user_id)               # ownership
elif role == "admin":
    if teacher_id_filter:
        query = query.eq("teacher_id", teacher_id_filter) # optional filter
    # else: admin sees all
```

**Services using this:** `calendar_service.py`, `assignments_service.py`, `members_service.py`, `grades_service.py`.

### Error Handling on Queries

Two-tier approach:

1. **`supabase_execute(query, entity=)`** wraps `.execute()` and raises `HTTPException(500)` on any database error with a descriptive message.
2. **`parse_single_or_404(response, entity=)`** checks `response.data` and raises `HTTPException(404)` if empty.

For non-critical secondary queries (hydration), services use bare try/except to silently degrade:

```python
try:
    resp = db.table("profiles").select(...).in_("id", ids).execute()
    teacher_map = {row["id"]: row for row in (resp.data or [])}
except Exception:
    logger.warning("Failed to fetch teacher profiles for hydration")
```

This ensures a hydration failure doesn't block the primary response.

### Compensating Rollback

For multi-table writes without true transactions, the codebase uses compensating rollback:

```python
# Create session
session = db.table("calendar_sessions").insert(data).execute()

# Create related rows
try:
    db.table("student_sessions").insert(student_rows).execute()
except Exception:
    # Rollback: delete the orphaned parent
    db.table("calendar_sessions").delete().eq("id", session["id"]).execute()
    raise HTTPException(500, detail="Failed. Rolled back.")
```

**Used by:** `calendar_service.py` (create_session, create_session_batch), `assignments_service.py` (create_assignment).

---

## 7. Table Inventory

All 24 tables in the `public` schema with their domain grouping.

| Table | Description | Domain Group |
|-------|-------------|-------------|
| `organizations` | Multi-tenant org container — name, slug, billing, enrollment codes, limits | `data/auth.md` |
| `profiles` | User profiles — role (admin/teacher/student), status, contact info, subject/class associations | `data/auth.md` |
| `classrooms` | Teacher-owned classes — student grouping via subject_ids, grade_levels, courses arrays | `data/classes.md` |
| `subjects` | Subject catalog — education level, color, icon, grade_levels, exam/CFS flags | `data/curriculum.md` |
| `curriculum` | Hierarchical curriculum tree — subject > year > component > nodes (levels 0-3) | `data/curriculum.md` |
| `base_content` | Rich content linked 1:1 to curriculum nodes (content_json, word_count) | `data/curriculum.md` |
| `calendar_sessions` | Scheduled tutoring sessions — teacher, students, time range, recurrence, price snapshots | `data/calendar.md` |
| `student_sessions` | Per-student session records — student summaries, artifact links | `data/calendar.md` |
| `session_types` | Session type reference — name, color, student price, teacher cost per hour | `data/calendar.md` |
| `assignments` | Teacher-created assignments/homework — links to artifact, student_ids, due date, status lifecycle | `data/assignments.md` |
| `student_assignments` | Per-student assignment tracking — progress (jsonb), submission (jsonb), grade, status lifecycle | `data/assignments.md` |
| `artifacts` | Documents/quizzes/notes — content (jsonb), tiptap_json, markdown, processing pipeline state | `data/documents.md` |
| `document_jobs` | Pipeline processing jobs for uploaded files — status tracking, step progress, retry | `data/documents.md` |
| `questions` | Question bank — type (MC, TF, fill, match, etc.), content (jsonb), curriculum tagging, exam metadata | `data/documents.md` |
| `chat_conversations` | AI chat conversations — user-scoped, title, timestamps | `data/chat.md` |
| `chat_messages` | Chat messages — role (user/assistant/tool/system), content, tool calls, metadata | `data/chat.md` |
| `student_grade_settings` | Grade calculator settings per student per year — education level, regime, period weights | `data/grades.md` |
| `student_subject_enrollments` | Student enrolled in a subject for a year — links settings, subject; exam candidate flag, cumulative weights | `data/grades.md` |
| `student_subject_periods` | Period grades per enrollment — raw, calculated, pauta, override, own/cumulative grades | `data/grades.md` |
| `subject_evaluation_elements` | Individual grade elements (tests, projects) — weight, raw grade, domain assignment | `data/grades.md` |
| `subject_evaluation_domains` | Evaluation domains per enrollment — weight vectors per period, domain type | `data/grades.md` |
| `student_annual_subject_grades` | Annual grade summary per enrollment — raw and rounded annual grade | `data/grades.md` |
| `student_subject_cfd` | Final subject grade with exam — CIF, exam score (0-20 and 0-200), CFD calculation | `data/grades.md` |
| `student_cfs_snapshot` | CFS (overall secondary score) snapshot — formula, all CFD data, DGES value | `data/grades.md` |
| `student_notes` | Per-student post-it notes written by teachers — content, color, opt-in sharing | `data/student-notes.md` |
