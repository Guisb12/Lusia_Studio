---
last-updated: 2026-03-19
stability: semi-stable
agent-routing: "Read when working on classrooms data layer."
---

# Classrooms Domain Entity

Teacher-created student grouping containers. Each classroom belongs to a teacher and links students to subjects via array columns.

---

## Table: `classrooms`

**Purpose:** Groups students under a teacher for a set of subjects and grade levels. Used as a filter dimension in calendar sessions and assignments.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `organization_id` | uuid | Owning organization | FK → organizations(id) ON DELETE CASCADE, NOT NULL |
| `name` | text | Classroom display name | NOT NULL |
| `description` | text | Optional description | |
| `teacher_id` | uuid | Owning teacher | FK → profiles(id), NOT NULL |
| `subject_ids` | uuid[] | Subjects taught in this class | DEFAULT '{}' |
| `grade_levels` | text[] | Grade levels covered (e.g., ['7', '8']) | DEFAULT '{}' |
| `courses` | text[] | Course tracks (e.g., ['Ciências e Tecnologias']) | DEFAULT '{}' |
| `active` | boolean | Whether classroom is active | DEFAULT true |
| `is_primary` | boolean | Whether this is the teacher's primary/default class | DEFAULT false |
| `created_at` | timestamptz | Creation timestamp | DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | DEFAULT now() |

**Schema evolution:** Migration 012 replaced the original single-value columns (`subject_id`, `grade_level`, `school_year`, `status`) with array-based columns (`subject_ids`, `grade_levels`, `courses`) and boolean flags (`active`, `is_primary`). The `teacher_id` was also changed to NOT NULL.

### Indexes

```
Index: idx_classrooms_org
Columns: (organization_id)
Type: btree
Purpose: Serves: listing all classrooms in an organization

Index: idx_classrooms_teacher
Columns: (teacher_id)
Type: btree
Purpose: Serves: listing classrooms owned by a specific teacher

Index: idx_classrooms_active
Columns: (organization_id, active)
Type: btree composite
Purpose: Serves: listing active classrooms for an organization (the default list view)

Index: idx_classrooms_primary
Columns: (teacher_id, is_primary)
Type: btree partial (WHERE is_primary = true)
Purpose: Serves: finding a teacher's primary classroom quickly
```

### Relationships

- Each classroom belongs to one organization (`organization_id` → `organizations.id`).
- Each classroom is owned by one teacher (`teacher_id` → `profiles.id`).
- Students are linked to classrooms via `profiles.class_ids` (uuid array on the profiles table, not a join table). A student's `class_ids` array contains the IDs of classrooms they belong to.
- Classrooms reference subjects via `subject_ids` (uuid array referencing `subjects.id`), but this is not a formal FK — it's an application-level reference.
- Calendar sessions and assignments can optionally reference a classroom via `class_id`.

### Access Patterns

**Service:** `classrooms_service.py`

```
SELECT constant: CLASSROOM_SELECT =
    "id,organization_id,name,description,subject_ids,
     grade_levels,courses,teacher_id,active,is_primary,
     created_at,updated_at"

MEMBER_SELECT =
    "id,full_name,display_name,avatar_url,grade_level,
     course,subject_ids"
```

- **List active by org:** `.eq("organization_id", org_id).eq("active", True).order("name")` — admin sees all, teachers see own via `.eq("teacher_id", user_id)`.
- **Get by ID:** `.eq("organization_id", org_id).eq("id", classroom_id).limit(1)`.
- **List members:** Queries `profiles` table with `.contains("class_ids", [classroom_id])` to find students in the class.
- **Add student to class:** Read-modify-write on `profiles.class_ids` — appends classroom_id to the student's array.
- **Remove student from class:** Read-modify-write on `profiles.class_ids` — removes classroom_id from the array.
- **Create:** `.insert({...})` with org/teacher scoping.
- **Update:** `.update({...}).eq("organization_id", org_id).eq("id", classroom_id)`.
- **Soft delete:** `.update({"active": False}).eq("id", classroom_id)` — classrooms are deactivated, not hard-deleted.
- **Access control:** `assert_classroom_access()` verifies teacher ownership (admins bypass).

### RPC Functions

```sql
get_student_recommendations(p_org_id uuid, p_teacher_subject_ids uuid[])
```

Returns student profiles ranked by subject overlap with the teacher's subjects. Used by the UI to suggest students when creating/editing a classroom. Defined in migration 012.

### RLS Policies

- `classrooms_select_org_members`: FOR SELECT — org members can read classrooms in their organization.

---

## Domain Relationships Summary

Classrooms serve as a grouping mechanism that connects teachers to students. The student-classroom relationship is stored denormalized on `profiles.class_ids` (not in a join table), queried via GIN index with `.contains()`. Classrooms are referenced optionally by `calendar_sessions.class_id` and `assignments.class_id` to scope sessions and assignments to a specific class. The `subject_ids` array on classrooms aligns with the subjects domain (`data/curriculum.md`) but is not enforced via FK constraints.
