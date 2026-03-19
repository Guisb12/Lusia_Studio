---
last-updated: 2026-03-19
stability: frequently-updated
agent-routing: "Read before working on student notes data layer."
---

# Student Notes — Entity Catalog

## Tables

### `student_notes`

Post-it style notes written by teachers about individual students. Each note belongs to one teacher (the author) and is about one student. Notes are personal by default, with an opt-in `is_shared` flag.

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `id` | `uuid` | `gen_random_uuid()` | Primary key |
| `organization_id` | `uuid NOT NULL` | — | FK to `organizations(id)`. Multi-tenancy scope. |
| `student_id` | `uuid NOT NULL` | — | The student this note is about |
| `teacher_id` | `uuid NOT NULL` | — | The teacher who wrote the note (owner) |
| `content` | `text NOT NULL` | `''` | Note text content |
| `color` | `text NOT NULL` | `'#FFF9B1'` | Hex color code for the post-it |
| `shared_with_ids` | `uuid[] NOT NULL` | `'{}'` | Teacher IDs this note is shared with |
| `created_at` | `timestamptz` | `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | `now()` | Last update timestamp |

### Indexes

| Index | Columns | Type | Purpose |
|-------|---------|------|---------|
| `idx_student_notes_org_student_teacher` | `(organization_id, student_id, teacher_id)` | Composite B-tree | Primary access: teacher lists their own notes for a student |
| `idx_student_notes_shared_with_gin` | `shared_with_ids` | GIN | Secondary access: fetch notes shared with a specific teacher (`@>` containment) |

### Relationships

- `organization_id` → `organizations(id)`: Every note belongs to one org
- `student_id` → logically references `profiles(id)` where `role = 'student'`
- `teacher_id` → logically references `profiles(id)` where `role IN ('teacher', 'admin')`

### Read Patterns

| Pattern | Query Shape |
|---------|-------------|
| Teacher's own notes for a student | `.eq("organization_id", org_id).eq("student_id", sid).eq("teacher_id", tid)` |
| Notes shared with a teacher | `.eq("organization_id", org_id).eq("student_id", sid).neq("teacher_id", tid).contains("shared_with_ids", [tid])` |
| Admin: all notes for a student | `.eq("organization_id", org_id).eq("student_id", sid)` |

### Migration

Files: `migrations/021_student_notes.sql` (table creation), `migrations/022_student_notes_shared_with.sql` (replace `is_shared` with `shared_with_ids`)
