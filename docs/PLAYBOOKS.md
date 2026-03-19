---
last-updated: 2026-03-19
stability: semi-stable
agent-routing: "Read when executing a standardized process. Check the playbook index to find the relevant procedure."
---

# Operational Playbooks

Agent-executable procedures for recurring, multi-layer processes in the LUSIA Studio codebase. Each playbook is a step-by-step protocol to follow in order. For engineering rules, see `STANDARDS.md`. For feature context, see `features/*.md`.

**Reference implementation:** Calendar feature — every playbook points to it as the pattern to follow.

---

## Playbook Index

| Playbook | Description | When to Use |
|----------|-------------|-------------|
| [Build a New Feature](#playbook-build-a-new-feature) | End-to-end feature creation from DB to UI to docs | When creating a feature that doesn't exist yet |
| [Add a New Backend Endpoint](#playbook-add-a-new-backend-endpoint) | Add an endpoint to an existing feature | When an existing feature needs a new API capability |
| [Add a New Database Table](#playbook-add-a-new-database-table) | Create a table with migration, indexes, and service access | When a feature needs a new table |
| [Refactor a Feature to Match Standards](#playbook-refactor-a-feature-to-match-standards) | Align an existing feature with `STANDARDS.md` using calendar as the target | When an existing feature has architectural gaps |

---

## Playbook: Build a New Feature

**When to use:** A new user-facing feature needs to be built from scratch.
**Estimated scope:** Backend (schema, service, router, migration), Frontend (route page, shell, queries, API route, server fetch, UI components, loading skeleton), Docs.
**Prerequisites:** Read `STANDARDS.md` (mandatory). Read `features/calendar.md` (reference pattern). Read `ARCHITECTURE.md` §9 Feature Inventory (to understand placement). Read `data/overview.md` if creating tables.

### Steps

1. **Define the feature scope**
   - Determine: routes (teacher? student? both?), roles (admin/teacher/student access), data model (tables involved), endpoints needed.
   - Identify the query namespace prefix (e.g., `feature:items:`).
   - Checkpoint: You can describe the feature's route, role access, data model, and endpoint list.

2. **Create backend schemas**
   - File: `LUSIA Studio - Backend/app/api/http/schemas/{feature}.py`
   - Define Pydantic models: `{Feature}Create`, `{Feature}Update`, `{Feature}Out` (response).
   - Use `Optional[type] = None` for optional fields, `Field(...)` for required fields with validation.
   - Follow `STANDARDS.md` §15 Backend Patterns.
   - Pattern: `schemas/calendar.py` — `SessionCreate`, `SessionUpdate`, `SessionOut`.
   - Checkpoint: Schemas define request/response shapes. Create and Update models exist.

3. **Create backend service**
   - File: `LUSIA Studio - Backend/app/api/http/services/{feature}_service.py`
   - Define `FEATURE_LIST_SELECT` and `FEATURE_DETAIL_SELECT` constants. Every column is intentional — see `STANDARDS.md` §8.3.
   - Implement `_batch_hydrate_summaries(db, items)` — lightweight hydration, cap related data for list views.
   - Implement `_batch_hydrate_details(db, items)` — full hydration for detail views.
   - Implement CRUD functions: `list_{features}()`, `get_{feature}()`, `create_{feature}()`, `update_{feature}()`, `delete_{feature}()`.
   - Apply role-aware filtering in list functions — see `STANDARDS.md` §10.3.
   - Use `supabase_execute()` for primary queries, `parse_single_or_404()` for single-entity lookups.
   - Use batch hydration pattern: collect IDs → batch-fetch per type → merge. Never N+1.
   - Pattern: `services/calendar_service.py` — `SESSION_LIST_SELECT`, `_batch_hydrate_session_summaries()`, `list_sessions()`, `create_session()`.
   - Checkpoint: Service has SELECT constants, hydration functions, and CRUD operations. No N+1 queries.

4. **Create backend router**
   - File: `LUSIA Studio - Backend/app/api/http/routers/{feature}.py`
   - Define FastAPI router with endpoints that validate and delegate to the service.
   - Use dependency injection for auth: `require_teacher`, `require_admin`, `get_current_user` from `app/api/deps.py`.
   - Use Pydantic schemas for request body parsing and `response_model` for response typing.
   - Router body: 5-10 lines per endpoint — extract org_id/role → delegate to service.
   - Register the router in `app/api/http/router.py`.
   - Pattern: `routers/calendar.py` — every endpoint is validate → extract org_id → delegate.
   - Checkpoint: Router registered. Endpoints validate auth, parse input, delegate to service. No business logic in router.

5. **Create Next.js API route**
   - File: `LUSIA Studio - Frontend/app/api/{feature}/{resource}/route.ts`
   - Thin auth proxy: extract token via `getAccessToken()`, forward to backend with `Authorization: Bearer`, use `cache: "no-store"`, return backend response status and payload.
   - Follow `STANDARDS.md` §9.1 — no business logic, no payload reshaping.
   - Pattern: `app/api/calendar/sessions/route.ts`.
   - Checkpoint: API route forwards requests transparently. No business logic.

6. **Create server fetch function**
   - File: `LUSIA Studio - Frontend/lib/{feature}.server.ts`
   - Call `fetchBackendJsonServer()` directly against the FastAPI backend (skips Next API proxy — one fewer hop for SSR).
   - Return typed data with a safe fallback (empty array, null, etc.).
   - Thin wrapper — no business logic, no caching logic.
   - Pattern: `lib/calendar.server.ts` — `fetchCalendarSessionsServer()`.
   - Checkpoint: Server fetch function exists, returns typed data with fallback.

7. **Create query module**
   - File: `LUSIA Studio - Frontend/lib/queries/{feature}.ts`
   - Must follow the full contract in `STANDARDS.md` §5 Feature Query Module Contract.
   - Required exports:
     - Constants: `FEATURE_QUERY_PREFIX`, `FEATURE_DETAIL_QUERY_PREFIX`, stale times.
     - Key builders: `buildFeatureListKey(params)`, `buildFeatureDetailKey(id)`.
     - Query hooks: `useFeatureQuery(params, initialData?)`, `useFeatureDetailQuery(id)`.
     - Prefetch: `prefetchFeatureQuery(params)`, `prefetchFeatureDetailQuery(id)`.
     - Snapshot/restore: `snapshotFeatureQueries()`, `restoreFeatureQueries(snapshots)`.
     - Cache sync: `syncFeatureAcrossQueries(items, options?)`, `removeFeatureFromQueries(matcher)`, `updateFeatureInQueries(matcher, updater)`.
     - Invalidation: `invalidateFeatureQueries()`, `invalidateFeatureDetailQuery(id)`.
   - Read-only features (e.g., analytics) can skip snapshot/restore and cache sync. Document why.
   - Pattern: `lib/queries/calendar.ts` — the complete reference.
   - Checkpoint: Query module exports the full contract. Keys are deterministic. Stale times are explicit.

8. **Create feature shell component**
   - File: `LUSIA Studio - Frontend/components/{feature}/{Feature}Shell.tsx`
   - `"use client"` directive. This is the orchestration layer.
   - Accepts `initialData` from the route page. Passes to query hooks.
   - Owns all query orchestration (active params, hook calls).
   - Owns all mutation requests with optimistic updates: snapshot → apply → try API → sync/restore.
   - Owns cache synchronization across list and detail.
   - Owns background prefetch timing (deferred, after paint).
   - Renders UI components, passing data and callbacks via props.
   - Pattern: `components/calendar/CalendarShell.tsx`.
   - Checkpoint: Shell orchestrates all data flow. UI components receive props. No query logic in UI components.

9. **Create route page**
   - File: `LUSIA Studio - Frontend/app/(teacher)/dashboard/{feature}/page.tsx` (and/or student route).
   - Server component. Calls the server fetch function for critical first-screen data only.
   - Passes `initialData` to the feature shell.
   - Minimal file — no query orchestration, no mutation logic, no client-side code.
   - Pattern: `app/(teacher)/dashboard/calendar/page.tsx` — 23 lines.
   - Checkpoint: Route page server-fetches only first-screen data. Passes to shell. Minimal code.

10. **Create UI components**
    - Directory: `LUSIA Studio - Frontend/components/{feature}/`
    - UI components own rendering, local state (dialog open, tab selection, drag state), and interaction.
    - Accept data and callbacks from the shell via props.
    - Heavy dialogs/editors: lazy-load with `dynamic(() => import("./HeavyComponent"), { ssr: false })`.
    - Follow `STANDARDS.md` §3 Layer Responsibilities — UI Component rules.
    - Pattern: `components/calendar/EventCalendar.tsx`, `SessionFormDialog.tsx`.
    - Checkpoint: UI components render data from props. Local state only. No query/mutation logic.

11. **Create loading skeleton**
    - File: `LUSIA Studio - Frontend/app/(teacher)/dashboard/{feature}/loading.tsx`
    - Route-specific loading skeleton matching the final layout.
    - Shown before server data arrives.
    - Checkpoint: Loading skeleton exists and visually matches the feature layout.

12. **Create feature doc**
    - File: `docs/features/{feature}.md`
    - Follow the template from `features/calendar.md`: Overview, Availability, Architecture (layer walkthrough with file paths), Cache Contract, Payload Shapes, Backend Patterns, Database, Edge Cases.
    - Include frontmatter: `last-updated`, `stability: frequently-updated`, `agent-routing`.
    - Checkpoint: Feature doc covers all template sections. File paths are accurate.

13. **Update ARCHITECTURE.md feature inventory**
    - Add the new feature to `ARCHITECTURE.md` §9 Feature Inventory table.
    - Include: feature name, frontend route(s), backend router, backend service, feature doc path.
    - Checkpoint: Feature appears in the inventory table.

14. **Update README.md navigation index**
    - Add the new feature doc to the navigation index in `docs/README.md`.
    - Checkpoint: Feature doc is listed in the navigation index.

### Doc Updates

- [ ] `docs/features/{feature}.md` — created (step 12)
- [ ] `docs/ARCHITECTURE.md` — update §9 Feature Inventory
- [ ] `docs/README.md` — update navigation index

### Verification

- [ ] Route loads. Shell renders before data arrives.
- [ ] First paint data: only critical data fetched server-side. Check network tab.
- [ ] Cache state: after load, expected cache keys exist with data.
- [ ] Mutation roundtrip: create/update/delete an entity. List and detail caches stay coherent.
- [ ] Optimistic rollback: simulate network failure. Cache restores to pre-mutation state.
- [ ] Cross-navigation: navigate away and back. Cache is warm, no redundant fetches.
- [ ] Payload sizes: list endpoint returns summary data, not full detail.
- [ ] Code compiles: `npx tsc --noEmit` passes.
- [ ] Pattern matches calendar — or documents why it differs.

---

## Playbook: Add a New Backend Endpoint

**When to use:** An existing feature needs a new API endpoint (e.g., a new list filter, a detail view, a new mutation).
**Estimated scope:** Backend (schema, service, router), Frontend (API route, query module update).
**Prerequisites:** Read the feature's `features/{feature}.md`. Read `STANDARDS.md` §9-10 (API and service rules).

### Steps

1. **Add request/response schema**
   - File: `LUSIA Studio - Backend/app/api/http/schemas/{feature}.py`
   - Add or update Pydantic models for the new endpoint's request body and response shape.
   - Use `Optional[type] = None` for optional fields.
   - Pattern: `schemas/calendar.py` — `SessionCreate`, `SessionOut`.
   - Checkpoint: Schema models exist for the new endpoint.

2. **Add service method**
   - File: `LUSIA Studio - Backend/app/api/http/services/{feature}_service.py`
   - Implement the business logic function.
   - If it returns list data: use `FEATURE_LIST_SELECT` + `_batch_hydrate_summaries()`.
   - If it returns detail data: use `FEATURE_DETAIL_SELECT` + `_batch_hydrate_details()`.
   - Scope queries by `organization_id`. Apply role-aware filtering if needed.
   - Use `supabase_execute()` for primary queries.
   - Pattern: `services/calendar_service.py` — `list_sessions()`, `get_session()`.
   - Checkpoint: Service function exists, uses correct SELECT, applies org scoping.

3. **Add router endpoint**
   - File: `LUSIA Studio - Backend/app/api/http/routers/{feature}.py`
   - Add the FastAPI endpoint. Validate auth via dependency injection, parse params, delegate to service.
   - Declare `response_model` for type safety.
   - Router body: validate → extract org_id → delegate. No business logic.
   - Pattern: `routers/calendar.py` — `list_sessions_endpoint()`.
   - Checkpoint: Endpoint registered, validates auth, delegates to service.

4. **Add Next.js API route**
   - File: `LUSIA Studio - Frontend/app/api/{feature}/{resource}/route.ts`
   - Add or update the thin auth proxy for the new endpoint.
   - Extract token, forward to backend, return response transparently.
   - Pattern: `app/api/calendar/sessions/route.ts`.
   - Checkpoint: API route proxies the new endpoint.

5. **Add or update frontend query/mutation**
   - File: `LUSIA Studio - Frontend/lib/queries/{feature}.ts`
   - For a new read endpoint: add key builder, fetcher function, query hook, and prefetch function.
   - For a new mutation: add the mutation function in the feature shell that calls the API and syncs caches.
   - If adding a new list dimension: ensure the key builder encodes all filter params.
   - Pattern: `lib/queries/calendar.ts` — `fetchCalendarSessions()`, `useCalendarSessionsQuery()`.
   - Checkpoint: Query module updated with new key builder, hook, and/or prefetch.

6. **Update feature doc**
   - File: `docs/features/{feature}.md`
   - Add the new endpoint to the Architecture section.
   - If cache keys changed, update the Cache Contract section.
   - If payload shapes changed, update the Payload Shapes section.
   - Checkpoint: Feature doc reflects the new endpoint.

### Doc Updates

- [ ] `docs/features/{feature}.md` — update Architecture, Cache Contract, and/or Payload Shapes sections

### Verification

- [ ] New endpoint returns correct data with proper auth enforcement.
- [ ] Response follows summary/detail convention (list endpoints return summary, detail endpoints return full).
- [ ] Frontend query hook receives data and populates cache correctly.
- [ ] If mutation: optimistic update → API call → sync/rollback works.
- [ ] Feature doc updated.

---

## Playbook: Add a New Database Table

**When to use:** A feature needs a new table in the database.
**Estimated scope:** Backend (migration, service SELECT constants, query methods), Docs (data entity doc, feature doc update).
**Prerequisites:** Read `data/overview.md` (naming conventions, index strategy, migration rules). Read `STANDARDS.md` §11 Database Rules.

### Steps

1. **Design the schema**
   - Follow naming conventions from `data/overview.md` §3:
     - Table name: `snake_case`, plural (e.g., `session_types`, `student_assignments`).
     - Primary key: `id uuid DEFAULT gen_random_uuid()`.
     - Foreign keys: `{referenced_table_singular}_id` (e.g., `organization_id`, `teacher_id`).
     - Array foreign keys: `{referenced_table_singular}_ids uuid[]` (e.g., `student_ids`).
     - Timestamps: `created_at timestamptz DEFAULT now()`, `updated_at timestamptz DEFAULT now()`.
     - Booleans: `is_` prefix for state flags (e.g., `is_active`, `is_public`).
     - Status columns: `status text` with CHECK constraints.
     - JSON columns: `jsonb` type.
     - Monetary values: `numeric(8,2)`.
   - Include `organization_id uuid REFERENCES organizations(id)` for multi-tenancy (unless the table scopes by user_id like chat).
   - Checkpoint: Column list with types, constraints, and foreign keys defined.

2. **Create migration file**
   - File: `LUSIA Studio - Backend/migrations/{next_number}_{description}.sql`
   - Next number: check existing migration files and use the next sequential three-digit number. Currently at `020_`, so next is `021_`.
   - Use `CREATE TABLE IF NOT EXISTS` for idempotency.
   - Include `COMMENT ON COLUMN` for non-obvious columns.
   - Include RLS policies if the table stores user data.
   - Wrap multi-statement migrations in `BEGIN; ... COMMIT;` when atomicity is needed.
   - Pattern: `migrations/016_calendar_perf_indexes.sql` (indexes), `migrations/001_classrooms.sql` (table creation).
   - Checkpoint: Migration file exists with correct numbering and idempotent DDL.

3. **Create indexes for known access patterns**
   - In the same migration file or a separate one.
   - Use `CREATE INDEX IF NOT EXISTS idx_{table}_{columns}` following the naming convention from `data/overview.md` §4.
   - Composite indexes for multi-column filter patterns that match UI access patterns.
   - GIN indexes for array containment queries (`student_ids`, `class_ids`).
   - Partial indexes where useful (e.g., `WHERE status = 'active'`).
   - Every index must have a documented reason tied to a UI access pattern.
   - Pattern: `migrations/016_calendar_perf_indexes.sql`.
   - Checkpoint: Indexes created for all identified access patterns. Each has a comment or clear purpose.

4. **Run migration**
   - Apply via Supabase SQL editor or `supabase db push`.
   - Verify the table and indexes exist.
   - Checkpoint: Table and indexes are live in the database.

5. **Add backend service access**
   - File: `LUSIA Studio - Backend/app/api/http/services/{feature}_service.py`
   - Define `FEATURE_LIST_SELECT` and `FEATURE_DETAIL_SELECT` constants for the new table.
   - Add query methods that use the new table: list, get, create, update, delete as needed.
   - Use `supabase_execute()` and `parse_single_or_404()`.
   - Scope all queries by `organization_id`.
   - Pattern: `services/calendar_service.py` — `SESSION_LIST_SELECT`, `list_sessions()`.
   - Checkpoint: Service has SELECT constants and CRUD operations for the new table.

6. **Create or update data entity doc**
   - File: `docs/data/{domain}.md`
   - Add the table to the relevant domain entity doc. Include: table name, every column (name, type, purpose), primary key, foreign keys, indexes (name, columns, type, why it exists), relationships in domain language.
   - If no entity doc exists for this domain, create one following the template from existing entity docs.
   - Checkpoint: Entity doc includes the new table with complete column and index documentation.

7. **Update feature doc if applicable**
   - File: `docs/features/{feature}.md`
   - Update the Database section to reference the new table.
   - Add new read patterns and indexes to the feature doc.
   - Checkpoint: Feature doc's Database section reflects the new table.

### Doc Updates

- [ ] `docs/data/{domain}.md` — add or update entity documentation for the new table
- [ ] `docs/features/{feature}.md` — update Database section if the table serves a feature
- [ ] `docs/data/overview.md` — update §7 Table Inventory with the new table

### Verification

- [ ] Table exists in database with correct columns, types, and constraints.
- [ ] Indexes exist and match identified UI access patterns.
- [ ] Service can CRUD against the new table with correct org scoping.
- [ ] Entity doc is complete and accurate.
- [ ] Migration is idempotent (running it again causes no errors).

---

## Playbook: Refactor a Feature to Match Standards

**When to use:** An existing feature has architectural gaps relative to `STANDARDS.md` and needs alignment using the calendar pattern as the target.
**Estimated scope:** May touch all layers: backend service, frontend queries, shell, UI components, route page.
**Prerequisites:** Read all five docs listed in Required Reading below before writing any code.

### Required Reading (in this order)

1. `docs/STANDARDS.md` — mandatory engineering standard. Every decision must align.
2. `docs/features/{feature}.md` — current state of the feature being refactored.
3. `docs/features/calendar.md` — reference implementation. The target pattern.
4. `docs/ARCHITECTURE.md` — system-level context if needed.
5. `docs/data/overview.md` — if touching the data layer.

### Steps

1. **Read all required docs**
   - Read the five docs above in order. Do not skip any.
   - Checkpoint: You can describe the current feature's architecture, the target pattern (calendar), and the engineering standards.

2. **Identify gaps between current state and standards**
   - Compare the feature's current architecture against `STANDARDS.md` and `features/calendar.md`.
   - Check each layer:
     - **Route page:** Does it server-fetch critical data only? Is it minimal? Pattern: `app/(teacher)/dashboard/calendar/page.tsx`.
     - **Server fetch:** Does `lib/{feature}.server.ts` exist? Does it call `fetchBackendJsonServer()` directly? Pattern: `lib/calendar.server.ts`.
     - **Feature shell:** Does it own query orchestration, mutations, optimistic updates, prefetch? Pattern: `components/calendar/CalendarShell.tsx`.
     - **Query module:** Does `lib/queries/{feature}.ts` export the full contract (keys, hooks, prefetch, snapshot, sync, invalidation)? Pattern: `lib/queries/calendar.ts`. See `STANDARDS.md` §5.
     - **API route:** Is it a thin auth proxy with no business logic? Pattern: `app/api/calendar/sessions/route.ts`.
     - **Backend service:** Does it define `FEATURE_LIST_SELECT` and `FEATURE_DETAIL_SELECT`? Does it use batch hydration? Pattern: `services/calendar_service.py`. See `STANDARDS.md` §10.
     - **Backend router:** Is it validate → delegate? No DB logic? Pattern: `routers/calendar.py`.
     - **Cache contract:** Are keys deterministic? Is invalidation explicit? Are optimistic mutations snapshot-based?
     - **Payloads:** Is there a summary/detail split? See `STANDARDS.md` §8.
     - **Performance:** Is first paint bounded? Are non-critical fetches deferred? Are heavy components lazy-loaded?
   - Checkpoint: You have a list of specific gaps, each referencing the relevant standard or calendar pattern.

3. **Plan the changes**
   - Do NOT start coding yet.
   - Order the changes: backend first (service → router → schema), then frontend (query module → server fetch → shell → route page → UI).
   - Identify which changes are independent (can be done in any order) vs dependent (must be sequenced).
   - Identify which existing tests may be affected.
   - Checkpoint: You have an ordered list of changes with dependencies identified.

4. **Execute backend changes**
   - Fix backend gaps first: add missing SELECT constants, split summary/detail hydration, add role-aware filtering, fix N+1 queries.
   - Pattern references: `STANDARDS.md` §10 Backend Service Contract, `services/calendar_service.py`.
   - Checkpoint: Backend service follows the standard contract. SELECT constants defined. Batch hydration implemented.

5. **Execute frontend changes**
   - Fix frontend gaps layer by layer:
     - **Query module** — add missing exports (key builders, hooks, prefetch, snapshot, sync, invalidation). See `STANDARDS.md` §5.
     - **Server fetch** — create or fix `lib/{feature}.server.ts`.
     - **Feature shell** — restructure to own all data orchestration. Move query/mutation logic out of UI components into the shell.
     - **Route page** — make it server-fetch critical data and pass to shell. Remove client-side query logic.
     - **UI components** — ensure they only own rendering and local state. Accept data via props.
     - **Loading skeleton** — create `loading.tsx` if missing.
   - Checkpoint: Frontend follows the layer responsibility model. Shell orchestrates. UI renders.

6. **Verify: no regressions**
   - Run `npx tsc --noEmit` to verify compilation.
   - If Playwright tests exist, run `npx playwright test --reporter=list`.
   - Manually verify: route loads, first paint is fast, mutations work, cache stays coherent.
   - Checkpoint: All tests pass. No regressions.

7. **Update feature doc**
   - File: `docs/features/{feature}.md`
   - Update all sections to reflect the new architecture: Architecture walkthrough, Cache Contract, Payload Shapes, Backend Patterns, Database.
   - Checkpoint: Feature doc accurately describes the refactored feature.

### Verification Checklist

After completing the refactor, confirm ALL of the following:

- [ ] Change aligns with `STANDARDS.md` principles.
- [ ] Pattern matches calendar — or documents why it differs.
- [ ] Code compiles: `npx tsc --noEmit` passes.
- [ ] No regressions in other features.
- [ ] Route loads with fast first paint (server-fetched critical data only).
- [ ] Summary and detail payloads are different (list endpoint is lightweight).
- [ ] Cache contract is explicit: keys, stale times, sync, invalidation all defined in the query module.
- [ ] Optimistic mutations have snapshot-based rollback.
- [ ] No N+1 queries in backend service.
- [ ] Feature doc updated to reflect new architecture.

### Doc Updates

- [ ] `docs/features/{feature}.md` — update all sections to reflect new architecture
