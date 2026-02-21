# LUSIA Studio Backend Alignment

This document aligns the new backend foundation with the legacy `Lusia - Backend` architecture so both products follow the same engineering seams and integration logic.

## Module Gap Mapping (New vs Legacy)

### Entrypoint and API wiring
- New: `app/main.py` with root health endpoints and CORS.
- Legacy reference: `backend_agents/app/api/main.py` with router aggregation and startup lifecycle hooks.
- Alignment direction: keep `app/main.py` lightweight, but centralize versioned router registration in `app/api/http/router.py`.

### Configuration
- New: `app/core/config.py` (`pydantic-settings` + strict env schema).
- Legacy reference: `backend_agents/app/config/settings.py` (richer runtime flags).
- Alignment direction: keep typed `Settings`; grow by adding explicit fields instead of implicit `os.getenv` spread.

### Auth and security
- New: `app/core/security.py` validates bearer JWT via Supabase and resolves `profiles`.
- Legacy reference: `backend_agents/app/auth_logic/core/dependencies.py` and cookie/session stack.
- Alignment direction (v1 lock): use bearer token validation as source of truth for backend APIs.

### HTTP routers and schemas
- New: no feature routers yet.
- Legacy reference: `backend_agents/app/api/http/routers/*` + `backend_agents/app/api/http/schemas/*`.
- Alignment direction: introduce `app/api/http/routers`, `app/api/http/schemas`, and `app/api/http/services` now (minimal endpoints first).

### Services and DB access
- New: direct Supabase client access in dependencies/core only.
- Legacy reference: explicit service layer (`profiles_user/service.py`, etc.) and db helpers.
- Alignment direction: route handlers call service functions; services isolate response shaping and Supabase queries.

## Locked v1 Contract Decisions

- `auth_strategy`: backend uses `Authorization: Bearer <access_token>` for protected routes.
- `session_source`: frontend owns Supabase session/cookies; backend does not own encrypted app-cookie auth in v1.
- `api_versioning`: new endpoints live under `/api/v1/*`.
- `response_shape`: auth identity endpoint returns:
  - `authenticated: boolean`
  - `user: { id, email, role, organization_id } | null`

## First Implementation Queue

1. Add versioned router composition (`/api/v1`).
2. Add `/api/v1/health`.
3. Add `/api/v1/auth/me` using `get_current_user`.
4. Keep domain placeholders (`/api/v1/classrooms`, `/api/v1/chat`) returning `501` until feature implementation starts.
5. Extend services/schemas before adding AI/SSE complexity.
