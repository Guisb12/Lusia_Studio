---
status: in-progress
created: 2026-04-02
updated: 2026-04-02
priority: p0
planned-by: codex
---

## Goal

Establish the dedicated mobile grades route and reduce `Casa` to the agreed summary role, while keeping the phase read-only except for navigation and scaffolding needed for later quick-edit entry points.

This phase is intentionally limited. The outcome should be a stable, testable foundation that exposes the grades experience in the right places before any heavy mutation logic is ported.

## Relationship to the Main Migration Contract

- Parent task: `docs/tasks/grades-mobile-migration.md`
- This phase must not expand scope beyond the read-only foundation and summary restructuring defined below
- No phase-2 mutation logic should be implemented here

## Source Context

### Mobile files to read before implementation

- `Mobile/app/_layout.tsx`
- `Mobile/app/index.tsx`
- `Mobile/components/views/CasaView.tsx`
- `Mobile/components/casa/CasaHeroCard.tsx`
- `Mobile/components/casa/CasaGradesHeroCard.tsx`
- `Mobile/components/grades/GradeBoard.tsx`
- `Mobile/components/grades/SubjectDetailSheet.tsx`
- `Mobile/lib/grades.ts`
- `Mobile/lib/queries/grades.ts`

### Web reference files for behavior

- `LUSIA Studio - Frontend/components/grades/GradesPage.tsx`
- `LUSIA Studio - Frontend/components/grades/GradeBoard.tsx`
- `LUSIA Studio - Frontend/components/grades/SubjectDetailSheet.tsx`

## Current State

1. There is no dedicated mobile grades route yet
2. The grades board is currently embedded inside `Mobile/components/views/CasaView.tsx`
3. The grades hero card in `Casa` currently acts more like a general grades summary card than the agreed compact latest-period summary
4. The mobile grades board and subject detail exist, but they are still tied to `Casa` and are mostly read-only
5. The route stack currently includes `index`, `sign-in`, `profile`, `cfs`, `sessions`, `tasks`, and `artifact/[id]`

## Phase 1 Scope

### In Scope

#### 1. Dedicated grades route

- add a new mobile route for grades
- register it in the Expo router stack
- make it reachable from `Casa`
- the route should load the current academic year board by default

#### 2. Read-only grades page foundation

- reuse or adapt the existing mobile `GradeBoard`
- reuse or adapt the existing mobile `SubjectDetailSheet`
- support subject opening from the grades page
- support current-year display
- support year navigation scaffolding aligned with the migration contract:
  - current implementation in this phase may be read-only
  - year navigation must be structurally ready and testable if data exists

#### 3. Casa summary narrowing

- remove the full board from `Casa`
- keep `Casa` as a summary surface
- show only the latest meaningful period/semester summary
- keep a clear CTA into the dedicated grades page
- preserve existing `CFS`/hero context where still useful, but the summary must align with the new role

#### 4. Latest period detection

- implement a utility or local selector that determines the latest configured period where at least one active subject has:
  - `pauta_grade`
  - or `calculated_grade`
  - or `cumulative_grade`
- if no period has meaningful grade data, fallback to the final configured period

#### 5. Quick edit scaffolding only

- provide route structure or callback plumbing needed for future quick edits from `Casa`
- do not implement mutation behavior in this phase
- if needed, quick-edit UI in this phase may route into the dedicated grades page and open the relevant subject/period in read-only mode

### Explicitly Out of Scope

- period-grade editing
- annual-grade editing
- exam candidate toggles
- exam-grade input
- optimistic mutation flows
- rollback flows
- flat criteria editing
- domain setup/config
- cumulative weights editing
- settings changes
- subject management
- past-year setup
- copy-to-subject flows

Those belong to later phases and must not leak into Phase 1.

## Likely Files Affected

### Route layer

- `Mobile/app/_layout.tsx`
- `Mobile/app/grades.tsx` or `Mobile/app/grades/index.tsx` depending on the chosen route shape

### Casa integration

- `Mobile/components/views/CasaView.tsx`
- `Mobile/components/casa/CasaHeroCard.tsx`
- `Mobile/components/casa/CasaGradesHeroCard.tsx`

### Grades read-only surface

- `Mobile/components/grades/GradeBoard.tsx`
- `Mobile/components/grades/SubjectDetailSheet.tsx`

### Shared grades selectors/helpers

- `Mobile/lib/grades.ts`
- optionally a new helper file under `Mobile/lib/grades/` if the latest-period selector should be isolated

## Implementation Plan

### Step 1: Add the dedicated route shell

- create the dedicated grades route
- add it to the route stack in `Mobile/app/_layout.tsx`
- ensure navigation into the route works from `Casa`
- preserve modal/push behavior intentionally rather than inheriting it accidentally

### Step 2: Extract the current board usage out of `Casa`

- remove the full embedded `GradeBoard` section from `CasaView`
- keep the subject detail modal only if still needed temporarily during transition
- avoid leaving duplicated grades entry points that compete with the dedicated route

### Step 3: Build the read-only grades screen

- compose a page around:
  - board query
  - settings presence gating
  - no-settings state
  - no-subjects state
  - board rendering
  - subject detail opening
- preserve current data-loading patterns from the existing mobile grades query layer

### Step 4: Implement latest-period summary selection for `Casa`

- derive the latest meaningful period from current-year board data
- summarize only that period/semester in `Casa`
- if no period has data, summarize the final configured period
- use active subjects only

### Step 5: Add CTA and quick-edit scaffolding

- add CTA from `Casa` into the grades page
- add stable plumbing for future deep-link or subject/period targeting
- if useful, pass route params or local state for future quick-edit expansion

### Step 6: Locked-year and historical visibility foundation

- ensure the dedicated grades page is structurally ready to represent historical years
- Phase 1 can stay read-only, but the shape must not block later historical navigation
- no write controls should appear in locked-year contexts

## Design and Behavior Notes

### Casa behavior in this phase

`Casa` should answer:

- what is the student's current/latest grade state?
- how do they enter the full grades experience?

It should not act as the primary grades workspace anymore.

### Grades page behavior in this phase

The dedicated grades page should answer:

- what are my subjects and current grades?
- what year am I looking at?
- what does each subject detail currently look like?

It should not yet answer:

- how do I edit this?

That belongs to Phase 2.

## Risks

### 1. Duplicate information during transition

If the full board remains in `Casa` while the new page is added, the product direction becomes unclear. Phase 1 should avoid ending in that split state.

### 2. Summary drift

If latest-period detection is implemented ad hoc in `Casa`, later quick-edit logic may target the wrong period. The selector should be explicit and reusable.

### 3. Route shape churn

If we add a route that later needs to be renamed, follow-up work becomes noisy. Pick the final grades route shape now.

## Manual User Test Script

The user should test this exact checklist after implementation:

### A. Casa summary

- [ ] Open the app landing experience that renders `Casa`
- [ ] Confirm grades are no longer presented as a full board inside `Casa`
- [ ] Confirm `Casa` shows a compact grades summary only
- [ ] Confirm the summary reflects only the latest meaningful period/semester
- [ ] If no grades exist yet, confirm the fallback period is the final configured one

### B. Grades navigation

- [ ] Tap the grades CTA from `Casa`
- [ ] Confirm the dedicated grades page opens
- [ ] Confirm the page renders the board for the current academic year
- [ ] Confirm the no-settings and no-subjects states are sensible if applicable

### C. Subject detail

- [ ] Open a subject from the dedicated grades page
- [ ] Confirm subject detail opens correctly
- [ ] Confirm the detail surface is read-only in this phase
- [ ] Confirm there are no accidental edit controls yet

### D. Year structure

- [ ] If multi-year data exists, confirm year navigation is visible or structurally ready as intended
- [ ] Confirm current-year rendering is correct
- [ ] Confirm locked or historical years remain viewable if applicable

## Acceptance Criteria

- dedicated mobile grades route exists
- route is reachable from `Casa`
- `Casa` no longer shows the full embedded grades board
- `Casa` shows only the latest meaningful period/semester summary
- fallback to final configured period works when no data exists
- dedicated grades page renders board data read-only
- subject detail opens from the dedicated page
- no Phase 2 mutation behavior is introduced

## Executor Verification

Before handing this phase to the user for testing:

- verify route registration compiles
- verify the summary selector works against representative board states
- verify `Casa` no longer contains the full board section
- verify the grades page can load with:
  - settings present
  - settings absent
  - no active subjects
- verify subject detail still renders with the migrated entry path

## Rollback Boundary

If Phase 1 fails or feels wrong, rollback should only need to revert:

- new grades route introduction
- `Casa` summary restructuring
- any helper added for latest-period selection

No mutation logic should exist yet, which keeps rollback cheap.

## Next Step After Approval

If this plan is approved:

1. implement Phase 1 only
2. stop after implementation
3. provide the exact user test checklist again
4. wait for approval before Phase 2
