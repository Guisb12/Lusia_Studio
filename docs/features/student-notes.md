---
last-updated: 2026-03-19
stability: frequently-updated
agent-routing: "Read before working on student notes (post-it notes) feature code."
---

# Student Notes (Post-it Notes)

## 1. Overview

The student notes feature lets teachers jot down quick, personal post-it style notes about individual students. Notes live in a dedicated "Anotações" tab within the `StudentDetailCard` — the right-side panel that opens when clicking a student on `/dashboard/students`. Each note has text content and a color. Notes are personal by default, with an opt-in share toggle that makes a note visible to other teachers in the organization. Admins see all notes regardless of sharing status.

## 2. Availability

| Attribute | Value |
|---|---|
| **Roles** | Admin (sees all notes for a student), Teacher (sees own notes + shared notes from other teachers) |
| **Center types** | All (trial included) |
| **Route** | `/dashboard/students` → click student → "Anotações" tab |

**Visibility rules:**
- **Teacher:** sees own notes + notes from other teachers where `is_shared = true`
- **Admin:** sees all notes for the student regardless of `is_shared`
- Only the note author can edit, delete, or toggle `is_shared`

## 3. Architecture

### 3.1 Tab Integration — `components/students/StudentDetailCard.tsx`

The "Anotações" tab is the 4th tab in `StudentDetailCard`. It renders `StudentNotesTab` when active.

### 3.2 Feature Shell — `components/students/tabs/StudentNotesTab.tsx`

Client component. Orchestrates notes queries and mutations.

**Query orchestration:**
- Calls `useStudentNotesQuery(studentId)` for note data
- Notes are fetched on-demand when the tab is activated (not on initial load)

**Mutations (all optimistic with rollback):**
- `handleCreate` — adds optimistic note with temp ID → API call → sync real data / restore
- `handleUpdate` — applies optimistic field changes → API call → sync / restore
- `handleDelete` — removes from cache → API call → restore on failure

### 3.3 UI Components

**`components/students/notes/PostItBoard.tsx`:**
- Renders notes in a flex-wrap grid layout
- "Novo Post-it" button to create
- Manages create and edit modal overlays (click note → overlay + expanded card)
- Loading skeleton and empty state

**`components/students/notes/PostItNote.tsx`:**
- Individual post-it card with color, tape decoration, rotation, shadow
- Share toggle icon (owner only)
- Author attribution label (non-owner only)
- Framer Motion animations: spring entry, hover scale, crumple exit

### 3.4 Next.js API Routes

| Route File | Method | Backend Path |
|---|---|---|
| `app/api/members/[id]/notes/route.ts` | `GET` | `/api/v1/members/{id}/notes` |
| `app/api/members/[id]/notes/route.ts` | `POST` | `/api/v1/members/{id}/notes` |
| `app/api/members/[id]/notes/[noteId]/route.ts` | `PATCH` | `/api/v1/members/{id}/notes/{noteId}` |
| `app/api/members/[id]/notes/[noteId]/route.ts` | `DELETE` | `/api/v1/members/{id}/notes/{noteId}` |

### 3.5 Backend Router — `routers/members.py` (notes section)

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| `GET` | `/{member_id}/notes` | `require_teacher` | `student_notes_service.list_notes()` |
| `POST` | `/{member_id}/notes` | `require_teacher` | `student_notes_service.create_note()` |
| `PATCH` | `/{member_id}/notes/{note_id}` | `require_teacher` | `student_notes_service.update_note()` |
| `DELETE` | `/{member_id}/notes/{note_id}` | `require_teacher` | `student_notes_service.delete_note()` |

### 3.6 Backend Service — `services/student_notes_service.py`

**SELECT constant:** `STUDENT_NOTE_SELECT = "id,student_id,teacher_id,content,color,is_shared,created_at,updated_at"`

**Role-aware list query:**
- Teacher: two queries (own notes + shared from others), merged and sorted
- Admin: single query, all notes for the student

**Hydration:** `_hydrate_note_authors()` batch-resolves `teacher_name` from profiles.

**Ownership enforcement:** Update and delete filter by `teacher_id` — only the author can modify.

### 3.7 Backend Schemas — `schemas/student_notes.py`

- `StudentNoteCreate`: `content` (required), `color` (optional), `is_shared` (optional, default false)
- `StudentNoteUpdate`: `content`, `color`, `is_shared` (all optional)
- `StudentNoteOut`: full note with hydrated `teacher_name`

## 4. Cache Contract

| Attribute | Value |
|---|---|
| **Query namespace** | `student-notes:` |
| **staleTime** | 60,000ms (1 minute) |

**Key:** `student-notes:{studentId}`

**Cache operations:**
- `addNoteToCache()` — optimistic create
- `updateNoteInCache()` — optimistic update
- `removeNoteFromCache()` — optimistic delete
- `snapshotStudentNotesQuery()` / `restoreStudentNotesQuery()` — rollback
- `invalidateStudentNotesQuery()` — force refetch

## 5. Payload Shape

Single shape (no summary/detail split — notes are lightweight):

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Note ID |
| `student_id` | `string` | Student this note is about |
| `teacher_id` | `string` | Author teacher |
| `content` | `string` | Note text |
| `color` | `string` | Hex color code |
| `is_shared` | `boolean` | Whether other teachers can see it |
| `created_at` | `string \| null` | Creation timestamp |
| `updated_at` | `string \| null` | Last update timestamp |
| `teacher_name` | `string \| null` | Hydrated author name |

## 6. Database

### Tables

| Table | Description |
|---|---|
| `student_notes` | Post-it notes written by teachers about students |
| `profiles` | Queried for teacher name hydration |

Cross-reference: See `data/student-notes.md` for full entity schema.

### Indexes

| Index | Table | Columns | Serves |
|---|---|---|---|
| `idx_student_notes_org_student_teacher` | `student_notes` | `(organization_id, student_id, teacher_id)` | Teacher's own notes for a student |
| `idx_student_notes_org_student_shared` | `student_notes` | `(organization_id, student_id)` WHERE `is_shared = true` | Shared notes from other teachers |

## 7. Edge Cases and Notes

- **No summary/detail split:** Notes are small. One payload shape is sufficient. Documented deviation from the calendar pattern.
- **No server fetch / SSR:** Notes are on-demand detail data, fetched client-side when the tab activates.
- **Tab label "Anotações":** "Notas" means "grades" in Portuguese educational context — "Anotações" avoids ambiguity.
- **Crumple animation:** Delete uses a Framer Motion exit animation (scale down + rotate + fall) inspired by the SVG prototype.
