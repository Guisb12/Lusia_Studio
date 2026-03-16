# Refactoring Agent Execution Prompt

Copy-paste this prompt when assigning a task to an agent. Replace `[TASK_ID]` with the specific task from the refactoring plan.

---

## Prompt

You are an implementation agent for the LUSIA Studio codebase. Your job is to execute one specific refactoring task and verify it passes.

### Task

Execute task **[TASK_ID]** from the refactoring plan.

### Required Reading (in this order)

1. **Architecture standard:** `/Users/gui/LUSIA Studio - WorkSpace/docs/UI-EX-BIBLE.md`
   — This is the mandatory engineering standard. Every decision must align with it.

2. **Refactoring plan:** `/Users/gui/LUSIA Studio - WorkSpace/docs/REFACTORING-PLAN.md`
   — Find your task by ID. Read the task description, why it matters, affected areas, expected outcome, and dependencies.

3. **Reference implementation:** The `/dashboard/calendar` feature is the architectural baseline. When unsure how something should work, look at how calendar does it:
   - Route: `LUSIA Studio - Frontend/app/(teacher)/dashboard/calendar/page.tsx`
   - Feature shell: `LUSIA Studio - Frontend/components/calendar/CalendarShell.tsx`
   - Query module: `LUSIA Studio - Frontend/lib/queries/calendar.ts`
   - Server fetch: `LUSIA Studio - Frontend/lib/calendar.server.ts`
   - API route: `LUSIA Studio - Frontend/app/api/calendar/sessions/route.ts`
   - Backend router: `LUSIA Studio - Backend/app/api/http/routers/calendar.py`
   - Backend service: `LUSIA Studio - Backend/app/api/http/services/calendar_service.py`
   - Backend schemas: `LUSIA Studio - Backend/app/api/http/schemas/calendar.py`

### Codebase Structure

**Frontend** (`LUSIA Studio - Frontend/`):
- `app/(teacher)/dashboard/` — teacher/admin routes (calendar, assignments, docs, students, teachers, analytics, profile)
- `app/(student)/student/` — student routes (grades, assignments, sessions, chat, profile)
- `app/api/` — Next.js API routes (thin auth proxies to backend)
- `components/` — React components organized by feature
- `lib/queries/` — React Query modules per feature (cache keys, hooks, prefetch, sync, invalidation)
- `lib/*.server.ts` — server-side data fetching functions
- `lib/*.ts` — client-side data fetching and types
- `lib/query-client.ts` — custom QueryClient (not React Query — custom implementation)
- `lib/hooks/` — shared hooks (useDeferredQueryEnabled, useSessionStorageQuerySeed, etc.)

**Backend** (`LUSIA Studio - Backend/`):
- `app/api/http/routers/` — FastAPI routers (validate + delegate to services)
- `app/api/http/services/` — business logic, DB access, hydration
- `app/api/http/schemas/` — Pydantic request/response models
- `migrations/` — SQL migration files

### Key Architectural Patterns to Follow

**Query client** is a custom implementation in `lib/query-client.ts`. It is NOT React Query / TanStack Query. Key APIs:
- `queryClient.fetchQuery({ key, fetcher, staleTime })` — fetch or return cached
- `queryClient.setQueryData(key, updater)` — set/patch cache
- `queryClient.getMatchingQueries(matcher)` — get all entries matching prefix
- `queryClient.updateQueries(matcher, updater)` — batch patch
- `queryClient.invalidateQueries(matcher)` — mark stale
- `useQuery({ key, fetcher, enabled, staleTime, initialData })` — React hook

**Feature query modules** (`lib/queries/*.ts`) must export:
- Key builders: `buildXxxListKey()`, `buildXxxDetailKey()`
- Hooks: `useXxxQuery()`, `useXxxDetailQuery()`
- Prefetch: `prefetchXxxQuery()`
- Snapshot/restore: `snapshotXxxQueries()`, `restoreXxxQueries()`
- Sync: `syncXxxAcrossQueries()`, `upsertXxxInQueries()`
- Invalidation: `invalidateXxxQueries()`

**Backend services** must:
- Define `FEATURE_LIST_SELECT` and `FEATURE_DETAIL_SELECT` constants
- Use `_batch_hydrate_summaries()` for list endpoints (lightweight)
- Use `_batch_hydrate_details()` for detail endpoints (full)
- Never do N+1 queries — collect IDs, batch fetch

**API routes** must be thin proxies — no business logic.

### How to Verify Your Work

After implementing, run the Playwright test suite:

```bash
cd "LUSIA Studio - Frontend"
npx playwright test --reporter=list
```

Credentials auto-load from `.env.test`. The app must be running on `localhost:3000`.

The tests produce route trace reports showing:
- **Timing:** shell visible, data visible, network idle
- **Network:** every API request with timing and payload size
- **Cache:** all query cache entries after load
- **Payloads:** size of each response

Reports are saved to `e2e/reports/`. Compare before/after to verify improvement.

**Test files:**
- `e2e/grades.spec.ts` — calendar reference trace, assignments trace, docs trace
- `e2e/route-compliance.spec.ts` — all dashboard routes trace, cross-route cache, payload audit
- `e2e/helpers/trace.ts` — network logger, cache inspector, report formatter

### Verification Checklist

After your task is done, confirm:

- [ ] The change aligns with `UI-EX-BIBLE.md` principles
- [ ] The pattern matches how calendar does it (or documents why it differs)
- [ ] `npx playwright test` passes — all 15 tests green
- [ ] Route trace reports show expected improvement (fewer requests, smaller payloads, faster shell, correct cache state)
- [ ] No regressions in other routes' traces
- [ ] Code compiles: `npx next build` or `npx tsc --noEmit` passes

### Rules

- Read the files before modifying them.
- Do not refactor code outside your task scope.
- Do not add features, comments, or type annotations beyond what's needed.
- If your task has dependencies listed in the plan, check if they've been completed first. If not, flag it and stop.
- Prefer editing existing files over creating new ones.
- Follow the existing code style (no semicolons in some files, semicolons in others — match the file you're editing).
- Test your changes. If a test fails, fix the issue before marking done.
