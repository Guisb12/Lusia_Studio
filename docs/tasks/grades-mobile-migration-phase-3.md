---
status: in-progress
created: 2026-04-02
updated: 2026-04-02
priority: p0
planned-by: codex
---

## Goal

Port the domain-based grading workflow from web to mobile with the same calculation semantics, override precedence, cumulative behavior, and structure-copy rules.

This phase is explicitly based on the clarified product model:

- direct mode still exists for subjects without criteria
- the only real criteria workflow to create/edit on mobile is the domain model
- cumulative behavior is the default expectation for criteria-based subjects
- the user-entered `Nota da pauta` remains the official source of truth

## Relationship to the Main Migration Contract

- Parent task: `docs/tasks/grades-mobile-migration.md`
- Phase 2 must already be accepted before this phase is treated as valid
- Phase 4 settings/subject-management flows remain out of scope

## Product Model Locked Before Implementation

### Official grade semantics

- `Nota da pauta` is the official visible grade
- auto-calculated values remain visible for context
- the user may override the official grade
- when overridden, the official grade wins over automatic calculation

### Domain calculation semantics

For each active period:

1. elements inside each domain produce that domain's period result
2. domains are combined using `domain.period_weights[period]`
3. this produces `Nota própria`
4. cumulative weights recursively combine previous cumulative results with the current own result
5. this produces `Nota acumulada`
6. the displayed official result is the cumulative result unless overridden by `Nota da pauta`

### Scope decisions

- flat legacy elements may remain readable if old data exists
- but mobile setup/configuration work in this phase targets domains only
- `nota anual` should not appear as a main grades-flow concept
- preferred wording:
  - `Nota da pauta`
  - `Nota calculada`
  - `Nota própria`
  - `Nota acumulada`

### Locked-year rule

- no domain editing
- no evaluation-element editing
- only the final visible grade remains editable

## Phase 3 Scope

### In Scope

#### 1. Domain setup flow

- create a mobile flow for first-time criteria setup
- choose domain types
- define element counts by period
- define per-period domain weights
- define cumulative-weight behavior
- persist via existing domains + cumulative APIs

#### 2. Domain editing flow

- edit domain labels
- edit element labels
- edit per-period domain weights
- add/remove domains
- add/remove elements per period
- preserve web-style deferred save behavior

#### 3. Domain element grading

- edit domain element grades inline
- preserve live recalculation before commit
- commit on blur/end-edit exactly like web semantics
- patch board data optimistically

#### 4. Override flow for criteria-based subjects

- expose `Nota da pauta` override from domain view
- preserve calculated values in UI
- preserve official-grade precedence when overridden

#### 5. Copy structure to other subjects

- copy domains
- copy domain weights
- copy cumulative weights
- never copy grades
- never copy raw values

#### 6. Locked-year criteria behavior

- domain structure remains visible
- element/domain editing is blocked
- only final visible grade override remains available

### Explicitly Out of Scope

- subject management
- settings/regime/scale changes
- past-year setup flows
- full historical setup workflows
- non-domain criteria creation as a first-class path

## Likely Files Affected

- `Mobile/components/grades/SubjectDetailSheet.tsx`
- `Mobile/components/grades/DomainCriteria.tsx`
- `Mobile/components/grades/GradeEditModals.tsx`
- `Mobile/app/grades.tsx`
- `docs/tasks/grades-mobile-migration.md`

## Implementation Plan

### Step 1: Shared mobile domain UI components

- add mobile domain setup flow
- add mobile domain config view
- add copy-to-subjects modal
- add override modal for official-grade editing

### Step 2: Subject sheet view-mode parity

- add subject-sheet modes for:
  - direct
  - flat legacy read-only fallback
  - domains
  - setup
  - config
- expose config/setup entry points only where allowed

### Step 3: Domain calculation parity

- port live own-grade and cumulative-grade preview logic
- preserve override precedence
- preserve exact `Nota própria` / `Nota acumulada` semantics

### Step 4: Domain mutation flows

- blur-to-save domain element grades
- deferred-save structure edits
- cumulative-weight updates
- override updates

### Step 5: Structure copy

- copy domain structure and cumulative weights to selected subjects
- preserve no-grades rule

## Manual User Test Script

### A. First-time setup

- [ ] Open a direct subject with no criteria
- [ ] Start the domain setup flow
- [ ] Configure domain types, counts, weights, and cumulative weights
- [ ] Confirm the subject switches into domain mode

### B. Live domain calculations

- [ ] Enter grades into domain elements
- [ ] Confirm `Nota própria` reacts immediately
- [ ] Confirm `Nota acumulada` reacts immediately
- [ ] Confirm the official `Nota da pauta` reflects calculation unless overridden

### C. Override semantics

- [ ] Override the official grade
- [ ] Confirm the calculated values remain visible
- [ ] Confirm the override becomes the official displayed grade

### D. Domain config

- [ ] Rename a domain element
- [ ] Add/remove domain elements
- [ ] Add/remove domains
- [ ] Change per-period domain weights
- [ ] Change cumulative weights
- [ ] Confirm structure persists after closing and reopening

### E. Copy structure

- [ ] Copy structure to another subject
- [ ] Confirm domains/weights/cumulative weights are copied
- [ ] Confirm grades are not copied

### F. Locked-year behavior

- [ ] Open a locked criteria-based year
- [ ] Confirm domain structure is visible
- [ ] Confirm element/domain editing is blocked
- [ ] Confirm final visible grade override remains possible

## Acceptance Criteria

- domain setup works end-to-end
- domain editing works end-to-end
- live own/cumulative calculation matches web semantics
- override precedence works correctly
- copy-to-subjects preserves structure-only behavior
- locked-year criteria behavior matches the clarified product rule
