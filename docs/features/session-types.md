---
last-updated: 2026-03-19
stability: frequently-updated
agent-routing: "Read before working on session types feature code."
---

# Session Types

## 1. Overview

Session types define the pricing and categorization for calendar sessions. Each organization has a set of session types with per-hour student pricing and teacher cost. One type can be marked as the default. When a session is created, the current prices are **snapshotted** onto the session row, preserving historical pricing. Session types are managed via a dialog within the calendar feature — there is no standalone page.

## 2. Availability

| Attribute | Value |
|---|---|
| **Roles** | Admin (full CRUD), Teacher (read-only — can view and select types when creating sessions, but cannot create/edit/delete types) |
| **Center types** | All (trial included) |
| **Route** | Managed within `/dashboard/calendar` via `SessionTypeManagerDialog` |
| **Access note** | Backend enforces `require_admin` for create/update/delete; `require_teacher` for list/get |

## 3. Architecture

### 3.1 UI Entry Point

Session types are accessed from two places within the calendar:

1. **SessionTypeManagerDialog** — CRUD interface opened from the calendar settings
2. **SessionTypePicker** — inline dropdown within `SessionFormDialog` for selecting a type when creating/editing a session

Both are lazy-loaded via `dynamic()` within `EventCalendar.tsx`.

### 3.2 UI Components

**SessionTypeManagerDialog** (`components/calendar/SessionTypeManagerDialog.tsx`):
- Dialog with three modes: list, create, edit
- Uses `useSessionTypes(true, open)` — fetches active types only, enabled only when dialog is open
- Inline form fields: name, student price per hour, teacher cost per hour, color (10 predefined colors)
- Shows default type badge ("padrão")
- Hover actions: edit button, delete button
- Calls `createSessionTypeWithCache()`, `updateSessionTypeWithCache()`, `deleteSessionTypeWithCache()`

**SessionTypePicker** (sub-component in `components/calendar/SessionFormDialog.tsx`):
- Popover-based dropdown
- Displays: color dot, name, student price per hour
- Error border if no type selected
- Auto-selects default type on form open

**Predefined colors:** `["#3b82f6", "#8b5cf6", "#ec4899", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#6366f1", "#64748b"]`

### 3.3 Next.js API Routes

**`app/api/session-types/route.ts`** — collection operations:
- `GET` — forwards `active_only` param to `GET /api/v1/session-types`
- `POST` — forwards JSON body to `POST /api/v1/session-types`

**`app/api/session-types/[id]/route.ts`** — single operations:
- `GET` — forwards to `GET /api/v1/session-types/{id}`
- `PATCH` — forwards body to `PATCH /api/v1/session-types/{id}`
- `DELETE` — forwards to `DELETE /api/v1/session-types/{id}`

All routes use `getAccessToken()` + Bearer header, `cache: "no-store"`.

### 3.4 Backend Router — `routers/session_types.py`

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| `GET` | `/` | `require_teacher` | `list_session_types(active_only=True by default)` |
| `GET` | `/{session_type_id}` | `require_teacher` | `get_session_type()` |
| `POST` | `/` | `require_admin` | `create_session_type()` |
| `PATCH` | `/{session_type_id}` | `require_admin` | `update_session_type()` |
| `DELETE` | `/{session_type_id}` | `require_admin` | `delete_session_type()` |

### 3.5 Backend Service — `services/session_types_service.py`

**SELECT constant:**

```
SESSION_TYPE_SELECT:
  id, organization_id, name, description,
  student_price_per_hour, teacher_cost_per_hour,
  color, icon, is_default, active, created_at, updated_at
```

**No batch hydration** — session types have no foreign key references that need hydration.

**Key business logic:**

- **Auto-create default:** `_ensure_default_session_type()` runs on `list_session_types()` — if no active types exist, auto-creates "Geral" (default=true, prices=0, color="#3b82f6"). This guarantees every org always has at least one session type.
- **Single default enforcement:** `_clear_default()` sets `is_default=False` on all existing types before a new default is marked. Combined with the partial unique index, this ensures exactly one default per org.
- **Soft delete:** `delete_session_type()` sets `active=False` and `is_default=False`. Does not physically remove the row.
- **Smart update:** `update_session_type()` uses `payload.model_fields_set` to detect which fields were explicitly provided (vs default None), and only updates those fields. Returns existing record if no fields provided.
- **Ordering:** Types are returned ordered by `is_default DESC, name ASC`.

### 3.6 Backend Schemas — `schemas/session_types.py`

**SessionTypeCreate:** `name` (str, 1–200), `description` (optional), `student_price_per_hour` (float, >= 0), `teacher_cost_per_hour` (float, >= 0), `color` (optional), `icon` (optional), `is_default` (bool, default false)

**SessionTypeUpdate:** All fields optional — `name`, `description`, `student_price_per_hour`, `teacher_cost_per_hour`, `color`, `icon`, `is_default`, `active`

**SessionTypeOut:** `id`, `organization_id`, `name`, `description`, `student_price_per_hour`, `teacher_cost_per_hour`, `color`, `icon`, `is_default`, `active`, `created_at`, `updated_at`

## 4. Cache Contract

| Attribute | Value |
|---|---|
| **Query namespace** | `session-types:` |
| **Stale time** | 600,000ms (10 minutes) |

**Query keys:**

| Key | Shape | Used for |
|---|---|---|
| Active types | `session-types:active` | Default query — active types only |
| All types | `session-types:all` | Admin view when showing archived types |

**Cache management functions:**

- `createSessionTypeWithCache(payload)` — POST to API, sync into caches via `syncSessionTypeIntoCaches()`, then `refreshSessionTypeQueries()` for server truth
- `updateSessionTypeWithCache(id, payload)` — PATCH to API, sync into caches (handles default flag clearing), updates calendar session caches to reflect new type data, then refreshes
- `deleteSessionTypeWithCache(id)` — DELETE to API, `removeSessionTypeFromActiveCaches()`, updates calendar session caches, then refreshes
- `invalidateSessionTypesQueries()` — invalidates all session-type queries

**Calendar session cache sync:**

When a session type is updated or deleted, `updateSessionTypeWithCache` and `deleteSessionTypeWithCache` also update calendar session caches — any session referencing the modified type gets its `session_type` object refreshed. This prevents stale type names/colors in the calendar grid.

**Sorting:** Types are sorted by `is_default` descending, then by name (Portuguese locale).

## 5. Optimistic Update Strategy

Session types use **server-first with immediate cache sync** rather than full optimistic mutation:

1. Fire API call (POST/PATCH/DELETE)
2. On success: sync result into caches via `syncSessionTypeIntoCaches()` or `removeSessionTypeFromActiveCaches()`
3. Then `refreshSessionTypeQueries()` re-fetches from server for consistency

No snapshot/restore — the dialog shows a loading state during the API call and syncs the real result into cache on success. Calendar session caches are also updated to reflect type changes.

## 6. Payload Shapes

Single payload shape (no summary/detail split):

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Session type ID |
| `organization_id` | `string` | Org scope |
| `name` | `string` | Type name (e.g., "Aula Individual", "Aula em Grupo") |
| `description` | `string \| null` | Optional description |
| `student_price_per_hour` | `number` | Per-hour student price |
| `teacher_cost_per_hour` | `number` | Per-hour teacher cost |
| `color` | `string \| null` | Display color (hex) |
| `icon` | `string \| null` | Display icon |
| `is_default` | `boolean` | Default type flag |
| `active` | `boolean` | Soft-delete flag |
| `created_at` | `string \| null` | Creation timestamp |
| `updated_at` | `string \| null` | Last update |

## 7. Database

### Table: `session_types`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `organization_id` | uuid | NOT NULL, FK → organizations(id) CASCADE |
| `name` | text | NOT NULL |
| `description` | text | nullable |
| `student_price_per_hour` | numeric(8,2) | NOT NULL, default 0 |
| `teacher_cost_per_hour` | numeric(8,2) | NOT NULL, default 0 |
| `color` | text | nullable |
| `icon` | text | nullable |
| `is_default` | boolean | default false |
| `active` | boolean | default true |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | default now() |

### Indexes

| Index | Columns | Type | Serves |
|---|---|---|---|
| `idx_session_types_org` | `(organization_id, active)` | B-tree | Listing active types for an org |
| `idx_session_types_default` | `(organization_id)` WHERE `is_default = true` | Unique partial | Enforcing one default per org |

### Calendar Session Linkage

Migration `014_session_types.sql` also added to `calendar_sessions`:

| Column | Type | Purpose |
|---|---|---|
| `session_type_id` | uuid, FK → session_types(id) ON DELETE SET NULL | Links session to its type |
| `snapshot_student_price` | numeric(8,2), nullable | Historical student price at creation |
| `snapshot_teacher_cost` | numeric(8,2), nullable | Historical teacher cost at creation |

Index: `idx_sessions_type` on `(session_type_id)`.

When a session is created, `calendar_service._snapshot_session_type()` copies the current `student_price_per_hour` and `teacher_cost_per_hour` into the snapshot columns. This ensures historical sessions retain original pricing even if the type's prices change later.

### RLS Policies

- `session_types_org_read` — SELECT for org members
- `session_types_org_write` — INSERT/UPDATE/DELETE for org admins and teachers

## 8. Edge Cases and Notes

### Auto-Created Default
If `list_session_types()` finds no active types for an org, it auto-creates "Geral" with `is_default=true`, both prices at 0, and color `#3b82f6`. This guarantees the session form always has at least one type to select.

### ON DELETE SET NULL
If a session type is physically deleted (bypassing soft-delete), `session_type_id` on linked calendar sessions is set to NULL. Snapshot prices remain intact.

### Default Flag Enforcement
The partial unique index `idx_session_types_default` ensures at most one default per org at the database level. The service also calls `_clear_default()` before setting a new default, providing application-level enforcement. Both guards are needed — the index catches race conditions the application logic could miss.

### Price Snapshot Timing
Snapshots are taken at session creation only — if a session type's prices change, existing sessions keep their original snapshot prices. This is intentional for financial accuracy.

### Soft Delete Behavior
Deleted types have `active=False` and `is_default=False`. They remain in the database and are still referenced by existing sessions via `session_type_id`. The active-only query (`session-types:active`) excludes them; the all query (`session-types:all`) includes them.

## 9. Reference Status

Session types is a supporting feature for the calendar. It has no standalone route — UI lives entirely within the calendar's `SessionTypeManagerDialog` and `SessionFormDialog`. The feature uses a 10-minute stale time since types change infrequently, and server-first mutation strategy since operations are admin-only and low-frequency.
