---
last-updated: 2026-03-19
stability: frequently-updated
agent-routing: "Read before working on analytics feature code"
---

# Analytics

## 1. Overview

Analytics is a **read-only financial dashboard** for LUSIA Studio. It aggregates session data — using price snapshots stored on each session — into revenue, cost, and profit metrics. Three role-specific dashboard views exist: admin (full organization financials), teacher (own earnings and student billing), and student (personal spending breakdown). Data is aggregated server-side per request; there is no pre-computed analytics table. Visualization uses Recharts area charts for 12-month time series and card/list layouts for per-entity breakdowns. The UI is month-navigable with deferred prefetch of adjacent months.

## 2. Availability

| Attribute | Value |
|---|---|
| **Roles** | Admin (full org-wide financial dashboard), Teacher (own earnings — via teacher dashboard endpoint, currently consumed in student detail views), Student (own spending — via student dashboard endpoint, currently consumed in student detail views) |
| **Center types** | All (trial included) |
| **Admin route** | `/dashboard/analytics` |
| **Teacher/Student routes** | No dedicated routes — teacher and student dashboards are consumed via the student analytics query hook (`useStudentAnalyticsQuery`) embedded in other views (e.g., student profile/detail panels) |

**Role-based access control** (enforced in `routers/analytics.py`):
- **Admin:** `require_admin` — full org dashboard; can filter by teacher and session type
- **Teacher:** `require_teacher` — can only view own teacher dashboard (403 if `teacher_id != user.id`)
- **Student:** `get_current_user` — can only view own student dashboard (403 if `student_id != user.id`); teachers/admins can view any student's dashboard

## 3. Architecture

### 3.1 Route — `app/(teacher)/dashboard/analytics/page.tsx`

Server component. Calls `fetchAdminDashboardServer({ granularity: "monthly" })` to get the current month's admin dashboard data, then passes it as `initialData` to `AdminAnalyticsDashboard`.

**Key behavior:** Only the admin dashboard for the current month (default params) is fetched server-side. The 12-month chart range query and adjacent months are deferred to client-side.

**Loading skeleton:** `app/(teacher)/dashboard/analytics/loading.tsx` — renders animated placeholder cards and chart area.

### 3.2 Server Fetch — `lib/analytics.server.ts`

Calls `fetchBackendJsonServer()` directly against the FastAPI backend with analytics params. Returns `AdminDashboardData | null` with a `null` fallback. Skips the Next.js API route proxy — one fewer network hop for SSR.

### 3.3 Feature Shell — `components/analytics/AdminAnalyticsDashboard.tsx`

Client component (`"use client"`). This is both the shell and the primary UI component (no separate shell/UI split — the feature is read-only with a single monolithic component).

**State managed:**
- `monthOffset` — integer offset from the current month (0 = current, -1 = previous, etc.)

**Query orchestration:**
- **Month query:** `useAdminAnalyticsQuery(monthQueryParams, initialData, enabled)` — fetches the selected month's admin dashboard data. Passes `initialData` from server props only when `monthOffset === 0`.
- **Chart query:** `useAdminAnalyticsQuery(chartQueryParams)` — fetches a 12-month span ending at the selected month for the area chart. No initial data (always client-fetched).

**Prefetch behavior (deferred, after paint):**
- Uses `requestIdleCallback` (with `setTimeout` fallback) to prefetch adjacent months after paint
- Skips prefetch on first mount (`hasBootstrappedPrefetch` ref guard) to avoid competing with first paint
- Prefetches previous month always; next month only if `monthOffset < 0` (don't prefetch future months)

**Children rendered:** All rendering is inline — `FinCard`, `TeacherPayRow`, `StudentBillRow`, `SessionTypeRow`, `MonthNavigator`, `ChartTooltip`, and Recharts `AreaChart` are all defined and rendered within this file.

**Visualization components (all in `AdminAnalyticsDashboard.tsx`):**
- `FinCard` — stat card with icon, value, label, and optional subtitle
- `MonthNavigator` — prev/next month arrows with formatted month label
- `AreaChart` (Recharts) — 12-month revenue vs cost area chart with gradient fills and custom tooltip
- `TeacherPayRow` — teacher payment row with avatar, name, cost, sessions, hours, revenue generated
- `StudentBillRow` — student billing row with avatar, name, billed amount, sessions, hours
- `SessionTypeRow` — session type row with color dot, name, session count, revenue, cost

### 3.4 Next.js API Routes

Three route files, all thin auth proxies:

**`app/api/analytics/admin/route.ts`** — admin dashboard:
- `GET` — forwards `date_from`, `date_to`, `teacher_id`, `session_type_id`, `granularity` params to `GET /api/v1/analytics/admin`

**`app/api/analytics/teacher/[id]/route.ts`** — teacher dashboard:
- `GET` — forwards `date_from`, `date_to`, `granularity` params to `GET /api/v1/analytics/teacher/{id}`

**`app/api/analytics/student/[id]/route.ts`** — student dashboard:
- `GET` — forwards `date_from`, `date_to`, `granularity` params to `GET /api/v1/analytics/student/{id}`

All routes: extract access token via `getAccessToken()`, attach `Authorization: Bearer` header, use `cache: "no-store"`, return backend response status and payload transparently.

### 3.5 Backend Router — `routers/analytics.py`

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| `GET` | `/admin` | `require_admin` | `get_admin_dashboard()` |
| `GET` | `/teacher/{teacher_id}` | `require_teacher` | `get_teacher_dashboard()` — teachers can only view own (403 otherwise) |
| `GET` | `/student/{student_id}` | `get_current_user` | `get_student_dashboard()` — students can only view own; teachers/admins can view any |

**Query params (all endpoints):** `date_from`, `date_to`, `granularity` (default `"monthly"`, also supports `"weekly"`)
**Admin-only params:** `teacher_id`, `session_type_id` (additional filters)

### 3.6 Backend Service — `services/analytics_service.py`

Analytics is an **aggregation service** — it reads raw session rows and computes dashboard-level metrics in-memory. There is no entity list/detail pattern, so the standard summary/detail SELECT split does not apply.

**SELECT constant:**

```
ANALYTICS_SESSION_SELECT:
  id, teacher_id, student_ids, session_type_id,
  snapshot_student_price, snapshot_teacher_cost,
  starts_at, ends_at
```

This is the minimal set of columns needed for financial calculations — no title, notes, subjects, or recurrence fields.

**Shared helpers:**
- `_session_duration_hours(session)` — computes duration from `starts_at`/`ends_at`
- `_session_financials(session)` — computes `(hours, revenue, cost, profit)` where:
  - `revenue = snapshot_student_price × hours × num_students`
  - `cost = snapshot_teacher_cost × hours`
  - `profit = revenue - cost`
- `_period_key(iso_str, granularity)` — generates period key: `"YYYY-MM"` for monthly, `"YYYY-Wnn"` for weekly
- `_fetch_sessions(db, org_id, ...)` — base session query with optional `date_from`, `date_to`, `teacher_id`, `session_type_id` filters, ordered by `starts_at`, capped at 5000 rows
- `_fetch_profile_map(db, ids)` — batch-fetches profiles → `{id: {name, avatar_url}}`
- `_fetch_session_type_map(db, ids)` — batch-fetches session types → `{id: {id, name, color}}`

**`get_admin_dashboard()`:**
Iterates all matching sessions once, accumulating into four aggregation dicts:
1. `teacher_agg` — per-teacher: sessions, hours, cost, revenue
2. `student_agg` — per-student: sessions, hours, billed (price × hours per student)
3. `type_agg` — per-session-type: sessions, revenue, cost
4. `time_agg` — per-period: revenue, cost, profit, count

After aggregation, batch-fetches profile names/avatars for all teacher + student IDs, and session type names/colors for all type IDs. Returns a structured dashboard with `summary`, `by_teacher`, `by_student`, `by_session_type`, and `time_series`.

**`get_teacher_dashboard()`:**
Same session-fetch pattern but pre-filtered to `teacher_id`. Aggregates student breakdown and time series. The teacher's "earnings" is the cost side (what the org pays them). Returns `total_earnings`, `total_sessions`, `total_hours`, `revenue_generated`, `by_student`, `time_series`.

**`get_student_dashboard()`:**
Uses `contains("student_ids", [student_id])` to filter sessions where the student participated. Computes per-session cost (`snapshot_student_price × hours`) and time series. Returns `total_spent`, `total_sessions`, `total_hours`, `session_costs` (per-session detail list), `time_series`.

**Batch hydration:** Follows the standard batch pattern — collects all unique IDs across aggregated data, batch-fetches profiles and session types in one query per entity type, merges into output.

### 3.7 Backend Schemas — `schemas/analytics.py`

**FinancialSummary:** `total_revenue`, `total_cost`, `total_profit`, `total_sessions`, `total_hours`, `average_revenue_per_session`, `average_cost_per_session`

**AdminDashboardData:** `summary: FinancialSummary`, `by_teacher: list[TeacherFinancialDetail]`, `by_student: list[StudentFinancialDetail]`, `by_session_type: list[SessionTypeBreakdown]`, `time_series: list[TimeSeriesPoint]`

**TeacherDashboardData:** `total_earnings`, `total_sessions`, `total_hours`, `revenue_generated`, `by_student: list[StudentFinancialDetail]`, `time_series: list[TimeSeriesPoint]`

**StudentDashboardData:** `total_spent`, `total_sessions`, `total_hours`, `session_costs: list[dict]`, `time_series: list[TimeSeriesPoint]`

**TimeSeriesPoint:** `period` (string, format `"YYYY-MM"` or `"YYYY-Wnn"`), `revenue`, `cost`, `profit`, `session_count`

## 4. Cache Contract

| Attribute | Value |
|---|---|
| **Query namespace** | `analytics:admin:` (admin), `analytics:student:` (student) |
| **staleTime** | 60,000ms (1 minute) |

**Admin query keys:**

Pattern: `buildAdminAnalyticsQueryKey(params)`

Shape: `analytics:admin:{URLSearchParams.toString()}`

Example: `analytics:admin:date_from=2026-03-01&date_to=2026-03-31&granularity=monthly`

Encodes all filter dimensions via URL search params: `date_from`, `date_to`, `granularity`, `teacher_id`, `session_type_id`. Empty/undefined params are omitted.

**Student query keys:**

Pattern: `buildStudentAnalyticsQueryKey(studentId, params)`

Shape: `analytics:student:{studentId}|{URLSearchParams.toString()}`

Example: `analytics:student:abc123|date_from=2026-03-01&date_to=2026-03-31`

**Invalidation rules:**

| Trigger | What is invalidated |
|---|---|
| `invalidateAnalyticsQueries()` | All entries matching `analytics:admin:*` OR `analytics:student:*` |

Invalidation is the only cache operation needed — analytics is read-only with no mutations.

**Prefetch behavior:**

| What | When | Mechanism |
|---|---|---|
| Adjacent months | After paint, on month navigation (not on first mount) | `prefetchAdminAnalyticsQuery()` via `requestIdleCallback` with 2000ms timeout |
| 12-month chart data | On mount (client-side) | `useAdminAnalyticsQuery()` with chart range params — no initial data, loads as secondary query |

## 5. Optimistic Update Strategy

**N/A — read-only feature.** Analytics has no mutations. Data is derived from session/assignment data managed by other features. The query module explicitly documents this: *"Read-only feature: no mutation sync, snapshot/restore, or optimistic helpers needed."*

When sessions are created, updated, or deleted via the calendar feature, analytics caches will serve stale data until `staleTime` expires (1 minute) or until `invalidateAnalyticsQueries()` is called explicitly. Currently, calendar mutations do not call analytics invalidation — the 1-minute stale time is the natural refresh window.

## 6. Payload Shapes

Analytics does not follow the standard summary/detail payload pattern. There is no entity list/detail split — each endpoint returns a complete pre-computed dashboard object.

### Admin Dashboard Payload

| Field | Type | Purpose |
|---|---|---|
| `summary.total_revenue` | `float` | Sum of `snapshot_student_price × hours × num_students` across all sessions |
| `summary.total_cost` | `float` | Sum of `snapshot_teacher_cost × hours` across all sessions |
| `summary.total_profit` | `float` | `revenue - cost` |
| `summary.total_sessions` | `int` | Count of sessions in range |
| `summary.total_hours` | `float` | Sum of session durations |
| `summary.average_revenue_per_session` | `float` | `revenue / sessions` |
| `summary.average_cost_per_session` | `float` | `cost / sessions` |
| `by_teacher[]` | `list` | Per-teacher: `teacher_id`, `teacher_name`, `avatar_url`, `total_sessions`, `total_hours`, `total_cost`, `total_revenue_generated` — sorted by revenue desc |
| `by_student[]` | `list` | Per-student: `student_id`, `student_name`, `avatar_url`, `total_sessions`, `total_hours`, `total_billed` — sorted by billed desc |
| `by_session_type[]` | `list` | Per-type: `session_type_id`, `session_type_name`, `color`, `total_sessions`, `total_revenue`, `total_cost` — sorted by revenue desc |
| `time_series[]` | `list` | Per-period: `period`, `revenue`, `cost`, `profit`, `session_count` — sorted chronologically |

### Teacher Dashboard Payload

| Field | Type | Purpose |
|---|---|---|
| `total_earnings` | `float` | Teacher's cost-side earnings (what the org pays them) |
| `total_sessions` | `int` | Count of teacher's sessions |
| `total_hours` | `float` | Sum of teacher's session durations |
| `revenue_generated` | `float` | Total student revenue from teacher's sessions |
| `by_student[]` | `list` | Per-student breakdown (same shape as admin) |
| `time_series[]` | `list` | Per-period breakdown (same shape as admin) |

### Student Dashboard Payload

| Field | Type | Purpose |
|---|---|---|
| `total_spent` | `float` | Total `snapshot_student_price × hours` for this student |
| `total_sessions` | `int` | Count of sessions the student participated in |
| `total_hours` | `float` | Sum of session durations |
| `session_costs[]` | `list` | Per-session: `session_id`, `starts_at`, `ends_at`, `hours`, `cost`, `session_type_id` |
| `time_series[]` | `list` | Per-period: `period`, `revenue` (= student's spend), `cost` (0), `profit` (0), `session_count` |

**Note on student `time_series`:** The student dashboard reuses the `TimeSeriesPoint` schema but maps student spending to the `revenue` field with `cost` and `profit` set to 0. This is a pragmatic reuse of the shared schema shape.

## 7. Database

### Tables Involved

| Table | Role in Analytics |
|---|---|
| `calendar_sessions` | Primary data source — session times, teacher, students, price snapshots |
| `profiles` | Hydrated for teacher/student names and avatars |
| `session_types` | Hydrated for session type names and colors |

Analytics does not write to any table. It is a pure read/aggregation feature.

### DB Access Patterns

| Pattern | Query Shape |
|---|---|
| Admin: all sessions in range | `.eq("organization_id", org_id).gte("starts_at", from).lte("starts_at", to).limit(5000)` |
| Admin: filtered by teacher | Above + `.eq("teacher_id", tid)` |
| Admin: filtered by session type | Above + `.eq("session_type_id", stid)` |
| Teacher: own sessions | `.eq("organization_id", org_id).eq("teacher_id", tid).gte(...).lte(...)` |
| Student: participated sessions | `.eq("organization_id", org_id).contains("student_ids", [sid]).gte(...).lte(...)` |
| Profile batch hydration | `.in_("id", all_ids)` — single query for all teacher + student IDs |
| Session type batch hydration | `.in_("id", type_ids)` |

**Indexes leveraged** (defined by the calendar feature):
- `idx_calendar_sessions_org_starts` — org + date range queries
- `idx_calendar_sessions_org_teacher_starts` — org + teacher + date range queries
- `idx_calendar_sessions_student_ids_gin` — student membership containment queries

Analytics does not define its own indexes — it reuses the calendar feature's indexes which already serve the same access patterns.

### Query Bound

All analytics session queries are capped at **5000 rows** via `.limit(5000)`. This prevents unbounded memory use during aggregation. For organizations with more than 5000 sessions in a single date range, results will be truncated (no pagination — the cap is a safety guard, not a UX feature).

## 8. Edge Cases and Notes

### Financial Calculation Model

Revenue and cost are computed from **price snapshots** stored on each session at creation time (`snapshot_student_price`, `snapshot_teacher_cost`), NOT from the current session type prices. This means analytics correctly reflects historical pricing even if session type prices change.

- **Revenue** = `snapshot_student_price × duration_hours × number_of_students` — revenue scales with student count (each student is billed independently)
- **Cost** = `snapshot_teacher_cost × duration_hours` — cost does not scale with student count (teacher is paid once regardless of student count)
- **Profit** = `revenue - cost`

Sessions missing price snapshots (`null`) contribute 0 to revenue/cost.

### No Pre-Computed Analytics Table

All analytics are computed on-the-fly from raw session data. There is no materialized view, no analytics table, and no background aggregation job. This keeps the architecture simple but means large organizations may see slower dashboard loads as session counts grow.

### Granularity Support

Two granularity levels: `"monthly"` (default) and `"weekly"`. Monthly generates period keys like `"2026-03"`. Weekly generates ISO week keys like `"2026-W12"`. The frontend currently only uses `"monthly"`.

### Admin Dashboard — Dual Query Pattern

The admin dashboard page fires **two concurrent queries**:
1. **Month query** — selected single month (has server-side initial data for month 0)
2. **Chart query** — 12-month rolling window ending at the selected month (always client-fetched)

This means the dashboard area charts load slightly after the summary cards on first paint. This is intentional — chart data is deferred to keep first paint fast.

### Teacher Earnings Semantics

In the teacher dashboard, `total_earnings` represents the **cost side** of sessions — what the organization pays the teacher. `revenue_generated` is the student-side revenue from that teacher's sessions. The distinction matters: the teacher "earns" the cost, while the revenue goes to the organization.

### Student `time_series` Schema Reuse

The student dashboard reuses the `TimeSeriesPoint` schema from the admin dashboard, but maps the student's spending to the `revenue` field and sets `cost` and `profit` to 0. This is a pragmatic choice to reuse chart components that expect the `TimeSeriesPoint` shape.

### 5000-Row Session Cap

The `_fetch_sessions()` helper applies a hard `.limit(5000)` on all analytics queries. This prevents memory issues during aggregation but means very active organizations viewing long date ranges may see incomplete data. There is no user-visible warning when the cap is hit.

### Month Navigation Bounds

The `MonthNavigator` disables the "next" button when `monthOffset >= 0` — users cannot navigate into the future. Backward navigation has no bound.

## 9. Reference Status

Analytics is **not the reference implementation** (calendar is — see `features/calendar.md`). However, analytics is a clean example of:

- **Read-only query module pattern** — `lib/queries/analytics.ts` demonstrates the minimal query module for a feature with no mutations: key builders, query hooks, prefetch function, and invalidation. No snapshot/restore, no sync functions, no optimistic helpers.
- **Server-side aggregation** — the backend service computes all derived metrics instead of sending raw data to the frontend. This keeps payloads small and chart-ready.
- **Dual query pattern** — firing separate queries for the detail view (single month) and the chart (12-month span) to keep first paint fast while still providing rich visualizations.
- **Deferred prefetch with idle callback** — adjacent month prefetch uses `requestIdleCallback` with a 2000ms timeout, skipping the first mount to avoid competing with initial data.
