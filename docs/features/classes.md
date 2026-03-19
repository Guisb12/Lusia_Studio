---
last-updated: 2026-03-19
stability: frequently-updated
agent-routing: "Read before working on classes/classrooms feature code."
---

# Classes

## 1. Overview

Classes (classrooms) let teachers organize students into groups for batch operations — session scheduling, assignment scoping, and grade tracking. Each teacher has one auto-created **primary class** ("Meus Alunos") that acts as their default student roster, plus unlimited secondary classes for specific teaching groups. Admins can view and manage all classes across the organization; teachers see only their own.

## 2. Availability

| Attribute | Value |
|---|---|
| **Roles** | Admin (full CRUD on all classes, can create classes for other teachers), Teacher (full CRUD on own classes), Student (no direct access — students are class *members*, not class *viewers*) |
| **Center types** | All (trial included) |
| **Teacher route** | `/dashboard/students` (classes managed via students page) |
| **Admin route** | Same route — admin sees "Turmas do Centro", teacher sees "Minhas Turmas" |

## 3. Architecture

### 3.1 Route — `app/(teacher)/dashboard/students/page.tsx`

Classes are rendered within the students page layout. Server-side, the route fetches initial class data and passes it to `ClassesPage`.

### 3.2 Feature Shell — `components/classes/ClassesPage.tsx`

Client component. Owns the split-panel layout:

**Left panel:** `ClassesList` grid of classroom cards (animates to 55% width when detail is open).
**Right panel:** `ClassDetail` for the selected class (slides in/out).

**State managed:**
- `classes` — current classes array
- `selectedId` — selected class ID for detail panel
- `createOpen` — create dialog visibility

**Key behavior:**
- Shows `ClassesOnboarding` if no classes exist (guides teacher through primary class creation)
- Admin header: "Turmas do Centro"; teacher header: "Minhas Turmas"
- Passes `primaryClassId` to child dialogs for auto-sync

### 3.3 UI Components

**Component tree:**

```
ClassesPage
├── ClassesList
│   └── ClassCard (per classroom — avatar stack, subject pills, member count)
├── ClassDetail (selected classroom)
│   ├── Name/description inline editing
│   ├── Student list (grouped by grade level, collapsible)
│   ├── Add students panel (from available pool)
│   └── Delete/archive confirmation
├── CreateClassDialog
│   ├── SubjectSelector
│   ├── StudentPicker (with subject-based recommendations)
│   └── TeacherPicker (admin only)
└── ClassesOnboarding (first-time flow)
    └── Step 1: Welcome → Step 2: Select students → Step 3: Confirm
```

**ClassesList** (`components/classes/ClassesList.tsx`):
- Grid layout (1–3 columns responsive)
- Primary classes appear first, then alphabetical
- Each card shows: class icon (Home for primary, Users for regular), subject pills with colors, avatar stack (max 4 members + overflow count), member count

**ClassDetail** (`components/classes/ClassDetail.tsx`):
- Inline editing for name and description (not allowed for primary classes)
- Student list grouped by grade level with collapsible sections and search
- Add mode: shows available students from org roster
- Remove mode: multi-select students for removal
- Delete/archive button (not for primary classes)
- Cache sync: updates class queries, class members cache, and primary student views on member changes

**CreateClassDialog** (`components/classes/CreateClassDialog.tsx`):
- Form: class name (required), subjects (multi-select), students (with recommendations), teacher (admin only)
- Auto-syncs added students to the teacher's primary class
- Cache sync: `syncCreatedClassIntoQueries()` + `addStudentsToClassMembersCache()`

**ClassesOnboarding** (`components/classes/ClassesOnboarding.tsx`):
- Three-step flow for first-time class creation
- Uses `useClassRecommendationsQuery()` for smart student recommendations (students sharing subjects with teacher)
- Auto-selects recommended students
- Creates primary class with `is_primary: true`

### 3.4 Next.js API Routes

**`app/api/classes/route.ts`** — collection operations:
- `GET` — forwards `active`, `page`, `per_page`, `own` params to `GET /api/v1/classrooms`
- `POST` — forwards JSON body to `POST /api/v1/classrooms`

**`app/api/classes/recommendations/route.ts`**:
- `GET` — forwards to `GET /api/v1/classrooms/recommendations`

**`app/api/classes/[id]/route.ts`** — single classroom operations:
- `GET` — forwards to `GET /api/v1/classrooms/{id}`
- `PATCH` — forwards body to `PATCH /api/v1/classrooms/{id}`
- `DELETE` — forwards to `DELETE /api/v1/classrooms/{id}`

**`app/api/classes/[id]/members/route.ts`** — member operations:
- `GET` — forwards to `GET /api/v1/classrooms/{id}/members`
- `POST` — forwards `{ student_ids }` to `POST /api/v1/classrooms/{id}/members`
- `DELETE` — forwards `{ student_ids }` to `DELETE /api/v1/classrooms/{id}/members`

All routes use `proxyAuthedJson()` for auth.

### 3.5 Backend Router — `routers/classrooms.py`

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| `GET` | `/recommendations` | `require_teacher` | `get_smart_recommendations()` |
| `GET` | `/` | `require_teacher` | `list_classrooms()` — paginated, admin sees all unless `own=true` |
| `GET` | `/{classroom_id}` | `require_teacher` | `get_classroom()` |
| `POST` | `/` | `require_teacher` | `create_classroom()` — admin can assign `teacher_id` |
| `PATCH` | `/{classroom_id}` | `require_teacher` | `update_classroom()` — access check via `assert_classroom_access()` |
| `DELETE` | `/{classroom_id}` | `require_teacher` | `delete_classroom()` — soft delete, blocks primary class deletion |
| `GET` | `/{classroom_id}/members` | `require_teacher` | `get_classroom_members()` |
| `POST` | `/{classroom_id}/members` | `require_teacher` | `add_students_to_classroom()` |
| `DELETE` | `/{classroom_id}/members` | `require_teacher` | `remove_students_from_classroom()` |

### 3.6 Backend Service — `services/classrooms_service.py`

**SELECT constants:**

```
CLASSROOM_SELECT:
  id, organization_id, name, description, subject_ids, grade_levels,
  courses, teacher_id, active, is_primary, created_at, updated_at

MEMBER_SELECT:
  id, full_name, display_name, avatar_url, grade_level, course, subject_ids
```

**Key business logic:**

- **Access control:** `assert_classroom_access()` checks admin can access any class; teachers can only access their own. Returns 403 otherwise.
- **Primary class guard:** Only one active primary class per teacher. `create_classroom()` checks for existing primary before creating. `delete_classroom()` blocks deletion of primary classes.
- **Member management:** Students are linked via `profiles.class_ids` array. `add_students_to_classroom()` appends the classroom ID to each student's `class_ids`. `remove_students_from_classroom()` removes it. Both operate per-student (fetching current `class_ids`, modifying, updating).
- **Smart recommendations:** `get_smart_recommendations()` merges teacher's `subject_ids` and `subjects_taught`, then calls the `get_student_recommendations` RPC function. Falls back to all active students if RPC fails. Returns students with `matching_subject_ids` and `score` (count of overlapping subjects).
- **Pagination:** Uses `paginated_query()` helper.
- **Soft delete:** `delete_classroom()` sets `active = false`.

### 3.7 Backend Schemas — `schemas/classrooms.py`

**ClassroomCreate:** `name` (str, 1–200), `description` (optional), `subject_ids` (list, default []), `grade_levels` (list, default []), `courses` (list, default []), `teacher_id` (optional, admin only), `is_primary` (bool, default false)

**ClassroomUpdate:** All fields optional — `name`, `description`, `subject_ids`, `grade_levels`, `courses`, `active`

**ClassroomResponse:** Full model — `id`, `organization_id`, `name`, `description`, `subject_ids`, `grade_levels`, `courses`, `teacher_id`, `active`, `is_primary`, `created_at`, `updated_at`

**ClassroomMembersUpdate:** `student_ids` (list[str], min 1)

**ClassroomMemberResponse:** `id`, `full_name`, `display_name`, `avatar_url`, `grade_level`, `course`, `subject_ids`

**StudentRecommendation:** `student_id`, `full_name`, `display_name`, `avatar_url`, `grade_level`, `course`, `subject_ids`, `matching_subject_ids`, `score`

## 4. Cache Contract

| Attribute | Value |
|---|---|
| **Query namespace** | `classes:own:list`, `classes:all:list`, `classes:recommendations`, `classes:members:{classId}` |
| **Stale time** | 60,000ms (1 minute) |

**Query keys:**

| Key | Shape | Used for |
|---|---|---|
| Own classes | `classes:own:list` | Teacher's own classes (page 1, 50 items) |
| All classes | `classes:all:list` | Admin view — all classes (page 1, 100 items) |
| Recommendations | `classes:recommendations` | Smart student recommendations for onboarding |
| Class members | `classes:members:{classId}` | Students in a specific class |

**Invalidation rules:**

| Trigger | Action |
|---|---|
| Class created | `syncCreatedClassIntoQueries()` adds to own/all queries sorted by name |
| Class updated | `updateClassesQueries(updater)` updates both own and all queries |
| Class deleted | `removeClassFromQueries(classId)` removes from both queries |
| Members added | `addStudentsToClassMembersCache()` + `syncStudentsIntoPrimaryStudentViews()` |
| Members removed | `removeStudentsFromClassMembersCache()` + `removeStudentsFromPrimaryStudentViews()` |

**Snapshot/restore:**

`snapshotClassesQueries()` captures own and all class queries. `restoreClassesQueries(snapshots)` restores them. Used for optimistic rollback.

## 5. Optimistic Update Strategy

Classes use **direct cache mutation with server refetch fallback** rather than full optimistic mutation. Member add/remove operations update the class members cache immediately, then rely on the server response. On failure, the page refetches.

Primary class sync: when students are added to any class, `syncStudentsIntoPrimaryStudentViews()` also adds them to the primary class members cache and the members query cache. This keeps the primary class roster consistent.

## 6. Payload Shapes

### Classroom Payload

Single payload shape (no summary/detail split — classrooms are lightweight):

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Classroom ID |
| `organization_id` | `string` | Org scope |
| `name` | `string` | Class name |
| `description` | `string \| null` | Optional description |
| `subject_ids` | `string[]` | Linked subjects |
| `grade_levels` | `string[]` | Grade levels in class |
| `courses` | `string[]` | Course codes |
| `teacher_id` | `string` | Owning teacher |
| `active` | `boolean` | Soft-delete flag |
| `is_primary` | `boolean` | Primary class flag |
| `created_at` | `string \| null` | Creation timestamp |
| `updated_at` | `string \| null` | Last update |

### Class Member Payload

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Student profile ID |
| `full_name` | `string \| null` | Full name |
| `display_name` | `string \| null` | Display name |
| `avatar_url` | `string \| null` | Avatar |
| `grade_level` | `string \| null` | Grade level |
| `course` | `string \| null` | Course |
| `subject_ids` | `string[] \| null` | Student's subjects |

## 7. Database

Cross-reference: See `data/classes.md` for full entity schemas, column definitions, and index details.

### Table: `classrooms`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `organization_id` | uuid | NOT NULL, FK → organizations(id) CASCADE |
| `name` | text | NOT NULL |
| `description` | text | nullable |
| `subject_ids` | uuid[] | default `{}` |
| `grade_levels` | text[] | default `{}` |
| `courses` | text[] | default `{}` |
| `teacher_id` | uuid | NOT NULL, FK → profiles(id) |
| `active` | boolean | default true |
| `is_primary` | boolean | default false |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | default now() |

### Indexes

| Index | Columns | Serves |
|---|---|---|
| `idx_classrooms_org` | `(organization_id)` | Listing classes by org |
| `idx_classrooms_teacher` | `(teacher_id)` | Teacher's own classes |
| `idx_classrooms_active` | `(organization_id, active)` | Active class queries |
| `idx_classrooms_primary` | `(teacher_id, is_primary)` WHERE `is_primary = true` | Enforcing one primary per teacher |

### Student–Class Relationship

Students are linked to classes via the `profiles.class_ids` uuid array column (reverse relationship). Each student's `class_ids` contains 0+ classroom UUIDs. No join table exists — membership is managed by modifying the student's `class_ids` array.

### RPC Function: `get_student_recommendations`

Parameters: `p_org_id uuid`, `p_teacher_subject_ids uuid[]`

Returns active students whose `subject_ids` overlap with the teacher's subjects, sorted by match score descending. Used by the onboarding flow and `CreateClassDialog`.

## 8. Edge Cases and Notes

### Primary Class Constraints
- One primary class per teacher, enforced by the partial unique index and service-level check.
- Primary classes cannot be deleted or renamed.
- Students added to any class are auto-synced to the teacher's primary class via `syncStudentsIntoPrimaryStudentViews()`.

### Soft Delete
- `DELETE` sets `active = false` — classes are archived, not destroyed.
- Archived classes are excluded from default queries (`active = true` filter).

### Member Management Is Per-Student
- Adding/removing members modifies each student's `profiles.class_ids` array individually. This is not batch-optimized — large member changes produce N update queries.

### Smart Recommendations Fallback
- If the RPC `get_student_recommendations` fails (or teacher has no subjects), the system falls back to returning all active students with `score = 0`.

## 9. Reference Status

Classes is a lighter feature with a single payload shape (no summary/detail split) and no complex optimistic patterns. It follows the standard layer structure (route → shell → components → API → router → service → DB) but skips some patterns that heavier features require (deferred prefetch, summary vs detail hydration).
