---
last-updated: 2026-03-19
stability: frequently-updated
agent-routing: "Read before working on students/members feature code, class membership management, or the student detail drawer."
---

# Students

## 1. Overview

The students feature is the member management hub for LUSIA Studio. Teachers and admins use it to view their student roster, inspect individual student details (contact info, grades, sessions, assignments, financials), manage class membership, and search across the organization. The feature reuses the backend `members` entity — students and teachers share the same `profiles` table and API endpoints, differentiated by role. The page also serves as the entry point for class management (creating classes, adding/removing members, viewing the admin "Turmas" grid).

**Key distinction from other features:** The students feature is primarily **read-heavy** with class-membership mutations being the main write path. There are no direct student CRUD operations — students are created via the enrollment flow (`features/onboarding.md`). The mutations here operate on class-student associations, not on student records themselves.

## 2. Availability

| Attribute | Value |
|---|---|
| **Roles** | Admin (full — sees all org students, all classes, "Centro"/"Eu"/"Turmas" mode toggle), Teacher (sees own students scoped by primary class, can manage own classes) |
| **Center types** | All (trial included) |
| **Route** | `/dashboard/students` |
| **Also used for teachers** | The same `StudentsPage` component is reused at `/dashboard/teachers` with `memberRole="teacher"` |

**Role-based view modes (admin only):**

| Mode | Label | What it shows |
|---|---|---|
| `"centro"` | Centro | All students in the organization, no class filter |
| `"eu"` | Eu | Admin's own students (scoped by primary class), same as teacher view |
| `"turmas"` | Turmas | Grid view of all classes across all teachers (`AdminClassesView`) |

**Teacher view:** Always scoped to the teacher's primary class. A "Ver todos os alunos do centro" expansion lets teachers see org-wide students (read-only, with option to add to own class).

## 3. Architecture

### 3.1 Route — `app/(teacher)/dashboard/students/page.tsx`

Server component. Resolves the current user's role via Supabase auth. For non-admin (teacher), fetches their classes server-side via `fetchClassesServer()` to determine the primary class. Then fetches members via `fetchMembersServer("student", "active", 100, primaryClassId)`. Passes `initialMembers` and `initialClasses` to `StudentsPage`.

**Key behavior:** The route determines whether to scope by primary class at the server level. Admin loads all students (no class filter), teacher loads only primary-class students.

### 3.2 Server Fetch — `lib/members.server.ts`

Three server-side fetch functions:

- `fetchMembersServer(role?, status?, perPage?, classId?)` — calls `fetchBackendJsonServer()` directly against the FastAPI backend with query params. Returns `PaginatedMembers` with empty fallback.
- `fetchMyProfileServer()` — fetches the current user's own profile.
- `fetchMemberStatsServer(memberId)` — fetches aggregated stats for a student.

All use `fetchBackendJsonServer()` — one fewer network hop than routing through the Next API route.

### 3.3 Feature Shell — `components/students/StudentsPage.tsx`

Client component (`"use client"`). This is both the shell and the primary UI — it does not delegate to a separate shell component.

**State managed:**
- `adminMode` — `"centro" | "eu" | "turmas"` (admin-only 3-mode toggle)
- `selectedId` — currently selected student/teacher for the detail drawer
- `searchQuery` + `deferredSearchQuery` — client-side text search (via `useDeferredValue`)
- `listFilters` — `{ years: string[], courses: string[] }` for grade year and course filtering
- `selectedClassId` — when a non-primary class card is clicked in the gallery
- `classMembersCache` — `Record<string, ClassMember[]>` local cache of loaded class members
- `memberCounts` — `Record<string, number>` class member counts
- `showAllExpanded` — whether the "Ver todos" section is expanded (shows org-wide students)
- `manageClassOpen` / `manageClassId` — manage class dialog state
- `createClassOpen` — create class dialog state
- `removingMemberId` — tracks which member is being removed (loading state)
- `addDialogMember` — member being added to primary class from "ver todos" expansion

**Query orchestration:**
- `useMembersQuery()` — primary member list, parameterized by role, status, classId (derived from admin mode and primary class)
- `useMembersQuery()` (second instance) — org-wide students, enabled only when `showAllExpanded` is true
- `useOwnClassesQuery()` — teacher's own classes (for gallery)
- `useAllClassesQuery()` — all org classes (admin turmas mode)
- `useTeachersQuery()` — teacher names for class cards (admin only)
- `useMemberQuery(selectedId)` — detail fetch for the selected member (when list data is incomplete)
- `useMemberStatsQuery()` — prefetched on hover

**Prefetch behavior:**
- On hover over a member row: `prefetchMemberQuery(memberId)` + `prefetchMemberStatsQuery(memberId)`
- After initial load (admin): prefetches members with and without class filter, plus all classes
- After initial load (teacher): prefetches org-wide members (for "ver todos")
- Class member loading: `ensureClassMembersLoaded()` lazily loads members for a class on click

**Children rendered:**
- `ClassesGallery` — horizontal scrollable class cards (teacher and admin "eu" mode)
- `AdminClassesView` — grid of all classes with inline student lists (admin "turmas" mode)
- `StudentDetailCard` / `TeacherDetailCard` — detail drawer (right panel, 40% width)
- `ManageClassDialog` — class member management dialog (add/remove students, rename, delete)
- `CreateClassDialog` — new class creation dialog
- `ClassesOnboarding` — onboarding flow when teacher has no primary class (lazy-loaded via `dynamic()`)

### 3.4 Detail Drawer — `components/students/StudentDetailCard.tsx`

Right-side panel that opens when a student row is clicked. Contains three tabs:

| Tab | Component | Data Source |
|---|---|---|
| **Info** | `StudentInfoTab` | `Member` from list/detail cache — contact, academic info, parent info |
| **Grades** (Medias) | `StudentGradesTab` | `useMemberGradeBoardQuery()`, `useMemberCFSDashboardQuery()`, `useMemberPeriodElementsQuery()`, `useMemberEnrollmentDomainsQuery()` |
| **Overview** (Resumo) | `StudentOverviewTab` | `useStudentAnalyticsQuery()`, `useMemberSessionsQuery()`, `useMemberAssignmentsQuery()` — financial cards, recent sessions, recent assignments |

**Teacher equivalent:** `TeacherDetailCard` with tabs for info, sessions (with date filtering), and stats.

### 3.5 Next.js API Routes

All thin auth proxies using `proxyAuthedJson()`:

| Route File | Method | Backend Path |
|---|---|---|
| `app/api/members/route.ts` | `GET` | `/api/v1/members?role=&status=&page=&per_page=&class_id=` |
| `app/api/members/[id]/route.ts` | `GET` | `/api/v1/members/{id}` |
| `app/api/members/[id]/route.ts` | `PATCH` | `/api/v1/members/{id}` |
| `app/api/members/[id]/stats/route.ts` | `GET` | `/api/v1/members/{id}/stats` |
| `app/api/members/[id]/sessions/route.ts` | `GET` | `/api/v1/members/{id}/sessions` (forwards query params) |
| `app/api/members/[id]/assignments/route.ts` | `GET` | `/api/v1/members/{id}/assignments` |
| `app/api/members/[id]/teacher-stats/route.ts` | `GET` | `/api/v1/members/{id}/teacher-stats` |
| `app/api/members/[id]/grades/[year]/route.ts` | `GET` | `/api/v1/members/{id}/grades/{year}` |
| `app/api/members/[id]/grades/cfs/route.ts` | `GET` | `/api/v1/members/{id}/grades/cfs` |
| `app/api/members/[id]/grades/periods/[periodId]/elements/route.ts` | `GET` | `/api/v1/members/{id}/grades/periods/{periodId}/elements` |
| `app/api/members/[id]/grades/enrollments/[enrollmentId]/domains/route.ts` | `GET` | `/api/v1/members/{id}/grades/enrollments/{enrollmentId}/domains` |
| `app/api/members/me/route.ts` | `GET`, `PATCH` | `/api/v1/members/me` |

### 3.6 Backend Router — `routers/members.py`

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| `GET` | `` | `require_teacher` | `list_members()` — paginated list, filtered by role/status/class_id |
| `GET` | `/me` | `get_current_user` | `get_member()` — own profile, any role |
| `GET` | `/{member_id}` | `require_teacher` | `get_member()` |
| `GET` | `/{member_id}/sessions` | `require_teacher` | `get_member_sessions()` — as student or teacher, with date range |
| `GET` | `/{member_id}/assignments` | `require_teacher` | `get_member_assignments()` — role-filtered |
| `GET` | `/{member_id}/stats` | `require_teacher` | `get_member_stats()` — aggregated student stats |
| `GET` | `/{member_id}/teacher-stats` | `require_teacher` | `get_teacher_stats()` — admin or self only |
| `GET` | `/{member_id}/grades/cfs` | `require_teacher` | `grades_service.get_cfs_dashboard()` |
| `GET` | `/{member_id}/grades/periods/{period_id}/elements` | `require_teacher` | `grades_service.get_elements()` |
| `GET` | `/{member_id}/grades/enrollments/{enrollment_id}/domains` | `require_teacher` | `grades_service.get_domains()` |
| `GET` | `/{member_id}/grades/{academic_year}` | `require_teacher` | `grades_service.get_board_data()` |
| `PATCH` | `/me` | `get_current_user` | `update_member()` — role-based field restrictions |
| `PATCH` | `/{member_id}` | `require_admin` | `update_member()` — admin only |
| `DELETE` | `/{member_id}` | `require_admin` | `remove_member()` — soft-delete (status → suspended) |

**Key details:**
- `PATCH /me` applies role-based field filtering: students can edit parent info, teachers can edit subjects_taught/hourly_rate, all roles can edit name/avatar/phone
- Grade endpoints validate org membership via `get_member()` before delegating to `grades_service`
- Teacher stats endpoint enforces self-access for non-admins

### 3.7 Backend Service — `services/members_service.py`

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

**Detail-only fields:** `school_name`, `phone`, `subjects_taught`, `parent_name`, `parent_email`, `parent_phone`, `hourly_rate`.

**Note:** `list_members()` currently uses `MEMBER_DETAIL_SELECT` because the frontend detail card seeds from list data. The comment in the service notes this should switch to `MEMBER_LIST_SELECT` once the detail card owns its own fetch.

**No batch hydration:** Members use the `profiles` table directly (flat — no joins). The summary/detail split is purely at the column level, unlike calendar which hydrates foreign keys.

**Key business logic:**

- **`list_members()`** — Supports multi-role filtering (e.g., `"admin,teacher"` for the teachers page), class_id filtering via `contains("class_ids", [class_id])`, pagination. Uses `paginated_query()` for the simple path, manual query builder for multi-role or class_id filtering.
- **`get_member_stats()`** — Aggregates: total sessions, sessions this month, total assignments, completed assignments, average grade, completion rate, weekly session counts (last 12 weeks), grade list. For non-admin teachers, filters assignments to only those they own.
- **`get_teacher_stats()`** — Aggregates: total sessions, sessions this month, total hours, snapshot-based earnings, revenue generated, weekly session counts. Uses session type price snapshots for earnings calculation with fallback to hourly rate.
- **`get_member_sessions()`** — Lists `calendar_sessions` for a member as student (`contains("student_ids", [member_id])`) or as teacher (`eq("teacher_id", member_id)`). Hydrates subject names and session types via batch fetches.
- **`get_member_assignments()`** — Lists `student_assignments` for a student, hydrated with parent assignment info (title, due_date, status) and artifact type. Filters by teacher ownership for non-admins.
- **`remove_member()`** — Soft-delete: sets `status` to `"suspended"`.

### 3.8 Backend Schemas — `schemas/members.py`

**MemberListItem (response):**
```
id, full_name, display_name, email, role, status,
avatar_url, grade_level, course, school_name, phone,
subjects_taught, subject_ids, class_ids,
parent_name, parent_email, parent_phone,
hourly_rate, onboarding_completed, created_at
```

**MemberUpdateRequest:**
```
status, class_ids, role, full_name, display_name, avatar_url,
phone, grade_level, course, school_name,
parent_name, parent_email, parent_phone,
subjects_taught, subject_ids, hourly_rate
```

## 4. Cache Contract

| Attribute | Value |
|---|---|
| **Query namespace** | `members:list:` (list), `members:detail:` (detail), `members:stats:` (stats), `members:sessions:` (sessions), `members:assignments:` (assignments), `members:teacher-sessions:` (teacher sessions), `members:teacher-stats:` (teacher stats), `members:grade-board:` (grades), `members:cfs:` (CFS), `members:elements:` (period elements), `members:domains:` (enrollment domains) |
| **staleTime** | 60,000ms (1 minute) — all member queries |

**List query keys:**

Pattern: `buildMembersQueryKey({ role, status, page, perPage, classId })`

Shape: `members:list:{role}|{status}|{page}|{perPage}|{classId ?? "*"}`

Example: `members:list:student|active|1|100|cls_abc123`

Encodes all five filter dimensions: role, status, pagination, and optional class filter.

**Detail query keys:**

Pattern: `buildMemberDetailKey(memberId)`

Shape: `members:detail:{memberId}`

**Stats / sub-entity keys:**

| Prefix | Key Shape | Used by |
|---|---|---|
| `members:stats:` | `members:stats:{memberId}` | `useMemberStatsQuery` |
| `members:sessions:` | `members:sessions:{memberId}` | `useMemberSessionsQuery` |
| `members:assignments:` | `members:assignments:{memberId}` | `useMemberAssignmentsQuery` |
| `members:teacher-sessions:` | `members:teacher-sessions:{memberId}\|{dateFrom}\|{dateTo}` | `useTeacherSessionsQuery` |
| `members:teacher-stats:` | `members:teacher-stats:{memberId}` | `useTeacherStatsQuery` |
| `members:grade-board:` | `members:grade-board:{memberId}\|{academicYear}` | `useMemberGradeBoardQuery` |
| `members:cfs:` | `members:cfs:{memberId}` | `useMemberCFSDashboardQuery` |
| `members:elements:` | `members:elements:{memberId}\|{periodId}` | `useMemberPeriodElementsQuery` |
| `members:domains:` | `members:domains:{memberId}\|{enrollmentId}` | `useMemberEnrollmentDomainsQuery` |

**Invalidation rules:**

| Trigger | What is invalidated |
|---|---|
| `invalidateMembersQueries()` | All `members:list:*` queries via prefix match |
| Class membership change | `updateMembersQueryData(key, updater)` — targeted update on the specific list key |
| Member detail updated | `updateMemberDetailCache(member)` — directly sets detail cache via `setQueryData` |

**Mutation sync (class membership changes):**

Class membership mutations (add/remove students from classes) are the primary write path. They synchronize across:
1. The `classMembersCache` local state in `StudentsPage`
2. The `members:list:*` query cache via `updateMembersQueryData()`
3. The `members:detail:*` query cache via `updateMemberDetailCache()`
4. The class members query cache via `addStudentsToClassMembersCache()` / `removeStudentsFromClassMembersCache()`
5. The primary student views via `syncStudentsIntoPrimaryStudentViews()` / `removeStudentsFromPrimaryStudentViews()`

**Snapshot / restore:**

`snapshotMembersQueries()` captures all cache entries under `members:list:` prefix. `restoreMembersQueries(snapshots)` writes each snapshot's data back. Used by the manage class dialog for rollback on failure.

**Prefetch behavior:**

| What | When | Mechanism |
|---|---|---|
| Member detail | On hover over member row | `prefetchMemberQuery(memberId)` |
| Member stats | On hover over member row | `prefetchMemberStatsQuery(memberId)` |
| Org-wide members | After initial load (admin/teacher) | `prefetchMembersQuery()` without class filter |
| Primary-class members | After initial load (admin with primary class) | `prefetchMembersQuery()` with primary class filter |
| All classes | After initial load (admin) | `prefetchAllClassesQuery()` |
| Class members | On class card click | `prefetchClassMembersQuery(classId)` via `ensureClassMembersLoaded()` |

**Student search (separate query module — `lib/queries/students.ts`):**

Ephemeral search queries used by `StudentPicker` in the calendar feature. No mutations, snapshot/restore, or cross-feature sync. Key prefix: `students:search:`, staleTime: 60,000ms. Fetches from `/api/calendar/students/search` (backend route in `routers/calendar.py`).

## 5. Optimistic Update Strategy

The students feature has **limited optimistic behavior** compared to calendar. The main optimistic operations are class membership changes.

### Add student to class (from ManageClassDialog)

1. Build `ClassMember` objects from the `StudentInfo` array
2. Update `classMembersCache` local state (add new members)
3. Update `memberCounts` local state
4. Call `addStudentsToClassMembersCache(classId, students)` — updates the classes query cache
5. If the class is not the primary class but primary class exists: also add to primary class caches and call `syncStudentsIntoPrimaryStudentViews()`
6. Background: `prefetchMemberQuery()` for each student to hydrate full Member objects
7. **On failure:** `handleManageAddMembersRollback(classId, studentIds)` — removes the added students from all caches

### Remove student from class (from ManageClassDialog)

1. Update `classMembersCache` (remove member)
2. Update `memberCounts`
3. Call `removeStudentsFromClassMembersCache(classId, [memberId])`
4. If the class is the primary class: call `removeStudentsFromPrimaryStudentViews()`
5. **On failure:** `handleManageRemoveMemberRollback(classId, member)` — re-adds the member to all caches

### Remove student from non-primary class (inline)

1. Save member for rollback
2. Update `classMembersCache` and `memberCounts` optimistically
3. Call `removeClassMembers(selectedClassId, [memberId])`
4. **On failure:** Restore the member to `classMembersCache` and increment `memberCounts`

### Add student to primary class (from "ver todos" expansion)

1. Call `addClassMembers(primaryClassId, [memberId])`
2. Update `members:list:*` query cache via `updateMembersQueryData()`
3. Update `classMembersCache` and `memberCounts`
4. Update class members cache via `updateClassMembersCache()`
5. Update member detail cache
6. **On failure:** Show error toast (no rollback — the API call happens first)

## 6. Payload Shapes

### List Payload

Used by `list_members()` with `MEMBER_DETAIL_SELECT` (see note in Section 3.7 — currently uses detail select).

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Member ID |
| `full_name` | `string \| null` | Full name |
| `display_name` | `string \| null` | Display name |
| `email` | `string \| null` | Email address |
| `role` | `string \| null` | `"admin"`, `"teacher"`, `"student"` |
| `status` | `string \| null` | `"active"`, `"pending_approval"`, `"suspended"` |
| `avatar_url` | `string \| null` | Profile photo URL |
| `grade_level` | `string \| null` | Grade level (e.g., "12º ano") |
| `course` | `string \| null` | Academic course |
| `school_name` | `string \| null` | School name (detail-only, currently in list) |
| `phone` | `string \| null` | Phone number (detail-only, currently in list) |
| `subjects_taught` | `string[] \| null` | Subjects taught (teachers only, detail-only, currently in list) |
| `subject_ids` | `string[] \| null` | Subject IDs |
| `class_ids` | `string[] \| null` | Class membership array |
| `parent_name` | `string \| null` | Parent/guardian name (detail-only, currently in list) |
| `parent_email` | `string \| null` | Parent email (detail-only, currently in list) |
| `parent_phone` | `string \| null` | Parent phone (detail-only, currently in list) |
| `hourly_rate` | `number \| null` | Hourly rate (teachers, detail-only, currently in list) |
| `onboarding_completed` | `boolean` | Whether onboarding is done |
| `created_at` | `string \| null` | Registration date |

### Detail Payload

Same as list payload currently (see note above). When the split is implemented, the list payload will drop: `school_name`, `phone`, `subjects_taught`, `parent_name`, `parent_email`, `parent_phone`, `hourly_rate`.

### Member Stats Payload (from `get_member_stats()`)

| Field | Type | Purpose |
|---|---|---|
| `total_sessions` | `number` | Total sessions as student |
| `sessions_this_month` | `number` | Sessions in current month |
| `total_assignments` | `number` | Total assignments |
| `completed_assignments` | `number` | Submitted or graded assignments |
| `average_grade` | `number \| null` | Average grade across graded assignments |
| `completion_rate` | `number` | 0-1 completion rate |
| `weekly_sessions` | `{ week, count }[]` | Last 12 weeks of session counts |
| `grade_list` | `{ title, grade }[]` | Individual assignment grades |

### Teacher Stats Payload (from `get_teacher_stats()`)

| Field | Type | Purpose |
|---|---|---|
| `total_sessions` | `number` | Total sessions taught |
| `sessions_this_month` | `number` | Sessions in current month |
| `total_hours` | `number` | Total hours taught |
| `hourly_rate` | `number \| null` | Profile hourly rate |
| `total_earnings` | `number \| null` | Snapshot-based or rate-based earnings |
| `total_revenue_generated` | `number` | Revenue from student prices |
| `weekly_sessions` | `{ week, count }[]` | Last 12 weeks of session counts |

## 7. Database

### Tables Involved

| Table | Description |
|---|---|
| `profiles` | Core member table — stores all users (admin, teacher, student) with role, status, contact info, academic info, parent info, class membership (`class_ids` array) |
| `calendar_sessions` | Queried for per-student session lists and stats (`contains("student_ids", [member_id])`) |
| `student_assignments` | Queried for per-student assignment lists and stats |
| `assignments` | Parent assignment table — joined for titles, due dates, teacher ownership filtering |
| `artifacts` | Queried for assignment artifact types (quiz, note, exercise_sheet, etc.) |
| `subjects` | Queried for subject name/color hydration in session lists |
| `session_types` | Queried for session type name/color hydration in session lists |

### Indexes

| Index | Table | Columns | Serves |
|---|---|---|---|
| `idx_profiles_active_students_org_name` | `profiles` | `(organization_id, full_name)` WHERE `role='student' AND status='active'` | Fetching active students by org + name (sorted list) |
| `idx_profiles_active_students_full_name_trgm` | `profiles` | GIN on `full_name` using `gin_trgm_ops` WHERE `role='student' AND status='active'` | Fuzzy text search on student names |
| `idx_profiles_active_students_display_name_trgm` | `profiles` | GIN on `display_name` using `gin_trgm_ops` WHERE `role='student' AND status='active'` | Fuzzy text search on student display names |

Note: Additional indexes on `profiles(organization_id)` and `profiles(organization_id, role, status)` are implicitly used by `list_members()` but are not explicitly defined in student-specific migrations. The class_id filtering uses `contains("class_ids", [class_id])` which benefits from a GIN index on `class_ids` if present.

### Read Patterns

| Pattern | Query Shape |
|---|---|
| Org + role + status (student list) | `.eq("organization_id", org_id).eq("role", "student").eq("status", "active")` |
| Org + multi-role (teacher list) | `.eq("organization_id", org_id).in_("role", ["admin", "teacher"])` |
| Org + class_id (class-scoped list) | `.eq("organization_id", org_id).contains("class_ids", [class_id])` |
| Org + member_id (detail) | `.eq("organization_id", org_id).eq("id", member_id)` |
| Student sessions | `.eq("organization_id", org_id).contains("student_ids", [member_id])` on `calendar_sessions` |
| Student assignments | `.eq("organization_id", org_id).eq("student_id", member_id)` on `student_assignments` |

## 8. Edge Cases and Notes

### Dual Query Modules

The students/members feature has two query modules:
- **`lib/queries/members.ts`** — The primary module for the students page. Handles member lists, detail, stats, sessions, assignments, grades, and CFS. Full cache contract with snapshot/restore.
- **`lib/queries/students.ts`** — Ephemeral search queries used by `StudentPicker` in the calendar feature. No mutations, no sync. Results are short-lived.

### Cross-Feature Cache Synchronization

Class membership changes in the students page must synchronize with:
- The **classes query cache** (via `addStudentsToClassMembersCache`, `removeStudentsFromClassMembersCache`, etc. from `lib/queries/classes.ts`)
- The **members list query cache** (via `updateMembersQueryData` with the specific list key)
- The **primary student views** (via `syncStudentsIntoPrimaryStudentViews`, `removeStudentsFromPrimaryStudentViews`)

This is one of the most complex cache synchronization patterns in the codebase because it crosses feature boundaries (students ↔ classes).

### Client-Side Filtering

Search and filter (by grade year, course) are performed **client-side** on the already-fetched member list. The list query fetches up to 100 members per page. This means:
- Text search is instant (no network request)
- Grade/course filters are instant
- The backend is not queried for filtered results (no server-side search on this page)

Student search via `useStudentSearchQuery()` (in `StudentPicker`) is a separate concern — it calls the backend `/api/v1/calendar/students/search` endpoint with trigram indexes.

### Shared Component for Students and Teachers

`StudentsPage` serves both `/dashboard/students` (with `memberRole="student"`) and `/dashboard/teachers` (with `memberRole="teacher"`). When in teacher mode:
- Grade year and course filters are hidden
- Subjects taught are shown in the list row
- `TeacherDetailCard` is rendered instead of `StudentDetailCard`
- The admin mode toggle is hidden
- The query uses `role="admin,teacher"` instead of `role="student"`

### Primary Class Concept

Every teacher has a **primary class** — a special class that acts as the default scope for their student list. Primary classes are identified by `is_primary: true` on the classroom record. The primary class concept is resolved via `usePrimaryClass()` hook. When a teacher has no primary class, a `ClassesOnboarding` component is shown instead of the student list.

### "Ver todos" Expansion

When scoped by primary class, the student list shows a "Ver todos os alunos do centro" button at the bottom. Clicking it:
1. Triggers a second `useMembersQuery()` with no class filter
2. Shows "extra" students (those not in the primary class) below a separator
3. Clicking an extra student shows an "add to my students" dialog instead of opening the detail drawer
4. Adding an extra student calls `addClassMembers()` and updates all relevant caches

### Member Stats Are Role-Filtered

`get_member_stats()` and `get_member_assignments()` filter results by teacher ownership for non-admin users. A teacher only sees stats from sessions they taught and assignments they created. Admin sees everything.

### Onboarding Guard

If a teacher or admin (in "eu" mode) has no primary class, the entire student list is replaced by the `ClassesOnboarding` component (lazy-loaded). This guides the user through creating their first class before they can see students.

### Admin Turmas View

The "Turmas" admin mode renders `AdminClassesView` — a grid layout showing all classes across all teachers. Each class card displays its members inline. Clicking a student in this view opens the detail drawer. Clicking "manage" on a class card opens the `ManageClassDialog`. This view uses `useAllClassesQuery()` (all org classes) instead of `useOwnClassesQuery()`.

## 9. Reference Status

The students feature is **not** the reference implementation. It follows the calendar pattern partially:

| Pattern | Status |
|---|---|
| **Thin route bootstrap** | Yes — `page.tsx` server-fetches initial members and classes |
| **Server-first initial data** | Yes — `members.server.ts` direct backend calls |
| **Shell orchestration** | Partial — `StudentsPage` combines shell and UI (no separate shell component) |
| **Summary/detail split** | Defined in service (`MEMBER_LIST_SELECT` vs `MEMBER_DETAIL_SELECT`) but **not yet enforced** — list currently uses detail select |
| **Complete cache contract** | Yes — `lib/queries/members.ts` exports key builders, hooks, prefetch, snapshot/restore, invalidation |
| **Optimistic mutations with rollback** | Yes — class membership operations have rollback paths |
| **Batch hydration** | N/A — `profiles` is a flat table with no foreign key joins in the list query |
| **Deferred prefetch** | Yes — hover-triggered member/stats prefetch, lazy class member loading |
| **Lazy-loaded heavy components** | Yes — `ClassesOnboarding` loaded via `dynamic()` |

**Known gaps:**
- `list_members()` should use `MEMBER_LIST_SELECT` (not `MEMBER_DETAIL_SELECT`)
- The page combines shell and UI concerns in a single 1770-line component
- Client-side search could be augmented with server-side search for orgs with >100 students
