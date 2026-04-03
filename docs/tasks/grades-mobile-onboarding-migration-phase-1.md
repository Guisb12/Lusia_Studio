---
status: planned
created: 2026-04-03
updated: 2026-04-03
priority: p0
planned-by: codex
---

## Goal

Build the mobile onboarding shell for the grades feature, with the same step logic structure as web but without yet porting the full setup behavior.

This phase exists to create a stable mobile container before we start wiring real onboarding mutations and validations.

## Relationship to the Main Onboarding Contract

- Parent task: `docs/tasks/grades-mobile-onboarding-migration.md`
- Phase O0 must be accepted before implementation is treated as valid
- Current-year setup parity remains out of scope for this phase

## Source of Truth

### Web

- `LUSIA Studio - Frontend/components/grades/SetupWizard.tsx`

### Mobile Target

- `Mobile/app`
- `Mobile/components`
- `Mobile/lib`

## Product Rules Locked For Phase O1

### Shell behavior

- Mobile onboarding must have a dedicated entry surface
- The shell must support forward and backward navigation
- The shell must preserve draft state while navigating between steps
- Step order must follow the same logical-step model as web, even if step content is still placeholder

### Step coverage for the shell

The shell must be able to represent these logical steps:

- `grade_year`
- `course`
- `scale`
- `regime`
- `subjects`
- `past_grades`

### Out of scope for this phase

- real subject selection
- real exam toggles
- real historical-grade inputs
- final submit behavior
- API mutations

## In Scope

### 1. Route and entry foundation

- add a dedicated mobile onboarding route or screen entry for grades setup
- wire a safe temporary entry point from the existing grades experience if needed

### 2. Step shell

- render progress header
- render step title/description
- render placeholder content per logical step
- support next/back navigation

### 3. Draft state shape

- create mobile state shape aligned with web onboarding:
  - selected grade level
  - course
  - grade scale
  - regime
  - current-year selected subject IDs
  - current-year exam candidate IDs
  - per-past-year state

### 4. Conditional step resolution

- implement the logical-step resolver
- ensure step count and labels change correctly with the current draft/user profile assumptions

## Explicitly Out of Scope

- final design polish
- API integration
- persistence across app restarts
- post-completion redirect

## Likely Files Affected

- `Mobile/app`
- `Mobile/components`
- `Mobile/lib`
- `docs/tasks/grades-mobile-onboarding-migration.md`

## Implementation Plan

### Step 1: Choose the mobile onboarding entry surface

- inspect the current mobile grades entry path
- add a dedicated route/screen for onboarding
- keep the entry simple and reversible

### Step 2: Port step resolution logic

- mirror the web logical-step model
- compute visible steps from draft state and any available user profile data

### Step 3: Build the shell UI

- add progress header
- add step metadata
- add placeholder step bodies
- add navigation controls

### Step 4: Validate state continuity

- move across steps
- go backwards
- confirm draft state survives navigation

## Manual User Test Script

### A. Route access

- [ ] Open the mobile onboarding route
- [ ] Confirm the onboarding shell renders without crashing

### B. Step logic

- [ ] Confirm the visible steps change when the draft grade level changes between non-secundário and secundário assumptions
- [ ] Confirm `past_grades` only appears for grades above `10.º`

### C. Navigation

- [ ] Move forward through the shell
- [ ] Move backward through the shell
- [ ] Confirm draft values remain intact while navigating

### D. Stability

- [ ] Confirm the shell handles missing user-profile grade level cleanly
- [ ] Confirm no accidental submit or mutation occurs in this phase

## Acceptance Criteria

- a mobile onboarding shell exists
- the shell mirrors the logical-step structure of web
- draft state survives navigation within the flow
- there are no real setup mutations yet
- this phase ends in a stable, testable foundation for Phase O2

## Rollback Boundary

If this phase causes instability, rollback should be limited to the onboarding route/shell files only. No grades mutation or setup logic should need to be undone because this phase introduces none.
