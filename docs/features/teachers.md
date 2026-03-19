---
last-updated: 2026-03-19
stability: frequently-updated
agent-routing: "Read before working on teachers feature code."
---

# Teachers

## 1. Overview

The teachers feature lets admins view, manage, and analyze the teaching staff within their organization. It provides a searchable teacher roster with detail panels showing profile info, financial analytics, session history, and stats. Admins can promote teachers to admin or demote admins to teacher role. Teachers share the backend `members` service with students but have their own frontend query module, components, and route.

## 2. Availability

| Attribute | Value |
|---|---|
| **Roles** | Admin (full access — view all teachers, manage roles, view any teacher's stats/analytics), Teacher (no access to this page — teachers cannot manage other teachers) |
| **Center types** | All (trial included) |
| **Route** | `/dashboard/teachers` |

## 3. Architecture

### 3.1 Route — `app/(teacher)/dashboard/teachers/page.tsx`

Server component. Fetches admins and teachers separately via `fetchMembersServer("admin", "active", 100)` and `fetchMembersServer("teacher", "active", 100)`, merges with deduplication and sorting (admins first, then alphabetical by name), and passes as `initialMembers` to `TeachersPage`.

Has a `loading.tsx` skeleton with animated pulse placeholders (header, search toolbar, 6 list item skeletons).

### 3.2 Feature Shell — `components/teachers/TeachersPage.tsx`

Client component. Owns the list + detail split-panel layout.

**State managed:**
- `selectedId` — currently selected teacher ID
- `searchQuery` / `deferredSearchQuery` — search input with `useDeferredValue` for performance
- `roleFilter` — `"all" | "admin" | "teacher"` filter

**Query orchestration:**
- `useTeacherListQuery(initialMembers)` — fetches all teachers/admins combined
- `useTeacherDetailQuery(selectedId, enabled, selectedTeacherSeed)` — fetches selected teacher detail, seeded from list data when available

**Search:** Client-side, case-insensitive across `display_name`, `full_name`, `email`, `subjects_taught`.

**Layout:** List takes full width; detail panel slides in from right taking 40% width when a teacher is selected.

### 3.3 UI Components

**Component tree:**

```
TeachersPage
├── Search input + role filter dropdown
├── Teacher list (filtered + searchable)
│   └── Teacher row (avatar, name, email, role badge)
└── TeacherDetailCard (selected teacher)
    ├── Header (avatar, name, email, close button)
    └── Tabs
        ├── Info tab (TeacherInfoTab)
        │   ├── Contact section (email, phone, member since)
        │   ├── Disciplines section (subjects with icons/colors)
        │   └── Permissions section (role badge, promote/demote)
        └── Overview tab (TeacherOverviewTab)
            ├── Financial widget (earnings, revenue, sessions, hours — monthly)
            └── Sessions list (upcoming + recent with session details)
```

**TeacherDetailCard** (`components/teachers/TeacherDetailCard.tsx`):
- Two tabs: "info" and "overview" with animated underline indicator (Framer Motion `layoutId`)
- Scrollable content via `AppScrollArea`

**TeacherInfoTab** (`components/teachers/tabs/TeacherInfoTab.tsx`):
- Contact info: email, phone, member since (formatted `created_at`)
- Disciplines: resolves `subjects_taught` IDs to full subject objects via `useSubjects()`, displays with icons and colors
- Permissions: current role badge. Admin-only action: promote teacher → admin or demote admin → teacher (with confirmation). Calls `updateTeacher(teacherId, { role })` and fires `onTeacherUpdated` callback.

**TeacherOverviewTab** (`components/teachers/tabs/TeacherOverviewTab.tsx`):
- Financial widget: 2×2 card grid with month navigation (prev/next, forward disabled on current month). Uses `useTeacherAnalyticsQuery(teacherId, { date_from, date_to })`. Shows: total earnings, revenue generated, session count, hours.
- Sessions list: uses `useTeacherSessionsQuery(teacherId, { limit })`. Splits into upcoming (future) and recent (past). Each row shows color dot, title, duration, date, time, session type badge, student count. "Load all" button fetches remaining sessions.

**Additional tabs** (available but used contextually):
- `TeacherSessionsTab` — month filter buttons (last 6 months + "all"), stat cards, session list with subject badges and student counts
- `TeacherStatsTab` — stat cards (total sessions, sessions this month, total hours, total earnings), revenue generated card, weekly sessions bar chart (Recharts, 12-week history)

### 3.4 Shared Backend — Members Service

Teachers do not have a dedicated backend router or service. They share:
- **Router:** `routers/members.py`
- **Service:** `services/members_service.py`
- **Schemas:** `schemas/members.py`

See [Section 3.5](#35-backend-router--routersmemberspy-teacher-relevant-endpoints) for teacher-specific endpoints.

### 3.5 Backend Router — `routers/members.py` (teacher-relevant endpoints)

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| `GET` | `/members` | `require_teacher` | `list_members()` — filter by `role=admin,teacher` for teacher list |
| `GET` | `/members/{member_id}` | `require_teacher` | `get_member()` |
| `GET` | `/members/{member_id}/sessions` | `require_teacher` | `get_member_sessions(as_teacher=True)` — teacher's taught sessions |
| `GET` | `/members/{member_id}/teacher-stats` | `require_teacher` | `get_teacher_stats()` — admins can view any; teachers only their own (403 otherwise) |
| `PATCH` | `/members/me` | `get_current_user` | Self-update with role-based field filtering — teachers can update: `full_name`, `display_name`, `avatar_url`, `phone`, `subjects_taught`, `hourly_rate` |
| `PATCH` | `/members/{member_id}` | `require_admin` | `update_member()` — admin can update any member including role changes |
| `DELETE` | `/members/{member_id}` | `require_admin` | `remove_member()` — soft-remove, sets `status = "suspended"` |

### 3.6 Backend Service — `services/members_service.py` (teacher-relevant logic)

**SELECT constants:**

```
MEMBER_LIST_SELECT:
  id, full_name, display_name, email, role, status,
  avatar_url, grade_level, course, subject_ids, class_ids,
  onboarding_completed, created_at

MEMBER_DETAIL_SELECT:
  id, full_name, display_name, email, role, status,
  avatar_url, grade_level, course, school_name, phone,
  subjects_taught, subject_ids, class_ids,
  parent_name, parent_email, parent_phone,
  hourly_rate, onboarding_completed, created_at
```

**Teacher-specific functions:**

- **`get_member_sessions(db, org_id, member_id, *, as_teacher=True, date_from, date_to, limit)`**
  When `as_teacher=True`: filters `calendar_sessions` by `teacher_id` (not `student_ids`). Supports date range and limit filters (default limit: 200). Hydrates with subjects and session type info.

- **`get_teacher_stats(db, org_id, teacher_id)`**
  Aggregates from `calendar_sessions` where `teacher_id` matches:
  - `total_sessions`, `sessions_this_month`
  - `total_hours` (sum of durations in hours)
  - `hourly_rate` (from teacher's profile)
  - `total_earnings` — **snapshot-based**: uses `snapshot_teacher_cost * duration_hours` per session. Falls back to `total_hours * hourly_rate` if no snapshots exist.
  - `total_revenue_generated` — `sum(snapshot_student_price * duration_hours * num_students)` per session
  - `weekly_sessions` — 12-week history with `{ week, count }` entries

### 3.7 Backend Schemas — `schemas/members.py`

**MemberListItem (response):** `id`, `full_name`, `display_name`, `email`, `role`, `status`, `avatar_url`, `grade_level`, `course`, `school_name`, `phone`, `subjects_taught`, `subject_ids`, `class_ids`, `parent_name`, `parent_email`, `parent_phone`, `hourly_rate`, `onboarding_completed`, `created_at`

**MemberUpdateRequest:** All fields optional — `status`, `class_ids`, `role`, `full_name`, `display_name`, `avatar_url`, `phone`, `grade_level`, `course`, `school_name`, `parent_name`, `parent_email`, `parent_phone`, `subjects_taught`, `subject_ids`, `hourly_rate`

## 4. Cache Contract

| Attribute | Value |
|---|---|
| **Query namespace** | `reference:teachers` (dropdown options), `teachers:list` (full list), `teachers:detail:{id}`, `teachers:sessions:{id}:...`, `teachers:stats:{id}`, `teachers:analytics:{id}:...` |
| **Stale time** | 600,000ms (10 minutes) for teacher queries |

**Query keys:**

| Key | Shape | Used for |
|---|---|---|
| Teacher options | `reference:teachers` | Lightweight teacher dropdown (id, name, avatar_url) |
| Teacher list | `teachers:list` | Full teacher roster with role/status |
| Teacher detail | `teachers:detail:{teacherId}` | Single teacher full profile |
| Teacher sessions | `teachers:sessions:{teacherId}:{dateFrom}:{dateTo}:{limit}` | Sessions taught by teacher |
| Teacher stats | `teachers:stats:{teacherId}` | Aggregated teacher statistics |
| Teacher analytics | `teachers:analytics:{teacherId}:{params}` | Monthly analytics dashboard data |

**Cache management:**

- `updateTeacherCaches(updated)` — updates detail cache, list cache (inserts if new, updates if existing), and options cache with sorting
- `invalidateTeachersQueries()` — invalidates list and options queries (not details)
- Detail view seeds from list data when available via `initialData`

**Prefetch:**

- `prefetchTeacherListQuery()` — used for route prefetch
- `prefetchTeachersQuery()` — used for dropdown warming

## 5. Optimistic Update Strategy

Teachers use **direct cache update + server confirmation** for the primary mutation (role change):

1. Call `updateTeacher(teacherId, { role })` (PATCH to `/api/members/{id}`)
2. On success: `updateTeacherCaches(updated)` syncs detail, list, and options caches
3. Fire `onTeacherUpdated` callback to update parent component state

No snapshot/restore pattern — role changes are infrequent and the UI shows a confirmation dialog before proceeding.

## 6. Payload Shapes

### Teacher List Payload

Uses `MEMBER_DETAIL_SELECT` (single payload shape — no summary/detail split since the list needs most fields for display and search):

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Profile ID |
| `full_name` | `string \| null` | Full name |
| `display_name` | `string \| null` | Display name |
| `email` | `string \| null` | Email address |
| `role` | `string` | `"admin"` or `"teacher"` |
| `status` | `string` | `"active"`, `"pending_approval"`, `"suspended"` |
| `avatar_url` | `string \| null` | Avatar image |
| `subjects_taught` | `string[] \| null` | Subject IDs the teacher teaches |
| `subject_ids` | `string[] \| null` | Subject IDs |
| `class_ids` | `string[] \| null` | Classroom IDs |
| `hourly_rate` | `number \| null` | Per-hour rate |
| `onboarding_completed` | `boolean` | Onboarding status |
| `created_at` | `string \| null` | Join date |

### Teacher Stats Payload

| Field | Type | Purpose |
|---|---|---|
| `total_sessions` | `number` | Lifetime session count |
| `sessions_this_month` | `number` | Current month session count |
| `total_hours` | `number` | Lifetime hours taught |
| `hourly_rate` | `number \| null` | Rate from profile |
| `total_earnings` | `number` | Snapshot-based lifetime earnings |
| `total_revenue_generated` | `number` | Student-price-based revenue |
| `weekly_sessions` | `{ week, count }[]` | 12-week session history |

## 7. Database

Teachers are stored in the shared `profiles` table — there is no dedicated teachers table. Teacher-specific columns on `profiles`:

| Column | Type | Purpose |
|---|---|---|
| `role` | text | `"admin"` or `"teacher"` |
| `subjects_taught` | uuid[] | Subject IDs the teacher teaches |
| `hourly_rate` | numeric | Per-hour cost rate |
| `class_ids` | uuid[] | Classrooms the teacher manages |

Teacher stats are derived from `calendar_sessions` where `teacher_id` matches the teacher's profile ID. Earnings use `snapshot_teacher_cost` and `snapshot_student_price` columns on `calendar_sessions` (see `features/calendar.md` §7 and `features/session-types.md` §7 for these columns).

No teacher-specific indexes exist beyond the standard `profiles` indexes on `(organization_id, role, status)`.

## 8. Edge Cases and Notes

### Teacher List Fetch Strategy
The frontend fetches admins and teachers as separate paginated requests (role=admin, role=teacher), then merges client-side with deduplication. This happens both server-side (in the route) and client-side (in `useTeacherListQuery`). Sorting: admins first, then alphabetical by name (Portuguese locale).

### Earnings Calculation
Teacher earnings use a dual strategy:
1. **Snapshot-based** (preferred): `snapshot_teacher_cost * session_hours` per session, summed. These snapshots are set at session creation from the session type's `teacher_cost_per_hour`.
2. **Fallback**: If no snapshots exist, uses `total_hours * hourly_rate` from the teacher's profile.

Revenue generated uses `snapshot_student_price * session_hours * student_count` per session.

### Role Change Authorization
- Only admins can change roles via `PATCH /members/{id}` (requires `require_admin`)
- Teachers cannot promote/demote — the UI hides the action for non-admin users
- An admin cannot demote themselves (UI prevents this)

### Self-Update Field Filtering
`PATCH /members/me` applies role-based field filtering. Teachers can only update: `full_name`, `display_name`, `avatar_url`, `phone`, `subjects_taught` (mapped to `subject_ids`), `hourly_rate`. Other fields are silently dropped.

## 9. Reference Status

Teachers is a read-heavy feature with one primary mutation (role change). It uses the shared `members` service rather than a dedicated service, and has its own query module (`lib/queries/teachers.ts`) to manage the teacher-specific cache namespace and hooks. The 10-minute stale time reflects that the teacher roster changes infrequently.
