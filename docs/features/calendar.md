---
last-updated: 2026-03-19
stability: frequently-updated
agent-routing: "Read before working on calendar feature code. This is also the reference implementation — other features should follow this pattern."
---

# Calendar

## 1. Overview

The calendar is the session scheduling feature for LUSIA Studio. Teachers and admins use it to create, edit, move, resize, and delete tutoring sessions — including recurring sessions with scope-based mutations (single, this-and-future, all). Each session is assigned to a teacher, linked to one or more students, optionally tagged with subjects, and priced via a session type. Students see a read-only list of their own upcoming and past sessions. The calendar is the **reference implementation** for the codebase's engineering standards — every pattern documented in `STANDARDS.md` is grounded in this feature.

## 2. Availability

| Attribute | Value |
|---|---|
| **Roles** | Admin (full CRUD, can assign sessions to other teachers, toggle "view all" vs "own sessions"), Teacher (full CRUD on own sessions), Student (read-only — view own sessions) |
| **Center types** | All (trial included) |
| **Teacher route** | `/dashboard/calendar` |
| **Student route** | `/student/sessions` |

**Role-based query filtering** (enforced in `calendar_service.list_sessions()`):
- **Admin:** sees all org sessions; optionally filtered by `teacher_id`
- **Teacher:** sees only sessions where `teacher_id == user.id`
- **Student:** sees only sessions where `student_ids @> [user.id]` (array containment via GIN index)

## 3. Architecture

### 3.1 Route — `app/(teacher)/dashboard/calendar/page.tsx`

Server component. Computes the current week range (Monday–Sunday via `startOfWeek`/`endOfWeek` with `weekStartsOn: 1`), calls `fetchCalendarSessionsServer(startISO, endISO)` to get sessions for the current week, and passes them as `initialSessions`, `initialStart`, `initialEnd` to `CalendarShell`.

**Key behavior:** Only the current week is fetched server-side. No adjacent weeks, no alternate views, no history. This keeps first paint fast.

### 3.2 Server Fetch — `lib/calendar.server.ts`

Calls `fetchBackendJsonServer()` directly against the FastAPI backend with `start_date` and `end_date` params. Returns `CalendarSession[]` with an empty-array fallback. This skips the Next.js API route proxy — one fewer network hop for SSR.

### 3.3 Feature Shell — `components/calendar/CalendarShell.tsx`

Client component (`"use client"`). This is the orchestration layer — it owns all data flow between queries, mutations, and UI.

**State managed:**
- `dateRange` — current `startDate`/`endDate` (ISO strings), initialized from server props
- `adminViewAll` — boolean toggle for admin "all sessions" vs "my sessions" view
- `scopeDialogOpen` + `pendingAction` — recurrence scope dialog state (edit/delete with scope selection)

**Query orchestration:**
- Calls `useCalendarSessionsQuery()` with the current `dateRange` and `teacherId` (derived from admin view toggle)
- Passes `initialData` from server props only when the date range matches the initial range and no teacher filter is active
- Exposes `handleDateRangeChange` for week/month navigation
- Exposes `handlePrefetchDateRange` for adjacent range prefetch
- Exposes `handleFetchSessionDetail` for on-demand detail fetch

**Admin prefetch behavior:**
- On first render, skips prefetch (focuses on first paint)
- After initial load, when `adminViewAll` toggles, prefetches the alternate view (own sessions vs all sessions) for the current date range via `prefetchCalendarSessions()`

**Mutations exposed:**
- `handleCreateSession` — single session or batch recurrence creation with optimistic updates
- `handleUpdateSession` — routes to scope dialog for recurring sessions, direct update for single sessions, or delete+recreate for non-recurring converted to recurring
- `handleDeleteSession` — routes to scope dialog for recurring sessions, direct delete for single sessions

**Optimistic strategy for each mutation:** See [Section 5](#5-optimistic-update-strategy).

**Children rendered:**
- `EventCalendar` — the main calendar UI component
- `RecurrenceEditScopeDialog` — scope selection dialog for recurring session edits/deletes

### 3.4 UI Components

**Component tree:**

```
CalendarShell
├── EventCalendar
│   ├── SessionFormDialog (lazy: dynamic import)
│   │   ├── StudentPicker
│   │   ├── SubjectSelector (from materiais)
│   │   ├── RecurrencePicker
│   │   │   └── CustomRecurrenceDialog
│   │   ├── SessionTypePicker (inline)
│   │   └── TeacherPicker (inline, admin only)
│   ├── SessionTypeManagerDialog (lazy: dynamic import)
│   ├── MonthView (inline in EventCalendar)
│   ├── WeekView (inline in EventCalendar)
│   ├── ListView (inline in EventCalendar)
│   └── StudentHoverCard
└── RecurrenceEditScopeDialog
```

**Lazy-loaded components:**
- `SessionFormDialog` — loaded via `dynamic(() => import("./SessionFormDialog"))` in `EventCalendar.tsx`
- `SessionTypeManagerDialog` — loaded via `dynamic(() => import("./SessionTypeManagerDialog"))` in `EventCalendar.tsx`

**EventCalendar** (`components/calendar/EventCalendar.tsx`):
- Owns `viewMode` state (`"month" | "week" | "list"`)
- Owns `currentDate` state (the anchor date for navigation)
- Owns `selectedSession` and `formDialogOpen` state for session creation/editing
- Owns drag/resize/click interaction state for the week view
- Computes layout positions for overlapping sessions via `layoutSessionsForDay()` (interval graph coloring)
- Fires `onDateRangeChange` when the user navigates weeks/months
- Fires `onPrefetchDateRange` for adjacent week/month prefetch
- Fires `onFetchSessionDetail` when a session block is clicked (fetches full detail before opening edit dialog)

**SessionFormDialog** (`components/calendar/SessionFormDialog.tsx`):
- Full create/edit form for sessions
- Fields: title, teacher notes, date, time range, students (via `StudentPicker`), subjects (via `SubjectSelector`), recurrence (via `RecurrencePicker`), session type, teacher (admin only, via `TeacherPicker`)
- Owns local form state, time validation, submission loading state
- Uses `useSessionTypes()`, `useSubjectCatalogQuery()`, `useTeachersQuery()` for picker data

**RecurrenceEditScopeDialog** (`components/calendar/RecurrenceEditScopeDialog.tsx`):
- Shows three scope options: "this", "this_and_future", "all"
- Returns the selected `EditScope` to the shell

**RecurrencePicker** (`components/calendar/RecurrencePicker.tsx`):
- Preset recurrence options (daily, weekdays, weekly, biweekly, monthly by date, monthly by weekday, yearly)
- Custom recurrence dialog for interval + specific days of week
- End date picker
- Live preview of session count

**StudentPicker** (`components/calendar/StudentPicker.tsx`):
- Multi-select student picker with search, class filter, grade filter
- Uses `useStudentSearchQuery()` for search and `useOwnClassesQuery()`/`useClassMembersQuery()` for class-scoped filtering
- Supports quick-add to class

**SubjectPicker** (`components/calendar/SubjectPicker.tsx`):
- Multi-select subject picker grouped by education level
- Uses `cachedFetch` for subject data (legacy — being migrated to query module)

**StudentHoverCard** (`components/calendar/StudentHoverCard.tsx`):
- Hover preview showing student avatar, name, grade level, course, parent info

**SessionTypeManagerDialog** (`components/calendar/SessionTypeManagerDialog.tsx`):
- CRUD for session types (create, edit, delete) with inline form
- Uses `useSessionTypes()`, `createSessionTypeWithCache()`, `updateSessionTypeWithCache()`, `deleteSessionTypeWithCache()`

### 3.5 Next.js API Routes

Two route files, both thin auth proxies:

**`app/api/calendar/sessions/route.ts`** — collection operations:
- `GET` — forwards `start_date`, `end_date`, `teacher_id` params to `GET /api/v1/calendar/sessions`
- `POST` — forwards JSON body to `POST /api/v1/calendar/sessions`

**`app/api/calendar/sessions/[id]/route.ts`** — single session operations:
- `GET` — forwards to `GET /api/v1/calendar/sessions/{id}`
- `PATCH` — forwards body + `scope` query param to `PATCH /api/v1/calendar/sessions/{id}?scope=...`
- `DELETE` — forwards `scope` query param to `DELETE /api/v1/calendar/sessions/{id}?scope=...`

All routes: extract access token via `getAccessToken()`, attach `Authorization: Bearer` header, use `cache: "no-store"`, return backend response status and payload transparently.

**Note:** `app/api/calendar/students/route.ts` does **not exist**. Student search is served via `GET /api/v1/calendar/students/search` (mapped in the backend router), but the frontend calls this through a different mechanism.

### 3.6 Backend Router — `routers/calendar.py`

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| `POST` | `/sessions` | `require_teacher` | `create_session()` or `create_session_batch()` (if `recurrence` provided) |
| `GET` | `/sessions` | `get_current_user` (all roles) | `list_sessions()` — role-aware filtering |
| `GET` | `/sessions/{session_id}` | `get_current_user` | `get_session()` |
| `PATCH` | `/sessions/{session_id}?scope=` | `require_teacher` | `update_session()` — scope: `this`, `this_and_future`, `all` |
| `DELETE` | `/sessions/{session_id}?scope=` | `require_teacher` | `delete_session()` — scope: `this`, `this_and_future`, `all` |
| `GET` | `/students/search?q=&limit=` | `require_teacher` | `search_students()` |

**Key details:**
- `POST /sessions` — admin can assign `teacher_id` to a different teacher; non-admins are always the teacher
- `GET /sessions` — accessible by all roles (admin, teacher, student); role filtering happens in the service
- `PATCH`/`DELETE` — the `scope` query param controls recurrence behavior; defaults to `"this"`
- Response schemas: `SessionOut` for single, `BatchSessionOut` for batch creation, `list[SessionOut]` for list

### 3.7 Backend Service — `services/calendar_service.py`

**SELECT constants:**

```
SESSION_LIST_SELECT:
  id, organization_id, teacher_id, student_ids, class_id,
  session_type_id,
  starts_at, ends_at, title, subject_ids,
  teacher_notes, teacher_summary, summary_status,
  recurrence_group_id, recurrence_index, recurrence_rule

SESSION_DETAIL_SELECT:
  id, organization_id, teacher_id, student_ids, class_id,
  session_type_id, snapshot_student_price, snapshot_teacher_cost,
  starts_at, ends_at, title, subject_ids,
  teacher_notes, teacher_summary, teacher_artifact_ids,
  summary_status, recurrence_group_id, recurrence_index, recurrence_rule,
  created_at, updated_at
```

**Detail-only fields:** `snapshot_student_price`, `snapshot_teacher_cost`, `teacher_artifact_ids`, `created_at`, `updated_at`.

**`_batch_hydrate_session_summaries(db, sessions)`:**
Hydrates sessions for list/calendar rendering. Collects unique teacher_ids, preview_student_ids (capped to first 4 per session), subject_ids, and session_type_ids across all sessions. Performs one batch query per entity type (profiles for teachers, profiles for students, subjects, session_types). Attaches `teacher_name`, `students` (preview only — max 4), `subjects`, and `session_type` to each session.

**`_batch_hydrate_sessions(db, sessions)`:**
Full hydration for detail views. Same batch pattern but **no student cap** — all students are hydrated. Also hydrates full student profiles with `grade_level` and `course` fields (summary only gets `full_name`, `display_name`, `avatar_url`).

**Key business logic:**

- **Recurrence generation:** `generate_recurrence_dates()` supports 8 frequency types: `daily`, `weekdays`, `weekly`, `biweekly`, `monthly_date`, `monthly_weekday`, `yearly`, `custom`. Hard cap: 365 sessions per recurrence series.
- **Batch creation:** `create_session_batch()` generates a UUID `recurrence_group_id`, bulk-inserts all `calendar_sessions` rows, then bulk-inserts all `student_sessions` rows. Compensating rollback on student_sessions failure (deletes the inserted calendar_sessions).
- **Scope-based mutations:** `update_session()` and `delete_session()` accept `scope` parameter:
  - `"this"` — only the specified session
  - `"this_and_future"` — sessions in the recurrence group with `recurrence_index >= cutoff`
  - `"all"` — all sessions in the recurrence group
- **Session type price snapshots:** On create, `_snapshot_session_type()` fetches the session type's current `student_price_per_hour` and `teacher_cost_per_hour` and stores them as `snapshot_student_price` and `snapshot_teacher_cost` on the session. This preserves historical pricing.
- **Student-session link sync:** `_sync_student_session_links()` performs a delete-then-reinsert of `student_sessions` rows when student_ids change. Uses `in_()` for multi-session scoped operations.
- **Validation:** `_validate_student_ids()` checks students exist as active students in the org. `_validate_teacher_id()` checks teacher exists as active teacher/admin in the org.

**DB access patterns:**
- `list_sessions()` — reads `calendar_sessions` filtered by `organization_id`, role-specific filter, optional date range, ordered by `starts_at`. Unbounded requests (no date range) are capped at 500 (admin) or 200 (others).
- `get_session()` — reads single `calendar_sessions` row by `organization_id + id` using `SESSION_DETAIL_SELECT`.
- `_get_group_sessions()` / `_get_group_scope_sessions()` — reads recurrence groups by `organization_id + recurrence_group_id`, optionally filtered by `recurrence_index >= cutoff`.
- `create_session()` / `create_session_batch()` — inserts to `calendar_sessions` and `student_sessions`.
- Batch updates use scoped `.update()` with `.eq("recurrence_group_id", group_id)` for non-time changes, or per-session `.update()` for time changes (since each session's time delta must be computed individually).

### 3.8 Backend Schemas — `schemas/calendar.py`

**RecurrenceRule:**
```
freq: "daily" | "weekdays" | "weekly" | "biweekly" | "monthly_date" | "monthly_weekday" | "yearly" | "custom"
interval: int (1–52, default 1)
days_of_week: list[int] | null (0=Mon..6=Sun)
month_day: int | null (1–31)
month_nth: int | null (1–5)
month_weekday: int | null (0–6)
end_date: str (ISO date "YYYY-MM-DD")
```

**SessionCreate:**
```
student_ids: list[str] (required, min 1)
session_type_id: str (required)
teacher_id: str | null (admin-only)
class_id: str | null
starts_at: datetime (required)
ends_at: datetime (required, must be after starts_at)
title: str | null
subject_ids: list[str] | null
teacher_notes: str | null
recurrence: RecurrenceCreate | null (contains a RecurrenceRule)
```

**SessionUpdate:**
```
student_ids: list[str] | null
session_type_id: str | null
class_id: str | null
starts_at: datetime | null
ends_at: datetime | null
title: str | null
subject_ids: list[str] | null
teacher_notes: str | null
```

**SessionOut (response):**
```
id, organization_id, teacher_id, student_ids
session_type_id, snapshot_student_price, snapshot_teacher_cost
class_id, starts_at, ends_at, title, subject_ids
teacher_notes, teacher_summary, teacher_artifact_ids, summary_status
recurrence_group_id, recurrence_index, recurrence_rule
created_at, updated_at
# Hydrated:
teacher_name, students (list[dict]), subjects (list[dict]), session_type (dict)
```

**BatchSessionOut:** `sessions: list[SessionOut]`, `recurrence_group_id: str`, `count: int`

**StudentSearchResult:** `id, full_name, display_name, avatar_url, grade_level, course, subject_ids, parent_name, parent_email, parent_phone`

## 4. Cache Contract

| Attribute | Value |
|---|---|
| **Query namespace** | `calendar:sessions:` (list), `calendar:session:` (detail) |
| **List staleTime** | 60,000ms (1 minute) |
| **Detail staleTime** | 60,000ms (1 minute) |

**List query keys:**

Pattern: `buildCalendarSessionsQueryKey({ startDate, endDate, teacherId })`

Shape: `calendar:sessions:{startDate}|{endDate}|{teacherId ?? "*"}`

Example: `calendar:sessions:2026-03-16T00:00:00.000Z|2026-03-22T23:59:59.999Z|*`

Encodes all three filter dimensions: date range and optional teacher filter. The `*` wildcard indicates "all teachers" (admin view-all or teacher's own sessions where teacherId is null).

**Detail query keys:**

Pattern: `buildCalendarSessionDetailQueryKey(sessionId)`

Shape: `calendar:session:{sessionId}`

**Invalidation rules:**

| Trigger | What is invalidated |
|---|---|
| Optimistic failure (any mutation) | `restoreCalendarQueries(snapshots)` restores all list queries + `invalidateCalendarSessionsQueries()` forces refetch of all list queries + `invalidateCalendarSessionDetail(id)` for the affected session |
| `refetchFromServer()` | `invalidateCalendarSessionsQueries()` (all list queries) + `refetchSessions()` |
| Delete success | Detail cache entries for deleted session IDs are set to `undefined` via `removeCalendarSessionDetails()` |

**Mutation sync (on success):**
- `syncCalendarSessionsAcrossQueries(sessions, options?)` — updates ALL matching list queries: removes sessions by `syncedIds` and `removeIds` from existing data, then adds synced sessions that match the query's date range and teacher filter (via `sessionBelongsToQuery()`). Also sets each session into its detail cache key.
- `removeCalendarSessionsFromQueries(matcher)` — removes sessions matching the predicate from all list queries.
- `updateCalendarSessionsInQueries(matcher, updater)` — updates sessions matching the predicate in-place across all list queries.

**Prefetch behavior:**

| What | When | Mechanism |
|---|---|---|
| Adjacent week/month | On week/month navigation arrow hover or click, or when the shell detects navigation | `prefetchCalendarSessions()` via `handlePrefetchDateRange` callback in `EventCalendar` |
| Admin alternate view | After first paint, when `adminViewAll` toggles | `prefetchCalendarSessions()` in a `useEffect` with a bootstrap guard (`hasBootstrappedAdminPrefetch`) |
| Session detail | On session click in the calendar grid | `fetchCalendarSessionDetail()` called by `handleFetchSessionDetail` |

**NOT prefetched:** Session types, subject catalog, and teacher list are fetched lazily only when `SessionFormDialog` opens. Past sessions for the student view are prefetched via `requestIdleCallback` after paint.

**Snapshot/restore:**

`snapshotCalendarQueries()` captures all cache entries under the `calendar:sessions:` prefix. Each snapshot stores `{ key, data }` where data is a shallow copy of the `CalendarSession[]`. `restoreCalendarQueries(snapshots)` writes each snapshot's data back via `queryClient.setQueryData()`, exactly replacing the optimistic state. This restores the cache to its pre-mutation state on failure.

## 5. Optimistic Update Strategy

All mutations follow the same high-level flow: **snapshot → apply optimistic change → fire API call → on success: sync with real data → on failure: restore snapshot + invalidate + show error toast**.

### Create Session (single)

1. Generate `tempId` (`temp-{Date.now()}`)
2. Build optimistic `CalendarSession` with `tempId`, user-provided data, and current user info
3. `snapshotCalendarQueries()`
4. `syncCalendarSessionsAcrossQueries([optimistic])` — inserts into matching list queries
5. Show success toast immediately
6. `POST /api/calendar/sessions`
7. **Success:** `syncCalendarSessionsAcrossQueries([created], { removeIds: [tempId] })` — replaces temp with real session
8. **Failure:** `restoreCalendarQueries(snapshots)` — removes the optimistic entry

### Create Session (batch recurrence)

1. Generate `tempGroupId` and array of optimistic sessions with `temp-{seed}-{idx}` IDs
2. `snapshotCalendarQueries()`
3. `syncCalendarSessionsAcrossQueries(optimistics)` — inserts all into matching list queries
4. Show success toast with count
5. `POST /api/calendar/sessions` (with `recurrence` payload)
6. **Success:** `syncCalendarSessionsAcrossQueries(result.sessions, { removeIds: tempIds })` — replaces all temp sessions with real ones
7. **Failure:** `restoreCalendarQueries(snapshots)`

### Update Session (single or scoped)

1. Find the existing session in the current sessions array
2. `snapshotCalendarQueries()`
3. `updateCalendarSessionsInQueries(scopeMatcher, buildOptimisticSessionUpdate)` — applies optimistic field changes to matching sessions. For scoped updates, `buildScopeMatcher()` determines which sessions match based on scope (`this`, `this_and_future`, `all`) and `recurrence_group_id`/`recurrence_index`.
4. Time changes for scoped updates compute per-session delta from the reference session's start time.
5. `PATCH /api/calendar/sessions/{id}?scope=...`
6. **Success:** `syncCalendarSessionsAcrossQueries(updated)` — replaces optimistic with server data
7. **Failure:** `restoreCalendarQueries(snapshots)` + `invalidateCalendarSessionDetail(id)` + `refetchFromServer()`

### Delete Session (single or scoped)

1. Compute the set of session IDs to remove based on scope
2. `snapshotCalendarQueries()`
3. `removeCalendarSessionsFromQueries(scopeMatcher)` — removes sessions from all list queries
4. `removeCalendarSessionDetails(removedDetailIds)` — clears detail cache entries
5. `DELETE /api/calendar/sessions/{id}?scope=...`
6. **Success:** (nothing extra — cache already reflects the deletion)
7. **Failure:** `restoreCalendarQueries(snapshots)` + re-invalidate detail caches + `refetchFromServer()`

### Move/Resize Session (via EventCalendar drag/drop)

Handled through the same `handleUpdateSession` flow — `EventCalendar` constructs a `SessionFormData` with new `date`, `startTime`, `endTime` from the drag result and calls `onUpdateSession(id, data)`.

## 6. Payload Shapes

### Summary Payload (calendar grid / week view)

Used by `list_sessions()` with `SESSION_LIST_SELECT` + `_batch_hydrate_session_summaries()`.

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Session ID |
| `organization_id` | `string` | Org scope |
| `teacher_id` | `string` | Owning teacher |
| `student_ids` | `string[]` | Raw student ID array |
| `class_id` | `string \| null` | Optional class association |
| `session_type_id` | `string \| null` | Session type reference |
| `starts_at` | `string` | ISO datetime |
| `ends_at` | `string` | ISO datetime |
| `title` | `string \| null` | Optional session title |
| `subject_ids` | `string[] \| null` | Raw subject ID array |
| `teacher_notes` | `string \| null` | Teacher's notes |
| `teacher_summary` | `string \| null` | AI-generated summary |
| `summary_status` | `string \| null` | Summary generation status |
| `recurrence_group_id` | `string \| null` | Shared UUID for recurrence group |
| `recurrence_index` | `int \| null` | 0-based position in group |
| `recurrence_rule` | `dict \| null` | Full recurrence rule object |
| **Hydrated:** | | |
| `teacher_name` | `string \| null` | Display name from profiles |
| `students` | `list[dict]` | **Max 4 students** — `id, full_name, display_name, avatar_url` only |
| `subjects` | `list[dict]` | `id, name, color, icon` |
| `session_type` | `dict \| null` | `id, name, color, icon` |

**Intentionally excluded from summary:** `snapshot_student_price`, `snapshot_teacher_cost`, `teacher_artifact_ids`, `created_at`, `updated_at`, full student profiles (grade_level, course).

### Detail Payload (session edit dialog)

Used by `get_session()` with `SESSION_DETAIL_SELECT` + `_batch_hydrate_sessions()`.

| Field | Type | Differs from summary |
|---|---|---|
| `snapshot_student_price` | `float \| null` | Detail only — price snapshot at creation |
| `snapshot_teacher_cost` | `float \| null` | Detail only — cost snapshot at creation |
| `teacher_artifact_ids` | `list[str] \| null` | Detail only — linked teaching artifacts |
| `created_at` | `string \| null` | Detail only — creation timestamp |
| `updated_at` | `string \| null` | Detail only — last update timestamp |
| `students` | `list[dict]` | **All students** — includes `grade_level`, `course` |

### Student Cap

Summary hydration caps students to the **first 4** per session (`(session.get("student_ids") or [])[:4]`). This keeps list views cheap — a week with 50 sessions and 10 students each would otherwise require hydrating 500 student profiles. Detail hydration has no cap.

## 7. Database

### Tables Involved

| Table | Description |
|---|---|
| `calendar_sessions` | Core session records — time range, teacher, students, subjects, recurrence, pricing snapshots |
| `student_sessions` | Join table linking sessions to individual students — enables per-student summary/artifact tracking |
| `session_types` | Session type definitions with per-org pricing (student price, teacher cost) |
| `profiles` | User profiles — queried for teacher names, student info during hydration |
| `subjects` | Subject catalog — queried for subject names/colors during hydration |

Cross-reference: See `data/calendar.md` for full entity schemas.

### Indexes

| Index | Table | Columns | Serves |
|---|---|---|---|
| `idx_calendar_sessions_org_starts` | `calendar_sessions` | `(organization_id, starts_at)` | Fetching sessions by org + date range (primary list query) |
| `idx_calendar_sessions_org_teacher_starts` | `calendar_sessions` | `(organization_id, teacher_id, starts_at)` | Fetching sessions by org + teacher + date range (admin filtered view, teacher's own sessions) |
| `idx_calendar_sessions_org_recurrence_idx` | `calendar_sessions` | `(organization_id, recurrence_group_id, recurrence_index)` WHERE `recurrence_group_id IS NOT NULL` | Recurrence group operations — scope-based updates/deletes |
| `idx_calendar_sessions_student_ids_gin` | `calendar_sessions` | GIN on `student_ids` | Student membership lookups (`student_ids @> [user_id]` for student calendar view) |
| `idx_sessions_recurrence_group` | `calendar_sessions` | `(recurrence_group_id)` WHERE `recurrence_group_id IS NOT NULL` | Simple recurrence group lookups |
| `idx_sessions_type` | `calendar_sessions` | `(session_type_id)` | Join to session_types |
| `idx_session_types_org` | `session_types` | `(organization_id, active)` | Fetching active session types for an org |
| `idx_session_types_default` | `session_types` | UNIQUE on `(organization_id)` WHERE `is_default = true` | Enforcing one default session type per org |
| `idx_student_sessions_session_id` | `student_sessions` | `(session_id)` | Deleting student_sessions when sessions are deleted |

### Read Patterns

| Pattern | Index Used | Query Shape |
|---|---|---|
| Org + date range (week/month view) | `idx_calendar_sessions_org_starts` | `.eq("organization_id", org_id).gte("starts_at", start).lte("ends_at", end)` |
| Org + teacher + date range (filtered view) | `idx_calendar_sessions_org_teacher_starts` | `.eq("organization_id", org_id).eq("teacher_id", tid).gte("starts_at", start).lte("ends_at", end)` |
| Org + recurrence group (scope operations) | `idx_calendar_sessions_org_recurrence_idx` | `.eq("organization_id", org_id).eq("recurrence_group_id", gid).gte("recurrence_index", cutoff)` |
| Org + session ID (detail fetch) | Primary key + `organization_id` | `.eq("organization_id", org_id).eq("id", sid)` |
| Student membership (student calendar view) | `idx_calendar_sessions_student_ids_gin` | `.contains("student_ids", [user_id])` |
| Student_sessions cleanup on delete | `idx_student_sessions_session_id` | `.in_("session_id", ids)` |

## 8. Edge Cases and Notes

### Recurrence Storage

Recurring sessions are stored as **individual rows** in `calendar_sessions`, each with:
- `recurrence_group_id` — a shared UUID identifying the group (generated at batch creation, no separate table)
- `recurrence_index` — 0-based position in the series
- `recurrence_rule` — the full rule object stored as JSONB on every session (self-contained — no need to look up the rule elsewhere)

This means scope-based operations (`"this_and_future"`, `"all"`) filter directly on `recurrence_group_id` and `recurrence_index`. No separate recurrence table exists.

### Recurrence Time Propagation

When a scoped update changes time fields (`starts_at`/`ends_at`), the service computes a time delta from the reference session and applies it to each affected session individually (per-session update). Non-time field changes (title, students, subjects, etc.) use a single bulk `.update()` across all scoped sessions.

### Price Snapshots

Session types define per-hour prices. When a session is created, the current prices are snapshotted into `snapshot_student_price` and `snapshot_teacher_cost` on the session row. This ensures historical sessions retain their original pricing even if session type prices change later.

### Student Sessions Join Table

`student_sessions` exists alongside the `student_ids` array column on `calendar_sessions`. The array is used for fast containment queries (GIN index) and for the calendar UI. The join table enables per-student session-level data (student summaries, student artifact IDs, summary status). When students change on a session, `_sync_student_session_links()` performs a full delete-and-reinsert of the join rows.

### Compensating Rollback

The service does not use database transactions for multi-table writes. Instead, it uses compensating rollback:
- On single session create: if `student_sessions` insert fails, the orphaned `calendar_sessions` row is deleted
- On batch create: if `student_sessions` insert fails, all created `calendar_sessions` rows are deleted
- On student link sync: failures raise an HTTP 500 with an explicit message about potential inconsistency

### Student Sessions Page

Students access their sessions at `/student/sessions` via `StudentSessionsPage`. This page reuses `useCalendarSessionsQuery()` with computed date ranges (`buildStudentSessionsRanges()`). It shows two tabs: "upcoming" (next 60 days) and "past" (previous 90 days). The past tab is prefetched via `requestIdleCallback` after paint. The backend filters sessions to only those where the student is a participant (via `student_ids @> [user_id]`).

### Unbounded Query Guard

`list_sessions()` guards against unbounded requests (no date range): admin queries are capped at 500 results, non-admin at 200. Normal calendar range queries (with date filters) are not capped.

### Search Sanitization

`search_students()` sanitizes the search query by stripping PostgREST/SQL special characters (`%`, `_`, `,`, `;`, `'`, `"`, `\`, null bytes) and limiting to 100 characters.

## 9. Reference Status

The calendar is the **reference implementation** for the LUSIA Studio engineering standards. Other features should follow the same patterns. When building or refactoring another feature, look at how calendar does it.

**What makes it the reference:**

| Pattern | Calendar Implementation |
|---|---|
| **Thin route bootstrap** | `page.tsx` — 23 lines. Server-fetches current week, passes to shell. No client logic. |
| **Server-first initial data** | `calendar.server.ts` — direct backend call via `fetchBackendJsonServer()`, skipping Next API proxy |
| **Shell orchestration** | `CalendarShell.tsx` — owns queries, mutations, optimistic updates, prefetch timing. UI components receive data and callbacks via props. |
| **Summary/detail split** | `SESSION_LIST_SELECT` + `_batch_hydrate_session_summaries()` (students capped to 4) vs `SESSION_DETAIL_SELECT` + `_batch_hydrate_sessions()` (full) |
| **Complete cache contract** | `lib/queries/calendar.ts` — exports key builders, hooks, prefetch, snapshot/restore, sync, invalidation, removal |
| **Optimistic mutations with rollback** | Every mutation: snapshot → apply → try API → sync real data / restore + invalidate |
| **Deferred prefetch** | Adjacent week prefetch, admin alternate view prefetch, session detail on click — all after first paint |
| **Batch hydration** | Collects all foreign IDs, batch-fetches once per type, merges. O(entity types) queries, not O(items). |
| **Aligned indexes** | 5 indexes on `calendar_sessions` + 1 GIN, each tied to a specific UI access pattern |
| **Lazy-loaded heavy dialogs** | `SessionFormDialog` and `SessionTypeManagerDialog` loaded via `dynamic()` |
| **Scope-based recurrence** | Complete `this/this_and_future/all` scope handling for edits and deletes |
