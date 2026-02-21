# Frontend Auth + Onboarding Flow Report

## Goal
Implement a stable auth/onboarding experience with two clear entry points:

1. `Login / Create account` (all users)
2. `Create center` (admin path only)

Member flow (teacher/student) must be: **authenticate first, enter enrollment code second**.

---

## High-Level UX Flows

### A) Create Center (Admin)
1. User signs up/logs in.
2. User verifies email.
3. Frontend calls `POST /api/v1/auth/org/register`.
4. Frontend completes admin onboarding (`PATCH /api/v1/auth/onboarding/admin`).
5. Frontend calls `GET /api/v1/auth/me` and routes to dashboard when onboarding is done.

### B) Member (Teacher/Student) - New Required Flow
1. User signs up/logs in first.
2. User verifies email.
3. User enters enrollment code.
4. Frontend calls `POST /api/v1/auth/enrollment/attach` with `{ code }`.
5. Frontend calls `GET /api/v1/auth/me`.
6. Route by role and onboarding state:
   - teacher -> teacher onboarding
   - student -> student onboarding
7. After onboarding update endpoint returns success, call `/auth/me` again and route to dashboard.

This removes the fragile "token before auth" dependency.

---

## Backend Endpoints Frontend Should Use

## 1) Source of truth for routing
`GET /api/v1/auth/me`

### Success shape (200)
```json
{
  "authenticated": true,
  "user": {
    "id": "uuid",
    "email": "user@email.com",
    "email_verified": true,
    "role": "admin|teacher|student|null",
    "organization_id": "uuid|null",
    "profile_exists": true,
    "onboarding_completed": false
  }
}
```

### Unauthorized shape (401)
```json
{
  "authenticated": false,
  "user": null,
  "error_code": "UNAUTHORIZED",
  "detail": "..."
}
```

### Internal error shape (500)
```json
{
  "authenticated": false,
  "user": null,
  "error_code": "AUTH_ME_INTERNAL_ERROR",
  "detail": "Failed to load authenticated user state"
}
```

---

## 2) Member code linking (new primary step after auth)
`POST /api/v1/auth/enrollment/attach`

### Request
```json
{
  "code": "center-prof-abc123"
}
```

### Behavior
- Requires authenticated user.
- Requires verified email.
- Validates code and links account to organization + role.
- Idempotent for same org/role.

### Common error codes
- `EMAIL_NOT_VERIFIED`
- `ENROLLMENT_CODE_INVALID`
- `ACCOUNT_ALREADY_LINKED`
- `ACCOUNT_ROLE_MISMATCH`

---

## 3) Onboarding completion endpoints
- `PATCH /api/v1/auth/onboarding/admin`
- `PATCH /api/v1/auth/onboarding/teacher`
- `PATCH /api/v1/auth/onboarding/student`

All require verified email and authenticated user profile.

---

## Routing Rules (Frontend)

After login, callback, verification, onboarding submit, and app startup:
always call `GET /api/v1/auth/me` and route from response only.

### Suggested decision tree
1. If `authenticated !== true` -> go to login.
2. If `user.profile_exists === false`:
   - show "Create center" or "Join with code" choice.
3. If `user.email_verified === false`:
   - show verify-email blocker UI.
4. If `user.organization_id` missing:
   - show setup step (admin create center or member enter code).
5. If `user.onboarding_completed === false`:
   - route to role onboarding form.
6. Else route to dashboard.

---

## Session Handling Requirements

- Keep Supabase session persistence enabled.
- Do not call sign-out on onboarding/API errors.
- Only manual logout should end session.
- On browser tab focus, callback return, and app boot: re-fetch `/auth/me`.

---

## Error Handling Contract

Backend may return structured error detail like:
```json
{
  "detail": {
    "code": "EMAIL_NOT_VERIFIED",
    "message": "Email is not verified. Verify your email before continuing."
  }
}
```

Frontend should use `detail.code` as primary key for UX decisions, never parse plain text.

Important codes:
- `EMAIL_NOT_VERIFIED`
- `ENROLLMENT_TOKEN_EXPIRED`
- `ENROLLMENT_CODE_INVALID`
- `UNAUTHORIZED`
- `AUTH_ME_INTERNAL_ERROR`

---

## Recommended Frontend API Sequence (Member)
1. Supabase signup/login
2. wait for verification/session restoration
3. `GET /api/v1/auth/me`
4. if `profile_exists=false` -> collect code
5. `POST /api/v1/auth/enrollment/attach`
6. `GET /api/v1/auth/me`
7. role onboarding patch endpoint
8. `GET /api/v1/auth/me`
9. dashboard

---

## Notes
- Legacy token-based enrollment endpoints still exist for compatibility.
- Preferred path going forward is code attach after auth.
