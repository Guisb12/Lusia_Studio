# UI + EX Bible

## Purpose

This document defines the canonical engineering pattern for building and refactoring features in this codebase.

`UI` means the quality of what the user sees and feels.

`EX` means execution quality:
- frontend architecture
- data flow
- cache behavior
- optimistic behavior
- payload design
- API design
- backend service boundaries
- DB query discipline
- performance discipline

This document exists so we stop re-deciding these rules feature by feature.

The calendar feature is the current reference implementation for these rules.

## Core Goals

Every feature must optimize for all of the following at the same time:

1. Fast first paint.
2. Predictable data flow.
3. Strict ownership of state.
4. Minimal network and DB work for the visible screen.
5. Safe optimistic behavior.
6. Stable cache rules.
7. Backend correctness before cleverness.
8. Easy refactoring and easy extension by new team members.

If a solution is clever but makes ownership unclear, it is the wrong solution.

If a solution works but creates hidden fetches, hidden writes, or hidden cache coupling, it is not production-grade enough.

## Non-Negotiable Principles

### 1. First Paint Is Sacred

The app must load only what is required to render the first useful screen.

For any route:
- render the route shell immediately
- fetch only critical data for the visible frame
- defer adjacent, related, historical, and analytical data until after paint

Never allow background prefetch to compete with first paint.

### 2. One Layer, One Responsibility

Each layer must have a narrow job.

Frontend route/page:
- determines the initial critical data for the route
- fetches only the minimum first-screen data
- passes initial data into the feature shell

Feature shell:
- owns feature query orchestration
- owns mutation orchestration
- owns cache update/invalidation behavior
- owns background prefetch rules

Presentational/interaction component:
- owns rendering
- owns local UI state
- owns interaction state like dialog, drag, hover, selection
- does not decide backend fetch policy

Next API route:
- proxies auth and transport concerns
- does not implement business logic

Backend router:
- validates request shape and auth access
- delegates to services

Backend service:
- owns domain logic
- owns DB reads/writes
- defines summary/detail payload behavior

Database:
- stores truth
- is optimized to serve known access patterns

### 3. Shared Data Is Not the Same as Global State

We do not want one giant global store for everything.

We use 3 categories of state.

Global shared app data:
- user
- organization
- teacher list
- subject catalog
- session types
- small reusable reference datasets

Feature-shared cached data:
- feature list queries
- feature detail queries
- feature mutation results
- feature range caches

Local UI state:
- dialog open state
- current tab
- drag state
- resize state
- hover state
- form dirtiness
- local view mode

Rule:
- if state is needed across routes or features, cache it
- if state is needed across one feature, keep it in that feature query namespace
- if state only affects one render tree, keep it local

### 4. One Feature Must Have One Cache Contract

Every feature must define:
- list query keys
- detail query keys
- mutation sync rules
- invalidation rules
- optimistic rules

No feature should rely on developer memory to remember which queries should also be updated.

If the cache contract is incomplete, the feature is incomplete.

### 5. Optimistic UX Must Be Deterministic

Optimistic updates are allowed only when:
- the expected result shape is known
- rollback is possible
- the visible UI can recover safely

A feature should have one optimistic strategy, not multiple competing strategies.

Optimistic updates must:
- update the visible data source
- update or invalidate corresponding detail caches
- rollback cleanly on failure
- never leave stale phantom records behind

### 6. Summary and Detail Payloads Must Be Different

List and calendar views must never pay the cost of full detail payloads.

Every complex feature should explicitly define:
- summary payload
- detail payload

Summary payload is for:
- list pages
- calendar blocks
- cards
- tables
- initial route view

Detail payload is for:
- dialogs
- side panels
- editors
- drilldown views

If a list needs full detail to render, the payload is too heavy or the UI is badly designed.

### 7. The Backend Must Match the Frontend Access Pattern

Indexes, payloads, and query structure must match how the UI actually reads data.

We do not optimize DB access abstractly.

We optimize for:
- visible route range queries
- detail fetches
- mutation scope operations
- filters actually used in the product

### 8. Patterns Must Be Easy to Repeat

A good pattern is one that another engineer can copy safely.

If a feature requires remembering hidden caveats, it is not yet a reference pattern.

## Canonical Frontend Pattern

### Route/Page Responsibilities

Every route should:
- fetch only critical first-screen data
- use server-side fetch for the first visible payload when possible
- pass initial data into the feature shell
- avoid route-level fan-out beyond what the user immediately needs

Route example:
- `/dashboard/calendar` fetches the current visible week
- it does not fetch adjacent weeks, month range, history, or alternate role views during first paint

### Feature Shell Responsibilities

The feature shell is the canonical feature coordinator.

It must own:
- active query params
- query hook calls
- mutation requests
- optimistic behavior
- query synchronization
- background prefetch timing

It must not own:
- low-level visual rendering details
- drag geometry
- hover state
- dense UI interactions that are specific to one widget

### UI Component Responsibilities

The UI component may own:
- view mode
- selected date
- drag state
- resize state
- popover state
- local loading placeholders
- pure rendering transforms

The UI component must not own:
- route fetch policy
- app-level prefetch policy
- backend mutation orchestration
- global cache invalidation

## Cache Rules

### Canonical Cache Foundation

The app uses a shared client query cache.

That cache is app-wide in the browser session.

Features should use:
- one namespace per feature
- stable key generation helpers
- explicit detail key builders

Every feature query module must expose:
- `build...ListKey`
- `build...DetailKey`
- `use...Query`
- `prefetch...Query`
- mutation sync helpers
- invalidation helpers

### Cache Design Rules

1. Query keys must be deterministic.
2. Detail keys must be explicit functions, not string literals scattered across files.
3. Mutation helpers must synchronize both list and detail caches when relevant.
4. Deleting an entity must remove or invalidate its detail cache.
5. Background prefetch data must never block first paint.
6. Cache entries must map to actual feature read patterns, not theoretical entity graphs.

### What Belongs in Shared Cache

Good candidates:
- session ranges
- session detail
- teacher list
- members list
- subject catalog
- organization settings
- session types

Bad candidates:
- open modal booleans
- drag pointers
- current hover target
- input keystrokes

### Cache Behavior Rules

For route switching:
- prefer server-provided initial data for first paint
- do not duplicate that same payload in aggressive hover prefetch unless there is a measured benefit

For background loading:
- prefetch only after paint
- use idle time or delayed background fetch
- keep background fetches bounded

For detail fetches:
- fetch on demand
- hydrate into detail cache
- optionally sync the visible list cache if the entity is already visible

## Memory Management Rules

### Browser Memory

We do not keep unbounded copies of the same feature state in multiple places.

Rules:
- one visible source of truth for feature data
- local overlays only when truly needed
- remove duplicate optimistic layers unless there is a strong reason
- do not clone large arrays unnecessarily in render paths

### Cache Memory

Feature caches must stay bounded by real usage.

Rules:
- no prefetch explosion
- no warming unrelated ranges on initial mount
- no permanent caching of broad ranges unless the route truly needs them
- broad list queries must have a reason

### UI Memory

Heavy interactive components should lazy-load expensive dialogs, managers, and editors.

The visible page shell should stay cheap.

## Optimistic Update Rules

### Allowed Optimistic Operations

Optimistic behavior is good for:
- create
- update
- reorder
- move
- resize
- delete

but only when the rollback path is defined.

### Required Optimistic Contract

For each optimistic mutation:

1. Snapshot affected cache state.
2. Apply optimistic result to the canonical feature cache.
3. Keep detail and list caches coherent.
4. On success, replace optimistic data with canonical server data.
5. On failure, restore snapshot and invalidate if needed.

### What We Avoid

We avoid:
- separate optimistic systems for the same entity in different layers
- hidden local overrides that drift from feature cache
- optimistic writes without rollback
- optimistic deletes that leave stale detail views alive

## Payload Rules

### Summary Payload Rules

Summary payloads must include only what the screen needs to render.

Examples:
- id
- time range
- title
- minimal teacher label
- minimal student preview
- minimal subject/session type label and color
- recurrence markers if the view needs them

Summary payloads must not include:
- full notes
- full artifact payloads
- large nested objects
- full related collections unless the visible frame needs them

### Detail Payload Rules

Detail payloads are allowed to be richer, but still must be intentional.

They should include:
- editable fields
- relations required by the editor
- audit metadata only when useful
- operational fields the detail UI actually displays

They should not include:
- unrelated joins
- analytics
- bulky history that should be fetched separately

### Payload Discipline Rule

The backend must define select sets intentionally.

No endpoint should use a vague "get everything" approach.

## Route Prefetch Rules

### Route Prefetch Is Allowed

Route prefetch is useful when:
- the user is likely to navigate
- the payload is small enough
- the prefetched data matches the next screen exactly

### Route Prefetch Is Not Allowed To

Route prefetch must not:
- duplicate the route's first-screen server fetch without clear benefit
- trigger heavy adjacent/background data loads
- fetch unrelated feature data during simple navigation
- create large competing request bursts

### Canonical Rule

On hover/focus/touch:
- prefetch the route shell
- prefetch only the exact minimal first-screen data if needed
- do not fetch "nice to have" secondary data yet

## API Design Rules

### Next API Routes

Next API routes exist to:
- attach auth
- normalize transport
- isolate browser from backend service URLs

They do not exist to:
- duplicate business logic
- add hidden data joins
- reshape payloads arbitrarily

Rules:
- route handler should stay thin
- `no-store` is correct for authenticated mutable feature traffic
- the route should forward the request clearly and transparently

### Backend Router Rules

Routers should:
- validate access
- parse params
- declare response shape
- delegate immediately to services

Routers should not:
- contain DB logic
- build business rules
- duplicate service logic

### Backend Service Rules

Services are the source of truth for:
- feature business behavior
- scoped query rules
- mutation scope rules
- summary/detail hydration logic

Services should:
- define list payloads
- define detail payloads
- apply role-aware filtering
- keep DB access bounded and explicit

## Database Rules

### Query Discipline

Every feature must know its primary read patterns.

For calendar those are:
- organization + date range
- organization + teacher + date range
- organization + recurrence group
- organization + id
- student membership lookups

Indexes must be created for those actual patterns.

### DB Write Rules

Writes that affect related tables must be treated carefully.

Preferred:
- transactional writes
- RPC/function when a single atomic operation spans multiple tables

Acceptable temporary pattern:
- compensating rollback with explicit error handling

Not acceptable as the long-term standard:
- silent partial success
- hidden inconsistency risk

### Set-Based Operations

Where possible, prefer set-based DB operations over row-by-row loops.

Examples:
- bulk inserts
- scoped updates
- scoped deletes

If a user action can affect many records, the service should be reviewed for row-by-row fan-out.

## Performance Rules

### First Screen Budget

Every feature must define:
- critical first-screen data
- deferred background data
- on-demand detail data

If those three categories are not explicitly defined, the feature is not done.

### Rendering Rules

Avoid:
- rendering full-detail objects in grid/list/calendar views
- duplicate derived state where render derivation is enough
- unnecessary observers on heavy subtrees
- expensive remapping of large collections during every small interaction

Prefer:
- memoized grouping/layout work when data changes
- dynamic import for heavy editors and managers
- route-specific loading skeletons
- stable key and range logic

### Background Work Rules

Allowed after paint:
- adjacent range prefetch
- alternate filter prefetch
- deeper history
- non-critical reference data

Not allowed during first paint:
- all adjacent ranges
- entire month if only week is visible
- alternate role view
- broad reference fetches unrelated to the visible frame

## Error Handling Rules

Every feature must define:
- what happens on fetch failure
- what happens on optimistic mutation failure
- what happens on partial backend failure
- what the user sees

Rules:
- visible failures should be clear and actionable
- cache should recover after failure
- detail and list views should not silently diverge
- partial write risk must be surfaced in service-level errors

## Calendar As The Reference Pattern

The calendar feature should now be understood as the reference implementation of these ideas:

### Good Patterns Present In Calendar

- thin route bootstrap
- server-first initial current-range fetch
- feature shell orchestration
- summary vs detail payload split
- feature query namespace
- optimistic mutations with rollback
- background prefetch deferred until after paint
- list/detail cache coherence
- backend service layer separation
- indexes aligned to read patterns

### Calendar Rules We Intend To Standardize Across The App

1. Route loads only first-screen critical data.
2. Feature shell owns cache and mutation coordination.
3. UI components keep ephemeral state local.
4. Summary and detail payloads are intentionally different.
5. Feature query modules define the full cache contract.
6. Hover prefetch must never duplicate route-critical data without measured benefit.
7. Background prefetch is deferred.
8. Deletes clear both list and detail cache.
9. Related DB access patterns must have explicit indexes.

## What Still Requires Care Even In The Reference Pattern

The calendar is the foundation, but not the excuse to stop thinking.

The remaining standards we should continue improving across the app are:
- stronger transactional guarantees for multi-table writes
- more set-based recurring mutations
- tighter app-wide prefetch policy
- more formal performance budgets by route

These are next-stage hardening areas, not reasons to reject the pattern.

## Anti-Patterns

The following are not allowed in new features and should be removed during refactors:

1. Fetching related/historical data on initial mount without user-visible need.
2. Using one payload shape for both list and detail.
3. Doing business logic inside Next route handlers.
4. Letting detail and list cache drift after mutation.
5. Having multiple optimistic systems for the same entity.
6. Using broad unbounded list requests without explicit reason.
7. Adding feature state to a global store when local state is enough.
8. Depending on developer memory for cache invalidation rules.
9. Row-by-row mutation loops for large scoped operations when a set-based option exists.
10. Treating dev-mode route compilation time as production performance truth.

## Feature Build Checklist

Every new feature must answer all of these questions before it is considered done.

### UI / UX

- What is the first useful frame?
- What exact skeleton is shown before data is ready?
- What can be deferred until after paint?

### Frontend Data

- What is the feature namespace?
- What are the list query keys?
- What are the detail query keys?
- What is cached globally vs feature-local vs local-only?
- What is the initial route payload?

### Optimistic Behavior

- Which mutations are optimistic?
- What cache is updated?
- How is rollback handled?
- Are detail and list caches both coherent?

### API

- What endpoints provide summary payload?
- What endpoints provide detail payload?
- Is the Next API route thin?

### Backend

- What service owns the domain behavior?
- What are the real read patterns?
- Are indexes aligned?
- Are related writes atomic or safely compensated?

### Performance

- Are non-critical fetches deferred?
- Is the first route load bounded?
- Is route prefetch minimal and intentional?

## Final Rule

A feature is production-ready only when:
- the user gets a fast first frame
- the data flow is obvious
- the cache rules are explicit
- the payloads are intentionally shaped
- the backend reflects the UI access pattern
- another engineer can extend the feature without guessing

If any of those is missing, the feature is not finished.
