# LUSIA Studio Frontend Alignment

This document aligns the new frontend scaffold with the legacy `Lusia - Frontend` patterns while keeping the new codebase intentionally minimal.

## Module Gap Mapping (New vs Legacy)

### App shell
- New: only `app/globals.css`; no root `app/layout.tsx` or `app/page.tsx`.
- Legacy reference: `src/app/layout.tsx` and routed app shell.
- Alignment direction: add minimal root layout/page so App Router is valid and ready for route groups.

### Auth/session boundary
- New: Supabase helpers exist (`lib/supabase/client.ts`, `server.ts`, `middleware.ts`) but no root middleware integration.
- Legacy reference: `src/middleware.ts` and `src/contexts/AuthContext.tsx`.
- Alignment direction (v1 lock): keep Supabase SSR session as source of truth; use middleware + server route handlers for protected data.

### API proxy routes
- New: no route handlers yet.
- Legacy reference: many `src/app/api/**/route.ts` handlers proxying backend endpoints.
- Alignment direction: create thin proxy handlers under `app/api/*` for health and identity bootstrap.

### Feature module boundaries
- New: route group folders exist but no pages/components yet.
- Legacy reference: `src/features/*` domain modules.
- Alignment direction: keep route groups as feature boundaries and introduce feature code per domain (auth, dashboard, chat) incrementally.

## Locked v1 Contract Decisions

- `session_strategy`: Supabase SSR (`@supabase/ssr`) is the only session source.
- `backend_auth`: frontend sends Supabase access token to backend API when calling protected endpoints.
- `middleware_scope`: guard only protected app paths and refresh session via `updateSession`.
- `api_contract_bootstrap`: frontend identity bootstrap uses backend `/api/v1/auth/me`.

## First Implementation Queue

1. Add `app/layout.tsx` and `app/page.tsx`.
2. Add root `middleware.ts` that calls `lib/supabase/middleware.ts`.
3. Add `app/api/health/route.ts` proxy to backend `/health`.
4. Add `app/api/auth/me/route.ts` proxy to backend `/api/v1/auth/me` with bearer forwarding.
5. Add feature pages by route group after auth + proxy baseline is stable.

## Local Run and Troubleshooting

- Copy `.env.example` to `.env.local` and set:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000`)
- Start frontend:
  - `npm install`
  - `npm run dev`
- Common issues:
  - Tailwind/PostCSS error: ensure `@tailwindcss/postcss` is installed and `postcss.config.js` uses that plugin.
  - Supabase key/url error in middleware: verify `.env.local` exists and Next.js was restarted after edits.
  - Backend URL mismatch: update `NEXT_PUBLIC_API_BASE_URL` to the actual backend port.
