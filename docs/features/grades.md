---
last-updated: 2026-03-19
stability: frequently-updated
agent-routing: "Read before working on grades feature code."
---

# Grades

## 1. Overview

The grades feature ("Calculadora de Médias") is a student-facing grade tracking and GPA computation system for the Portuguese education system. Students use it to configure their academic subjects, enter period grades (directly or via weighted evaluation elements), track annual grades across subjects, manage national exam entries, and compute their final secondary school GPA (CFS/Média do Secundário).

The feature supports three grading models that reflect the Portuguese system:

- **CFS (Classificação Final do Secundário)** — the secondary school GPA, computed as a weighted or simple mean of all CFD values across 10th–12th grade. Truncated to one decimal (never rounded up). Used for university admission (DGES score = CFS × 10).
- **CFD (Classificação Final de Disciplina)** — per-subject final grade, blending the internal classification (CIF) with the national exam score when applicable: `CFD = CIF × (100 - examWeight)% + CE × examWeight%`. For subjects without exams, CFD equals CIF.
- **CIF (Classificação Interna Final)** — multi-year simple average of annual grades for a subject (e.g., a trienal subject uses the average of 10th, 11th, and 12th year annual grades).

The feature also supports Básico (1º, 2º, 3º ciclo) education levels with 1–5 scale grading and qualitative grades for 1º ciclo, and Básico 3º ciclo "Provas Finais" (9th grade exams) with percentage-to-level conversion.

**Two evaluation modes** exist per subject:

- **Legacy flat elements** — evaluation elements (tests, projects, etc.) are assigned directly to a period with explicit weight percentages summing to 100%.
- **Domain-based evaluation** — elements are grouped into evaluation domains (e.g., "Testes 80%", "Apresentações 20%") with per-period weight vectors, enabling cumulative cross-period blending via a configurable weight matrix.

**Key interactions:** Students configure subjects during a setup wizard, enter period grades (directly or via element scores that auto-calculate), edit annual grades for past years, toggle national exam candidacy per subject, enter exam scores, and view the CFS dashboard. There is no teacher-side grades UI — this is entirely student-owned.

## 2. Availability

| Attribute | Value |
|---|---|
| **Roles** | Student (full CRUD — this is a student-only feature). Teachers and admins do NOT access this feature directly; teacher-side grade viewing is via the members/students feature. |
| **Center types** | All (trial included) |
| **Student route** | `/student/grades` (main board), `/student/grades/cfs` (CFS dashboard) |
| **Teacher route** | None (teacher views student grades via `/dashboard/students` member detail) |

**Auth enforcement:** All backend endpoints use `require_student` dependency — only authenticated students can access their own grade data.

## 3. Architecture

### 3.1 Route — `app/(student)/student/grades/page.tsx`

Server component. Computes the current academic year via `getCurrentAcademicYear()` (September boundary), then parallel-fetches `fetchGradeSettingsServer(academicYear)` and `fetchGradeBoardServer(academicYear)`. Passes both as `initialSettings` and `initialBoardData` to `GradesEntryPage`.

**Key behavior:** Two server fetches in parallel — settings (tiny payload, fast) and board data (heavier). Settings arriving first enables progressive rendering via `GradesShell`.

### 3.2 CFS Route — `app/(student)/student/grades/cfs/page.tsx`

Minimal route rendering `CFSDashboard` with `initialData={null}`. CFS data is loaded client-side via `useCFSDashboardQuery()`. The CFS dashboard is typically prefetched before navigation via `prefetchCFSDashboardQuery()` on hover/focus of the "Média secundário" link.

### 3.3 Server Fetch — `lib/grades.server.ts`

Three server-side fetch functions, all following the same pattern: create Supabase server client, extract access token from session, call the FastAPI backend directly (bypassing Next API routes), return typed data with null fallback.

- `fetchGradeSettingsServer(academicYear)` → `GET /api/v1/grades/settings/{year}`
- `fetchGradeBoardServer(academicYear)` → `GET /api/v1/grades/board/{year}`
- `fetchCFSDashboardServer()` → `GET /api/v1/grades/cfs`

### 3.4 Entry Page — `components/grades/GradesEntryPage.tsx`

Client component (`"use client"`). Orchestrates progressive loading and routing between three states:

1. **Settings null + queries done** → `SetupWizard` (first-time configuration)
2. **Board data not ready** → `GradesShell` (skeleton with period tabs from settings)
3. **Board data ready** → `GradesPage` (full interactive board)

Uses `useSessionStorageQuerySeed()` to persist board data across client-side navigation — the board query data is saved to sessionStorage and restored on re-mount, avoiding redundant fetches.

### 3.5 Feature Shell — `components/grades/GradesShell.tsx`

Lightweight shell rendering the page header ("Médias"), academic year subtitle, and period tabs derived from `settings.period_weights`. Content area shows `GradesBoardSkeleton` (animated placeholder cards). Falls back to `GradesPageSkeleton` when settings are not yet available.

### 3.6 Main Page — `components/grades/GradesPage.tsx`

Client component. The primary orchestration layer — owns all grade data flow, mutations, and view state.

**State managed:**
- `activeYearIdx` / `activeYearTab` — for secundário multi-year navigation (10º, 11º, 12º)
- `currentBoardView` — `"period-1" | "period-2" | "period-3" | "exams"` tab selection
- `selectedPeriod` — triggers `SubjectDetailSheet` opening
- `annualGradeEdit` — triggers `AnnualGradeInput` dialog
- `examInput` — triggers `ExamGradeInput` dialog
- `configDialogOpen` — triggers `UnifiedGradesConfigDialog`

**Query orchestration:**
- `useGradeBoardQuery(activeAcademicYear, initialData)` — main board data
- `useCFSDashboardQueryWithOptions(undefined, { enabled: shouldLoadCfs })` — CFS data loaded lazily only when exams tab, exam input, annual grade edit, or config dialog is active
- `cfdBySubjectYear` memoized map for fast CFD lookups

**Mutations exposed:**
- `handleExamToggle(subject, checked)` — toggle exam candidacy on enrollment
- `handleExamSave(subject, payload)` — save exam grade (raw score + weight), with separate paths for Básico (percentage→level) and Secundário (0-200 raw)
- `handleAnnualGradeSave(grade)` — save annual grade for past years
- `handleConfigDialogSaved()` — refetch board + CFS after configuration changes

**Prefetch behavior:**
- Adjacent year boards prefetched on year popover open (`prefetchGradeBoardQuery`)
- Subject detail sheet, annual grade input, exam grade input module-preloaded via `requestIdleCallback` after paint
- Subject catalog prefetched in idle time
- Per-subject element and domain data prefetched on card hover or click (`prefetchPeriodElementsQuery`, `prefetchDomainsQuery`)
- CFS dashboard prefetched on "Média secundário" link hover

### 3.7 UI Components

**Component tree:**

```
GradesEntryPage
├── SetupWizard (first-time setup)
├── GradesShell (progressive loading skeleton)
└── GradesPage
    ├── PeriodColumn → SubjectCard (per-period subject list)
    ├── ExamsNationalView (exam tab — toggle + grade display)
    ├── HistoricalAnnualList (locked past-year view)
    ├── SubjectDetailSheet (lazy: dynamic import)
    │   ├── EvaluationCriteria (element editor)
    │   ├── DomainConfigView / DomainSetupFlow (domain editor)
    │   ├── ExamSection / BasicoExamSection (exam grade entry)
    │   ├── GradeSummaryBar (period summary)
    │   ├── GradeOverrideDialog
    │   └── DirectGradeInput
    ├── AnnualGradeInput (lazy: dynamic import)
    ├── ExamGradeInput (lazy: dynamic import)
    └── UnifiedGradesConfigDialog (lazy: dynamic import)
        ├── SecundarioSubjectWizard
        └── subject/enrollment management
```

**Lazy-loaded components:**
- `SubjectDetailSheet` — loaded via `dynamic()` in `GradesPage.tsx`
- `AnnualGradeInput` — loaded via `dynamic()` in `GradesPage.tsx`
- `ExamGradeInput` — loaded via `dynamic()` in `GradesPage.tsx`
- `UnifiedGradesConfigDialog` — loaded via `dynamic()` in `GradesPage.tsx`

**CFSDashboard** (`components/grades/CFSDashboard.tsx`): Standalone page at `/student/grades/cfs` showing the CFS/DGES summary, CFD table for all subjects across years, with inline exam grade editing and annual grade editing. Uses `useCFSDashboardQuery()`.

**CFSTable** (`components/grades/CFSTable.tsx`): Renders the subject-by-subject CFS breakdown table with CIF, exam, CFD columns and clickable grade cells for editing.

### 3.8 Next.js API Routes

20 route files under `app/api/grades/`, all thin auth proxies using `proxyAuthedJson()`:

| Route | Method | Backend Path |
|---|---|---|
| `board/[year]/route.ts` | GET | `/api/v1/grades/board/{year}` |
| `settings/[year]/route.ts` | GET | `/api/v1/grades/settings/{year}` |
| `settings/route.ts` | POST | `/api/v1/grades/settings` |
| `settings/[year]/lock/route.ts` | PATCH | `/api/v1/grades/settings/{id}/lock` |
| `enrollments/route.ts` | POST | `/api/v1/grades/enrollments` |
| `enrollments/[id]/route.ts` | PATCH | `/api/v1/grades/enrollments/{id}` |
| `enrollments/[id]/domains/route.ts` | GET, PUT | `/api/v1/grades/enrollments/{id}/domains` |
| `enrollments/[id]/cumulative-weights/route.ts` | PATCH | `/api/v1/grades/enrollments/{id}/cumulative-weights` |
| `enrollments/[id]/copy-domains/route.ts` | POST | `/api/v1/grades/enrollments/{id}/copy-domains` |
| `periods/[id]/route.ts` | PATCH | `/api/v1/grades/periods/{id}` |
| `periods/[id]/override/route.ts` | PATCH | `/api/v1/grades/periods/{id}/override` |
| `periods/[id]/elements/route.ts` | GET, PUT | `/api/v1/grades/periods/{id}/elements` |
| `periods/[id]/copy-elements/route.ts` | POST | `/api/v1/grades/periods/{id}/copy-elements` |
| `elements/[id]/route.ts` | PATCH | `/api/v1/grades/elements/{id}` |
| `annual-grade/route.ts` | PATCH | `/api/v1/grades/annual-grade` |
| `past-year/route.ts` | POST | `/api/v1/grades/past-year` |
| `cfs/route.ts` | GET | `/api/v1/grades/cfs` |
| `cfs/snapshot/route.ts` | POST | `/api/v1/grades/cfs/snapshot` |
| `cfd/[id]/exam/route.ts` | PATCH | `/api/v1/grades/cfd/{id}/exam` |
| `cfd/[id]/basico-exam/route.ts` | PATCH | `/api/v1/grades/cfd/{id}/basico-exam` |

All routes use `proxyAuthedJson()` — a shared utility that extracts the access token, forwards to the backend, and returns the response transparently.

### 3.9 Backend Router — `routers/grades.py`

All endpoints use `require_student` dependency. The router is organized into five groups:

| Group | Endpoints | Delegates to |
|---|---|---|
| **Settings** | `GET /settings/{year}`, `POST /settings`, `POST /setup-past-year`, `PATCH /settings/{id}/lock` | `get_settings()`, `create_settings()`, `setup_past_year()`, `lock_settings()` |
| **Enrollments** | `GET /enrollments`, `POST /enrollments`, `PATCH /enrollments/{id}` | `list_enrollments()`, `create_enrollment()`, `update_enrollment()` |
| **Board** | `GET /board/{year}` | `get_board_data()` |
| **Periods** | `PATCH /periods/{id}`, `PATCH /periods/{id}/override`, `GET /periods/{id}/elements`, `PUT /periods/{id}/elements`, `PATCH /elements/{id}`, `POST /periods/{id}/copy-elements` | `update_period_grade()`, `override_period_grade()`, `get_elements()`, `replace_elements()`, `update_element_grade()`, `copy_elements_to_other_periods()` |
| **Domains** | `GET /enrollments/{id}/domains`, `PUT /enrollments/{id}/domains`, `PATCH /enrollments/{id}/cumulative-weights`, `POST /enrollments/{id}/copy-domains` | `get_domains()`, `replace_domains()`, `update_cumulative_weights()`, `copy_domains_to_subjects()` |
| **Annual / CFS** | `GET /annual/{year}`, `PATCH /annual-grade`, `GET /cfs`, `PATCH /cfd/{id}/exam`, `PATCH /cfd/{id}/basico-exam`, `POST /cfs/snapshot` | `get_annual_grades()`, `update_annual_grade()`, `get_cfs_dashboard()`, `update_exam_grade()`, `update_basico_exam_grade()`, `create_cfs_snapshot()` |

### 3.10 Backend Service — `services/grades_service.py`

**SELECT constants:**

```
ENROLLMENT_BOARD_SELECT:
  id, student_id, subject_id, academic_year, year_level, settings_id,
  is_active, is_exam_candidate, cumulative_weights, created_at, updated_at,
  subjects(name, slug, color, icon, affects_cfs, has_national_exam)

PERIOD_BOARD_SELECT:
  id, enrollment_id, period_number, raw_calculated, calculated_grade,
  pauta_grade, is_overridden, override_reason, qualitative_grade, is_locked,
  own_raw, own_grade, cumulative_raw, cumulative_grade
```

**Progressive loading pattern:** The board endpoint (`get_board_data()`) returns summary data only — enrollments with subject joins, period summaries (no elements), annual grades, and domain presence flags. Full element and domain data are loaded on demand via dedicated endpoints (`GET /periods/{id}/elements`, `GET /enrollments/{id}/domains`). This replaces the traditional summary/detail split with per-entity detail endpoints, appropriate for the nested data structure.

**`_batch_hydrate_board_summaries(db, enrollments, settings)`:**
Follows the calendar batch hydration pattern. Collects all enrollment IDs, then performs batch queries:
1. Periods — all period rows for all enrollments in one query (`PERIOD_BOARD_SELECT`)
2. Element presence — lightweight query checking which periods have elements (just `period_id`, not full rows)
3. Annual grades — all annual grade rows for all enrollments in one query
4. Domain presence — lightweight check for which enrollments have domains

Assembles the results into `BoardSubject[]` with `{ enrollment, periods, annual_grade, has_domains }`.

**Key business logic:**

- **Period grade calculation (`recalculate_period_grade`):** Two paths — legacy flat elements (weighted sum) and domain-based (per-domain weighted average × domain weight). Both produce `raw_calculated` and `calculated_grade`. When not overridden, `pauta_grade` is set to `calculated_grade` automatically.
- **Cumulative cascade (`_recalculate_cumulative_cascade`):** When `cumulative_weights` is set on an enrollment, computes cumulative grades for each period using the weight matrix: P1 = own, P2 = cw[1][0]% × P1_cumul + cw[1][1]% × P2_own, etc. Updates `cumulative_raw`, `cumulative_grade`, and cascades to annual grade.
- **Annual grade recalculation (`_try_recalculate_annual`):** Annual grade = last period's pauta grade (or last cumulative grade in cumulative mode). Manual pauta overrides take precedence over calculated values.
- **CIF computation (`_compute_cif`):** Simple average of annual grades across years for a subject. Uses `Decimal` for precision.
- **CFD computation (`_compute_cfd`):** Blends CIF with exam score: `CFD = CIF × (100 - examWeight)% + (examGradeRaw/10) × examWeight%`. Exam scores are stored on the 0–200 scale to avoid premature rounding.
- **CFS computation:** Server-side computed during `get_cfs_dashboard()`. Also computed client-side in `calculateCFS()` for optimistic updates.

**Ownership verification:** The service enforces student ownership at every mutation via `_verify_period_ownership()`, `_verify_element_ownership()`, and `_assert_enrollment_writable()`. Elements can be owned via `period_id` (legacy) or `domain_id` (domain-based) chains.

### 3.11 Backend Schemas — `schemas/grades.py`

Request schemas: `GradeSettingsCreateIn`, `PeriodGradeUpdateIn`, `PeriodGradeOverrideIn`, `EvaluationElementIn`, `EvaluationElementsReplaceIn`, `ElementGradeUpdateIn`, `EnrollmentCreateIn`, `EnrollmentUpdateIn`, `AnnualGradeUpdateIn`, `PastYearSetupIn`, `ExamGradeUpdateIn`, `BasicoExamGradeUpdateIn`, `CFSSnapshotCreateIn`, `EvaluationDomainIn`, `DomainsReplaceIn`, `CumulativeWeightsUpdateIn`, `CopyDomainsIn`.

Response schemas: `GradeSettingsOut`, `SubjectEnrollmentOut`, `EvaluationElementOut`, `SubjectPeriodOut`, `AnnualGradeOut`, `EvaluationDomainOut`, `BoardSubjectOut`, `GradeBoardOut`, `SubjectCFDOut`, `CFSSnapshotOut`, `CFSDashboardOut`.

Mutation response schemas (return entity + cascade results): `PeriodMutationOut` (period + annual_grade), `ElementsReplaceOut` (elements + period + annual_grade), `ElementMutationOut` (element + period + annual_grade), `EnrollmentMutationOut` (enrollment + cfd + computed_cfs + computed_dges), `AnnualGradeMutationOut` (annual_grade + cfd + computed_cfs + computed_dges), `ExamGradeMutationOut` (cfd + computed_cfs + computed_dges).

## 4. Cache Contract

| Attribute | Value |
|---|---|
| **Board namespace** | `grades:board:` |
| **Settings namespace** | `grades:settings:` |
| **CFS key** | `grades:cfs` (single key, no params) |
| **Period elements namespace** | `grades:period-elements:` |
| **Domains namespace** | `grades:domains:` |
| **Board staleTime** | 60,000ms (1 minute) |
| **Settings staleTime** | 300,000ms (5 minutes) |
| **CFS staleTime** | 60,000ms (1 minute) |
| **Elements staleTime** | 300,000ms (5 minutes) |
| **Domains staleTime** | 300,000ms (5 minutes) |

**Key builders:**

- `buildGradesBoardKey(academicYear)` → `grades:board:{academicYear}`
- `buildGradesSettingsKey(academicYear)` → `grades:settings:{academicYear}`
- `buildGradesPeriodElementsKey(periodId)` → `grades:period-elements:{periodId}`
- `buildGradesDomainsKey(enrollmentId)` → `grades:domains:{enrollmentId}`
- CFS uses a fixed key: `grades:cfs`

**Invalidation:**

| Trigger | What is invalidated |
|---|---|
| `invalidateGradesQueries()` | All `grades:board:*`, all `grades:settings:*`, and `grades:cfs` |
| Optimistic failure | `restoreGradesQueries(snapshots)` restores snapshotted keys |
| Config dialog save | `boardQuery.refetch()` + `cfsQuery.refetch()` |

**Mutation sync (in-place patching):**

The grades feature uses **in-place cache patching** instead of the calendar's sync-across-queries pattern. This is because grades has a different data shape — a single board object per academic year rather than arrays of items across overlapping key ranges.

Key patch functions:
- `patchBoardQueries(updater)` — updates ALL board queries matching the prefix
- `patchBoardPeriod(periodId, updater)` — updates a specific period within any board query, triggers annual grade recalculation
- `patchBoardPeriodElements(periodId, updater)` — updates elements within a period
- `patchBoardEnrollment(enrollmentId, updater)` — updates enrollment fields
- `patchBoardAnnualGrade(subjectId, academicYear, grade)` — updates annual grade in a specific year's board
- `patchBoardDomains(enrollmentId, domains)` — updates domain data
- `patchBoardSubjectPeriods(enrollmentId, periods, annualGrade)` — updates periods and annual grade together
- `patchCFSDashboard(updater)` — updates the CFS query data directly
- `patchCFDSummary(cfd, summary)` — updates a specific CFD within the CFS dashboard and sets computed_cfs/computed_dges
- `setPeriodElementsQueryData(periodId, data)` — directly sets element query data
- `setDomainsQueryData(enrollmentId, data)` — directly sets domain query data

**Prefetch behavior:**

| What | When | Mechanism |
|---|---|---|
| Adjacent year board | Year popover opened | `prefetchGradeBoardQuery(tab.academicYear)` |
| Subject catalog | Idle callback after paint | `prefetchSubjectCatalogQuery()` |
| Period elements | Card click or hover (first 4 on idle after mount) | `prefetchPeriodElementsQuery(periodId)` |
| Evaluation domains | Card click or hover | `prefetchDomainsQuery(enrollmentId)` |
| CFS dashboard | "Média secundário" link hover/focus | `prefetchCFSDashboardQuery()` |
| Heavy dialog modules | `requestIdleCallback` after paint | `loadSubjectDetailSheet()`, `loadAnnualGradeInput()`, `loadExamGradeInput()` |

**Session storage seed:**

`GradesEntryPage` uses `useSessionStorageQuerySeed()` with key `grades:board:{academicYear}` (version 1) to persist board data across client-side navigation. This avoids refetching on back-navigation.

**Snapshot/restore:**

`snapshotGradesQueries(matcher)` captures all cache entries matching the matcher. Uses `structuredClone` (or JSON fallback) for deep cloning. `restoreGradesQueries(snapshots)` writes each snapshot back via `queryClient.setQueryData()`.

## 5. Optimistic Update Strategy

Grades mutations follow a **snapshot → patch → API call → sync real data / restore** pattern, but with a key difference from calendar: grades uses **targeted cache patching** rather than full sync-across-queries, because each mutation affects a known subset of the cache.

### Period Grade Update (Direct)

1. `snapshotGradesQueries()` on affected board + CFS keys
2. `patchBoardPeriod(periodId, updater)` — updates period in board cache, auto-recalculates annual
3. `PATCH /api/grades/periods/{id}`
4. **Success:** `patchBoardPeriod()` with server response (period + annual_grade)
5. **Failure:** `restoreGradesQueries(snapshots)` + error toast

### Element Grade Update

1. Snapshot affected board + element queries
2. `setPeriodElementsQueryData()` with optimistic element update
3. `patchBoardPeriod()` with recalculated grade
4. `PATCH /api/grades/elements/{id}`
5. **Success:** sync server response (element + period + annual_grade)
6. **Failure:** restore snapshots

### Exam Toggle (Enrollment Update)

1. `snapshotGradesQueries()` on board + CFS keys
2. `patchBoardEnrollment()` with `is_exam_candidate` toggle
3. `patchCFSDashboard()` with updated CFD
4. `PATCH /api/grades/enrollments/{id}`
5. **Success:** `patchBoardEnrollment()` + `patchCFDSummary()` with server data
6. **Failure:** `restoreGradesQueries(snapshots)` + error toast

### Exam Grade Save

1. Snapshot CFS key
2. Compute optimistic CFD using client-side `calculateCFD()` or `calculateBasicoCFD()`
3. `patchCFSDashboard()` with optimistic CFD (includes recomputed CFS via `calculateCFS()`)
4. `PATCH /api/grades/cfd/{id}/exam` or `PATCH /api/grades/cfd/{id}/basico-exam`
5. **Success:** `patchCFDSummary()` with server-confirmed CFD + CFS values
6. **Failure:** restore snapshots + error toast

### Annual Grade Save

1. Snapshot board + CFS keys
2. `patchBoardAnnualGrade()` in the relevant year's board
3. `patchCFSDashboard()` updating the annual_grades array in the matching CFD
4. `PATCH /api/grades/annual-grade`
5. **Success:** `patchBoardAnnualGradeByEnrollment()` + `patchCFDSummary()` with server data
6. **Failure:** restore snapshots + error toast

## 6. Payload Shapes

Grades does not follow the traditional summary/detail SELECT split. Instead, it uses a **progressive loading** approach:

**Board payload** (via `GET /board/{year}`):
- `settings` — full `GradeSettings` object (id, student_id, academic_year, education_level, graduation_cohort_year, regime, course, period_weights, is_locked)
- `subjects[]` — each with:
  - `enrollment` — full enrollment with hydrated subject fields (subject_name, subject_slug, subject_color, subject_icon, affects_cfs, has_national_exam, cumulative_weights)
  - `periods[]` — summary only: id, enrollment_id, period_number, raw_calculated, calculated_grade, pauta_grade, is_overridden, override_reason, qualitative_grade, is_locked, own_raw, own_grade, cumulative_raw, cumulative_grade, has_elements (boolean flag)
  - `annual_grade` — id, enrollment_id, raw_annual, annual_grade, is_locked (or null)
  - `has_domains` — boolean flag (domains loaded on demand)

**Detail data loaded on demand:**
- `GET /periods/{id}/elements` → `EvaluationElement[]` (full element rows)
- `GET /enrollments/{id}/domains` → `EvaluationDomain[]` (full domain + nested element rows)

**CFS dashboard payload** (via `GET /cfs`):
- `settings` — latest grade settings
- `cfds[]` — per-subject CFD with hydrated fields: subject_name, subject_slug, affects_cfs, has_national_exam, is_exam_candidate, duration_years, annual_grades array
- `snapshot` — finalized CFS snapshot (if exists)
- `computed_cfs` — live-computed CFS value
- `computed_dges` — CFS × 10 for university admission

## 7. Database

### Tables Involved

| Table | Description |
|---|---|
| `student_grade_settings` | Per-student per-year configuration: education level, regime (trimestral/semestral), period weights, graduation cohort year, course, lock status. UNIQUE(student_id, academic_year). |
| `student_subject_enrollments` | Links a student to a subject for a specific academic year. Tracks year level, active status, exam candidacy, cumulative weights. UNIQUE(student_id, subject_id, academic_year). |
| `student_subject_periods` | Per-enrollment per-period grade record. Stores raw_calculated, calculated_grade, pauta_grade, override state, qualitative grade, domain-based own/cumulative grades. UNIQUE(enrollment_id, period_number). |
| `subject_evaluation_elements` | Individual evaluation items (tests, projects, etc.). Can be linked via `period_id` (legacy) or `domain_id` + `period_number` (domain-based). Stores element_type, label, weight_percentage, raw_grade. |
| `subject_evaluation_domains` | Evaluation domain categories per enrollment (e.g., "Testes", "Apresentações"). Stores per-period weight vector, sort order. |
| `student_annual_subject_grades` | Annual grade (CAF) per enrollment. Stores raw_annual and rounded annual_grade. UNIQUE(enrollment_id). |
| `student_subject_cfd` | Per-subject final classification blending CIF + exam. Stores cif_raw, cif_grade, exam_grade, exam_grade_raw (0-200), exam_weight, cfd_raw, cfd_grade. UNIQUE(student_id, subject_id, academic_year). |
| `student_cfs_snapshot` | Finalized CFS snapshot with cfs_value (truncated 1 decimal), dges_value, formula_used, cfd_snapshot (JSONB). UNIQUE(student_id, academic_year). |
| `subjects` | Subject catalog — queried for name, slug, color, icon, affects_cfs, has_national_exam during enrollment hydration. |

Cross-reference: See `data/grades.md` for full entity schemas, column definitions, and index details.

### Indexes

| Index | Table | Columns | Serves |
|---|---|---|---|
| `idx_sgs_student` | `student_grade_settings` | `(student_id)` | Settings lookup by student |
| `idx_sse_student_year` | `student_subject_enrollments` | `(student_id, academic_year)` | Enrollment list by student + year (board query) |
| `idx_sse_settings` | `student_subject_enrollments` | `(settings_id)` | Enrollment lookup by settings (cascade operations) |
| `idx_ssp_enrollment` | `student_subject_periods` | `(enrollment_id)` | Period list by enrollment (board hydration) |
| `idx_periods_enrollment_number` | `student_subject_periods` | `(enrollment_id, period_number)` | Period lookup by enrollment + number (grade recalculation) |
| `idx_see_period` | `subject_evaluation_elements` | `(period_id)` | Element list by period (legacy path) |
| `idx_see_domain` | `subject_evaluation_elements` | `(domain_id)` | Element list by domain |
| `idx_see_domain_period` | `subject_evaluation_elements` | `(domain_id, period_number)` WHERE `domain_id IS NOT NULL` | Domain + period element lookup (domain-based grade recalculation) |
| `idx_sed_enrollment` | `subject_evaluation_domains` | `(enrollment_id)` | Domain list by enrollment |
| `idx_sasg_enrollment` | `student_annual_subject_grades` | `(enrollment_id)` | Annual grade by enrollment |
| `idx_scfd_student` | `student_subject_cfd` | `(student_id)` | CFD list by student (CFS dashboard) |
| `idx_scs_student` | `student_cfs_snapshot` | `(student_id)` | CFS snapshot by student |

### Read Patterns

| Pattern | Index Used | Query Shape |
|---|---|---|
| Settings by student + year | PK UNIQUE constraint | `.eq("student_id", sid).eq("academic_year", year)` |
| Enrollments for board | `idx_sse_student_year` | `.eq("student_id", sid).eq("academic_year", year)` with subject join |
| All periods for enrollments | `idx_ssp_enrollment` | `.in_("enrollment_id", ids)` |
| Element presence check | `idx_see_period` | `.select("period_id").in_("period_id", ids)` |
| Domain presence check | `idx_sed_enrollment` | `.select("enrollment_id").in_("enrollment_id", ids)` |
| Elements for a period | `idx_see_period` | `.eq("period_id", pid)` |
| Domain elements for recalculation | `idx_see_domain_period` | `.eq("domain_id", did).eq("period_number", pn)` |
| Annual grades for enrollments | `idx_sasg_enrollment` | `.in_("enrollment_id", ids)` |
| All CFDs for student | `idx_scfd_student` | `.eq("student_id", sid)` |

## 8. Edge Cases and Notes

### Decimal Precision

Grade calculations use `Decimal.js` on the client and Python's `decimal.Decimal` on the server to avoid floating-point errors at critical thresholds. Both sides use `ROUND_HALF_UP` for integer rounding (e.g., 9.5 → 10) and `ROUND_DOWN` for CFS truncation (e.g., 14.68 → 14.6). The `Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP })` configuration ensures consistent behavior across all calculations.

### Exam Score Precision

National exam scores are stored on the 0–200 scale (`exam_grade_raw`) to preserve precision. The division to 0–20 scale (`CE = exam_grade_raw / 10`) happens during CFD computation, not at storage time. This avoids the lossy `145 → 15 → 150` roundtrip that would occur if only the 0–20 value were stored. Migration `009_exam_grade_raw.sql` added this column and backfilled existing data.

### Básico vs Secundário Exam Differences

- **Básico 3º Ciclo (9th grade):** Provas Finais use percentage scores (0–100) converted to levels (1–5) via `convertExamPercentageToLevel()`. Default exam weight is 30%. CFD uses the 1–5 scale.
- **Secundário (10th–12th):** National exams use 0–200 raw scores. Default exam weight is 25% (post-2023 cohorts per Decreto-Lei 62/2023). CFD uses the 0–20 scale.

### CFS Formula Variants

Two formulas exist:
- **Simple mean** (legacy, pre-2026 cohorts): CFS = average of all eligible CFDs
- **Weighted mean** (2026+ cohorts): CFS = weighted average where each CFD is weighted by subject duration_years (trienal=3, bienal=2, anual=1)

The `WEIGHTED_CFS_START_COHORT = 2026` constant and `usesWeightedCfsFormula(cohortYear)` function control this. CFS is always truncated to 1 decimal (never rounded up).

### Multi-Year Subject Tracking

Secundário students in 11th or 12th grade need annual grades from previous years for CIF computation. The setup wizard allows entering past-year grades, which creates locked settings + enrollments + annual grades for those years. The `GradesPage` renders year tabs (10º, 11º, 12º) with per-year board data, prefetching adjacent years on popover open.

### Domain-Based vs Legacy Evaluation

Both modes coexist. The service detects which mode an enrollment uses by checking for `subject_evaluation_domains` rows. Domain-based evaluation computes per-domain averages (weighted or equal-weight), then blends them using domain period_weights. The cumulative cascade then blends across periods. Legacy mode simply uses flat element-to-period weighted sums.

### Cumulative Weights

When `cumulative_weights` is set on an enrollment (e.g., `[[100],[40,60],[25,30,45]]`), period grades are blended across periods. P1 = 100% own, P2 = 40% P1_cumul + 60% P2_own, P3 = 25% P1_cumul + 30% P2_cumul + 45% P3_own. This produces a `cumulative_grade` that becomes the visible period grade and drives the annual grade.

### Mandatory Exam Candidates

Português at 12th grade is always an exam candidate (`is_exam_candidate = true`) — the `_resolve_exam_candidate()` function enforces this, overriding user toggle. This matches Portuguese law requiring the Português national exam.

### Virtual CFD IDs

For subjects without a stored CFD row (not yet finalized), the CFS dashboard generates virtual CFD records client-side using the `_VIRTUAL_CFD_PREFIX` pattern (`virtual-cfd--{subject_id}--{academic_year}`). These are constructed from annual grades and enrollment data without a DB row.

### Session Storage Persistence

`GradesEntryPage` uses `useSessionStorageQuerySeed()` to persist the board query data. This means navigating away from `/student/grades` and returning restores data instantly from sessionStorage before a potential refetch, providing fast perceived load times.

## 9. Reference Status

Grades diverges from the calendar reference pattern in several ways due to its fundamentally different data model and user context:

| Pattern | Calendar Approach | Grades Approach | Rationale |
|---|---|---|---|
| **Data shape** | Array of items across overlapping date-range keys | Single object per academic year key | Grades has one board per year, not overlapping ranges |
| **Detail data** | Summary/detail SELECT split with batch hydration | Progressive loading with on-demand detail endpoints | Deeply nested data (enrollments → periods → elements/domains) makes separate detail endpoints cleaner than a single heavy payload |
| **Cache sync** | `syncAcrossQueries()` for cross-key updates | `patchBoardQueries()` with targeted updaters | No overlapping keys to sync across — each year is independent |
| **Mutation responses** | Server returns full entity, synced into all relevant keys | Server returns entity + cascade results (period + annual_grade, or CFD + CFS) | Mutations cascade across the computation graph; responses include all affected values |
| **Optimistic computation** | Simple field update | Client-side grade recalculation (`calculateCFD`, `calculateCFS`, etc.) | Grades must show optimistic computed results, not just field changes |
| **Feature shell** | `CalendarShell` owns all orchestration | `GradesPage` owns orchestration; `GradesEntryPage` handles progressive loading | Progressive loading (settings → skeleton → full page) is more complex |
| **Server fetch** | Direct backend call via `fetchBackendJsonServer()` | Direct backend call via custom fetch with Supabase token extraction | Same pattern, different utility function |
| **Batch hydration** | `_batch_hydrate_summaries()` + `_batch_hydrate_details()` | `_batch_hydrate_board_summaries()` only (detail via dedicated endpoints) | Valid alternative per STANDARDS.md when nested data is complex |
| **Role filtering** | Multi-role (admin/teacher/student) | Student-only | All data scoped to `student_id` — no role-based filtering needed |

**What it follows:** Thin API routes, server-side initial data, lazy-loaded dialogs, `requestIdleCallback` prefetch, snapshot/restore optimistic pattern, Decimal precision matching between client and server, batch queries in hydration (O(entity types) not O(items)), explicit cache key builders, feature query module structure.

**What it doesn't follow:** Summary/detail SELECT pair (uses progressive loading instead), `_batch_hydrate_details()` (uses per-entity detail endpoints), multi-key sync functions (uses targeted patching), date-range-based key encoding (uses academic year).
