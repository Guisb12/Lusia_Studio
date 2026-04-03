---
status: in-progress
created: 2026-04-02
updated: 2026-04-02
priority: p0
planned-by: codex
---

## Goal

Migrate the student grades feature from the Next.js frontend into the React Native mobile app with behavioral parity and feature parity, while allowing mobile-native UI changes. Delivery must happen in gated phases, and each phase must end with a bounded, testable checkpoint before the next phase begins.

## User Intent

The user wants:

1. The existing web grades feature to remain the source of truth for behavior
2. The mobile migration to preserve all business logic, validations, cache behavior, and edge-case handling
3. `Casa` to show only a compact grades summary for the latest meaningful period/semester, plus quick edit actions and navigation into a dedicated grades page
4. A dedicated mobile grades page to eventually support the full feature set
5. Configuration-heavy flows to use sheets instead of web-style dialogs/popovers
6. The migration to proceed in phases with explicit implementation scope, user-test checklist, and acceptance criteria per phase

## Confirmed Product Decisions

### Scope and Parity

- Behavioral parity with web is required
- Feature parity with web is required
- Visual parity is not required
- Mobile-native interaction patterns are allowed as long as the underlying behavior remains equivalent

### Navigation Model

- `Casa` shows a summary only
- The full grades feature lives on a dedicated mobile grades page
- `Casa` includes a navigation action into the dedicated grades page

### Casa Summary Rules

- `Casa` should show only the latest period or semester with actual data
- "Latest with data" means the latest configured period where at least one active subject has `pauta_grade`, `calculated_grade`, or `cumulative_grade`
- If no periods have data, fallback is the final configured period
- `Casa` should support quick edit entry points

### Full Mobile Grades Scope

The dedicated mobile grades page must eventually include:

- current-year board
- year navigation parity
- subject detail flows
- period grade editing
- annual grade editing
- exam candidate toggles
- exam grade input
- subject configuration
- past-year setup
- domain setup and domain editing
- cumulative weights
- cross-subject copy of structure
- settings changes for regime and scale

### UI Policy

- config-heavy flows use sheets
- quick interactions may remain inline or lightweight if behavior matches web
- mobile should not blindly reproduce dense web modal/popover UI

### Lock Rules

- Locked years remain visible
- Locked years follow the same write restrictions as web
- Mobile must not expose editing where web blocks editing
- Backend enforcement remains authoritative even if UI gating misses something

### Copy Rules

- Copy-to-subjects copies structure and cumulative weights
- Grades are never copied

## Source of Truth

### Web Feature Source

- `LUSIA Studio - Frontend/components/grades/GradesPage.tsx`
- `LUSIA Studio - Frontend/components/grades/SubjectDetailSheet.tsx`
- `LUSIA Studio - Frontend/components/grades/UnifiedGradesConfigDialog.tsx`
- `LUSIA Studio - Frontend/components/grades/EvaluationCriteria.tsx`
- `LUSIA Studio - Frontend/components/grades/DomainSetupFlow.tsx`
- `LUSIA Studio - Frontend/components/grades/DomainConfigView.tsx`
- `LUSIA Studio - Frontend/components/grades/GradeBoard.tsx`
- `LUSIA Studio - Frontend/components/grades/SubjectCard.tsx`
- `LUSIA Studio - Frontend/lib/grades.ts`
- `LUSIA Studio - Frontend/lib/queries/grades.ts`
- `LUSIA Studio - Frontend/lib/grades/calculations.ts`
- `LUSIA Studio - Frontend/lib/grades/exam-config.ts`

### Backend Source

- `LUSIA Studio - Backend/app/api/http/services/grades_service.py`
- `LUSIA Studio - Backend/app/api/http/schemas/grades.py`
- `LUSIA Studio - Backend/app/api/http/routers/grades.py`
- `LUSIA Studio - Backend/tests/test_grades_service.py`

### Mobile Target Surface

- `Mobile/components/views/CasaView.tsx`
- `Mobile/components/grades/GradeBoard.tsx`
- `Mobile/components/grades/SubjectDetailSheet.tsx`
- `Mobile/lib/grades.ts`
- `Mobile/lib/queries/grades.ts`
- `Mobile/app/profile.tsx`

## Key Technical Findings From Phase 0 Audit

1. The grade calculation core is already largely portable:
   - `Mobile/lib/grades/calculations.ts` matches the web version
   - `Mobile/lib/grades/exam-config.ts` matches the web version
   - `Mobile/lib/grades/curriculum-secundario.ts` matches the web version
2. The backend already encodes the highest-risk rules:
   - lock enforcement
   - reset vs conversion rules when settings change
   - cumulative recalculation rules
   - annual grade derivation
   - domain validation
   - exam-grade behavior
   - virtual CFD behavior
3. Mobile already has partial board/detail rendering, but the current mobile implementation is mostly read-only and not feature-complete
4. The migration risk is concentrated in:
   - interaction parity
   - cache patching and rollback
   - optimistic mutation behavior
   - complex sheet flows replacing web dialogs/popovers

## Behavior That Must Be Preserved

### Data and Calculation Rules

- All grade calculations must remain aligned with the web and backend logic
- Validation ranges must remain identical to the existing feature:
  - exam score 0-200 where applicable
  - básico final exam percentage 0-100 where applicable
  - annual grade and pauta ranges according to education level and scale
  - cumulative weight matrices must preserve backend validation rules
- CIF, CFD, CFS, annual grade, cumulative grade, and domain-weighted period math must stay equivalent

### Optimistic and Cache Rules

- The mobile client must preserve the current grades query-key model
- Mutations that are optimistic on web should remain optimistic on mobile
- Snapshot-and-restore rollback behavior must remain available
- Patch-in-place behavior must stay aligned with the existing web cache contract

### Loading and Progressive Detail Rules

- Board endpoints remain summary endpoints
- Full period elements load on demand
- Full domain structures load on demand
- Prefetching remains valuable for common transitions where mobile UX benefits from it

### Editing Rules

- Direct grade mode, flat criteria mode, and domain mode must all be supported
- Domain mode must preserve local live calculation before commit
- Blur-to-save behavior for domain element grade commits must remain intact unless explicitly changed later
- Copy-to-other-periods and copy-to-other-subjects behaviors must remain constrained exactly as they are now

### Historical and Lock Rules

- Past years remain visible
- Locked years remain visible
- Writable past-year behavior must match web and backend exactly

## Phase Delivery Model

Every phase must include:

1. defined implementation scope
2. bounded files/components likely affected
3. technical verification by executor
4. explicit user-test checklist
5. acceptance criteria
6. go/no-go approval before the next phase

No phase proceeds automatically.

## Phase Plan

### Phase 0: Migration Contract and Parity Checklist

#### Goal

Freeze the migration contract before implementation.

#### Scope

- document source-of-truth behavior
- document confirmed product decisions
- define phase gates
- define the parity checklist that later phases must satisfy

#### User Test

- read and approve the contract
- confirm that the phase breakdown matches the desired rollout model

#### Acceptance Criteria

- this task file is approved as the working migration contract
- no remaining ambiguity exists about:
  - parity target
  - navigation target
  - Casa behavior
  - lock behavior
  - config UI policy
  - copy rules

### Phase 1: Dedicated Mobile Grades Route and Read-Only Foundation

#### Goal

Introduce a dedicated mobile grades page and restructure `Casa` into a summary surface.

#### Scope

- add a dedicated grades route in mobile
- wire year navigation behavior
- port read-only board rendering
- port read-only subject opening flow
- update `Casa` to latest-period summary + nav button + quick edit entry points scaffold

#### User Test

- open `Casa`
- confirm only the latest meaningful period/semester is summarized
- open the full grades page from `Casa`
- navigate between years
- open subject details
- confirm locked years remain visible

#### Acceptance Criteria

- route exists and loads stable data
- summary logic in `Casa` matches the agreed fallback rules
- year navigation works
- no unintended write flows are exposed yet

### Phase 2: Core Mutation Parity

#### Goal

Port the main grade mutation flows.

#### Scope

- period grade editing
- annual grade editing
- exam candidate toggles
- exam input flows
- quick edit flows from `Casa`
- optimistic patching and rollback parity

#### User Test

- edit a period grade
- edit an annual grade
- toggle exam candidacy
- enter exam data
- verify immediate UI reaction and persisted backend state
- verify invalid inputs are blocked

#### Acceptance Criteria

- all mutations align with backend rules
- optimistic updates and rollback behavior work
- quick edit flows are usable
- locked-year gating is correct

#### Status

- implementation plan documented in `docs/tasks/grades-mobile-migration-phase-2.md`
- currently in progress

### Phase 3: Criteria and Domain System Parity

#### Goal

Port the dense criteria/domain workflows.

#### Scope

- flat criteria editing
- domain setup flow
- domain config editing
- cumulative weight editing
- local live calculation behavior
- copy structure to other subjects

#### User Test

- create/edit flat criteria
- create domains
- edit domain weights and elements
- configure cumulative weights
- copy structure to another subject
- verify grades are not copied

#### Acceptance Criteria

- domain calculations match web behavior
- cumulative behavior matches backend rules
- copy flow preserves structure-only semantics
- validation and save timing are correct

#### Status

- implementation plan documented in `docs/tasks/grades-mobile-migration-phase-3.md`
- currently in progress

### Phase 4: Settings, Subject Management, and Historical Flows

#### Goal

Port configuration and historical setup flows.

#### Scope

- subject management sheets
- settings changes for regime and grade scale
- reset confirmation flow
- past-year setup
- add/remove/reactivate subject flows

#### User Test

- add subjects
- reactivate or remove eligible subjects
- attempt blocked removals
- change regime/scale in safe and destructive scenarios
- set up historical years

#### Acceptance Criteria

- conversion vs reset behavior matches backend
- blocked removals behave like web
- historical flows behave correctly

#### Status

- implementation plan documented in `docs/tasks/grades-mobile-migration-phase-4.md`
- currently in progress

### Phase 5: Casa Polish and Full Regression Gate

#### Goal

Finalize `Casa`, performance, and parity validation.

#### Scope

- polish summary UX in `Casa`
- finalize quick edit entry points
- tune loading and sheet UX
- run full parity regression against the migration checklist

#### User Test

- use `Casa` as the entry surface
- jump into the grades page
- perform common edits
- re-open app and verify persistence
- validate current year, past years, exams, domains, settings, and copy flows

#### Acceptance Criteria

- no known parity gaps remain in migrated scope
- `Casa` is intentionally compact
- dedicated grades page is feature-complete for the intended mobile scope

## Suggested Subagent Strategy

Subagents are optional and should only be used for bounded work within a phase.

Recommended usage:

- Phase 1:
  - optional worker for dedicated route scaffolding
  - optional worker for `Casa` summary extraction
- Phase 2:
  - one worker for exam flows
  - one worker for annual/period edit flows
- Phase 3:
  - one worker for criteria/domain UI
  - one worker for query/cache mutation parity
- Phase 4:
  - one worker for settings/subject-management sheets
  - one worker for historical setup flows
- Phase 5:
  - explorer/reviewer worker for parity verification

The main thread remains authoritative for:

- migration decisions
- parity interpretation
- phase gates
- final integration

## Phase 0 Parity Checklist

The following checklist must be used as the migration baseline.

### Casa Summary Checklist

- [ ] `Casa` shows only the latest meaningful period/semester
- [ ] fallback is the final configured period when no data exists
- [ ] `Casa` includes navigation into the dedicated grades page
- [ ] `Casa` supports quick edit entry points

### Dedicated Grades Page Checklist

- [ ] full-board reading experience exists on mobile
- [ ] year navigation mirrors web behavior
- [ ] subject detail access exists
- [ ] locked and historical years remain viewable

### Core Mutation Checklist

- [ ] period grade edits
- [ ] annual grade edits where allowed
- [ ] exam candidate toggles
- [ ] exam score input
- [ ] optimistic patching
- [ ] rollback on failure

### Criteria and Domain Checklist

- [ ] flat criteria editing
- [ ] domain setup
- [ ] domain config
- [ ] cumulative weights
- [ ] live local calculations
- [ ] blur-to-save where required
- [ ] copy structure to other subjects without grades

### Config and Historical Checklist

- [ ] subject management
- [ ] add/reactivate/remove subject flows
- [ ] past-year setup
- [ ] regime changes
- [ ] scale changes
- [ ] destructive reset confirmation behavior

### Lock and Access Checklist

- [ ] locked years visible
- [ ] locked years match web write restrictions
- [ ] blocked edits are clearly reflected in UI
- [ ] backend remains authoritative

### Validation Checklist

- [ ] exam 0-200 validation
- [ ] básico final exam 0-100 validation
- [ ] pauta and annual-grade validation
- [ ] cumulative weight matrix validation
- [ ] settings validation for scale/regime changes

### Regression Checklist

- [ ] current-year behavior matches web
- [ ] historical-year behavior matches web
- [ ] CFS/CFD/CIF behavior matches web and backend
- [ ] no grades are copied in structure-copy flows

## Next Step

After approval of this task file:

1. begin Phase 1
2. write a phase-specific implementation plan before changing code
3. implement only the Phase 1 scope
4. stop for user testing and approval
