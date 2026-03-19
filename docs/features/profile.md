---
last-updated: 2026-03-19
stability: frequently-updated
agent-routing: "Read before working on profile feature code (teacher or student profile pages)."
---

# Profile

## 1. Overview

The profile feature allows every authenticated user to view and edit their own profile information. Teachers and admins access a profile page at `/dashboard/profile`; students access theirs at `/student/profile`. Both pages share the same visual primitives (`ProfilePrimitives.tsx`, `ProfileSubjectsPicker.tsx`, `ProfileFieldSelect.tsx`) and the same query module (`lib/queries/profile.ts`), but differ in the sections displayed and the fields each role may edit. Admin users additionally see organization settings and enrollment code management on their profile page.

Profile is a **singleton entity** feature — there is no list/detail split, no collection queries, and no optimistic snapshot/restore cycle. Each user has exactly one profile, fetched via `GET /members/me`, and fields are patched individually via `PATCH /members/me`. Cache updates are applied directly after each successful save using `patchMyProfileQuery()`.

## 2. Availability

| Attribute | Value |
|---|---|
| **Roles** | Admin (own profile + organization settings), Teacher (own profile), Student (own profile + academic info + parent/guardian info) |
| **Center types** | All (trial included) |
| **Teacher/Admin route** | `/dashboard/profile` |
| **Student route** | `/student/profile` |

**Role-based field restrictions** (enforced in backend `update_own_profile_endpoint()`):

| Fields | Admin | Teacher | Student |
|---|---|---|---|
| `full_name`, `display_name`, `avatar_url`, `phone` | Yes | Yes | Yes |
| `subjects_taught`, `hourly_rate` | Yes | Yes | No |
| `school_name`, `subject_ids` | No | No | Yes |
| `parent_name`, `parent_email`, `parent_phone` | No | No | Yes |

## 3. Architecture

### 3.1 Route — Teacher/Admin: `app/(teacher)/dashboard/profile/page.tsx`

Server component. Calls `fetchMyProfileServer()` to load the current user's profile, passes it as `initialProfile` to `TeacherProfilePage`. Minimal — 12 lines.

### 3.2 Route — Student: `app/(student)/student/profile/page.tsx`

Server component. Identical pattern — calls `fetchMyProfileServer()`, passes `initialProfile` to `StudentProfilePage`. Also 12 lines.

### 3.3 Server Fetch — `lib/members.server.ts`

`fetchMyProfileServer()` calls `fetchBackendJsonServer("/api/v1/members/me")` directly against the FastAPI backend (skipping the Next API proxy). Returns `Member | null` with a `null` fallback.

### 3.4 Feature Shell — Teacher/Admin: `components/dashboard/TeacherProfilePage.tsx`

Client component (`"use client"`). Acts as both shell and UI — profile is simple enough that a separate shell is unnecessary.

**State managed:**
- `member` — local `Member | null` state, initialized from `initialProfile`, synced from `profileQuery.data`
- `subjectIds` — local `string[]` tracking the teacher's `subjects_taught`
- `orgData` — local org settings state (admin only), synced from `organizationQuery.data`
- `rotatingStudent` / `rotatingTeacher` — loading state for enrollment code rotation
- `copiedCode` — clipboard feedback state

**Query orchestration:**
- `useMyProfileQuery(initialProfile, enabled)` — singleton profile query with server-seeded initial data
- `useOrganizationQuery(orgId, enabled, initialData)` — organization data, deferred via `useDeferredQueryEnabled()`, admin-only

**Mutations:**
- `patchMe(body)` — calls `PATCH /api/members/me` for profile fields
- `patchOrg(orgId, body)` — calls `PATCH /api/organizations/{orgId}` for org settings (admin only)
- `handleRotateCode(type)` — calls `POST /api/organizations/{orgId}/codes/rotate-{student|teacher}` to regenerate enrollment codes

**Sections rendered:**
- Left sidebar: avatar upload (`AvatarUpload`), display name editor (`DisplayNameEditor`), email, role badge, member-since date, logout button
- Contact: full name, email (read-only), phone
- Subjects: `ProfileSubjectsPicker` with `subjects_taught` field
- Security: `ChangePasswordSection` — password change form (all roles)
- Organization settings (admin only): org logo, name, email, phone, district (`DistrictPicker`), city, address, postal code
- Enrollment codes (admin only): student/teacher codes with copy and rotate actions

### 3.5 Feature Shell — Student: `components/student-profile/StudentProfilePage.tsx`

Client component (`"use client"`). Same combined shell+UI pattern as the teacher page.

**State managed:**
- `member` — local `Member | null` state, synced from `profileQuery.data`
- `subjectIds` — local `string[]` tracking the student's `subject_ids`

**Query orchestration:**
- `useMyProfileQuery(initialProfile, enabled)` — singleton profile query
- `useGradeBoardQuery(academicYear, initialData, { enabled })` — grade board data, deferred via `useDeferredQueryEnabled()`
- `useCFSDashboardQueryWithOptions(undefined, { enabled })` — CFS data, enabled only for `secundario` education level, also deferred

**Deferred data:** Grade board and CFS data are secondary — loaded after first paint via `useDeferredQueryEnabled()`. They are used for the grades summary card in the sidebar.

**Mutations:**
- `patchMe(body)` — same as teacher, calls `PATCH /api/members/me`
- `handleSaveSubjects(ids)` — saves `subject_ids` field

**Sections rendered:**
- Left sidebar: avatar upload, display name editor, email, role badge, grade level badge, course badge, member-since date, grades summary card (yearly average + CFS, links to `/student/grades`), logout button
- Contact: full name, email (read-only), phone
- Academic: grade level (read-only), course (read-only, if applicable), school name (editable)
- Subjects: `ProfileSubjectsPicker` with `subject_ids` field
- Parent/Guardian: parent name, parent email, parent phone
- Security: `ChangePasswordSection` — password change form (all roles)

### 3.6 Shared UI Components — `components/profile/`

**`ProfilePrimitives.tsx`** — reusable layout primitives shared by both teacher and student pages:
- `ProfileCard` — card wrapper with brand styling
- `ProfileSectionLabel` — small uppercase section header with optional right action
- `ProfileSection` — combines label + card with divider rows
- `InlineEditRow` — click-to-edit field with icon, label, save-on-Enter/blur, loading spinner. Supports `readOnly`, `muted`, `formatValue` options
- `InfoRow` — static row for custom children (badges, selects)
- `DisplayNameEditor` — inline name editor centered in the avatar card

**`ProfileSubjectsPicker.tsx`** — subject selection widget used by both roles:
- Displays selected subjects as a list with icons and colors
- Opens `SubjectSelector` dialog on edit click
- Snapshots selection on open, diffs on close, saves only if changed
- Uses `useSubjectCatalogQuery()` for subject catalog data

**`ChangePasswordSection.tsx`** — self-contained password change form used by both roles:
- Contains "Nova password" + "Confirmar nova password" inputs
- Validates minimum length (6 chars) and match before submitting
- Calls `supabase.auth.updateUser({ password })` directly (no backend involvement)
- Shows loading/error states, clears form on success
- Uses `ProfileSectionLabel` + `ProfileCard` wrappers for visual consistency

**`ProfileFieldSelect.tsx`** — portal-based dropdown select used for profile fields:
- Renders dropdown via `createPortal` to `document.body`
- Auto-closes on scroll
- Used within profile forms for structured field selection

### 3.7 Next.js API Route — `app/api/members/me/route.ts`

Thin auth proxy:
- `GET` — forwards to `GET /api/v1/members/me`
- `PATCH` — forwards JSON body to `PATCH /api/v1/members/me`

Uses `proxyAuthedJson()` helper for auth token forwarding.

### 3.8 Backend Router — `routers/members.py`

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| `GET` | `/me` | `get_current_user` (any role) | `get_member(db, org_id, user_id)` |
| `PATCH` | `/me` | `get_current_user` (any role) | `update_member(db, org_id, user_id, filtered_payload)` |

**Key behavior:** The `PATCH /me` endpoint applies **role-based field filtering** before delegating to the service. Fields not in the allowed set for the user's role are stripped from the payload. For teacher/admin, `subjects_taught` is mapped to `subject_ids` in the DB update.

### 3.9 Backend Service — `services/members_service.py`

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

**`get_member(db, org_id, member_id)`:**
Queries `profiles` with `MEMBER_DETAIL_SELECT`, scoped by `organization_id` and `id`. Uses `parse_single_or_404()`.

**`update_member(db, org_id, member_id, payload)`:**
Filters out `None` values from payload, updates `profiles` row scoped by `organization_id` and `id`. Returns the single updated row. If no fields to update, returns the current profile unchanged.

**Note:** Profile uses the members service (`members_service.py`) rather than having a dedicated profile service. The `get_member` and `update_member` functions serve both the profile page and the members management feature.

## 4. Cache Contract

| Attribute | Value |
|---|---|
| **Query key** | `members:me` (singleton — no namespace prefix split) |
| **staleTime** | 300,000ms (5 minutes) |

**Why 5 minutes:** Profile data changes infrequently (only when the user themselves edits it), so a longer stale time reduces unnecessary refetches during navigation.

**Key builder:** None — the key is a constant (`MY_PROFILE_QUERY_KEY = "members:me"`). No list/detail split because profile is a singleton entity.

**Invalidation rules:**

| Trigger | Action |
|---|---|
| Inline field save (success) | `patchMyProfileQuery(updater)` — directly patches the cached data via `queryClient.setQueryData()` |
| Avatar upload (success) | `patchMyProfileQuery(updater)` — updates `avatar_url` in cache |
| Subject save (success) | `patchMyProfileQuery(updater)` — updates `subjects_taught` or `subject_ids` in cache |

**Organization data cache (admin only):**
- Managed separately via `useOrganizationQuery()` and `patchOrganizationQuery()` from `lib/queries/organizations.ts`
- Enrollment code rotation also patches via `patchEnrollmentInfoQuery()`

## 5. Optimistic Update Strategy

Profile does **not** use the standard optimistic snapshot/restore pattern. Instead, it uses a simpler **fire-and-patch** approach:

1. User edits a field inline and saves (Enter or blur)
2. `patchMe(body)` sends `PATCH /api/members/me`
3. On success (`res.ok`): `patchMyProfileQuery()` updates the cache, `setMember()` updates local state
4. On failure: no cache patch — the field reverts visually because the draft is discarded, but the cache retains the previous value

**Why no snapshot/restore:** Profile mutations are single-field patches on a singleton entity. There is no risk of cross-query divergence (no list queries to keep in sync), and individual field saves are low-risk. The `InlineEditRow` component handles its own loading/error state locally.

**Avatar upload** is slightly different: the cache is patched **before** the API call (`patchMyProfileQuery` first, then `await patchMe`). This provides instant visual feedback for the uploaded avatar. If the API call fails, the avatar URL may be stale in cache until the next profile fetch.

## 6. Payload Shapes

Profile uses a **single payload shape** — the `MEMBER_DETAIL_SELECT` from `members_service.py`. There is no summary/detail split because the profile page always shows full detail.

### Profile Response (from `GET /members/me`)

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | User ID |
| `full_name` | `string` | Legal name |
| `display_name` | `string \| null` | Preferred display name |
| `email` | `string` | Email (read-only on profile) |
| `role` | `string` | `admin`, `teacher`, or `student` |
| `status` | `string` | Account status |
| `avatar_url` | `string \| null` | Profile photo URL |
| `grade_level` | `string \| null` | Student's grade level |
| `course` | `string \| null` | Student's course (secundario) |
| `school_name` | `string \| null` | Student's school name |
| `phone` | `string \| null` | Phone number |
| `subjects_taught` | `string[] \| null` | Teacher's subject IDs |
| `subject_ids` | `string[] \| null` | Student's subject IDs |
| `class_ids` | `string[] \| null` | Associated class IDs |
| `parent_name` | `string \| null` | Parent/guardian name (student) |
| `parent_email` | `string \| null` | Parent/guardian email (student) |
| `parent_phone` | `string \| null` | Parent/guardian phone (student) |
| `hourly_rate` | `float \| null` | Teacher's hourly rate |
| `onboarding_completed` | `boolean` | Whether onboarding is done |
| `created_at` | `string` | Account creation timestamp |

### PATCH Body (to `PATCH /members/me`)

Partial update — only include fields being changed. Backend strips fields not allowed for the user's role.

## 7. Database

### Tables Involved

| Table | Description |
|---|---|
| `profiles` | Core user profiles — all profile data lives here. Shared with the members feature. |
| `organizations` | Organization settings (admin profile page only) |

### Read Patterns

| Pattern | Query Shape |
|---|---|
| Own profile fetch | `.select(MEMBER_DETAIL_SELECT).eq("organization_id", org_id).eq("id", user_id).limit(1)` |
| Own profile update | `.update(fields).eq("organization_id", org_id).eq("id", user_id)` |
| Organization fetch (admin) | `.select("*").eq("id", org_id).limit(1)` |

No feature-specific indexes are needed — profile queries use the `profiles` table primary key (`id`) with an `organization_id` equality filter. The primary key index serves all profile read patterns.

## 8. Edge Cases and Notes

### Dual Subject Fields

Teachers use `subjects_taught` while students use `subject_ids` to store their subject selections. The backend `PATCH /me` endpoint maps `subjects_taught` to `subject_ids` for teacher/admin roles before writing to the database. Both are stored in the same `subject_ids` column on the `profiles` table, but the frontend distinguishes them to maintain semantic clarity between "subjects I teach" and "subjects I study."

### Grade Data on Student Profile

The student profile sidebar displays a grades summary card (yearly average and CFS score). This data comes from `useGradeBoardQuery()` and `useCFSDashboardQueryWithOptions()`, both deferred via `useDeferredQueryEnabled()` to avoid competing with first paint. The CFS query is only enabled when `education_level === "secundario"`. The grades card links to `/student/grades` with prefetch on hover/focus/touch via `prefetchStudentRouteData()`.

### Organization Settings Deferred Load

On the admin profile page, organization data is loaded via `useOrganizationQuery()` with deferred enablement (`useDeferredQueryEnabled()`). This prevents the org query from competing with the profile's first paint.

### Enrollment Code Rotation

Admin users can rotate student and teacher enrollment codes via `POST /api/organizations/{orgId}/codes/rotate-{type}`. The response contains the new code, which is patched into both the organization query cache and the enrollment info query cache.

### No Loading Skeletons in Components

Both `TeacherProfilePage` and `StudentProfilePage` rely on server-seeded `initialProfile` data, so the main content renders immediately without a client-side loading state. The route-level `loading.tsx` files provide skeleton UIs during SSR/navigation transitions. These skeletons mirror the actual page layout (avatar card, contact section, subjects section, and for students: academic info and grades summary).

### Shared Primitives, Separate Pages

Despite sharing `ProfilePrimitives.tsx`, `ProfileSubjectsPicker.tsx`, and `ProfileFieldSelect.tsx`, the teacher and student profile pages are separate components (`TeacherProfilePage.tsx` and `StudentProfilePage.tsx`) because their section layouts, fields, and secondary data (org settings vs grades) differ substantially.

### Avatar Upload Flow

Avatar upload uses `AvatarUpload` with Supabase Storage (`bucket: "avatars"`, `pathPrefix: "profiles/"`). On upload complete, the new URL is patched into cache immediately (before the API call) for instant visual feedback. The org logo upload follows the same pattern with `pathPrefix: "org-logos/"`.

## 9. Reference Status

Profile is a **simple singleton feature** and does not follow the full reference pattern (no list/detail split, no optimistic snapshot/restore, no batch hydration). This is intentional — the complexity of the calendar pattern is unnecessary for a single-entity, single-user page.

**What profile demonstrates as a pattern:**
- Singleton query module with minimal exports (query hook, prefetch, direct cache patch)
- Inline editing with per-field save (no form submission)
- Role-based field restrictions enforced on the backend
- Deferred secondary data loading (`useDeferredQueryEnabled()` for grades and org data)
- Shared UI primitives across role-specific pages
- Server-seeded initial data with route-level loading skeletons
