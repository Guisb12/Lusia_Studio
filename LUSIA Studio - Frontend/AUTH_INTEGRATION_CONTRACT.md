# Frontend Auth Integration Contract

This document defines the frontend integration contract for auth/session/enrollment flows.

## 1) Session behavior (to avoid random logouts)

- Keep Supabase client with:
  - `persistSession: true`
  - `autoRefreshToken: true`
  - `detectSessionInUrl: true`
- Never call `signOut()` on onboarding/API errors. Only manual logout.
- On app load, auth callback return, and tab refocus:
  - call `GET /api/v1/auth/me`
  - route from that returned state.

## 2) `GET /api/v1/auth/me` is source of truth for routing

Use these fields to decide the next screen:
- `authenticated`
- `user.profile_exists`
- `user.email_verified`
- `user.onboarding_completed`
- `user.role`
- `user.organization_id`

Flow:
- `profile_exists=false` -> show org/member setup choice.
- `email_verified=false` -> show verify-email blocker.
- `onboarding_completed=false` -> resume onboarding form.
- else -> app dashboard by role.

## 3) Enrollment flow contract changed (important)

- `POST /api/v1/auth/enrollment/validate` now returns:
  - `valid`
  - `organization_id`, `organization_name`, `role_hint`
  - `enrollment_token`
  - `enrollment_token_expires_in`
- Store both:
  - original `enrollment_code`
  - returned `enrollment_token`
- `POST /api/v1/auth/member/complete` now accepts either:
  - `enrollment_token`, or
  - `enrollment_code` (fallback if token expired)
- Best practice: send both in `member/complete`.

## 4) Email verification integration

- Backend now has autoclose page:
  - `GET /api/v1/auth/email/verified`
- If using popup/new window, listen for:
  - `window.postMessage` event with `{ type: "lusia-email-verified" }`
- After receiving event (or on return/focus), re-run:
  1. `supabase.auth.getSession()` (or equivalent refresh path)
  2. `GET /api/v1/auth/me`
  3. Continue onboarding from returned state.

## 5) Backend now enforces verified email for writes

These endpoints can return `403 "Email is not verified..."` until verified:
- `/api/v1/auth/org/register`
- `/api/v1/auth/member/complete`
- `/api/v1/auth/onboarding*`

Frontend behavior:
- show verify step
- do not logout.

## 6) Admin enrollment code management

Available endpoints:

- Rotate:
  - `POST /api/v1/organizations/{organization_id}/codes/rotate-teacher`
  - `POST /api/v1/organizations/{organization_id}/codes/rotate-student`

- Manually set (new):
  - `PATCH /api/v1/organizations/{organization_id}/codes/teacher` with body `{ "code": "..." }`
  - `PATCH /api/v1/organizations/{organization_id}/codes/student` with body `{ "code": "..." }`

## 7) Must align environment/config

- Supabase redirect URLs should include chosen callback(s), including:
  - frontend callback page
  - optional backend autoclose page: `/api/v1/auth/email/verified`
- Backend migration required on existing DB:
  - `migrations/003_auth_hardening.sql`
