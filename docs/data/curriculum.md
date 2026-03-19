---
last-updated: 2026-03-19
stability: semi-stable
agent-routing: "Read when working on subjects, curriculum, or materials data layer."
---

# Curriculum Domain Entities

Subject catalog, hierarchical curriculum tree, and base content. Subjects are org-scoped reference data; curriculum and base_content are a read-only content tree used for material browsing, quiz generation, and document categorization.

---

## Table: `subjects`

**Purpose:** Subject catalog (e.g., "Matemática", "Física e Química", "Português"). Each subject has display properties and grade-level associations. Subjects can be global (shared across all orgs) or org-specific custom subjects.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `name` | text | Subject display name | NOT NULL |
| `slug` | text | URL-safe identifier | NOT NULL |
| `color` | text | Display color (hex or named) | |
| `icon` | text | Display icon identifier | |
| `education_level` | text | Education level | NOT NULL, CHECK: 'basico_1_ciclo', 'basico_2_ciclo', 'basico_3_ciclo', 'secundario', 'superior' |
| `grade_levels` | text[] | Applicable grade levels (e.g., ['10', '11', '12']) | |
| `organization_id` | uuid | Owning org (NULL for global subjects) | FK → organizations(id) |
| `active` | boolean | Whether subject is available | DEFAULT true |
| `affects_cfs` | boolean | Whether this subject affects CFS calculation | DEFAULT true |
| `has_national_exam` | boolean | Whether this subject has a national exam | DEFAULT false |
| `status` | subject_status (enum) | Content completeness status | DEFAULT 'viable', values: 'full', 'structure', 'viable', 'gpa_only' |
| `created_at` | timestamptz | Creation timestamp | DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | DEFAULT now() |

### Indexes

```
Index: idx_subjects_org
Columns: (organization_id)
Type: btree
Purpose: Serves: listing subjects for an organization

Index: idx_subjects_slug
Columns: (slug)
Type: btree
Purpose: Serves: subject lookup by slug
```

### Relationships

- Subjects can be global (`organization_id IS NULL`) or org-specific (`organization_id` → `organizations.id`).
- Referenced by profiles (`subject_ids` array), classrooms (`subject_ids` array), calendar sessions (`subject_ids` array), artifacts (`subject_id`), questions (`subject_id`), and curriculum nodes (`subject_id`).
- In the grades domain, subjects are referenced by `student_subject_enrollments.subject_id` and `student_subject_cfd.subject_id`.
- The `affects_cfs` and `has_national_exam` flags control grade calculation behavior in the grades domain.

### Access Patterns

**Service:** `subject_service.py`

```
SELECT constant:
SUBJECT_SELECT =
    "id,name,slug,color,icon,education_level,
     grade_levels,status,organization_id,has_national_exam"
```

- **List for org (dual-source):** Two queries merged — (1) `.is_("organization_id", "null").eq("active", True)` for global subjects, (2) `.eq("organization_id", org_id).eq("active", True)` for custom subjects. Results are combined with an `is_custom` flag.
- **Batch hydration (from other services):** `.select("id,name,slug,color,icon,affects_cfs,has_national_exam").in_("id", subject_ids)` — called by calendar, assignments, artifacts, and grades services.
- **Filter by education level:** `.eq("education_level", level)` — optional filter on list endpoint.
- **Nested select (from enrollments):** `subjects(name,slug,color,icon,affects_cfs,has_national_exam)` — PostgREST nested join from `student_subject_enrollments`.

---

## Table: `curriculum`

**Purpose:** Hierarchical curriculum tree organized as subject → year → component → nodes. Represents the official national curriculum structure used for content navigation, quiz generation, and document categorization.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `subject_id` | uuid | Subject this node belongs to | FK → subjects(id), NOT NULL |
| `code` | text | Unique curriculum code (e.g., 'MAT_10_ALG_01') | NOT NULL, UNIQUE |
| `title` | text | Node display title | NOT NULL |
| `description` | text | Optional detailed description | |
| `year_level` | text | Year/grade level (e.g., '7', '10') | |
| `subject_component` | text | Subject sub-area (e.g., 'Física', 'Química') | |
| `level` | integer | Hierarchy depth (0=root, 1, 2, 3) | |
| `parent_id` | uuid | Parent node for hierarchy | Self-referencing FK → curriculum(id) |
| `sequence_order` | integer | Sort order within same parent | |
| `keywords` | text[] | Search keywords for this node | |
| `has_children` | boolean | Whether this node has child nodes | |
| `full_path` | text | Denormalized hierarchy path | e.g., 'MAT/MAT_10/MAT_10_ALG' |
| `created_at` | timestamptz | Creation timestamp | DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | |

### Indexes

No explicit indexes found in migration files beyond PK and UNIQUE on `code`. The `parent_id` self-reference enables tree traversal.

### Relationships

- Each curriculum node belongs to one subject (`subject_id` → `subjects.id`).
- Nodes form a tree via `parent_id` self-reference — root nodes have `parent_id IS NULL`.
- The hierarchy is typically: Level 0 (subject root) → Level 1 (year grouping) → Level 2 (component/domain) → Level 3 (specific topic).
- Curriculum codes are referenced by `artifacts.curriculum_codes` and `questions.curriculum_codes` (text arrays, not FK) for content tagging.
- Each leaf node can have associated `base_content` (`base_content.curriculum_id` → `curriculum.id`).

### Access Patterns

**Service:** `materials_service.py`

- **Tree navigation (children of node):** `.eq("parent_id", parent_id).order("sequence_order")` — loads child nodes for expanding a tree level.
- **Root nodes by subject + year:** `.eq("subject_id", subject_id).eq("year_level", year_level).is_("parent_id", "null").order("sequence_order")` — entry point for curriculum browsing.
- **Search by keywords:** `.contains("keywords", [search_term])` or text matching on title/code.
- **Lookup by code:** `.eq("code", curriculum_code).limit(1)` — used during document categorization and quiz generation to resolve curriculum references.
- **Batch lookup by codes:** `.in_("code", codes)` — used for curriculum code resolution.

---

## Table: `base_content`

**Purpose:** Rich content (notes, explanations) linked 1:1 to curriculum nodes. Provides the study material for a specific curriculum topic.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `curriculum_id` | uuid | Linked curriculum node | FK → curriculum(id), NOT NULL |
| `content_json` | jsonb | Rich content (TipTap or structured JSON) | NOT NULL |
| `word_count` | integer | Content word count for reading time estimation | |
| `average_read_time` | integer | Estimated reading time in minutes | |
| `created_at` | timestamptz | Creation timestamp | DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | |

### Indexes

No explicit indexes found in migration files beyond PK. Queries access by `curriculum_id` (1:1 relationship).

### Relationships

- Each base_content record is linked to exactly one curriculum node (`curriculum_id` → `curriculum.id`).
- This is a 1:1 relationship — each curriculum node has at most one base_content record.
- The content is displayed when a student browses curriculum materials or when a teacher views source content for lesson planning.

### Access Patterns

**Service:** `materials_service.py`

- **Get by curriculum node:** `.eq("curriculum_id", curriculum_id).limit(1)` — loads content when user selects a curriculum topic.
- **Batch fetch for multiple nodes:** `.in_("curriculum_id", curriculum_ids)` — loads content for multiple topics at once.
- **Content used in quiz generation:** The quiz generation pipeline reads base_content to provide context for AI-generated questions.

---

## Domain Relationships Summary

The curriculum domain provides the subject and content foundation for the entire system. Subjects are referenced by nearly every other domain (profiles, classrooms, calendar sessions, assignments, artifacts, questions, grades). The curriculum tree is a read-only hierarchical structure that organizes national curriculum content by subject → year → component → topic. Base_content provides the actual study material for each curriculum node. Curriculum codes (`curriculum.code`) are used as tags on artifacts and questions (`curriculum_codes` text arrays) to connect user-created content to the official curriculum structure. The `affects_cfs` and `has_national_exam` flags on subjects drive grade calculation behavior in the grades domain (`data/grades.md`).
