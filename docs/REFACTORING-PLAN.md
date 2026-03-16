# Codebase Refactoring Plan

Canonical refactoring plan for aligning the LUSIA Studio codebase with `UI-EX-BIBLE.md`.

**Reference implementation:** `/dashboard/calendar`
**Date:** 2026-03-16

---

## 1. Executive Summary

### Current State

LUSIA Studio is a mature educational SaaS platform with ~450 frontend files and ~94 backend files across 8 major features. The calendar feature establishes a strong reference pattern that most of the codebase partially follows but no other feature fully matches.

### Major Strengths

- **API route discipline is excellent across the board.** Every Next.js API route is a thin auth proxy with zero business logic. This is the most consistently followed Bible rule.
- **Backend router/service separation is clean everywhere.** Routers validate and delegate; services own domain logic. No exceptions found.
- **Cache key architecture is well-structured.** All features use `buildXxxQueryKey()` helpers with deterministic, hierarchical keys. Snapshot/restore patterns exist where needed.
- **Optimistic updates exist in the right places.** Calendar, assignments, grades, documents, and members all implement snapshot-based rollback on mutation failure.
- **Batch hydration pattern prevents N+1 queries.** Calendar service pioneered this; assignments and members services follow the same O(1)-queries approach.
- **Deferred query infrastructure is production-grade.** `useDeferredQueryEnabled`, `useSessionStorageQuerySeed`, and `requestIdleCallback`-based bootstrap are sophisticated and correctly implemented.

### Major Architectural Weaknesses

1. **Grades feature violates first-paint discipline severely.** Loads the entire grade board (all subjects, all periods, all elements, all domains) in a single blocking request before any UI renders. This is the largest single violation in the codebase.
2. **Chat feature has no server-side initial data.** Page renders empty, then fetches everything client-side. Messages are stored in local state, not the query cache.
3. **Student dashboard bootstrap is nearly empty.** Only prefetches user profile — no subjects, session types, or catalog data. Students see more loading spinners than teachers.
4. **No feature has a formal summary/detail endpoint split on the backend** except calendar. Other features embed detail-level hydration in list endpoints or lack detail endpoints entirely.
5. **Sidebar prefetch fires on every mouseEnter without debounce.** Fast cursor movement across sidebar items triggers parallel prefetch storms.
6. **Query-client default staleTime is 0ms.** Individual features override this correctly, but any query without an explicit staleTime refetches on every mount.

### Production-Readiness Assessment

The codebase is **functional and deployable** but carries performance debt in grades and chat, and pattern inconsistency across features. The calendar pattern proves the architecture works — the gap is applying it uniformly.

---

## 2. Refactoring Principles

These principles are drawn directly from `UI-EX-BIBLE.md` and must govern every refactoring task.

1. **First paint is sacred.** Load only what the first useful screen needs. Defer everything else until after paint. Never allow background prefetch to compete with first paint.

2. **One layer, one responsibility.** Route fetches critical data. Feature shell orchestrates queries/mutations/cache. UI components own rendering and local state. API routes proxy. Backend routers validate and delegate. Services own domain logic.

3. **One feature, one cache contract.** Every feature must define list keys, detail keys, mutation sync rules, invalidation rules, and optimistic rules. No feature should rely on developer memory.

4. **Summary and detail payloads must be different.** List views pay for summary data only. Detail views fetch on demand. If a list needs full detail to render, the UI or payload is wrong.

5. **Optimistic updates must be deterministic.** Snapshot before mutating. Apply optimistic result. Replace with server data on success. Restore snapshot on failure. One strategy per entity.

6. **The backend must match the frontend access pattern.** Indexes, payloads, and query structure must reflect how the UI actually reads data. No abstract optimization.

7. **Patterns must be easy to repeat.** If another engineer cannot copy the pattern safely, it is not yet a reference pattern.

8. **Calendar is the reference.** When in doubt about how a feature should work, look at how calendar does it. Thin route → shell orchestration → summary list query → detail on demand → optimistic mutations → deferred prefetch → batch hydration → aligned indexes.

---

## 3. Global Architecture Tasks

### G-01: Set meaningful default staleTime in query-client

**Why:** Default staleTime is 0ms. Any query without an explicit override refetches on every component mount, wasting network and competing with first paint. Individual features set their own stale times correctly, but missing an explicit default means any new query or forgotten override silently degrades performance.

**Affected:** `lib/query-client.ts`, all features without explicit staleTime.

**Expected outcome:** Default staleTime of 60_000ms (1 minute). Features that need shorter/longer times override explicitly. Document the convention in a comment.

---

### G-02: Debounce sidebar prefetch

**Why:** Sidebar `onMouseEnter` triggers `router.prefetch()` + `prefetchTeacherRouteData()` / `prefetchStudentRouteData()` on every hover with no debounce. Fast cursor movement across 6 sidebar items fires 6 parallel prefetch chains. This creates request bursts that can compete with active page queries.

**Affected:** `components/dashboard/Sidebar.tsx`, `components/dashboard/StudentSidebar.tsx`.

**Expected outcome:** Debounce of 200-300ms on sidebar item hover before triggering data prefetch. `router.prefetch()` (which is cheap, just JS bundle) can stay immediate. Only the data prefetch functions need debouncing.

---

### G-03: Enhance student dashboard bootstrap

**Why:** `StudentDashboardReferenceDataBootstrap` only prefetches user profile. Students navigating to grades, sessions, or assignments hit cold caches for subject catalog, session types, and other reference data. This creates unnecessary loading spinners on first navigation.

**Affected:** `components/dashboard/StudentDashboardReferenceDataBootstrap.tsx`.

**Expected outcome:** Bootstrap prefetches (via `requestIdleCallback`): `prefetchMyProfileQuery()`, `prefetchSubjectCatalogQuery()`, `prefetchSessionTypes()`. Keep the same deferred/idle pattern as the teacher bootstrap.

---

### G-04: Standardize feature query module structure

**Why:** Calendar's query module (`lib/queries/calendar.ts`) is the reference: it exports key builders, query hooks, prefetch functions, snapshot/restore helpers, sync helpers, and invalidation helpers. Other features have partial implementations. Having a consistent module shape makes every feature's cache contract explicit and copyable.

**Affected:** All `lib/queries/*.ts` files.

**Expected outcome:** Every feature query module exports:
- `buildXxxListKey(params)` / `buildXxxDetailKey(id)`
- `useXxxQuery()` / `useXxxDetailQuery()`
- `prefetchXxxQuery()` / `prefetchXxxDetailQuery()`
- `snapshotXxxQueries()` / `restoreXxxQueries()`
- `syncXxxAcrossQueries()` / `upsertXxxInQueries()` / `removeXxxFromQueries()`
- `invalidateXxxQueries()`

Features that don't need all of these (e.g., read-only analytics) can skip mutation helpers but should document why.

---

### G-05: Establish summary/detail endpoint convention on backend

**Why:** Calendar backend has two hydration functions: `_batch_hydrate_session_summaries()` (list views, students capped to 4) and `_batch_hydrate_sessions()` (full detail). No other backend service has this explicit split. Assignments embeds full hydration in the list endpoint. Grades returns everything in one monolithic call.

**Affected:** All backend services (`app/api/http/services/*.py`).

**Expected outcome:** Every feature service that has both list and detail views defines:
- `FEATURE_LIST_SELECT` — columns needed for list/card/table rendering
- `FEATURE_DETAIL_SELECT` — columns needed for detail/editor/sheet rendering
- `_batch_hydrate_summaries()` — lightweight hydration for list views
- `_batch_hydrate_details()` — full hydration for detail views

Services with simple entities (session-types, subjects) that don't need the split should document why.

---

### G-06: Add route-specific loading skeletons for all feature routes

**Why:** Bible requires every route to define "what skeleton is shown before data is ready." Some routes have good skeletons (docs, analytics, calendar). Others show generic spinners or delegate to parent loading states.

**Affected:** All `app/**/loading.tsx` files.

**Expected outcome:** Every feature route has a `loading.tsx` that mirrors the final UI layout with shimmer/skeleton placeholders. No feature should show a centered spinner as its loading state.

---

### G-07: Standardize route prefetch to check cache before fetching

**Why:** Route prefetch functions in `lib/route-prefetch.ts` and sidebar handlers call `prefetchXxxQuery()` without checking if fresh data already exists in cache. Combined with 0ms default staleTime (G-01), this causes duplicate fetches when bootstrap already loaded the data.

**Affected:** `lib/route-prefetch.ts`, `components/dashboard/Sidebar.tsx`, `components/dashboard/StudentSidebar.tsx`.

**Expected outcome:** After G-01 is done (meaningful staleTime), `queryClient.fetchQuery()` will naturally skip if data is fresh. No additional cache-check code needed — fixing staleTime fixes this transitively. If G-01 is not done first, prefetch functions should manually check `queryClient.getQueryState(key)?.dataUpdatedAt` before fetching.

**Dependencies:** G-01.

---

## 4. Feature-by-Feature Audit

### 4.1 Calendar (Reference Implementation)

**Bible compliance: 9.5/10**

This is the standard. What it does right:

| Aspect | Implementation |
|--------|---------------|
| First paint | Server-side fetch of current week only. Shell renders immediately. |
| Feature shell | `CalendarShell` owns all queries, mutations, optimistic updates, prefetch timing. |
| Summary/detail split | `_batch_hydrate_session_summaries()` (list, 4 students max) vs `_batch_hydrate_sessions()` (full). |
| Cache contract | Complete: key builders, snapshot/restore, sync across queries, invalidation. |
| Optimistic updates | Snapshot → apply → replace on success → restore on failure. Handles recurrence scope. |
| Prefetch | Deferred. Adjacent ranges prefetched on hover over week boundaries. Route-level prefetch intentionally skipped (server already loads current week). |
| API routes | Thin proxy with scope param forwarding. |
| Backend | Router validates + delegates. Service owns batch hydration, recurrence logic, scope-based mutations. |
| DB indexes | 5 indexes aligned to exact read patterns (org+date, org+teacher+date, GIN on student_ids, recurrence group). |

**Remaining improvement areas (from Bible §"What Still Requires Care"):**
- Stronger transactional guarantees for multi-table writes (currently compensating rollback)
- More set-based recurring mutations
- Formal performance budget

**No refactoring tasks needed.** Calendar is the target pattern.

---

### 4.2 Assignments

**Bible compliance: 8.2/10**

**Strengths:**
- Thin route delegation with session storage seeding
- Well-structured cache keys with pattern-based batch operations
- Solid optimistic updates with snapshot/rollback on status changes
- Exemplary backend service with batch hydration and explicit SELECT constants
- Complete DB indexes (composite on org+teacher+status+created_at, GIN on student_ids)

**Problems:**

| Issue | Severity | Description |
|-------|----------|-------------|
| No detail query ownership | Medium | `AssignmentDetailPanel` receives summary data from parent. No `useAssignmentDetailQuery()` exists. Detail view doesn't own its own data fetch. |
| Backend mixes hydration | Medium | List endpoint hydrates teacher names, artifacts, students, submission counts — all detail-level data. No separate summary hydration function. |
| Feature shell mixes concerns | Low | `AssignmentsPage` manages both list state AND archive pagination AND detail selection. |
| Missing detail data prefetch | Low | Only submissions are prefetched on card hover. No assignment detail prefetch. |

**Refactoring tasks:**

**A-01: Create assignment detail query and endpoint**
- Add `GET /api/v1/assignments/{id}` backend endpoint with full hydration
- Add `useAssignmentDetailQuery(id)` hook
- Add `prefetchAssignmentDetailQuery(id)`
- `AssignmentDetailPanel` should call `useAssignmentDetailQuery()` instead of receiving data via props
- Backend: Split `_hydrate_assignments()` into `_hydrate_assignment_summaries()` (list) and `_hydrate_assignment_detail()` (single)

**A-02: Separate backend summary hydration**
- `list_assignments()` should use lightweight summary hydration (teacher name, student count, submission count — no artifact content, no full student list)
- Detail endpoint does full hydration
- Matches calendar pattern: `_batch_hydrate_session_summaries()` vs `_batch_hydrate_sessions()`

**A-03: Add detail prefetch on card hover**
- `handleAssignmentWarmup()` should also call `prefetchAssignmentDetailQuery(id)`
- Combined with existing `prefetchAssignmentSubmissionsQuery(id)` and component preload

---

### 4.3 Grades

**Bible compliance: 5.5/10**

This is the feature with the most significant violations.

**Strengths:**
- Cache key structure is excellent (hierarchical prefixes, wildcard invalidation)
- Snapshot/restore pattern is well-implemented
- Decimal precision is correct end-to-end (Decimal.js client, Python Decimal server)
- API routes are thin
- Backend router/service separation is clean
- Type safety is comprehensive

**Problems:**

| Issue | Severity | Description |
|-------|----------|-------------|
| First-paint violation | Critical | `get_board_data()` loads ALL subjects, ALL periods, ALL elements, ALL domains in one blocking request. User sees spinner until everything loads. |
| No feature shell | Critical | No shell renders before data arrives. `GradesEntryPage` blocks on full `boardQuery`. |
| Summary/detail coupling | High | `SubjectCard` embeds exam input controls (detail-level interaction) inside summary card view. |
| Monolithic backend query | High | `get_board_data()` triggers 8-12 DB queries with no separation between what the first screen needs and what detail views need. |
| No period-based pagination | Medium | All periods loaded at once even though only one period tab is visible at a time. |
| Inconsistent optimistic rollback | Medium | Some handlers capture snapshots; others (like SubjectCard exam inputs) don't. |
| Missing indexes | Low | No composite index for domain+period lookups; no multi-enrollment element index. |

**Refactoring tasks:**

**GR-01: Implement grades feature shell with progressive loading**
- Create `GradesShell` component that renders page header, period tab bar, and loading skeletons immediately (zero-fetch shell)
- Split data loading: settings query (tiny, instant) → active period subjects (visible data) → other periods (deferred)
- Backend: Create `GET /api/v1/grades/settings/{year}` endpoint (settings only, very fast)
- Backend: Create `GET /api/v1/grades/board/{year}/period/{period_number}` endpoint (one period at a time)
- Shell orchestrates: load settings → render tabs → load active period → prefetch adjacent periods in background

**GR-02: Separate SubjectCard summary from detail controls**
- `SubjectCard` should be a pure presentational component (subject name, grade badge, pass/fail color)
- Exam input controls, weight adjustments, and edit forms move to `SubjectDetailSheet` (loaded on demand when user clicks a card)
- This reduces re-render scope: updating one card's exam weight no longer re-renders all cards

**GR-03: Split backend board data into progressive endpoints**
- `GET /api/v1/grades/settings/{year}` — settings only (1 query)
- `GET /api/v1/grades/board/{year}` — subjects + enrollments + current period summary (3-4 queries)
- `GET /api/v1/grades/period/{period_id}/elements` — elements for one period (1-2 queries)
- `GET /api/v1/grades/enrollment/{id}/domains` — domains for one enrollment (1 query)
- Total: Progressive loading replaces monolithic 8-12 query call

**GR-04: Ensure consistent optimistic rollback**
- Every mutation handler in grades components must: capture snapshot → apply optimistic → try/catch → restore on error
- Audit all `handleSave`, `handleExamChange`, and similar handlers
- Remove any mutation path that doesn't have rollback

**GR-05: Add missing database indexes**
```sql
CREATE INDEX idx_see_domain_period ON subject_evaluation_elements(domain_id, period_number) WHERE domain_id IS NOT NULL;
CREATE INDEX idx_periods_enrollment_number ON student_subject_periods(enrollment_id, period_number);
```

---

### 4.4 Documents (Artifacts)

**Bible compliance: 9.5/10**

**Strengths:**
- Server-side initial data via `fetchArtifactsServer()`
- Excellent feature shell: heavy editors and dialogs lazy-loaded via `dynamic()` with `ssr: false`
- Clean summary/detail payload split: `ArtifactSummaryOut` (list) vs `ArtifactOut` (full content)
- Complete cache contract: `syncArtifactToCaches()`, `patchArtifactCaches()`, `removeArtifactFromCaches()`, `insertArtifactIntoCaches()`
- Optimistic updates with rollback on name/icon edits and deletion
- Explicit backend SELECT constants for summary vs detail

**Problems:**

| Issue | Severity | Description |
|-------|----------|-------------|
| Subject catalog not server-fetched | Low | `useDocsSubjectCatalogQuery()` loads client-side. Could be server-fetched alongside artifacts. |
| Summary payload has unused fields | Low | `ArtifactSummaryOut` includes processing_error, conversion_requested which aren't rendered in the table view. |

**Refactoring tasks:**

**D-01: Fetch subject catalog server-side in docs page**
- In `app/(teacher)/dashboard/docs/page.tsx`, add `fetchSubjectCatalogServer()` call alongside `fetchArtifactsServer()`
- Pass as `initialCatalog` prop to `DocsPage`
- Eliminates one client-side fetch on first load

**D-02: Trim summary payload fields**
- Remove unused fields from `ArtifactSummaryOut` / `ARTIFACT_SUMMARY_SELECT`
- Keep only fields actually rendered in the docs table/gallery view

---

### 4.5 Students / Members

**Bible compliance: 9.0/10**

**Strengths:**
- Server-side hydration with role-aware scoping (admin gets all, teacher gets filtered)
- Clean shell-to-detail progression with animated drawer
- Separate detail queries per tab (stats, sessions, assignments, grades)
- Cross-feature cache synchronization (class member changes sync to student list)
- Batch hydration in backend avoids N+1

**Problems:**

| Issue | Severity | Description |
|-------|----------|-------------|
| Missing prefetch on detail open | Low | No `prefetchMemberQuery(id)` called when hovering or selecting a student. Detail data fetches after selection. |
| All-classes query not deferred for admin | Low | `useAllClassesQuery()` loads immediately for admin users alongside primary class. Could be deferred. |
| GIN index on profiles.class_ids undocumented | Low | Backend relies on `contains("class_ids", [...])` but no migration creates the GIN index explicitly. |

**Refactoring tasks:**

**M-01: Add member detail prefetch on hover**
- When user hovers a student row, call `prefetchMemberQuery(id)` and `prefetchMemberStatsQuery(id)`
- Matches calendar pattern where detail is prefetched before selection

**M-02: Defer all-classes query for admin**
- Wrap `useAllClassesQuery()` with `useDeferredQueryEnabled()` so it loads after first paint
- Admin still gets class filter immediately via own-classes query; all-classes is secondary data

**M-03: Document and verify GIN index on profiles.class_ids**
- Add migration to explicitly create `CREATE INDEX IF NOT EXISTS idx_profiles_class_ids_gin ON profiles USING GIN(class_ids)` if it doesn't exist
- Or verify it exists via Supabase dashboard and add a comment in the service

---

### 4.6 Classes

**Bible compliance: 8.5/10**

**Strengths:**
- Server-side hydration, sorted server-side
- Clean lazy-loaded dialogs for create/edit
- Complete cache contract with cross-sync to member queries
- Optimistic member add/remove with refetch fallback

**Problems:**

| Issue | Severity | Description |
|-------|----------|-------------|
| No class detail endpoint | Low | Class detail uses same data as list entry. Acceptable for small payload, but doesn't follow summary/detail convention. |
| No optimistic update for class create/edit | Low | Creates/edits refetch instead of optimistic update. Acceptable but slower-feeling. |

**Refactoring tasks:**

**CL-01: Add optimistic create for classes**
- When creating a class, insert optimistic entry into cache immediately
- Replace with server response on success, rollback on failure
- Low priority but improves perceived speed

---

### 4.7 Analytics

**Bible compliance: 7.5/10**

**Strengths:**
- Server-side initial data fetch
- Good loading skeleton matching final layout
- Pre-computed aggregations on backend (not in component)
- Batch profile fetching avoids N+1

**Problems:**

| Issue | Severity | Description |
|-------|----------|-------------|
| No month prefetch | Medium | Changing months triggers full refetch with no prefetch of adjacent months. |
| No shell transition on month change | Medium | Entire dashboard re-renders when month changes. Should show skeleton for data area while keeping header/navigation stable. |
| Large batch fetch (5000 sessions) | Low | Backend fetches up to 5000 sessions per query, aggregates in Python. Could overwhelm for large orgs. |

**Refactoring tasks:**

**AN-01: Add adjacent month prefetch**
- When rendering current month, prefetch previous and next month data in background
- Matches calendar pattern of prefetching adjacent ranges

**AN-02: Add shell transition on month navigation**
- Keep header, month picker, and chart area stable when month changes
- Show skeleton only in the data cards area
- Prevents full-page flash on navigation

**AN-03: Add backend pagination for large organizations**
- Replace 5000-session hard limit with paginated aggregation
- Or use database-level aggregation (GROUP BY with SUM/COUNT) instead of fetching all rows and aggregating in Python

---

### 4.8 Chat

**Bible compliance: 4.0/10**

This feature has the most fundamental architectural gaps.

**Strengths:**
- Messages displayed immediately when user sends (optimistic append to local state)
- Streaming integration works
- Conversation list query has proper stale time

**Problems:**

| Issue | Severity | Description |
|-------|----------|-------------|
| No server-side initial data | Critical | Chat page renders empty. No SSR for conversation list or recent messages. |
| No feature shell | Critical | No skeleton or shell while conversation loads. Just blank space. |
| Messages in local state, not query cache | High | Messages fetched via vanilla `fetch()` and stored in `useState`. Not in React Query cache. No cache persistence across navigation. |
| No conversation detail cache | High | Navigating away from chat and returning re-fetches all messages. |
| Streaming completion doesn't sync cache | Medium | When assistant finishes responding, conversation list cache isn't updated with new message count/preview. |

**Refactoring tasks:**

**CH-01: Add server-side conversation list fetch**
- In chat page entry, fetch conversation list server-side via `fetchChatConversationsServer()`
- Pass as `initialConversations` to ChatPage
- User sees conversation sidebar immediately on first paint

**CH-02: Implement chat feature shell**
- Create `ChatShell` that renders: conversation sidebar (with initial data) + message area skeleton + input bar
- Shell renders instantly; messages load after mount

**CH-03: Move messages into React Query cache**
- Create `useChatMessagesQuery(conversationId)` hook
- Messages cached per conversation: `chat:messages:{conversationId}`
- Navigating between conversations hits cache instead of re-fetching
- Streaming appends to cache via `queryClient.setQueryData()`

**CH-04: Sync conversation list cache after streaming**
- When assistant response completes, update conversation list cache entry with latest message preview and updated_at timestamp
- Prevents stale conversation sidebar after sending messages

---

### 4.9 Profile

**Bible compliance: 8.0/10**

**Strengths:**
- Server-side initial data for both teacher and student profiles
- Optimistic inline saves with immediate UI update
- Clean layout with avatar sidebar

**Problems:**

| Issue | Severity | Description |
|-------|----------|-------------|
| Student profile loads grade board eagerly | Medium | `useGradeBoardQuery()` is always enabled when student profile loads. Grade data should be deferred or conditional. |
| No loading indicator on profile refetch | Low | When profile data refetches (stale), component re-renders in-place with no visual indication. |

**Refactoring tasks:**

**PR-01: Defer grade board query in student profile**
- Wrap grade board query with `useDeferredQueryEnabled()`
- Only fetch after profile UI has painted
- Or make it conditional on user scrolling to the grades section

---

### 4.10 Teachers

**Bible compliance: 8.5/10**

**Strengths:**
- Server-side initial data with merged admin+teacher list
- Detail card with conditional detail fetch (skips if summary data is sufficient)
- 10-minute stale time for teacher list
- Cross-cache sync via `updateTeacherCaches()`

**Problems:**

| Issue | Severity | Description |
|-------|----------|-------------|
| No pagination for large orgs | Low | Server fetches 100 admins + 100 teachers. For large organizations this will fail silently or truncate. |

**Refactoring tasks:**

**T-01: Add pagination support for teacher list**
- Add `page` and `perPage` params to members query for teacher list
- Backend already supports offset/limit — wire it through

---

### 4.11 Session Types

**Bible compliance: 8.0/10**

**Strengths:**
- On-demand loading (only when dialog opens)
- Deferred-optimistic pattern (sync cache, then refetch to verify)
- Clean backend with default-clearing logic
- 10-minute stale time

**Problems:**

| Issue | Severity | Description |
|-------|----------|-------------|
| No loading skeleton in dialog | Low | Shows centered spinner instead of placeholder list items while loading. |

**Refactoring tasks:**

**ST-01: Add skeleton list items to session type dialog**
- Replace spinner with 3-4 skeleton list items matching the final layout
- Matches Bible requirement for route-specific loading skeletons

---

## 5. Prioritized Refactor Backlog

### P0: Foundational / Blocking

These tasks establish the infrastructure that other refactors depend on, or fix critical violations.

| ID | Title | Why | Areas | Outcome | Dependencies |
|----|-------|-----|-------|---------|-------------|
| G-01 | Set meaningful default staleTime | Prevents duplicate fetches across the entire app. Every other prefetch optimization depends on queries actually respecting their cache. | `lib/query-client.ts` | Default 60s staleTime. Features override as needed. | None |
| GR-01 | Implement grades feature shell | Largest first-paint violation in the app. Users see a blank spinner for 2-3s. | `components/grades/GradesShell.tsx` (new), `GradesEntryPage.tsx`, backend grades endpoints | Grade page renders header + period tabs instantly. Active period loads in <200ms. | GR-03 |
| GR-03 | Split backend board data into progressive endpoints | Required for GR-01. Current monolithic endpoint cannot support progressive loading. | `services/grades_service.py`, `routers/grades.py`, `schemas/grades.py` | Separate endpoints for settings, period data, elements, domains. | None |
| CH-01 | Server-side conversation list for chat | Chat renders completely empty on first paint. Most basic Bible violation. | Chat page entry, `lib/chat.server.ts` | Conversation sidebar renders immediately with server data. | None |
| G-04 | Standardize feature query module structure | Makes the cache contract explicit and copyable across all features. Prevents developer-memory-dependent cache rules. | All `lib/queries/*.ts` | Every module exports the same shape: key builders, hooks, prefetch, snapshot, sync, invalidation. | None |

---

### P1: High-Value / High-Impact

These deliver the most visible improvement to users and developers.

| ID | Title | Why | Areas | Outcome | Dependencies |
|----|-------|-----|-------|---------|-------------|
| GR-02 | Separate SubjectCard summary from detail | Cards currently embed exam controls, causing unnecessary re-renders across all subject cards when one changes. | `components/grades/SubjectCard.tsx`, `SubjectDetailSheet.tsx` | Cards are pure presentational. Edit controls load on demand in sheet. | None |
| CH-02 | Chat feature shell | No shell = blank page while loading. Second-worst first-paint violation after grades. | `components/chat/ChatShell.tsx` (new), `ChatPage.tsx` | Shell with conversation sidebar + message skeleton + input bar renders instantly. | CH-01 |
| CH-03 | Move messages into React Query cache | Messages in local state means every navigation re-fetches. No cache persistence. | `lib/queries/chat.ts`, `ChatContent.tsx` | Messages cached per conversation. Navigation between conversations is instant from cache. | None |
| A-01 | Create assignment detail query and endpoint | Detail panel doesn't own its data. Summary props passed from parent couples list and detail. | `lib/queries/assignments.ts`, backend assignments endpoints, `AssignmentDetailPanel.tsx` | Detail panel fetches its own data. List and detail are independently cacheable. | A-02 |
| A-02 | Separate backend assignment summary hydration | List endpoint does full hydration (teacher, artifact, students, submissions). Overweight for list view. | `services/assignments_service.py` | `_hydrate_assignment_summaries()` for list (lightweight) vs `_hydrate_assignment_detail()` for detail. | None |
| G-02 | Debounce sidebar prefetch | Fast cursor movement triggers parallel prefetch storms. | `Sidebar.tsx`, `StudentSidebar.tsx` | 200-300ms debounce on data prefetch. Router prefetch stays immediate. | None |
| G-03 | Enhance student dashboard bootstrap | Students see loading spinners everywhere because bootstrap only prefetches profile. | `StudentDashboardReferenceDataBootstrap.tsx` | Bootstrap also prefetches subject catalog and session types via idle callback. | None |
| AN-01 | Adjacent month prefetch for analytics | Month navigation triggers full refetch with no preparation. | `AdminAnalyticsDashboard.tsx`, `lib/queries/analytics.ts` | Previous and next month data prefetched in background. | None |
| G-05 | Establish backend summary/detail convention | Calendar is the only feature with explicit summary vs detail hydration. Making this a convention prevents future features from repeating the same mistake. | All backend services | Every service with list+detail views has explicit `_hydrate_summaries()` and `_hydrate_details()`. | None |

---

### P2: Important Cleanup and Consistency

These improve consistency and developer experience without dramatic user-facing impact.

| ID | Title | Why | Areas | Outcome | Dependencies |
|----|-------|-----|-------|---------|-------------|
| GR-04 | Consistent optimistic rollback in grades | Some grade mutation paths lack snapshot/rollback. Inconsistent error recovery. | Grade components with mutation handlers | Every mutation: snapshot → optimistic → try/catch → restore. | None |
| GR-05 | Add missing grades DB indexes | Domain+period composite and enrollment+period_number indexes missing. | Migrations | Faster element and domain lookups. | None |
| D-01 | Fetch subject catalog server-side in docs | Eliminates one client-side fetch. Minor optimization. | `app/(teacher)/dashboard/docs/page.tsx` | Catalog available on first paint. | None |
| M-01 | Member detail prefetch on hover | No prefetch before student selection. Detail data waits until after click. | `StudentsPage.tsx`, `lib/queries/members.ts` | Hovering a student row prefetches detail and stats. | None |
| CH-04 | Sync conversation cache after streaming | Conversation sidebar shows stale preview after user sends messages. | `ChatContent.tsx`, `lib/queries/chat.ts` | Conversation list entry updated with latest message preview after streaming completes. | CH-03 |
| AN-02 | Shell transition on month navigation | Full-page flash when changing analytics month. | `AdminAnalyticsDashboard.tsx` | Keep header/picker stable. Show skeleton only in data cards. | None |
| G-06 | Route-specific loading skeletons for all routes | Some routes show generic spinners or delegate to parent. | All `loading.tsx` files | Every route has a skeleton matching final layout. | None |
| A-03 | Add detail prefetch on assignment card hover | Only submissions prefetched currently. Missing assignment detail prefetch. | `AssignmentsPage.tsx` | Card hover prefetches detail + submissions + component code. | A-01 |
| PR-01 | Defer grade board query in student profile | Grade board loads eagerly on profile page even though user may not scroll to it. | `StudentProfilePage.tsx` | Grade data deferred via `useDeferredQueryEnabled()`. | None |

---

### P3: Optional / Later-Stage Hardening

These are low-risk improvements that can wait until core patterns are stable.

| ID | Title | Why | Areas | Outcome | Dependencies |
|----|-------|-----|-------|---------|-------------|
| D-02 | Trim unused fields from artifact summary | Minor payload optimization. | Backend `ArtifactSummaryOut` | Smaller list payloads. | None |
| M-02 | Defer all-classes query for admin | Minor first-paint optimization for admin users. | `StudentsPage.tsx` | All-classes loads after primary view paints. | None |
| M-03 | Document GIN index on profiles.class_ids | Backend assumes index exists but no migration creates it explicitly. | Migrations | Explicit migration or documentation. | None |
| CL-01 | Optimistic create for classes | Currently refetches after create. Acceptable but slower-feeling. | `CreateClassDialog.tsx`, `lib/queries/classes.ts` | Optimistic insert on create. | None |
| AN-03 | Backend pagination for analytics | 5000-session limit could overwhelm large orgs. | `services/analytics_service.py` | DB-level aggregation or paginated fetch. | None |
| T-01 | Pagination for teacher list | 100+100 hard limit will truncate for large orgs. | Member queries for teachers | Proper pagination. | None |
| ST-01 | Skeleton list for session type dialog | Minor UX improvement. Spinner → skeleton items. | `SessionTypeManagerDialog.tsx` | Skeleton list while loading. | None |
| G-07 | Route prefetch cache-check | Redundant with G-01 if staleTime is set. Only needed if G-01 is delayed. | `lib/route-prefetch.ts` | Prefetch skips if fresh data exists. | G-01 |

---

## 6. Shared Pattern Extraction Opportunities

### 6.1 Feature Query Module Template

Create a documented template that new features copy. Based on `lib/queries/calendar.ts`:

```
lib/queries/{feature}.ts
├── Constants: QUERY_PREFIX, STALE_TIME
├── Key Builders: buildListKey(params), buildDetailKey(id)
├── Query Hooks: useFeatureQuery(params, initialData?), useFeatureDetailQuery(id)
├── Prefetch: prefetchFeatureQuery(params), prefetchFeatureDetailQuery(id)
├── Snapshot/Restore: snapshotFeatureQueries(), restoreFeatureQueries(snapshots)
├── Sync: syncFeatureAcrossQueries(items), upsertFeatureInQueries(item), removeFeatureFromQueries(matcher)
├── Invalidation: invalidateFeatureQueries(), invalidateFeatureDetailQuery(id)
└── Helpers: featureBelongsToQuery(item, queryMeta) — membership test for sync
```

### 6.2 Backend Service Hydration Convention

Standardize the batch hydration pattern from calendar across all services:

```python
# Service pattern
FEATURE_LIST_SELECT = "id,title,status,created_at"
FEATURE_DETAIL_SELECT = "id,title,status,content,notes,created_at,updated_at"

def _batch_hydrate_summaries(db, items):
    """Collect all foreign IDs, batch-fetch once per type, merge."""

def _batch_hydrate_details(db, items):
    """Full hydration for detail views."""

def list_features(db, org_id, **filters):
    rows = db.table("features").select(FEATURE_LIST_SELECT).eq("organization_id", org_id)...
    return _batch_hydrate_summaries(db, rows.data)

def get_feature(db, org_id, feature_id):
    row = db.table("features").select(FEATURE_DETAIL_SELECT).eq("id", feature_id)...
    return _batch_hydrate_details(db, [row.data])[0]
```

### 6.3 Optimistic Mutation Helper

Create a reusable optimistic mutation pattern:

```typescript
async function optimisticMutation<T>({
  snapshotFn,      // () => Snapshots
  applyFn,         // () => void (apply optimistic data)
  mutationFn,      // () => Promise<T> (actual API call)
  onSuccess,       // (result: T) => void (sync real data)
  onError,         // (snapshots: Snapshots) => void (restore)
}: OptimisticMutationConfig<T>): Promise<T> {
  const snapshots = snapshotFn();
  applyFn();
  try {
    const result = await mutationFn();
    onSuccess(result);
    return result;
  } catch (error) {
    onError(snapshots);
    throw error;
  }
}
```

This pattern is repeated identically in calendar, assignments, grades, documents, and members. Extracting it reduces boilerplate and ensures consistent error handling.

### 6.4 Session Storage Query Seed

Already extracted as `useSessionStorageQuerySeed`. Ensure all features that benefit from cross-navigation persistence use it:
- Currently used: Grades entry, Assignments entry
- Should also use: Analytics (persist month data), Chat (persist conversation list)

### 6.5 Deferred Query Enablement

Already extracted as `useDeferredQueryEnabled`. Ensure consistent usage:
- Use for: secondary analytics data, profile-page grade board, admin all-classes view, non-active period data in grades
- Do not use for: primary first-screen data (that should use server-side initial data instead)

### 6.6 Route Prefetch Convention

Standardize the route prefetch decision tree:

```
Route navigation →
  1. router.prefetch(href) — always (JS bundle)
  2. Does the route server-render initial data?
     YES → skip data prefetch (calendar pattern)
     NO → prefetch minimal first-screen data only
  3. Never prefetch secondary/deferred data during route prefetch
```

Document this convention in `lib/route-prefetch.ts` as a comment.

---

## 7. Risks and Sequencing Notes

### What Should Be Refactored Carefully

**Grades progressive loading (GR-01, GR-03):** This is the highest-impact change and the most complex. The current monolithic `get_board_data()` endpoint is deeply integrated. Splitting it requires:
- New backend endpoints
- New frontend query hooks
- Shell component restructuring
- Exam grade flow rewiring

Risk: Breaking grade calculations if period data loading order changes. Mitigation: Keep the monolithic endpoint working during migration. Build progressive endpoints alongside. Switch features one at a time.

**Chat message cache migration (CH-03):** Moving messages from local state to React Query changes the data flow for streaming. Risk: Streaming race conditions if cache updates conflict with real-time message appends. Mitigation: Test streaming with cache-based messages thoroughly before removing local state.

### What Can Cause Regressions

- **G-01 (staleTime change):** Increasing default staleTime means some queries won't refetch as aggressively. If any feature relies on automatic refetch-on-mount behavior, it may show stale data. Mitigation: Audit all features for implicit refetch-on-mount dependencies before changing the default.
- **GR-02 (SubjectCard split):** Moving exam controls to a sheet changes the user interaction flow. Teachers accustomed to inline editing will need to click to open the sheet. Mitigation: Consider keeping basic grade display inline, moving only complex controls (weights, domain config) to the sheet.
- **A-02 (assignment summary/detail split):** If the detail panel currently relies on fields that were embedded in the summary, splitting will cause it to show incomplete data until the detail query loads. Mitigation: Show loading state in detail panel while detail query fetches.

### What Should Be Measured Before/After

- **First Contentful Paint (FCP)** for `/student/grades` — target: <1s (currently estimated >2s)
- **Time to Interactive (TTI)** for `/student/grades` — target: <1.5s
- **Prefetch network request count** during sidebar hover sequence — target: no duplicate requests
- **Chat first-paint time** — target: conversation sidebar visible in <500ms
- **Analytics month-switch time** — target: <200ms with prefetched data

### Sequencing Recommendations

**Phase 1 — Foundation (P0):**
1. G-01 (staleTime) — unblocks all prefetch optimizations
2. G-04 (query module convention) — establishes pattern for all feature refactors
3. G-05 (backend summary/detail convention) — establishes backend pattern
4. CH-01 (chat SSR) — quick win, independent

**Phase 2 — Grades Overhaul (P0 + P1):**
1. GR-03 (backend split) — prerequisite for shell
2. GR-01 (feature shell) — highest user impact
3. GR-02 (card/sheet split) — follows naturally from shell work

**Phase 3 — Assignments + Chat (P1):**
1. A-02 (backend summary split) — prerequisite for detail query
2. A-01 (detail query) — follows backend split
3. CH-02 + CH-03 (chat shell + message cache) — can parallel with assignments

**Phase 4 — Polish (P1 + P2):**
1. G-02 (sidebar debounce) — quick win
2. G-03 (student bootstrap) — quick win
3. AN-01, AN-02 (analytics prefetch + transitions)
4. M-01 (member prefetch)
5. G-06 (loading skeletons)

**Phase 5 — Hardening (P2 + P3):**
- Remaining P2 and P3 tasks in any order
- Performance measurement and validation

---

## Appendix: Feature Compliance Scorecard

| Feature | Bible Score | First Paint | Shell | Summary/Detail | Cache | Optimistic | API Routes | Backend | DB |
|---------|-----------|------------|-------|----------------|-------|-----------|-----------|---------|-----|
| Calendar | 9.5/10 | Pass | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Documents | 9.5/10 | Pass | Pass | Pass | Pass | Pass | Pass | Pass | Pass |
| Students | 9.0/10 | Pass | Pass | Pass | Pass | Pass | Pass | Pass | Partial |
| Classes | 8.5/10 | Pass | Pass | Pass | Pass | Partial | Pass | Pass | Pass |
| Teachers | 8.5/10 | Pass | Pass | Pass | Pass | N/A | Pass | Pass | Partial |
| Assignments | 8.2/10 | Pass | Partial | Fail | Pass | Pass | Pass | Pass | Pass |
| Profile | 8.0/10 | Pass | Partial | Pass | Partial | Pass | Pass | Pass | Pass |
| Session Types | 8.0/10 | Partial | Partial | Pass | Pass | Partial | Pass | Pass | Pass |
| Analytics | 7.5/10 | Pass | Fail | Pass | Partial | N/A | Pass | Pass | Partial |
| Grades | 5.5/10 | Fail | Fail | Fail | Pass | Partial | Pass | Pass | Partial |
| Chat | 4.0/10 | Fail | Fail | Pass | Fail | Partial | Pass | Pass | Unknown |
