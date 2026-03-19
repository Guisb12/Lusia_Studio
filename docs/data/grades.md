---
last-updated: 2026-03-19
stability: semi-stable
agent-routing: "Read when working on grades, enrollments, evaluation, or CFS data layer."
---

# Grades Domain Entities

The most complex domain — 8 tables forming a hierarchical grade calculation system. From top-level settings through subject enrollments, period grades, evaluation elements/domains, to annual grades, final grades with exams (CFD), and overall secondary scores (CFS).

**Ownership model:** Unlike most domains, grades tables scope via ownership chains rather than `organization_id`. The chain is: `profiles.id` → `student_grade_settings.student_id` → `student_subject_enrollments.settings_id` → downstream tables via `enrollment_id`.

---

## Table: `student_grade_settings`

**Purpose:** Top-level grade calculator configuration for one student in one academic year. Defines education level, grading regime (trimestral/semestral), and period weights.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `student_id` | uuid | Student this settings record belongs to | FK → profiles(id) ON DELETE CASCADE, NOT NULL |
| `academic_year` | text | Academic year (e.g., '2025/2026') | NOT NULL |
| `education_level` | text | Education level (e.g., 'secundário', 'básico') | NOT NULL |
| `graduation_cohort_year` | integer | Expected graduation year | |
| `regime` | text | Grading period regime | CHECK: 'trimestral', 'semestral' |
| `period_weights` | numeric(5,2)[] | Weight of each period in annual calculation | NOT NULL, array |
| `course` | text | Student's course track | Added in migration 008 |
| `is_locked` | boolean | Whether settings are frozen | NOT NULL, DEFAULT false |
| `created_at` | timestamptz | Creation timestamp | NOT NULL, DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | NOT NULL, DEFAULT now() |

**Unique constraint:** `(student_id, academic_year)` — one settings row per student per year.

### Indexes

```
Index: idx_sgs_student
Columns: (student_id)
Type: btree
Purpose: Serves: loading grade settings for a student
```

### Relationships

- Each settings row belongs to one student (`student_id` → `profiles.id`).
- Each settings row has many subject enrollments (`student_subject_enrollments.settings_id` → `student_grade_settings.id`).
- The `regime` determines how many periods exist (trimestral=3, semestral=2) and `period_weights` defines their relative importance in annual grade calculation.

### Access Patterns

**Service:** `grades_service.py`

- **Get by student + year:** `.eq("student_id", student_id).eq("academic_year", year).limit(1)`.
- **Create:** `.insert({student_id, academic_year, education_level, regime, period_weights, ...})`.
- **Update weights:** `.update({"period_weights": weights}).eq("id", settings_id)`.

### RLS Policies

- `sgs_select/insert/update/delete`: Student can manage own settings (`auth.uid() = student_id`).

---

## Table: `student_subject_enrollments`

**Purpose:** A student's enrollment in a specific subject for an academic year. Links settings to subjects and tracks exam candidacy and cumulative grade weights.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `student_id` | uuid | Enrolled student | FK → profiles(id) ON DELETE CASCADE, NOT NULL |
| `subject_id` | uuid | Enrolled subject | FK → subjects(id) ON DELETE CASCADE, NOT NULL |
| `academic_year` | text | Academic year | NOT NULL |
| `year_level` | text | Student's year level for this subject | NOT NULL |
| `settings_id` | uuid | Parent grade settings | FK → student_grade_settings(id) ON DELETE CASCADE, NOT NULL |
| `is_active` | boolean | Whether enrollment is active | NOT NULL, DEFAULT true |
| `is_exam_candidate` | boolean | Whether student is an exam candidate | NOT NULL, DEFAULT false |
| `cumulative_weights` | jsonb | Weight configuration for cumulative grade calculation | Added in migration 019 |
| `created_at` | timestamptz | Creation timestamp | NOT NULL, DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | NOT NULL, DEFAULT now() |

**Unique constraint:** `(student_id, subject_id, academic_year)` — one enrollment per subject per year.

### Indexes

```
Index: idx_sse_student_year
Columns: (student_id, academic_year)
Type: btree composite
Purpose: Serves: loading all enrollments for a student in a given year (the grade board view)

Index: idx_sse_settings
Columns: (settings_id)
Type: btree
Purpose: Serves: finding all enrollments under a specific settings record
```

### Relationships

- Each enrollment belongs to one student (`student_id` → `profiles.id`).
- Each enrollment references one subject (`subject_id` → `subjects.id`).
- Each enrollment is linked to one settings record (`settings_id` → `student_grade_settings.id`).
- Each enrollment has many period records (`student_subject_periods.enrollment_id`).
- Each enrollment has many evaluation domains (`subject_evaluation_domains.enrollment_id`).
- Each enrollment has at most one annual grade (`student_annual_subject_grades.enrollment_id`).
- The `is_exam_candidate` flag determines whether CFD (final grade with exam) is calculated for this enrollment.

### Access Patterns

**Service:** `grades_service.py`

```
SELECT constant:
ENROLLMENT_BOARD_SELECT =
    "id,student_id,subject_id,academic_year,year_level,
     settings_id,is_active,is_exam_candidate,cumulative_weights,
     created_at,updated_at,
     subjects(name,slug,color,icon,affects_cfs,has_national_exam)"
```

- **Grade board (all enrollments for student+year):** `.eq("student_id", student_id).eq("academic_year", year).order("created_at")` with nested subject join.
- **Get by ID:** `.eq("id", enrollment_id).limit(1)`.
- **Create:** `.insert({student_id, subject_id, academic_year, year_level, settings_id, ...})`.
- **Update exam candidacy:** `.update({"is_exam_candidate": flag}).eq("id", enrollment_id)`.
- **Update cumulative weights:** `.update({"cumulative_weights": weights}).eq("id", enrollment_id)`.

### RLS Policies

- `sse_select/insert/update/delete`: Student can manage own enrollments (`auth.uid() = student_id`).

---

## Table: `student_subject_periods`

**Purpose:** Grade record for one period (trimester or semester) within an enrollment. Stores calculated grades, teacher-assigned grades (pauta), and override information.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `enrollment_id` | uuid | Parent enrollment | FK → student_subject_enrollments(id) ON DELETE CASCADE, NOT NULL |
| `period_number` | smallint | Period index (1, 2, or 3) | NOT NULL |
| `raw_calculated` | numeric(6,4) | Weighted average of evaluation elements | |
| `calculated_grade` | smallint | Rounded calculated grade (1-20 or 1-5) | |
| `pauta_grade` | smallint | Teacher-assigned official grade | |
| `is_overridden` | boolean | Whether teacher overrode the calculated grade | NOT NULL, DEFAULT false |
| `override_reason` | text | Reason for grade override | |
| `qualitative_grade` | text | Qualitative descriptor (for non-numeric scales) | CHECK: 'Muito Insuficiente', 'Insuficiente', 'Suficiente', 'Bom', 'Muito Bom' |
| `is_locked` | boolean | Whether this period's grade is frozen | NOT NULL, DEFAULT false |
| `own_raw` | numeric(6,4) | Domain-weighted grade for this period alone (before cumulative blending) | Added in migration 019 |
| `own_grade` | smallint | ROUND_HALF_UP(own_raw) | Added in migration 019 |
| `cumulative_raw` | numeric(6,4) | Cumulative grade (blended with previous periods) | Added in migration 019 |
| `cumulative_grade` | smallint | ROUND_HALF_UP(cumulative_raw) | Added in migration 019 |
| `created_at` | timestamptz | Creation timestamp | NOT NULL, DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | NOT NULL, DEFAULT now() |

**Unique constraint:** `(enrollment_id, period_number)` — one period record per enrollment per period.

### Indexes

```
Index: idx_ssp_enrollment
Columns: (enrollment_id)
Type: btree
Purpose: Serves: loading all periods for an enrollment

Index: idx_periods_enrollment_number
Columns: (enrollment_id, period_number)
Type: btree composite
Purpose: Serves: direct lookup of a specific period for an enrollment
```

### Relationships

- Each period belongs to one enrollment (`enrollment_id` → `student_subject_enrollments.id`).
- Each period can have many evaluation elements (`subject_evaluation_elements.period_id` — legacy path).
- Period grades feed into the annual grade calculation (`student_annual_subject_grades`).
- The `own_*` vs `cumulative_*` columns (migration 019) support two calculation modes: period-only and cumulative across periods.

### Access Patterns

**Service:** `grades_service.py`

```
SELECT constant:
PERIOD_BOARD_SELECT =
    "id,enrollment_id,period_number,raw_calculated,
     calculated_grade,pauta_grade,is_overridden,
     override_reason,qualitative_grade,is_locked,
     own_raw,own_grade,cumulative_raw,cumulative_grade"
```

- **All periods for enrollment:** `.eq("enrollment_id", enrollment_id).order("period_number")`.
- **Batch for multiple enrollments:** `.in_("enrollment_id", enrollment_ids).order("period_number")`.
- **Update grade:** `.update({raw_calculated, calculated_grade, pauta_grade, ...}).eq("id", period_id)`.
- **Lock period:** `.update({"is_locked": True}).eq("id", period_id)`.

### RLS Policies

- `ssp_select/insert/update/delete`: Access via enrollment ownership chain (`enrollment_id IN (SELECT id FROM student_subject_enrollments WHERE student_id = auth.uid())`).

---

## Table: `subject_evaluation_domains`

**Purpose:** Evaluation domain categories within an enrollment (e.g., "Conhecimentos", "Capacidades", "Atitudes"). Each domain has per-period weights and contains evaluation elements.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `enrollment_id` | uuid | Parent enrollment | FK → student_subject_enrollments(id) ON DELETE CASCADE, NOT NULL |
| `domain_type` | text | Domain category identifier | NOT NULL |
| `label` | text | Display label | NOT NULL |
| `icon` | text | Display icon | |
| `period_weights` | numeric(5,2)[] | Weight of this domain per period | NOT NULL, array |
| `sort_order` | smallint | Display order | NOT NULL, DEFAULT 0 |
| `created_at` | timestamptz | Creation timestamp | NOT NULL, DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | NOT NULL, DEFAULT now() |

### Indexes

```
Index: idx_sed_enrollment
Columns: (enrollment_id)
Type: btree
Purpose: Serves: loading all domains for an enrollment
```

### Relationships

- Each domain belongs to one enrollment (`enrollment_id` → `student_subject_enrollments.id`).
- Each domain has many evaluation elements (`subject_evaluation_elements.domain_id` → `subject_evaluation_domains.id`).
- The `period_weights` array defines how much this domain contributes to the grade in each period (e.g., [30.00, 30.00, 30.00] for equal weight across 3 trimesters).

### Access Patterns

**Service:** `grades_service.py`

- **All domains for enrollment:** `.eq("enrollment_id", enrollment_id).order("sort_order")`.
- **Batch for multiple enrollments:** `.in_("enrollment_id", enrollment_ids).order("sort_order")`.
- **Create:** `.insert({enrollment_id, domain_type, label, period_weights, sort_order, ...})`.
- **Update weights:** `.update({"period_weights": weights}).eq("id", domain_id)`.
- **Delete:** `.delete().eq("id", domain_id)` — cascades to elements.

### RLS Policies

- `sed_select/insert/update/delete`: Access via enrollment ownership chain.

---

## Table: `subject_evaluation_elements`

**Purpose:** Individual grade entries (tests, projects, homework, participation) within a period or domain. Each element has a weight and a raw grade that contributes to period grade calculation.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `period_id` | uuid | Legacy: parent period | FK → student_subject_periods(id) ON DELETE CASCADE, nullable after migration 019 |
| `domain_id` | uuid | Parent evaluation domain | FK → subject_evaluation_domains(id) ON DELETE CASCADE, added in migration 019 |
| `period_number` | smallint | Period this element belongs to | Added in migration 019 |
| `element_type` | text | Type of evaluation | NOT NULL, CHECK: 'teste', 'trabalho', 'apresentacao_oral', 'atitudes_valores', 'outro' |
| `label` | text | Display label (e.g., 'Teste 1', 'Projeto Final') | NOT NULL |
| `icon` | text | Display icon | |
| `weight_percentage` | numeric(5,2) | Weight within domain+period (NULL = equal weight; set = custom, must sum to 100) | Nullable |
| `raw_grade` | numeric(6,4) | Grade achieved (scale depends on education level) | |
| `created_at` | timestamptz | Creation timestamp | NOT NULL, DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | NOT NULL, DEFAULT now() |

**Schema evolution:** Migration 019 introduced the domain-based evaluation model. Elements can now belong to a domain (`domain_id`) instead of directly to a period (`period_id`). The `period_id` FK was made nullable and `weight_percentage` was also made nullable to support the new model. Elements with a `domain_id` use `period_number` to indicate which period they belong to.

### Indexes

```
Index: idx_see_period
Columns: (period_id)
Type: btree
Purpose: Serves: loading elements for a period (legacy path)

Index: idx_see_domain
Columns: (domain_id)
Type: btree
Purpose: Serves: loading elements for a domain (new path)

Index: idx_see_domain_period
Columns: (domain_id, period_number)
Type: btree composite partial (WHERE domain_id IS NOT NULL)
Purpose: Serves: loading elements for a specific domain in a specific period
```

### Relationships

- Elements can belong to a period (`period_id` → `student_subject_periods.id`) — legacy path.
- Elements can belong to a domain (`domain_id` → `subject_evaluation_domains.id`) — new path (migration 019).
- Both paths coexist: elements with `domain_id` use the domain-based model; elements with only `period_id` use the legacy model.
- Element grades and weights feed into the period's `raw_calculated` grade.

### Access Patterns

**Service:** `grades_service.py`

- **By period (legacy):** `.eq("period_id", period_id).order("created_at")`.
- **By domain + period:** `.eq("domain_id", domain_id).eq("period_number", period_number).order("created_at")`.
- **Batch by domain IDs:** `.in_("domain_id", domain_ids)`.
- **Create:** `.insert({domain_id, period_number, element_type, label, weight_percentage, ...})`.
- **Update grade:** `.update({"raw_grade": grade}).eq("id", element_id)`.
- **Delete:** `.delete().eq("id", element_id)`.

### RLS Policies

- `see_select/insert/update/delete`: Two-path access check — via period ownership chain OR via domain ownership chain.

---

## Table: `student_annual_subject_grades`

**Purpose:** Annual grade summary for a subject enrollment — the weighted average of all period grades, rounded to the official scale.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `enrollment_id` | uuid | Parent enrollment | FK → student_subject_enrollments(id) ON DELETE CASCADE, NOT NULL |
| `raw_annual` | numeric(6,4) | Weighted raw annual grade (before rounding) | |
| `annual_grade` | smallint | Rounded annual grade (official scale) | NOT NULL |
| `is_locked` | boolean | Whether annual grade is frozen | NOT NULL, DEFAULT false |
| `created_at` | timestamptz | Creation timestamp | NOT NULL, DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | NOT NULL, DEFAULT now() |

**Unique constraint:** `(enrollment_id)` — one annual grade per enrollment.

### Indexes

```
Index: idx_sasg_enrollment
Columns: (enrollment_id)
Type: btree
Purpose: Serves: loading annual grade for an enrollment
```

### Relationships

- Each annual grade belongs to one enrollment (`enrollment_id` → `student_subject_enrollments.id`).
- The annual grade is calculated from period grades using `period_weights` from the settings.
- The annual grade becomes the CIF (Classificação Interna de Frequência) in the CFD calculation.

### Access Patterns

**Service:** `grades_service.py`

- **Get by enrollment:** `.eq("enrollment_id", enrollment_id).limit(1)`.
- **Batch by enrollments:** `.in_("enrollment_id", enrollment_ids)`.
- **Upsert:** Create or update based on enrollment_id uniqueness.
- **Lock:** `.update({"is_locked": True}).eq("id", grade_id)`.

### RLS Policies

- `sasg_select/insert/update/delete`: Access via enrollment ownership chain.

---

## Table: `student_subject_cfd`

**Purpose:** Final subject grade with national exam (CFD — Classificação Final de Disciplina). Combines the internal grade (CIF) with the exam score using the regulated formula.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `student_id` | uuid | Student | FK → profiles(id) ON DELETE CASCADE, NOT NULL |
| `subject_id` | uuid | Subject | FK → subjects(id) ON DELETE CASCADE, NOT NULL |
| `academic_year` | text | Academic year | NOT NULL |
| `cif_raw` | numeric(6,4) | Internal classification raw value | |
| `cif_grade` | smallint | Internal classification grade (CIF, 1-20) | NOT NULL |
| `exam_grade` | smallint | Exam score on 0-20 scale | |
| `exam_grade_raw` | smallint | Exam score on 0-200 scale (raw exam points) | Added in migration 009 |
| `exam_weight` | numeric(4,2) | Exam weight in CFD formula (e.g., 0.30) | |
| `cfd_raw` | numeric(6,4) | Final grade raw value before rounding | |
| `cfd_grade` | smallint | Final grade (CFD, 1-20) | NOT NULL |
| `is_finalized` | boolean | Whether CFD is frozen/official | NOT NULL, DEFAULT false |
| `created_at` | timestamptz | Creation timestamp | NOT NULL, DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | NOT NULL, DEFAULT now() |

**Unique constraint:** `(student_id, subject_id, academic_year)` — one CFD per subject per year.

### Indexes

```
Index: idx_scfd_student
Columns: (student_id)
Type: btree
Purpose: Serves: loading all CFDs for a student
```

### Relationships

- Each CFD record belongs to one student (`student_id` → `profiles.id`) and one subject (`subject_id` → `subjects.id`).
- The CIF comes from `student_annual_subject_grades.annual_grade` for the corresponding enrollment.
- Only subjects with `has_national_exam = true` have meaningful exam data.
- CFD values feed into the CFS snapshot calculation.

### Access Patterns

**Service:** `grades_service.py`

- **All CFDs for student + year:** `.eq("student_id", student_id).eq("academic_year", year)`.
- **Get specific CFD:** `.eq("student_id", student_id).eq("subject_id", subject_id).eq("academic_year", year).limit(1)`.
- **Upsert:** Create or update based on unique constraint.
- **Finalize:** `.update({"is_finalized": True}).eq("id", cfd_id)`.

### RLS Policies

- `scfd_select/insert/update/delete`: Student can manage own CFDs (`auth.uid() = student_id`).

---

## Table: `student_cfs_snapshot`

**Purpose:** CFS (Classificação Final do Secundário) — the overall secondary education score used for university admission (DGES). A snapshot of all CFDs combined using the official formula.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `student_id` | uuid | Student | FK → profiles(id) ON DELETE CASCADE, NOT NULL |
| `academic_year` | text | Academic year this snapshot represents | NOT NULL |
| `graduation_cohort_year` | integer | Expected graduation year | NOT NULL |
| `cfs_value` | numeric(3,1) | CFS score (0.0-200.0 scale, 1 decimal) | NOT NULL |
| `dges_value` | smallint | DGES score (integer, 0-200) | |
| `formula_used` | text | Calculation formula applied | CHECK: 'simple_mean', 'weighted_mean' |
| `cfd_snapshot` | jsonb | Frozen copy of all CFD data used in calculation | NOT NULL |
| `is_finalized` | boolean | Whether snapshot is official | NOT NULL, DEFAULT false |
| `created_at` | timestamptz | Creation timestamp | NOT NULL, DEFAULT now() |
| `updated_at` | timestamptz | Last update timestamp | NOT NULL, DEFAULT now() |

**Unique constraint:** `(student_id, academic_year)` — one CFS snapshot per year.

### Indexes

```
Index: idx_scs_student
Columns: (student_id)
Type: btree
Purpose: Serves: loading CFS snapshot for a student
```

### Relationships

- Each CFS snapshot belongs to one student (`student_id` → `profiles.id`).
- The `cfd_snapshot` jsonb column stores a frozen copy of all CFD values at calculation time — decoupling the snapshot from future CFD changes.
- Only subjects where `affects_cfs = true` (on the subject record) contribute to the CFS calculation.

### Access Patterns

**Service:** `grades_service.py`

- **Get by student + year:** `.eq("student_id", student_id).eq("academic_year", year).limit(1)`.
- **Create/update:** Upsert based on unique constraint. Stores the `cfd_snapshot` with current CFD values.
- **Finalize:** `.update({"is_finalized": True}).eq("id", snapshot_id)`.

### RLS Policies

- `scs_select/insert/update/delete`: Student can manage own CFS snapshots (`auth.uid() = student_id`).

---

## Domain Relationships Summary

The grades domain forms a deep hierarchy: **settings** → **enrollments** → **periods** → **elements**, with **domains** providing a cross-period grouping of elements, and **annual grades** → **CFD** → **CFS** providing the bottom-up grade rollup. The calculation flow is: evaluation elements (individual tests/projects) are weighted within periods or domains to produce period grades, period grades are weighted by `period_weights` to produce annual grades, annual grades become CIF, CIF combines with exam scores to produce CFD, and all CFDs roll up into the CFS university admission score. Two evaluation models coexist (migration 019): the legacy period-based model (`elements.period_id`) and the newer domain-based model (`elements.domain_id`). Access control uses RLS policies based on ownership chains rather than `organization_id` — every RLS policy traces back to `student_id = auth.uid()`.
