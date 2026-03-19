---
last-updated: 2026-03-19
stability: stable
agent-routing: "Read before implementing any feature or refactoring any code. The authoritative reference for engineering standards."
---

# Engineering Standards

Canonical engineering standard for building and maintaining features in the LUSIA Studio codebase. Every rule is grounded in the calendar reference implementation.

**Reference implementation:** Calendar feature (`/dashboard/calendar`)

---

## 1. Core Goals

Every feature must optimize for all eight simultaneously. If a solution satisfies one at the expense of another, it is wrong.

| # | Goal | What It Means |
|---|------|---------------|
| 1 | **Fast first paint** | Load only what the first useful screen needs. Everything else waits. |
| 2 | **Predictable data flow** | Data flows through known layers in a known order. No hidden fetches, hidden writes, or hidden cache coupling. |
| 3 | **Strict state ownership** | Every piece of state has exactly one owner. No ambiguity about who reads, who writes, who invalidates. |
| 4 | **Minimal network and DB work** | Fetch only what the visible screen requires. Summary for lists, detail on demand. Indexes match real access patterns. |
| 5 | **Safe optimistic behavior** | Every optimistic mutation has a defined rollback path. One strategy per entity. |
| 6 | **Stable cache rules** | Every feature defines its full cache contract: keys, sync, invalidation, optimistic rules. No developer-memory dependencies. |
| 7 | **Backend correctness** | Correctness before cleverness. Transactional writes, role-aware filtering, explicit SELECT constants, batch hydration. |
| 8 | **Easy repetition** | A good pattern is one another engineer (or agent) can copy safely without hidden caveats. |

If a solution is clever but makes ownership unclear, it is the wrong solution.

---

## 2. Non-Negotiable Principles

### 2.1 First Paint Is Sacred

The app must load only what is required to render the first useful screen.

- Render the route shell immediately.
- Fetch only critical data for the visible frame.
- Defer adjacent, related, historical, and analytical data until after paint.
- Never allow background prefetch to compete with first paint.

**Concrete implication:** The calendar route fetches only the current week on the server. Adjacent weeks, alternate teacher views, and history are all deferred.
**Reference:** `app/(teacher)/dashboard/calendar/page.tsx` — server-fetches current week only.

### 2.2 One Layer, One Responsibility

Each layer has a narrow, non-overlapping job. See [Section 3](#3-layer-responsibilities) for the full breakdown.

**Concrete implication:** The feature shell owns query orchestration and mutations. UI components own rendering and local state. Neither crosses into the other's territory.

### 2.3 Three Categories of State

We do NOT use one giant global store. State falls into exactly three categories:

| Category | Examples | Where It Lives |
|----------|----------|----------------|
| **Global shared app data** | User, organization, teacher list, subject catalog, session types | App-wide query cache, long staleTime |
| **Feature-shared cached data** | Feature list queries, detail queries, mutation results, range caches | Feature query namespace in cache |
| **Local UI state** | Dialog open, current tab, drag state, resize, hover, form dirtiness | Component `useState` / `useRef` |

**Rule:** If state is needed across routes or features → cache it. If state is needed within one feature → feature query namespace. If state only affects one render tree → keep it local.

### 2.4 One Feature, One Cache Contract

Every feature must define: list query keys, detail query keys, mutation sync rules, invalidation rules, and optimistic rules.

**Concrete implication:** No feature should rely on developer memory to remember which queries also need updating. If the cache contract is incomplete, the feature is incomplete.
**Reference:** `lib/queries/calendar.ts` — defines the complete contract.

### 2.5 Optimistic UX Must Be Deterministic

Optimistic updates are allowed only when: the expected result shape is known, rollback is possible, and the visible UI can recover safely.

- A feature must have ONE optimistic strategy, not multiple competing strategies.
- Must update the visible data source AND corresponding detail caches.
- Must rollback cleanly on failure.
- Must never leave stale phantom records behind.

**Reference:** `components/calendar/CalendarShell.tsx` — snapshot → apply → replace on success → restore on failure.

### 2.6 Summary and Detail Payloads Must Be Different

List and calendar views must never pay the cost of full detail payloads.

- **Summary:** id, time range, title, minimal labels, minimal student preview, type/color markers.
- **Detail:** editable fields, full relations, audit metadata, operational fields.

**Rule:** If a list needs full detail to render, the payload is too heavy or the UI is badly designed.
**Reference:** Backend `services/calendar_service.py` — `SESSION_LIST_SELECT` vs `SESSION_DETAIL_SELECT`, `_batch_hydrate_session_summaries()` vs `_batch_hydrate_sessions()`.

### 2.7 Backend Must Match Frontend Access Pattern

Indexes, payloads, and query structure must reflect how the UI actually reads data. We do not optimize DB access abstractly.

**Concrete implication:** Calendar indexes match: org+date range, org+teacher+date range, org+recurrence group, org+id, GIN on student_ids.

### 2.8 Patterns Must Be Easy to Repeat

If a feature requires remembering hidden caveats, it is not yet a reference pattern. Every standard in this doc must be copyable from the calendar implementation.

---

## 3. Layer Responsibilities

### Frontend Route / Page

| | |
|---|---|
| **Responsibility** | Fetch critical first-screen data server-side, pass to shell |
| **Reference** | `app/(teacher)/dashboard/calendar/page.tsx` |

**MUST do:**
- Fetch only critical first-screen data via server-side fetch
- Pass `initialData` props to the feature shell
- Keep the file minimal — no query orchestration, no mutation logic

**MUST NOT do:**
- Fan out beyond what the user immediately needs
- Fetch adjacent ranges, history, or alternate views
- Contain any client-side query logic

```tsx
// Calendar page pattern — the entire route file
export default async function CalendarPage() {
    const sessions = await fetchCalendarSessionsServer(startISO, endISO);
    return <CalendarShell initialSessions={sessions} initialStart={startISO} initialEnd={endISO} />;
}
```

### Server Fetch

| | |
|---|---|
| **Responsibility** | Server-side initial data loading, skips Next API proxy |
| **Reference** | `lib/calendar.server.ts` |

**MUST do:**
- Call the backend directly via `fetchBackendJsonServer()` (one fewer network hop than routing through the Next API route)
- Return typed data with a safe fallback (empty array, null, etc.)
- Be a thin wrapper — no business logic

**MUST NOT do:**
- Import client-side code or hooks
- Implement caching logic (the query client handles that)
- Transform or reshape payloads

### Feature Shell

| | |
|---|---|
| **Responsibility** | Query orchestration, mutations, cache sync, prefetch |
| **Reference** | `components/calendar/CalendarShell.tsx` |

**MUST do:**
- Own active query params and hook calls
- Own all mutation requests
- Own optimistic behavior (snapshot → apply → try/catch → restore/replace)
- Own query synchronization across list and detail caches
- Own background prefetch timing (deferred, after paint)
- Accept `initialData` from the route page

**MUST NOT do:**
- Own low-level visual rendering details
- Own drag geometry, hover state, or dense widget interactions
- Directly call `fetch()` for reads (use query hooks)

### UI Component

| | |
|---|---|
| **Responsibility** | Rendering, local state, interaction |
| **Reference** | Calendar grid/week components |

**MUST do:**
- Own view mode, selected date, drag state, resize state, popover state
- Own local loading placeholders and pure rendering transforms
- Accept data and callbacks from the shell via props

**MUST NOT do:**
- Own route fetch policy or app-level prefetch policy
- Own backend mutation orchestration
- Own global cache invalidation
- Decide when to fetch or what endpoint to call

### Next API Route

| | |
|---|---|
| **Responsibility** | Thin auth proxy — attach auth, normalize transport, no business logic |
| **Reference** | `app/api/calendar/sessions/route.ts` |

**MUST do:**
- Extract access token via `getAccessToken()`
- Forward request to backend with `Authorization` header
- Use `cache: "no-store"` for authenticated mutable traffic
- Return the backend response status and payload transparently

**MUST NOT do:**
- Implement business logic
- Add hidden data joins or payload reshaping
- Duplicate service logic

```typescript
// Calendar API route pattern — thin proxy
export async function GET(request: NextRequest) {
    const accessToken = await getAccessToken();
    if (!accessToken) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const response = await fetch(`${BACKEND_API_URL}/api/v1/calendar/sessions?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
    });
    const payload = await response.json().catch(() => []);
    return Response.json(payload, { status: response.status });
}
```

### Backend Router

| | |
|---|---|
| **Responsibility** | Validate request + auth, declare response shape, delegate to service |
| **Reference** | `routers/calendar.py` |

**MUST do:**
- Validate access via dependency injection (`require_teacher`, `get_current_user`)
- Parse query params and request body via Pydantic schemas
- Declare `response_model` for type safety
- Delegate immediately to service functions

**MUST NOT do:**
- Contain DB logic
- Build business rules
- Duplicate service logic
- Import `supabase` directly

### Backend Service

| | |
|---|---|
| **Responsibility** | Domain logic, DB access, batch hydration |
| **Reference** | `services/calendar_service.py` |

**MUST do:**
- Define `FEATURE_LIST_SELECT` and `FEATURE_DETAIL_SELECT` constants
- Implement `_batch_hydrate_{feature}_summaries()` for list endpoints (lightweight)
- Implement `_batch_hydrate_{feature}s()` or `_batch_hydrate_{feature}_details()` for detail endpoints (full)
- Calendar ref: `_batch_hydrate_session_summaries()` and `_batch_hydrate_sessions()`
- Apply role-aware filtering
- Keep DB access bounded and explicit
- Use `supabase_execute()` helper for consistent error handling

**MUST NOT do:**
- Handle HTTP concerns (status codes belong in the router, errors use HTTPException)
- Import FastAPI routing decorators
- Expose internal DB schema details in response shapes

### Database

| | |
|---|---|
| **Responsibility** | Store truth, serve known access patterns |
| **Reference** | Calendar tables + indexes |

**MUST do:**
- Have indexes aligned to actual UI read patterns
- Support the feature's primary query dimensions (org+date range, org+teacher, etc.)
- Use GIN indexes for array containment queries (`student_ids`, `class_ids`)

---

## 4. Custom Query Client API Reference

**CRITICAL:** This codebase uses a custom query client (`lib/query-client.ts`), NOT React Query / TanStack Query. The API is different. Do not describe or use React Query APIs.

### QueryClient Instance

A singleton `queryClient` is exported from `lib/query-client.ts`. It manages an in-memory cache of query records, each identified by a string key.

**Default configuration:**
- `DEFAULT_STALE_TIME_MS = 60_000` (1 minute) — queries with data fresher than this are served from cache without a network request
- `DEFAULT_GC_TIME_MS = 5 * 60_000` (5 minutes) — unused cache entries are garbage-collected after this duration

### Core APIs

#### `queryClient.fetchQuery<T>(options)`

```typescript
queryClient.fetchQuery<T>({
    key: string,
    fetcher: () => Promise<T>,
    staleTime?: number,     // default: 60_000ms
    force?: boolean,        // default: false — skip freshness check
}): Promise<T>
```

**What it does:** Fetches data for a key. Returns cached data if fresh (within `staleTime`). De-duplicates concurrent requests for the same key.

**When to use:** Prefetch functions, server-seeded initial loads, imperative cache warming.
**When NOT to use:** Inside React components — use `useQuery` instead.

#### `queryClient.setQueryData<T>(key, updater)`

```typescript
queryClient.setQueryData<T>(
    key: string,
    updater: T | undefined | ((current: T | undefined) => T | undefined),
): void
```

**What it does:** Directly sets cache data for a key. Notifies all subscribers. Setting `undefined` resets the entry to idle.

**When to use:** Optimistic updates, syncing detail cache from list data, clearing entries on delete.
**When NOT to use:** As a substitute for proper fetching — this bypasses the fetcher entirely.

#### `queryClient.getMatchingQueries<T>(matcher)`

```typescript
queryClient.getMatchingQueries<T>(
    matcher: string | ((key: string) => boolean),
): QueryEntry<T>[]
```

**What it does:** Returns all cache entries whose key matches. String matchers use `startsWith`. Function matchers receive the full key.

**When to use:** Snapshotting all queries in a namespace for rollback, auditing cache state.

#### `queryClient.updateQueries<T>(matcher, updater)`

```typescript
queryClient.updateQueries<T>(
    matcher: string | ((key: string) => boolean),
    updater: (current: T | undefined, key: string) => T | undefined,
): void
```

**What it does:** Updates ALL matching cache entries in-place. The updater receives the current data and the key. Notifies subscribers for each updated entry.

**When to use:** Cross-query sync after mutations (e.g., updating a session across all date-range queries).
**When NOT to use:** When only one specific key needs updating — use `setQueryData` instead.

#### `queryClient.invalidateQueries(matcher)`

```typescript
queryClient.invalidateQueries(
    matcher: string | ((key: string) => boolean),
): void
```

**What it does:** Resets `updatedAt` to 0 for all matching entries, making them stale. Does NOT delete data — existing data remains visible while refetch happens.

**When to use:** After server-confirmed mutations when you want a full refetch. Cache invalidation as a fallback after optimistic failure.

#### `queryClient.primeQueryData<T>(key, data, updatedAt?)`

```typescript
queryClient.primeQueryData<T>(
    key: string,
    data: T,
    updatedAt?: number,     // default: Date.now()
): void
```

**What it does:** Seeds cache data ONLY if the key has no existing data. Does nothing if data already exists.

**When to use:** Server-side initial data seeding via `useQuery({ initialData })` — the hook calls this internally.
**When NOT to use:** When you need to overwrite existing data — use `setQueryData`.

#### `queryClient.getQueryData<T>(key)`

Returns the current cached data for a key, or `undefined` if none.

#### `queryClient.dumpCache()`

Returns all cache entries with key, status, updatedAt, and hasData. Used by e2e tests to inspect cache state.

### useQuery Hook

```typescript
function useQuery<T>({
    key: string,
    fetcher: () => Promise<T>,
    enabled?: boolean,         // default: true
    staleTime?: number,        // default: 60_000ms
    initialData?: T,
    initialUpdatedAt?: number,
}): UseQueryResult<T>
```

**Return value:**

| Field | Type | Description |
|-------|------|-------------|
| `data` | `T \| undefined` | Current cached data |
| `error` | `unknown` | Last error, if any |
| `status` | `"idle" \| "loading" \| "success" \| "error"` | Current query status |
| `isLoading` | `boolean` | `true` when enabled, loading, and no data yet |
| `isFetching` | `boolean` | `true` when enabled and loading (even with stale data) |
| `refetch` | `() => Promise<T \| undefined>` | Force refetch ignoring staleTime |
| `mutate` | `(updater) => void` | Directly update this query's cache (alias for `setQueryData`) |

**Behavior:**
- On mount (if enabled): calls `fetchQuery` which respects `staleTime`
- If `initialData` is provided: primes cache via `primeQueryData` (no-op if data already exists)
- Uses `useSyncExternalStore` for tear-free concurrent reads
- Refetches when `key`, `enabled`, `staleTime`, or `updatedAt` changes

---

## 5. Feature Query Module Contract

Every feature query module (`lib/queries/{feature}.ts`) must follow this structure. Based on `lib/queries/calendar.ts`.

### Required Constants

```typescript
export const FEATURE_QUERY_PREFIX = "feature:items:";
const FEATURE_DETAIL_QUERY_PREFIX = "feature:item:";
const FEATURE_QUERY_STALE_TIME = 60_000;
const FEATURE_DETAIL_QUERY_STALE_TIME = 60_000;
```

**Why:** Deterministic, hierarchical key prefixes enable pattern-based operations (snapshot all, update all, invalidate all). Stale times are explicit, not inherited from defaults.

### Required Exports

#### Key Builders

```typescript
export function buildFeatureListKey(params): string
export function buildFeatureDetailKey(id: string): string
```

**Why:** Keys are built by functions, never scattered string literals. Deterministic params produce deterministic keys.
**Calendar ref:** `buildCalendarSessionsQueryKey()`, `buildCalendarSessionDetailQueryKey()`

#### Query Hooks / Imperative Fetch

```typescript
export function useFeatureQuery(params, initialData?): UseQueryResult<T[]>

// Detail fetching — EITHER a hook OR an imperative fetch function:
export function useFeatureDetailQuery(id: string): UseQueryResult<T>
// OR
export function fetchFeatureDetail(id: string): Promise<T>
```

**Why:** Encapsulates key construction, fetcher, and staleTime. Shell components call these, never raw `useQuery`. Detail fetching can use either a reactive hook or an imperative fetch that populates the cache — both patterns are acceptable. The calendar reference implementation uses the imperative pattern (`fetchCalendarSessionDetail()`), which fetches detail data and writes it into the cache directly.
**Calendar ref:** `useCalendarSessionsQuery()` (list hook), `fetchCalendarSessionDetail()` (imperative detail fetch)

#### Prefetch Functions

```typescript
export function prefetchFeatureQuery(params): Promise<T[]>
export function prefetchFeatureDetailQuery(id: string): Promise<T>
// OR use the imperative fetchFeatureDetail() from above — it populates the cache directly
```

**Why:** Called by shells, sidebars, and route prefetch logic. Wraps `queryClient.fetchQuery()` with the correct key and staleTime.
**Calendar ref:** `prefetchCalendarSessions()` (list prefetch). For detail, the calendar uses `fetchCalendarSessionDetail()` — this is not a dedicated prefetch function but a direct fetch that populates the detail cache, serving the same purpose.

#### Snapshot / Restore

```typescript
export function snapshotFeatureQueries(): Snapshot[]
export function restoreFeatureQueries(snapshots: Snapshot[]): void
```

**Why:** Required for optimistic rollback. Snapshot captures all list queries in the namespace. Restore replaces them exactly.
**Calendar ref:** `snapshotCalendarQueries()`, `restoreCalendarQueries()`

#### Cache Sync

```typescript
export function syncFeatureAcrossQueries(items: T[], options?: { removeIds?: Iterable<string> }): void
export function updateFeatureInQueries(matcher: (item: T) => boolean, updater: (item: T) => T): void
export function removeFeatureFromQueries(matcher: (item: T) => boolean): void
```

**Why:** After mutations, list and detail caches must stay coherent. `syncFeatureAcrossQueries` upserts items into matching list queries and updates detail caches. The `options.removeIds` parameter is used for replacing temporary IDs with real IDs after server confirmation. `updateFeatureInQueries` takes a matcher function to find items and an updater function to transform them. `removeFeatureFromQueries` removes items matching a predicate.
**Calendar ref:** `syncCalendarSessionsAcrossQueries()`, `removeCalendarSessionsFromQueries()`, `updateCalendarSessionsInQueries(matcher, updater)`

#### Invalidation

```typescript
export function invalidateFeatureQueries(): void
export function invalidateFeatureDetailQuery(id: string): void
```

**Why:** Full-refetch fallback after optimistic failure or when cache integrity is uncertain.
**Calendar ref:** `invalidateCalendarSessionsQueries()`, `invalidateCalendarSessionDetail()`

### Optional but Recommended

- **Key parser:** `parseFeatureListKey(key) → QueryMeta | null` — enables membership testing during sync.
- **Membership test:** `featureBelongsToQuery(item, meta) → boolean` — determines if an item belongs in a specific list query based on its params.
- **Sort helper:** Consistent sort function used in all sync operations.

**Calendar ref:** `parseCalendarSessionsQueryKey()`, `sessionBelongsToQuery()`, `sortSessions()`

### Additional Optional Exports

Features may need additional cache operations depending on their domain:

```typescript
export function updateFeatureForRelatedEntity(relatedId: string, updater: (item: T) => T): void
export function removeFeatureDetails(matcher: (key: string) => boolean): void
```

- **`updateFeatureForRelatedEntity(relatedId, updater)`** — Update cache entries when a related entity changes. For example, when a session type is renamed or recolored, all cached sessions referencing that type need updating.
  **Calendar ref:** `updateCalendarSessionsForSessionType()` — updates all cached sessions when a session type changes.

- **`removeFeatureDetails(matcher)`** — Batch-remove detail cache entries matching a predicate. Useful for cleaning up detail caches after bulk operations.
  **Calendar ref:** `removeCalendarSessionDetails()`

### What Read-Only Features Can Skip

Features that are read-only (e.g., analytics) can skip: snapshot/restore, cache sync functions, and optimistic helpers. They should document why these are omitted.

---

## 6. Cache Rules

### 6.1 Cache Foundation

- The app uses a **shared client query cache** (`queryClient` singleton) that is app-wide in the browser session.
- Features use **one namespace per feature** via key prefixes (e.g., `calendar:sessions:`, `assignments:list:`).
- Key generation uses **explicit builder functions** — never string literals scattered across files.
- Detail keys use a **separate prefix** from list keys (e.g., `calendar:session:` for detail vs `calendar:sessions:` for list).

### 6.2 Cache Key Design Rules

1. Query keys must be **deterministic** — same params always produce the same key.
2. Keys must be built by **explicit functions**, not inline string concatenation.
3. Key prefixes must be **feature-namespaced** — no collisions between features.
4. List keys must encode **all filter dimensions** (date range, teacher filter, etc.).
5. Detail keys must encode **the entity ID**.

```typescript
// CORRECT
buildCalendarSessionsQueryKey({ startDate, endDate, teacherId })
// → "calendar:sessions:2026-03-16T00:00:00.000Z|2026-03-22T23:59:59.999Z|*"

// WRONG — scattered string literal
`calendar:sessions:${start}|${end}`
```

### 6.3 Mutation Sync Rules

After every mutation:
1. **List caches** must be updated (upsert for create/update, remove for delete).
2. **Detail caches** must be updated (set for create/update, clear for delete).
3. List and detail must **never silently diverge**.
4. Deleting an entity must remove or invalidate its detail cache.

### 6.4 What Belongs in Shared Cache

**Good candidates:** session ranges, session detail, teacher list, members list, subject catalog, organization settings, session types.

**Bad candidates:** open modal booleans, drag pointers, current hover target, input keystrokes, form dirtiness.

### 6.5 Cache Behavior on Route Switch

- Prefer **server-provided initial data** for first paint.
- Do not duplicate that same payload in aggressive hover prefetch unless there is a measured benefit.
- Client-side navigation **preserves** the existing cache — calendar cache survives navigation to assignments.

### 6.6 Background Loading

- Prefetch **only after paint** — use idle time or delayed background fetch.
- Keep background fetches **bounded** — no prefetch explosion.
- Allowed after paint: adjacent range prefetch, alternate filter prefetch, deeper history, non-critical reference data.
- NOT allowed during first paint: all adjacent ranges, entire month if only week is visible, alternate role views, unrelated reference fetches.

### 6.7 Detail Fetch Behavior

- Fetch on demand when user selects/opens an entity.
- Hydrate into the detail cache.
- Optionally sync back to the visible list cache if the entity is already visible.

**Calendar ref:** `fetchCalendarSessionDetail()` fetches detail, then calls `syncCalendarSessionsAcrossQueries()` to update list caches.

### 6.8 Memory Management

- **One visible source of truth** for feature data — no unbounded copies in multiple places.
- No prefetch explosion — do not warm unrelated ranges on initial mount.
- No permanent caching of broad ranges unless the route truly needs them.
- Heavy interactive components should **lazy-load** expensive dialogs, managers, and editors.

---

## 7. Optimistic Update Contract

### 7.1 Allowed Operations

Optimistic behavior is allowed for: **create, update, reorder, move, resize, delete** — but only when the rollback path is defined.

### 7.2 Required Contract

Every optimistic mutation must follow this exact sequence:

```
1. snapshot = snapshotFeatureQueries()        // Capture current state
2. applyOptimisticUpdate()                    // Apply expected result to cache
3. try {
4.     result = await apiCall()               // Make the real API call
5.     syncFeatureAcrossQueries(result)       // Replace optimistic data with server data
6. } catch {
7.     restoreFeatureQueries(snapshot)        // Restore pre-mutation state
8.     invalidateFeatureQueries()             // Optional: force refetch for safety
9.     showErrorToast()                       // Inform the user
10. }
```

**Calendar ref:** `CalendarShell.tsx` — every create, update, and delete follows this pattern.

> **Implementation note:** The calendar reference implementation uses a fire-and-forget pattern (`.then()/.catch()`) rather than `await`. Both patterns are acceptable — the key requirement is the sequence: snapshot, apply optimistic update, handle success (sync real data), handle failure (restore snapshot). The fire-and-forget pattern is preferred for non-blocking UX, as it avoids suspending the calling function while the network request completes.

### 7.3 Reusable Pattern

The optimistic mutation helper extracted from the refactoring plan:

```typescript
async function optimisticMutation<T>({
    snapshotFn,      // () => Snapshots
    applyFn,         // () => void — apply optimistic data
    mutationFn,      // () => Promise<T> — actual API call
    onSuccess,       // (result: T) => void — sync real data
    onError,         // (snapshots: Snapshots) => void — restore
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

This pattern is repeated identically in calendar, assignments, grades, documents, and members.

### 7.4 Anti-Patterns

- Separate optimistic systems for the same entity in different layers.
- Hidden local overrides that drift from feature cache.
- Optimistic writes without rollback.
- Optimistic deletes that leave stale detail views alive.

---

## 8. Payload Design Rules

### 8.1 Summary Payload

**What it is:** The minimum data needed to render an entity in a list, table, card, calendar block, or grid view.

**What goes in it:**
- `id`, time range, title, status
- Minimal teacher label (name only)
- Minimal student preview (first 4, avatar + name only)
- Subject/session type label and color
- Recurrence markers if the view needs them

**What does NOT go in it:**
- Full notes, full artifact payloads, large nested objects
- Full related collections (all students, all subjects with detail)
- Audit metadata (created_at, updated_at) unless rendered
- Fields only needed in edit/detail views

**Calendar ref:** `SESSION_LIST_SELECT` in `services/calendar_service.py`, `_batch_hydrate_session_summaries()` caps students to 4 preview.

### 8.2 Detail Payload

**What it is:** The full data needed to render an edit dialog, side panel, detail sheet, or drilldown view.

**What goes in it:**
- All editable fields
- Full relations required by the editor
- Audit metadata when useful (created_at, updated_at)
- Operational fields the detail UI actually displays

**What does NOT go in it:**
- Unrelated joins
- Analytics data (fetch separately)
- Bulky history (fetch separately)

**Calendar ref:** `SESSION_DETAIL_SELECT` in `services/calendar_service.py`, `_batch_hydrate_sessions()` returns full student profiles.

### 8.3 Backend SELECT Constant Convention

Every backend service must define explicit SELECT constants:

```python
FEATURE_LIST_SELECT = "id,title,status,created_at"
FEATURE_DETAIL_SELECT = "id,title,status,content,notes,created_at,updated_at"
```

**Rule:** No endpoint should use a vague "get everything" approach. Every column in the SELECT is intentional.

### 8.4 The Cardinal Rule

If a list needs full detail to render, the payload or the UI is wrong. Fix the UI or trim the payload.

---

## 9. API Design Rules

### 9.1 Next API Routes

**Purpose:** Attach auth, normalize transport, isolate browser from backend service URLs.

**Rules:**
- Route handler stays thin — extract token, forward request, return response.
- `cache: "no-store"` for all authenticated mutable feature traffic.
- Forward transparently — do not reshape payloads.
- Return the backend's status code, not a generic 200.

**MUST NOT:** Duplicate business logic, add hidden data joins, reshape payloads arbitrarily.

**Reference:** `app/api/calendar/sessions/route.ts`

### 9.2 Backend Routers

**Purpose:** Validate access, parse params, declare response shape, delegate to service.

**Rules:**
- Use FastAPI dependency injection for auth (`require_teacher`, `get_current_user`).
- Use Pydantic schemas for request body validation.
- Declare `response_model` for type safety on responses.
- Delegate immediately to service functions — the router body should be 5-10 lines.

**MUST NOT:** Contain DB logic, build business rules, duplicate service logic, import Supabase client directly.

**Reference:** `routers/calendar.py` — every endpoint is: validate → extract org_id/role → delegate.

### 9.3 Backend Services

**Purpose:** Source of truth for feature business behavior, scoped queries, mutation scope, hydration logic.

See [Section 10 — Backend Service Contract](#10-backend-service-contract) for the full contract including SELECT constants, batch hydration patterns, role-aware filtering, and validation helpers.

**Reference:** `services/calendar_service.py`

---

## 10. Backend Service Contract

The required pattern for every backend service that serves both list and detail views.

### 10.1 SELECT Constants

```python
# Columns for list/card/table rendering — lightweight
FEATURE_LIST_SELECT = "id,organization_id,title,status,teacher_id,created_at"

# Columns for detail/editor/sheet rendering — full
FEATURE_DETAIL_SELECT = (
    "id,organization_id,title,status,content,notes,"
    "teacher_id,student_ids,subject_ids,"
    "created_at,updated_at"
)
```

**Calendar ref:** `SESSION_LIST_SELECT` and `SESSION_DETAIL_SELECT` in `services/calendar_service.py`.

### 10.2 Batch Hydration

```python
def _batch_hydrate_{feature}_summaries(db: Client, items: list[dict]) -> list[dict]:
    """Collect all foreign IDs, batch-fetch once per type, merge.
    Students capped to preview subset (e.g., first 4).
    Convention: _batch_hydrate_{feature}_summaries() for list views."""
    if not items:
        return items

    # 1. Collect unique IDs across all items
    teacher_ids = list({i["teacher_id"] for i in items if i.get("teacher_id")})
    # ... other foreign ID collections

    # 2. Batch fetch each type (one query per type, not per item)
    teacher_map = {}
    if teacher_ids:
        resp = db.table("profiles").select("id,full_name,display_name").in_("id", teacher_ids).execute()
        teacher_map = {row["id"]: row for row in (resp.data or [])}

    # 3. Merge into items
    for item in items:
        item["teacher_name"] = teacher_map.get(item.get("teacher_id", ""))
    return items

def _batch_hydrate_{feature}s(db: Client, items: list[dict]) -> list[dict]:
    """Full hydration for detail views. No caps on related data.
    Convention: _batch_hydrate_{feature}s() or _batch_hydrate_{feature}_details() for detail views."""
    # Same pattern, no preview limits
```

**Critical rule:** No N+1 queries. Collect all foreign IDs first, batch-fetch once per type, merge. The number of DB queries is O(number of entity types), not O(number of items).

**Calendar ref:** `_batch_hydrate_session_summaries()` (students capped to 4) vs `_batch_hydrate_sessions()` (full) in `services/calendar_service.py`.

### 10.3 Role-Aware Filtering

```python
def list_features(db, org_id, *, role, user_id, **filters):
    query = db.table("features").select(FEATURE_LIST_SELECT).eq("organization_id", org_id)

    if role == "student":
        query = query.contains("student_ids", [user_id])
    elif role == "teacher":
        query = query.eq("teacher_id", user_id)
    elif role == "admin":
        pass  # admin sees all, optionally filtered by teacher_id

    # Apply date/status filters...
    return _batch_hydrate_{feature}_summaries(db, query.execute().data or [])
```

**Calendar ref:** `list_sessions()` in `services/calendar_service.py`.

### 10.4 Validation Helpers

- `_validate_student_ids()` — verify student IDs exist in the org before mutation.
- `_validate_teacher_id()` — verify teacher ID is active teacher/admin in the org.
- Use `HTTPException` with 422 for validation failures, 403 for auth failures, 500 for internal errors.

---

## 11. Database Rules

### 11.1 Query Discipline

Every feature must know its primary read patterns. For calendar those are:

| Access Pattern | Index |
|---------------|-------|
| Organization + date range | Composite on `(organization_id, starts_at)` |
| Organization + teacher + date range | Composite on `(organization_id, teacher_id, starts_at)` |
| Organization + recurrence group | On `(organization_id, recurrence_group_id)` |
| Student membership lookup | GIN on `student_ids` |
| Single entity by ID | Primary key |

Indexes must be created for actual UI access patterns, not theoretical ones.

### 11.2 Index Strategy

- **Composite indexes** for multi-column filter patterns (org+date, org+teacher+date).
- **GIN indexes** for array containment queries (`student_ids`, `class_ids`, `subject_ids`).
- **Partial indexes** where useful (e.g., only active records).
- Every index must have a documented reason tied to a UI access pattern.

### 11.3 Write Rules

- Prefer **transactional writes** for multi-table operations.
- Use **RPC/functions** when a single atomic operation spans multiple tables.
- Acceptable temporary: **compensating rollback** with explicit error handling (calendar uses this for `calendar_sessions` + `student_sessions`).
- NOT acceptable: silent partial success, hidden inconsistency risk.

**Calendar ref:** `create_session()` in `services/calendar_service.py` — creates session, then student_sessions, with compensating rollback on failure.

### 11.4 Set-Based Operations

Prefer set-based DB operations over row-by-row loops:
- Bulk inserts (calendar batch creation inserts all session rows at once)
- Scoped updates (recurring session updates use `.eq("recurrence_group_id", group_id)`)
- Scoped deletes (batch delete uses `.in_("id", session_ids)`)

If a user action can affect many records, the service should be reviewed for row-by-row fan-out.

---

## 12. Performance Rules

### 12.1 First Screen Budget

Every feature must explicitly define three data categories:

| Category | When Fetched | Example (Calendar) |
|----------|-------------|-------------------|
| **Critical first-screen data** | Server-side, before render | Current week's sessions |
| **Deferred background data** | After paint, idle callbacks | Adjacent weeks, alternate teacher view |
| **On-demand detail data** | On user interaction | Session detail on click |

If these three categories are not explicitly defined, the feature is not done.

### 12.2 Rendering Rules

**Avoid:**
- Rendering full-detail objects in grid/list/calendar views
- Duplicate derived state where render derivation is enough
- Unnecessary observers on heavy subtrees
- Expensive remapping of large collections during every small interaction

**Prefer:**
- Memoized grouping/layout work when data changes
- `dynamic(() => import(...), { ssr: false })` for heavy editors and managers
- Route-specific loading skeletons (every route must have a `loading.tsx`)
- Stable key and range logic to prevent unnecessary re-renders

### 12.3 Background Work Rules

**Allowed after paint:**
- Adjacent range prefetch (next/previous week)
- Alternate filter prefetch (admin: prefetch own-sessions view)
- Deeper history
- Non-critical reference data (subject catalog, session types via idle callbacks)

**NOT allowed during first paint:**
- All adjacent ranges
- Entire month if only week is visible
- Alternate role views
- Broad reference fetches unrelated to the visible frame

### 12.4 Route Prefetch Rules

Route prefetch is allowed when: user is likely to navigate, payload is small, prefetched data matches next screen exactly.

**Decision tree:**

```
Route navigation →
  1. router.prefetch(href) — always (JS bundle, cheap)
  2. Does the route server-render initial data?
     YES → skip data prefetch (server already loads it)
     NO → prefetch minimal first-screen data only
  3. Never prefetch secondary/deferred data during route prefetch
```

**MUST NOT:**
- Duplicate route-critical server fetch without clear measured benefit
- Trigger heavy adjacent/background data loads
- Fetch unrelated feature data during simple navigation
- Create large competing request bursts (debounce sidebar prefetch at 200-300ms)

### 12.5 Deferred Query Enablement

> **Note:** `useDeferredQueryEnabled()` is a cross-cutting utility used by other features (grades, assignments, docs) — it is NOT part of the calendar reference implementation. It is still a standard tool available for use in any feature that needs it.

Use `useDeferredQueryEnabled()` for secondary data that should load after first paint:
- Secondary analytics data
- Profile-page grade board
- Admin all-classes view
- Non-active period data in grades

Do NOT use for primary first-screen data — that should use server-side initial data instead.

### 12.6 Session Storage Query Seed

> **Note:** `useSessionStorageQuerySeed()` is a cross-cutting utility used by other features (grades entry, assignments entry) — it is NOT part of the calendar reference implementation. It is still a standard tool available for use in any feature that needs it.

Use `useSessionStorageQuerySeed()` to persist query data across client-side navigation when the data is expensive to re-derive. Currently used by grades entry and assignments entry.

---

## 13. Error Handling Rules

Every feature must define:

| Scenario | Required Behavior |
|----------|-------------------|
| **Fetch failure** | Show clear, actionable error to user. Do not render stale data without indication. |
| **Optimistic mutation failure** | Restore snapshot, invalidate affected queries, show error toast. |
| **Partial backend failure** | Surface in service-level errors. Compensating rollback where possible. |
| **User-visible feedback** | Every failure the user can trigger must produce a visible, understandable message. |

**Rules:**
- Cache must recover after failure — never leave the cache in an inconsistent optimistic state.
- Detail and list views must not silently diverge after a failed mutation.
- Partial write risk must be surfaced in service-level errors (e.g., "Session updated but student associations may be inconsistent").
- Backend uses `HTTPException` with appropriate status codes: 401 (unauthorized), 403 (forbidden), 404 (not found), 422 (validation), 500 (internal).

---

## 14. Testing Standards

### 14.1 Playwright E2E Tests

Route compliance tests verify that every major route meets performance and behavior expectations.

**Reference:** `e2e/route-compliance.spec.ts`

**What route traces verify:**

| Dimension | What to Check |
|-----------|---------------|
| **Timing** | Shell visible (ms), first data visible (ms), network idle (ms) |
| **Network** | Total API requests, requests before shell, requests after shell |
| **Cache** | Expected cache keys present with data after load |
| **Payloads** | Size of each API response (KB) |
| **Cross-navigation** | Cache survives client-side navigation, no duplicate fetches |

**Test infrastructure:**
- `e2e/helpers/trace.ts` — `startNetworkTrace()`, `dumpQueryCache()`, `filterRequests()`, `formatReport()`
- Cache inspection uses `window.__LUSIA_QUERY_CLIENT__.dumpCache()` (dev mode only)

### 14.2 Verification Checklist After Changes

After modifying any feature, verify:

1. **Route loads** — Navigate to the route. Shell renders before data arrives.
2. **First paint data** — Only critical data fetched. Check network tab for unnecessary requests.
3. **Cache state** — After load, expected cache keys exist with data (use `dumpQueryCache()` or browser console).
4. **Mutation roundtrip** — Create/update/delete an entity. List and detail caches stay coherent.
5. **Optimistic rollback** — Simulate network failure. Cache restores to pre-mutation state.
6. **Cross-navigation** — Navigate away and back. Cache is warm, no redundant fetches.
7. **Payload sizes** — List endpoint returns summary data, not full detail.

---

## 15. Code Style Conventions

Derived from the reference implementation files. Only documents what is consistent and important.

### File Naming

- Frontend components: `PascalCase.tsx` (e.g., `CalendarShell.tsx`)
- Frontend libs/queries: `kebab-case.ts` (e.g., `query-client.ts`, `calendar.server.ts`)
- Backend routers/services/schemas: `snake_case.py` (e.g., `calendar_service.py`)
- Query modules: `lib/queries/{feature}.ts` — one file per feature

### Import Ordering

Observed in reference files:
1. React imports
2. External library imports (date-fns, sonner, etc.)
3. Internal component imports (`@/components/...`)
4. Internal lib imports (`@/lib/...`)
5. Types (often co-located or imported with `type` keyword)

### TypeScript Patterns

- `"use client"` directive at top of client components and query modules
- Interface over type for object shapes (consistent in query-client.ts, calendar.ts)
- `export function` for named exports (not `export const fn = () =>`)
- Explicit return types on public API functions
- `Promise<T>` return types on async functions

### Component Structure

- Props interface defined above the component
- Hooks at the top of the component body
- Callbacks defined with `useCallback`
- Effects defined with `useEffect`
- Return JSX at the bottom

### Backend Patterns

- Pydantic `BaseModel` for all request/response schemas
- `Optional[type] = None` for optional fields with defaults
- `Field(...)` for required fields with validation
- Service functions are module-level (not class methods)
- Private helpers prefixed with `_` (e.g., `_batch_hydrate_sessions`)

---

## 16. Anti-Patterns

The following are NOT allowed in new features and must be removed during refactors:

1. **Fetching related/historical data on initial mount** without user-visible need.
2. **Using one payload shape for both list and detail.** Summary and detail must be different.
3. **Doing business logic inside Next route handlers.** API routes are thin proxies.
4. **Letting detail and list cache drift after mutation.** Sync both or invalidate both.
5. **Having multiple optimistic systems for the same entity** in different layers.
6. **Using broad unbounded list requests** without explicit reason (no limit, no date range).
7. **Adding feature state to a global store** when local state is enough.
8. **Depending on developer memory for cache invalidation rules.** The cache contract must be explicit in the query module.
9. **Row-by-row mutation loops** for large scoped operations when a set-based option exists.
10. **Treating dev-mode route compilation time** as production performance truth.
11. **Using React Query / TanStack Query APIs.** This codebase uses a custom query client. Do not import from `@tanstack/react-query`.
12. **Scattered string literal cache keys.** All keys must be built by exported builder functions.
13. **Fetching detail data in list endpoints.** List endpoints use summary hydration with preview caps.
14. **N+1 query patterns in services.** Collect IDs, batch-fetch, merge. Never query per-item.
15. **Prefetching during first paint.** Background prefetch fires only after the route has rendered.
16. **Skipping snapshot before optimistic mutations.** Every optimistic write must have a rollback path.
17. **Storing messages or mutable data in `useState` instead of the query cache** when the data needs to persist across navigation.
18. **Monolithic endpoints** that return all data for all views in one blocking request.

---

## 17. Feature Build Checklist

Every new feature must answer all of these questions before it is considered done.

### UI / UX

- [ ] What is the first useful frame the user sees?
- [ ] What exact skeleton/loading state is shown before data is ready?
- [ ] What data can be deferred until after first paint?

### Frontend Data

- [ ] What is the feature query namespace/prefix?
- [ ] What are the list query keys?
- [ ] What are the detail query keys?
- [ ] What is cached globally vs feature-local vs local-only?
- [ ] What is the initial route payload (server-fetched)?
- [ ] Does the query module export the full contract? (keys, hooks, prefetch, snapshot, sync, invalidation)

### Optimistic Behavior

- [ ] Which mutations are optimistic?
- [ ] What cache is updated on each mutation?
- [ ] How is rollback handled? (snapshot → restore)
- [ ] Are detail and list caches both coherent after mutations?

### API

- [ ] What endpoints provide summary payload?
- [ ] What endpoints provide detail payload?
- [ ] Is the Next API route thin? (auth proxy, no business logic)
- [ ] Are authenticated mutable routes using `cache: "no-store"`?

### Backend

- [ ] What service owns the domain behavior?
- [ ] Are `FEATURE_LIST_SELECT` and `FEATURE_DETAIL_SELECT` defined?
- [ ] Are `_batch_hydrate_{feature}_summaries()` and `_batch_hydrate_{feature}s()` (or `_batch_hydrate_{feature}_details()`) implemented?
- [ ] What are the real read patterns? Are indexes aligned?
- [ ] Are related writes atomic or safely compensated with rollback?
- [ ] Is role-aware filtering applied? (admin/teacher/student)

### Performance

- [ ] Are non-critical fetches deferred until after first paint?
- [ ] Is the first route load bounded (server-fetched critical data only)?
- [ ] Is route prefetch minimal and intentional?
- [ ] Are heavy dialogs/editors lazy-loaded with `dynamic()`?
- [ ] Does the route have a specific `loading.tsx` skeleton?

### Final Rule

A feature is production-ready only when:
- The user gets a fast first frame
- The data flow is obvious
- The cache rules are explicit
- The payloads are intentionally shaped
- The backend reflects the UI access pattern
- Another engineer or agent can extend the feature without guessing

If any of those is missing, the feature is not finished.
