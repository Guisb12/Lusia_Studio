---
last-updated: 2026-03-19
stability: frequently-updated
agent-routing: "Read before working on signup, enrollment, center creation, or onboarding wizard code."
---

# Onboarding

## 1. Overview

Onboarding is the full user journey from first visit to first dashboard view. It spans three interconnected flows: **signup** (account creation), **enrollment** (joining an existing organization via code), and **center creation** (creating a new organization). After account creation and organization attachment, a role-specific **onboarding wizard** collects the user's profile, education level, and subject preferences. The feature also includes **onboarding objectives** — a guided checklist for trial-organization admins that tracks early platform adoption (enrolling students, scheduling sessions, creating classes).

Unlike most features in the codebase, onboarding does **not** follow the standard shell/query-module/cache-contract pattern. It is a stateless, write-heavy flow with no persistent client cache. Data is collected via multi-step forms, submitted to the backend, and the user is redirected to their dashboard. There is no list/detail split, no optimistic updates, and no query namespace.

## 2. Availability

| Attribute | Value |
|---|---|
| **Roles** | All roles interact with onboarding: Admin (center creation + admin wizard), Teacher (enrollment + teacher wizard), Student (enrollment + student wizard) |
| **Center types** | All (onboarding objectives are trial-only) |
| **Auth routes** | `/signup`, `/enroll`, `/confirm-enrollment`, `/create-center`, `/onboarding`, `/onboarding/admin`, `/onboarding/teacher`, `/onboarding/student` |

**Route protection** (enforced in `middleware.ts`):
- `/signup`, `/enroll`, `/confirm-enrollment`, `/create-center` — public (redirect away if already fully onboarded)
- `/onboarding/*` — requires auth + verified email, no profile/org needed yet

## 3. Architecture

### 3.1 User Journey — Three Entry Paths

```
Path A: Admin (create center)
  /create-center → landing hero → wizard (account → center info → profile → education → subjects)
    → POST /api/auth/org/register
    → PATCH /api/auth/onboarding/teacher
    → redirect /dashboard

Path B: Teacher/Student (enrollment)
  /enroll → enter code → POST /api/auth/enrollment/validate → enrollment token issued
    → /confirm-enrollment → show org info → continue to /signup
    → /signup?flow=member → create account (email/password or Google)
    → POST /api/auth/member/complete (attach to org)
    → /onboarding/teacher or /onboarding/student (role-specific wizard)
    → PATCH /api/auth/onboarding/teacher or /api/auth/onboarding/student
    → GET /api/auth/me → redirect to dashboard

Path C: Generic signup (no enrollment code)
  /signup → create account → /onboarding → role selection
    → /onboarding/admin → complete profile → PATCH /api/auth/onboarding/admin → /dashboard
    (Admin path C is legacy — the primary admin flow is now Path A via /create-center)
```

### 3.2 Frontend Pages

**`app/(auth)/signup/page.tsx`** — Account creation page. Supports two modes:
- **Standalone signup** — creates account, redirects to `/onboarding` for role selection.
- **Member flow** (`?flow=member`) — receives `enrollment_token` and `enrollment_code` from the enrollment flow. After account creation, redirects directly to the role-specific onboarding page (`/onboarding/teacher` or `/onboarding/student`), passing enrollment params as query strings.
- Supports email/password signup and Google OAuth via Supabase Auth.
- Handles email verification: shows "Ja confirmei" button after a 5-second delay, polls via `checkVerificationNow()`.
- Uses `setPendingAuthFlow()` / `clearPendingAuthFlow()` to persist enrollment context across OAuth redirects.

**`app/(auth)/enroll/page.tsx`** — Enrollment code entry page. Validates the code via `POST /api/auth/enrollment/validate`. On success, stores the enrollment token and redirects to `/confirm-enrollment` with token and code as query params.

**`app/(auth)/confirm-enrollment/page.tsx`** — Enrollment confirmation page. Fetches org info via `POST /api/auth/enrollment/info` and displays the organization name, logo, and role badge. On continue, redirects to `/signup?flow=member` with all enrollment params.

**`app/(auth)/create-center/page.tsx`** — Organization creation wizard. Two-phase UI:
1. **Landing hero** — animated landing page with "Vamos comecar" CTA.
2. **Wizard** — five-step form:
   - Step 0 (Conta): Account creation (email/password or Google). Handles email verification inline.
   - Step 1 (Centro): Organization info — name, email, phone, district, logo upload.
   - Step 2 (Perfil): Admin profile — full name, display name, phone, avatar.
   - Step 3 (Ensino): Education levels and grades the admin teaches.
   - Step 4 (Disciplinas): Subject selection grouped by education level.
   - Final submit: `POST /api/auth/org/register` then `PATCH /api/auth/onboarding/teacher`.

**`app/(auth)/onboarding/page.tsx`** — Role selection page. Presents three cards: Administrador, Professor, Aluno. Links to role-specific onboarding pages.

**`app/(auth)/onboarding/admin/page.tsx`** — Single-step admin profile form. Collects full name, display name, phone, avatar. Submits via `PATCH /api/auth/onboarding/admin`. Redirects to `/dashboard`.

**`app/(auth)/onboarding/teacher/page.tsx`** — Three-step teacher onboarding wizard:
- Step 0 (Perfil): Full name, display name, phone, avatar.
- Step 1 (Ensino): Education levels and grade selection.
- Step 2 (Disciplinas): Subject selection fetched from `/api/subjects?education_level=...`, grouped by level.
- Supports enrollment flow: reads `enrollment_token` and `enrollment_code` from query params. If present, calls `completeMemberEnrollment()` before profile update.
- Final submit: `PATCH /api/auth/onboarding/teacher`. Calls `GET /api/auth/me` to determine correct redirect destination.

**`app/(auth)/onboarding/student/page.tsx`** — Multi-step student onboarding wizard with dynamic flow paths:
- Step 0 (Perfil): Full name, display name, school name, avatar.
- Step 1 (Escolaridade): Education level (1 Ciclo through Secundario) and grade.
- Branching logic based on education level:
  - **1/2 Ciclo**: Profile → Education → Confirm subjects → Apoio (tutored subjects)
  - **3 Ciclo**: Profile → Education → Lingua Estrangeira II selection → Confirm → Apoio
  - **Secundario**: Profile → Education → Course selection → `SecundarioSubjectWizard` → Apoio
- Apoio step: student selects which subjects they receive tutoring in at the center.
- Supports enrollment flow (same as teacher).
- Final submit: `PATCH /api/auth/onboarding/student`. Calls `GET /api/auth/me` for redirect.

### 3.3 Next.js API Routes

All auth API routes are thin proxies. Most use `proxyAuthedJson()` from `app/api/auth/_utils.ts`.

| Route | Method | Backend Endpoint | Auth Required |
|---|---|---|---|
| `api/auth/me` | `GET` | `GET /api/v1/auth/me` | Yes (reads Supabase session) |
| `api/auth/onboarding/admin` | `PATCH` | `PATCH /api/v1/auth/onboarding/admin` | Yes |
| `api/auth/onboarding/teacher` | `PATCH` | `PATCH /api/v1/auth/onboarding/teacher` | Yes |
| `api/auth/onboarding/student` | `PATCH` | `PATCH /api/v1/auth/onboarding/student` | Yes |
| `api/auth/org/register` | `POST` | `POST /api/v1/auth/org/register` | Yes |
| `api/auth/enrollment/validate` | `POST` | `POST /api/v1/auth/enrollment/validate` | No |
| `api/auth/enrollment/info` | `POST` | `POST /api/v1/auth/enrollment/info` | No |
| `api/auth/enrollment/attach` | `POST` | `POST /api/v1/auth/enrollment/attach` | Yes |
| `api/auth/member/complete` | `POST` | `POST /api/v1/auth/member/complete` | Yes |
| `api/onboarding-objectives` | `GET` | `GET /api/v1/onboarding-objectives` | Yes |

**Notable:** The enrollment `validate` and `info` routes are **unauthenticated** — they run before the user has an account. The `validate` route includes case-insensitive retry logic (tries uppercase if the first attempt fails).

### 3.4 Backend Router — `routers/auth.py`

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| `GET` | `/me` | Manual token extraction | Loads Supabase user + profile + org, returns `MeResponse` |
| `PATCH` | `/onboarding` | `get_current_user` | Generic onboarding complete (legacy) |
| `POST` | `/org/register` | `get_authenticated_supabase_user` | Creates org, upserts admin profile |
| `POST` | `/enrollment/validate` | None | Validates enrollment code, issues HMAC-signed token |
| `POST` | `/enrollment/info` | None | Returns org info from enrollment token |
| `POST` | `/enrollment/attach` | `get_authenticated_supabase_user` | Attaches user to org via code |
| `POST` | `/member/complete` | `get_authenticated_supabase_user` | Resolves enrollment, upserts profile |
| `PATCH` | `/onboarding/teacher` | `get_current_user` | Updates teacher profile, sets `onboarding_completed=true` |
| `PATCH` | `/onboarding/student` | `get_current_user` | Updates student profile, sets `onboarding_completed=true` |
| `PATCH` | `/onboarding/admin` | `get_current_user` | Updates admin profile, sets `onboarding_completed=true` |

**Key behaviors:**
- All onboarding endpoints require verified email (`_require_verified_email()`). Returns 403 with `EMAIL_NOT_VERIFIED` code if not verified.
- Profile upserts use `_profile_upsert_resilient()` which falls back gracefully if the `onboarding_completed` column is missing (migration safety).
- `/me` endpoint updates `last_login_at` on every call (fire-and-forget, failure is silently ignored).
- `/me` returns a degraded response (with `degraded: true`) if the backend is unreachable, using Supabase user metadata as fallback.

### 3.5 Backend Router — `routers/onboarding_objectives.py`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/onboarding-objectives` | `require_admin` | Returns guided objectives with live progress for trial orgs |

Returns four objectives with real-time counts:
1. `enroll_students` — active students in org (target: 3)
2. `enroll_teachers` — active teachers in org (target: 3)
3. `schedule_sessions` — sessions scheduled for next week (target: 1)
4. `create_classroom` — active classrooms (target: 1)

Only returns data for organizations with `status = "trial"`. Returns empty for non-trial orgs.

### 3.6 Backend Router — `routers/organizations.py`

Manages enrollment codes and org settings post-onboarding:

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/{org_id}/enrollment-info` | `require_teacher` | Returns enrollment codes (student code for teachers, both for admins) |
| `POST` | `/{org_id}/codes/rotate-teacher` | `require_admin` | Generates new teacher enrollment code |
| `POST` | `/{org_id}/codes/rotate-student` | `require_admin` | Generates new student enrollment code |
| `PATCH` | `/{org_id}/codes/teacher` | `require_admin` | Sets custom teacher enrollment code |
| `PATCH` | `/{org_id}/codes/student` | `require_admin` | Sets custom student enrollment code |

### 3.7 Backend Services

**`services/auth_service.py`:**
- `build_me_user(current_user)` — constructs `MeUser` response from profile + auth data.
- `build_onboarding_update_payload(payload)` — extracts role and org_id for the legacy onboarding endpoint.
- `normalize_slug(raw)` — converts org name to URL-safe slug.
- `normalize_enrollment_code(raw)` — lowercases, strips whitespace, replaces special chars with hyphens.
- `generate_enrollment_code(slug, role_hint)` — creates `{slug}-{role}-{random_hex}` format (e.g., `horizonte-prof-a1b2c3`).
- `build_org_insert_payload(payload, slug)` — assembles the organization row with auto-generated enrollment codes.

**`services/enrollment_service.py`:**
- `issue_enrollment_token(org_id, role_hint, ttl)` — creates HMAC-SHA256 signed token containing `organization_id`, `role_hint`, `iat`, and `exp`. Token format: `{base64_payload}.{base64_signature}`.
- `verify_enrollment_token(token)` — validates signature, checks expiry, returns payload dict.
- Token TTL is configured via `settings.ENROLLMENT_TOKEN_TTL_SECONDS`.

### 3.8 Backend Schemas — `schemas/auth.py`

**MeUser** (response):
```
id, email, email_verified, email_verified_at
full_name, display_name, avatar_url, role, status, phone
grade_level, course, subject_ids, subjects_taught
organization_id, organization_name, organization_logo_url, organization_status
profile_exists, onboarding_completed
```

**OrganizationRegisterRequest:**
```
name (required), slug (optional), email (required), full_name (required)
phone, address, district, city, postal_code, billing_email, logo_url, display_name
```

**OrganizationRegisterResponse:**
```
organization_id, slug, teacher_enrollment_code, student_enrollment_code
```

**EnrollmentValidateRequest:** `code: str`

**EnrollmentValidateResponse:**
```
valid, organization_id, organization_name, role_hint, enrollment_token, enrollment_token_expires_in
```

**MemberCompleteRequest:**
```
enrollment_token | enrollment_code (at least one required, validated via model_validator)
full_name (required), display_name
Teacher fields: phone, subjects_taught
Student fields: grade_level, course, subject_ids, school_name, parent_name, parent_email, parent_phone
```

**RoleOnboardingTeacherRequest:** `full_name, display_name, phone, subjects_taught, subject_ids, avatar_url`

**RoleOnboardingStudentRequest:** `full_name, display_name, grade_level, course, subject_ids, subjects_taught, school_name, parent_name, parent_email, parent_phone, avatar_url`

**RoleOnboardingAdminRequest:** `full_name, display_name, phone, avatar_url`

**OnboardingObjectivesResponse:** `objectives: list[ObjectiveOut], all_completed: bool`

**ObjectiveOut:** `id, title, description, current: int, target: int, completed: bool`

## 4. Cache Contract

Onboarding does **not** use the standard cache contract pattern. There is no query namespace, no list/detail split, no staleTime configuration, and no optimistic updates. This is because:

- Onboarding is a **write-only flow** — forms collect data, submit it, and redirect. There is no persistent data display that needs caching.
- The only read operation (`GET /api/auth/me`) is called with `cache: "no-store"` and is used for navigation decisions, not data display.
- Onboarding objectives (`GET /api/onboarding-objectives`) are fetched directly and displayed — no cache invalidation or sync is needed.

**Why this is acceptable:** Onboarding runs once per user. There is no repeated navigation, no list view, and no mutation cycle. See `STANDARDS.md` Section 5 — read-only/write-only features can skip snapshot/restore, cache sync, and optimistic helpers.

## 5. Optimistic Update Strategy

Not applicable. Onboarding has no optimistic updates. All mutations are synchronous form submissions that block the UI with a loading state until the server responds. On success, the user is redirected. On failure, an error message is shown and the user can retry.

## 6. Payload Shapes

### /api/auth/me Response (MeUser)

The central identity payload used throughout onboarding to determine navigation:

| Field | Type | Navigation Impact |
|---|---|---|
| `authenticated` | `bool` | `false` → redirect to login/signup |
| `email_verified` | `bool` | `false` → redirect to `/verify-email` |
| `profile_exists` | `bool` | `false` → redirect to `/onboarding` |
| `organization_id` | `string \| null` | `null` → redirect to `/onboarding` (no org attached) |
| `onboarding_completed` | `bool` | `false` → redirect to role-specific onboarding |
| `role` | `"admin" \| "teacher" \| "student" \| null` | Determines target dashboard (`/dashboard` or `/student`) |

### Enrollment Token

HMAC-SHA256 signed, base64url-encoded. Payload:

| Field | Type | Purpose |
|---|---|---|
| `organization_id` | `string` | The org the user is joining |
| `role_hint` | `"teacher" \| "student"` | The role determined by which enrollment code was used |
| `iat` | `int` | Issued-at timestamp (Unix) |
| `exp` | `int` | Expiry timestamp (Unix) |

### Onboarding Objectives Response

| Field | Type | Purpose |
|---|---|---|
| `objectives` | `list[ObjectiveOut]` | Array of guided objectives |
| `all_completed` | `bool` | Whether all objectives are met |

Each `ObjectiveOut`: `id`, `title`, `description`, `current` (progress count), `target` (goal count), `completed` (bool).

## 7. Database

### Tables Involved

| Table | Role in Onboarding |
|---|---|
| `profiles` | Created/upserted during onboarding. Stores user identity, role, org association, education prefs, and `onboarding_completed` flag. |
| `organizations` | Created during center creation. Stores org name, slug, enrollment codes, status, and contact info. |
| `classrooms` | Queried by onboarding objectives (count of active classrooms). |
| `calendar_sessions` | Queried by onboarding objectives (count of upcoming sessions). |
| `subjects` | Queried during wizard steps for subject catalog display. |

### Key Columns Added by Onboarding Migrations

From `migrations/003_auth_hardening.sql`:

| Column | Table | Type | Purpose |
|---|---|---|---|
| `onboarding_completed` | `profiles` | `boolean NOT NULL DEFAULT false` | Tracks whether user has completed their onboarding wizard |
| `last_login_at` | `profiles` | `timestamptz` | Updated by `/auth/me` on each call |

### Enrollment Code Storage

Enrollment codes are stored directly on the `organizations` table:
- `teacher_enrollment_code` — unique, lowercased, used for teacher enrollment
- `student_enrollment_code` — unique, lowercased, used for student enrollment

Codes are auto-generated during org creation via `generate_enrollment_code()` with format `{slug}-{prof|aluno}-{hex}`. Admins can rotate or set custom codes via the organizations API.

### Read Patterns

| Pattern | Table | Query |
|---|---|---|
| Profile lookup by user ID | `profiles` | `.select("*").eq("id", user_id)` |
| Org lookup by enrollment code | `organizations` | `.select("id,name,logo_url,status").ilike("teacher_enrollment_code", code)` |
| Org lookup by ID | `organizations` | `.select("id,name,logo_url,status").eq("id", org_id)` |
| Active students count | `profiles` | `.select("id", count="exact").eq("organization_id", org_id).eq("role", "student").eq("status", "active")` |
| Active teachers count | `profiles` | `.select("id", count="exact").eq("organization_id", org_id).eq("role", "teacher").eq("status", "active")` |
| Upcoming sessions count | `calendar_sessions` | `.select("id", count="exact").eq("organization_id", org_id).gte("starts_at", next_monday).lte("starts_at", next_sunday_end)` |
| Active classrooms count | `classrooms` | `.select("id", count="exact").eq("organization_id", org_id).eq("active", True)` |

## 8. Edge Cases and Notes

### Enrollment Token Expiry

Enrollment tokens have a configurable TTL (`ENROLLMENT_TOKEN_TTL_SECONDS`). If a token expires between validation and account creation, the frontend falls back to the raw `enrollment_code` for org resolution. The `MemberCompleteRequest` model validator enforces that at least one of `enrollment_token` or `enrollment_code` is present.

### Case-Insensitive Code Validation

The frontend enrollment validate route tries the user's code as-is first. If validation fails and the code isn't already uppercase, it retries with the uppercase version. Backend code lookup uses `ilike` for case-insensitive matching.

### Email Verification Loop

Both `/signup` and `/create-center` handle a verification loop for email/password signups:
1. User signs up → Supabase sends verification email.
2. Page shows "A confirmar email..." spinner.
3. After 5 seconds, a "Ja confirmei" button appears.
4. Clicking it calls `signInWithPassword` to check if the email is now confirmed.
5. If confirmed, proceeds to the next step. If not, shows a toast notification.

### Pending Auth Flow Persistence

For OAuth flows (Google), the enrollment context is stored via `setPendingAuthFlow()` before the OAuth redirect, since query params are lost during the Supabase OAuth redirect. After callback, the pending flow is read and used to resume the enrollment process.

### Profile Upsert Resilience

`_profile_upsert_resilient()` and `_profile_update_resilient()` catch errors related to missing `onboarding_completed` column and retry without it. This is a migration safety mechanism — if the `003_auth_hardening` migration hasn't been run yet, onboarding still works.

### Duplicate Organization Prevention

`register_organization()` checks if the user already has an `organization_id` on their profile. If so, it returns the existing org details instead of creating a duplicate. This prevents double-submit issues.

### Slug Collision Handling

Org slugs are auto-generated from the org name via `normalize_slug()`. If a slug collision exists, the backend appends a counter (`{slug}-2`, `{slug}-3`, etc.) until a unique slug is found.

### Secundario Subject Wizard

The student onboarding for Secundario education level delegates to `SecundarioSubjectWizard` component (`components/grades/SecundarioSubjectWizard.tsx`), which handles the complex Portuguese secondary education subject selection: foreign language, biennial subjects, annual electives, and optional subjects like EMRC and Cidadania. The wizard computes subject IDs across all three Secundario grades (10-12) so the GPA wizard can preselect past-year subjects correctly.

### Admin is Also a Teacher

When creating a center via `/create-center`, the admin's profile is set up using the **teacher onboarding** endpoint (`PATCH /api/auth/onboarding/teacher`), not the admin onboarding endpoint. This is because admins in LUSIA Studio are also teachers — they need education levels and subject preferences configured.

### Member Complete vs Role Onboarding

Two separate endpoints handle profile setup for enrolled members:
1. `POST /member/complete` — attaches the user to the org, sets role, and performs initial profile upsert. Called once, typically before the onboarding wizard.
2. `PATCH /onboarding/{role}` — updates profile with detailed preferences (subjects, education levels) and sets `onboarding_completed = true`. Called as the final step of the wizard.

The teacher/student onboarding pages call both in sequence when enrollment params are present.

### Middleware Navigation State Machine

The middleware (`middleware.ts`) implements a state machine that drives onboarding navigation:

```
User visits any auth-decision path
  → No session?            → redirect to /login
  → Session but no profile? → redirect to /onboarding
  → Profile but not verified? → redirect to /verify-email
  → Profile but no org?    → redirect to /onboarding
  → Profile + org but not onboarded? → redirect to /onboarding/{role}
  → Fully onboarded?       → redirect to /dashboard (teacher/admin) or /student (student)
```

This ensures users cannot skip steps or access dashboard routes before completing onboarding.

## 9. Reference Status

Onboarding is **not** a reference implementation for the standard feature pattern. It is a special-purpose flow that does not use the cache contract, query module, or optimistic update patterns described in `STANDARDS.md`. This is by design — onboarding is a one-time, write-heavy journey with no persistent data views.

**What other features should NOT copy from onboarding:**
- Direct `fetch()` calls without query hooks (acceptable here because there is no cache lifecycle)
- All state in `useState` (acceptable because form state is ephemeral — never needs to survive navigation)
- No query module or cache namespace (acceptable for write-only flows)
- Business logic in the frontend (subject filtering, flow branching) — this is acceptable for wizard UX logic but should not be replicated for data-centric features

**What is reusable:**
- The thin API route proxy pattern (`proxyAuthedJson()`) is used consistently and follows `STANDARDS.md` API rules.
- The enrollment token system (HMAC-signed, time-limited, stateless) is a clean auth pattern.
- The multi-step wizard UX pattern (stepper, animated transitions, sticky footer) can be applied to future wizard features.
