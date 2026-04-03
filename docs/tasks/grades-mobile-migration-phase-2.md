---
status: in-progress
created: 2026-04-02
updated: 2026-04-02
priority: p0
planned-by: codex
---

## Goal

Port the main mutation flows needed for daily mobile use of grades without dragging the Phase 3 structure-editing work into this checkpoint.

This phase is intentionally limited to:

- direct period-grade editing
- annual-grade editing
- exam candidate toggles
- exam-grade input
- optimistic cache patching and rollback
- a minimal Casa quick-edit entry path

## Relationship to the Main Migration Contract

- Parent task: `docs/tasks/grades-mobile-migration.md`
- Phase 1 must already be accepted before this phase is treated as valid
- flat-element and domain editing remain out of scope here

## Source Context

### Mobile files to read before implementation

- `Mobile/app/grades.tsx`
- `Mobile/components/casa/CasaGradesHeroCard.tsx`
- `Mobile/components/grades/GradeBoard.tsx`
- `Mobile/components/grades/SubjectDetailSheet.tsx`
- `Mobile/lib/grades.ts`
- `Mobile/lib/queries/grades.ts`
- `Mobile/lib/grades/calculations.ts`
- `Mobile/lib/grades/exam-config.ts`

### Web reference files for behavior

- `LUSIA Studio - Frontend/components/grades/GradesPage.tsx`
- `LUSIA Studio - Frontend/components/grades/SubjectDetailSheet.tsx`
- `LUSIA Studio - Frontend/components/grades/DirectGradeInput.tsx`
- `LUSIA Studio - Frontend/components/grades/AnnualGradeInput.tsx`
- `LUSIA Studio - Frontend/components/grades/ExamGradeInput.tsx`
- `LUSIA Studio - Frontend/components/grades/BasicoExamGradeInput.tsx`

## Phase 2 Scope

### In Scope

#### 1. Direct period-grade editing

- support direct-grade editing for subjects without criteria or domains
- preserve the same validation ranges as web using the existing scale helpers
- apply optimistic board patches before the server round-trip
- restore snapshots on failure

#### 2. Annual-grade editing

- expose annual-grade editing from mobile
- patch board and CFS data optimistically
- merge authoritative mutation responses back into the cache

#### 3. Exam candidate toggles

- allow toggling exam-candidate status where web allows it
- patch board and CFS data optimistically
- block toggle paths in locked contexts

#### 4. Exam-grade input

- support secundário exam input on the 0-200 scale
- support básico final-exam input on the 0-100 scale
- preserve conversion previews
- preserve exam-weight editing where appropriate

#### 5. Minimal Casa quick-edit path

- add a lightweight quick-edit entry point from `Casa`
- deep-link into the dedicated grades page with period and subject targeting
- auto-open the targeted subject sheet on first load

#### 6. Exam tab usefulness

- replace placeholder exam-tab values with live CFS-backed data
- keep exam-tab cards tappable so they open the same subject sheet

### Explicitly Out of Scope

- flat element editing
- domain setup and domain editing
- cumulative weights editing
- copy-to-subject structure flows
- settings changes
- subject management
- past-year setup

## Locked-Year Behavior in This Phase

- locked years remain visible
- direct period editing is blocked
- exam-candidate toggles are blocked
- historical annual-grade and exam-grade entry should remain available only where current web behavior still exposes them

## Likely Files Affected

- `Mobile/app/grades.tsx`
- `Mobile/components/casa/CasaGradesHeroCard.tsx`
- `Mobile/components/grades/GradeBoard.tsx`
- `Mobile/components/grades/SubjectDetailSheet.tsx`
- `Mobile/components/grades/GradeEditModals.tsx`
- `docs/tasks/grades-mobile-migration.md`

## Implementation Plan

### Step 1: Deep-link and subject targeting

- add `subject` param handling in the dedicated grades route
- auto-open the requested subject once when entered from `Casa`
- preserve correct initial period selection

### Step 2: Direct-grade editing in subject detail

- add a native modal editor for direct grades
- reuse `getPautaGradeScale`
- patch the active period optimistically
- update annual-grade cache from the mutation result

### Step 3: Annual-grade editing in subject detail

- add a native modal editor for annual grade
- patch board and CFS data optimistically
- merge the authoritative mutation response back into the cache

### Step 4: Exam flows in subject detail

- add candidate-toggle UI
- add exam-grade modal UI for secundário and básico cases
- patch CFS data optimistically
- merge server response into the dashboard cache

### Step 5: Improve the board exam tab

- feed live exam summaries from the CFS dashboard
- keep exam-tab cards tappable

### Step 6: Add Casa quick edit

- compute a quick-edit target for the latest meaningful period
- deep-link into `/grades` with `period` and `subject`
- keep the existing full-page CTA intact

## Risks

### 1. Over-scoping the sheet

If flat/domain mutation controls leak into this phase, the checkpoint stops being testable. The sheet should only gain the mutation controls that belong to direct grades, annual grades, and exams.

### 2. Cache divergence between board and CFS

Annual-grade and exam flows update both views of the same data. If one cache path is missed, the UI will feel inconsistent even when the backend is correct.

### 3. Reopening loops from quick-edit params

If the dedicated grades route keeps re-reading the `subject` param after the user closes the sheet, the experience becomes unusable. The route must consume that initial targeting only once.

## Manual User Test Script

### A. Casa quick edit

- [ ] Open `Casa`
- [ ] Confirm the full grades CTA still opens the dedicated grades page
- [ ] Confirm there is now a quick-edit action for the latest meaningful period
- [ ] Use the quick-edit path and confirm the targeted subject opens directly

### B. Direct grade editing

- [ ] Open a direct-grade subject from the grades page
- [ ] Edit the period grade
- [ ] Confirm the UI updates immediately
- [ ] Confirm the value persists after closing and reopening the sheet
- [ ] Try an out-of-range value and confirm it is rejected

### C. Annual grade editing

- [ ] Open a subject with an annual grade
- [ ] Edit the annual grade
- [ ] Confirm the annual badge updates
- [ ] If the subject affects CFS, confirm dependent final data updates correctly

### D. Exam flows

- [ ] Open a subject with national exam capability
- [ ] Toggle exam-candidate status where allowed
- [ ] Enter an exam grade
- [ ] Confirm the conversion preview matches expectation
- [ ] Confirm the grade persists and appears in the exam tab

### E. Locked-year behavior

- [ ] Open a locked year
- [ ] Confirm direct period editing is blocked
- [ ] Confirm exam-candidate toggling is blocked
- [ ] Confirm history remains visible
- [ ] Confirm the flows that web still exposes historically remain available

## Acceptance Criteria

- direct-grade editing works end-to-end
- annual-grade editing works end-to-end
- exam-candidate toggles work end-to-end
- exam-grade input works end-to-end
- optimistic updates and rollback work for the new mutation paths
- Casa has a bounded quick-edit entry path
- no flat/domain mutation behavior is introduced yet
