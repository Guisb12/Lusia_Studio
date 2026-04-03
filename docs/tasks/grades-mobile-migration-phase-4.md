---
status: in-progress
created: 2026-04-02
updated: 2026-04-02
priority: p0
planned-by: codex
---

## Goal

Port the remaining grades administration and historical flows from web to mobile with behavioral parity, using sheet-based mobile UI instead of the dense web dialog.

This phase covers the parts still missing after the board, direct editing, exam flows, and domain workflows:

- subject management
- settings changes for regime and scale
- reset-confirmation behavior
- past-year setup
- historical-year editing boundaries

## Relationship to the Main Migration Contract

- Parent task: `docs/tasks/grades-mobile-migration.md`
- Phase 3 must be accepted before this phase is treated as valid
- Phase 5 polish/regression remains out of scope

## Source of Truth

### Web

- `LUSIA Studio - Frontend/components/grades/UnifiedGradesConfigDialog.tsx`
- `LUSIA Studio - Frontend/components/grades/GradesPage.tsx`

### Backend

- `LUSIA Studio - Backend/app/api/http/services/grades_service.py`
- `LUSIA Studio - Backend/app/api/http/schemas/grades.py`
- `LUSIA Studio - Backend/app/api/http/routers/grades.py`

### Mobile Target

- `Mobile/app/grades.tsx`
- `Mobile/components/grades/GradeBoard.tsx`
- `Mobile/components/grades/SubjectDetailSheet.tsx`
- `Mobile/lib/grades.ts`
- `Mobile/lib/queries/grades.ts`

## Product Rules Locked For Phase 4

### Settings changes

- Current-year settings are editable only when the year is not locked
- Settings changes apply only to the current editable year
- Regime options are `trimestral` and `semestral`
- Scale editing is relevant for non-secundário flows
- If a settings change only converts between numeric-compatible scales, the backend converts existing data
- If a settings change affects regime or requires destructive scale reset, the backend demands confirmation before clearing data

### Reset-confirmation behavior

- Changing regime counts as destructive for the current year
- Changing scale is destructive when conversion is not safe
- When destructive reset is required and the year already has data, mobile must surface a confirmation step before retrying with `confirm_reset: true`
- The user must understand that grades, criteria, annual grades, and exams for that year will be cleared

### Subject management

- Subjects can be added to the current year
- In secundário, subject selection for `10.º` and `11.º` must stay synchronized like the web flow
- Inactive previous enrollments for the same year should be reactivated instead of recreated
- Subjects can be removed from the current year only if the backend allows it
- Web blocks removal when the subject already has edit data unless the year is historical/locked
- Historical years allow subject removal behavior that current unlocked years do not
- Exam-candidate selection belongs to the same management surface for subjects that actually support exams in that year

### Past-year setup

- If a past secondary year does not yet exist, mobile must be able to initialize it
- Past-year setup creates locked settings, enrollments, and optional final grades
- Past-year setup is year-specific
- Past-year setup must mirror the web flow where the user picks the subjects for that year

### Historical editing

- Historical years are visible
- Their settings remain locked
- Criteria/domain editing is not part of historical setup
- Historical years are edited through final visible grades only
- The backend allows annual-grade style upsert behavior for past years

## Explicit Web Behaviors To Preserve

### Subject-management parity

- Selection state is drafted before save
- Active subjects form the main selected list
- Inactive same-year enrollments appear as reactivatable options
- `10.º` and `11.º` subject-selection state is mirrored between synced year tabs
- Exam toggle applies only to compatible, non-mandatory exam subjects
- Removal must be blocked in current editable years when the subject already has data

### Settings parity

- Settings change detection is local and only saved when changed
- Mobile must respect the same destructive reset detection as web:
  - regime change
  - non-convertible scale change
- After successful save, board/settings queries must reflect the new server state

### Past-year parity

- Unconfigured past years should have a setup path
- Configured historical years should expose subject management and final-grade editing rules, not current-year criteria editing

## Phase 4 Scope

### In Scope

#### 1. Settings sheet for the dedicated grades route

- add a grades configuration entry point on mobile
- expose current-year regime editing
- expose scale editing where relevant
- detect destructive reset requirements
- implement reset confirmation and retry

#### 2. Subject management sheet

- show selected active subjects
- show add-more catalog sections
- preserve synchronized `10.º` / `11.º` selection behavior
- reactivate inactive same-year enrollments when possible
- create enrollments for truly new subjects
- remove/deactivate subjects when allowed
- preserve exam-candidate toggles in the management flow

#### 3. Past-year setup flow

- allow setup for unconfigured historical years
- choose subjects for the target past year
- create the past-year board through `setupPastYear`
- support subsequent final-grade editing through the existing mobile grade flow

#### 4. Historical-year management rules

- surface the correct locked/historical messaging
- prevent settings edits for locked years
- keep history visible
- preserve subject removal rules that differ between editable and historical years

### Explicitly Out of Scope

- Casa polish and final UX cleanup
- full regression/parity sign-off across the whole feature
- large visual redesign

## Likely Files Affected

- `Mobile/app/grades.tsx`
- `Mobile/components/grades/GradeBoard.tsx`
- `Mobile/components/grades/SubjectDetailSheet.tsx`
- `Mobile/components/grades/GradeConfigSheet.tsx`
- `Mobile/lib/grades.ts`
- `Mobile/lib/queries/grades.ts`
- `docs/tasks/grades-mobile-migration.md`

## Implementation Plan

### Step 1: Mobile config sheet foundation

- add a dedicated grades config sheet opened from the grades route
- support current-year settings editing
- support subject-selection draft state
- preload any required board/settings/catalog data

### Step 2: Settings mutation parity

- port regime and scale change handling
- detect destructive-reset cases locally
- implement confirm-reset retry path
- patch mobile queries after save

### Step 3: Subject management parity

- add/remove/reactivate subjects
- preserve exam candidate handling for compatible subjects
- mirror backend removal restrictions and error messages

### Step 4: Past-year setup parity

- add setup flow for unconfigured past years
- submit subject selection through `setupPastYear`
- refresh the new historical board after creation

### Step 5: Historical behavior polish

- show locked-year state clearly
- keep management and settings entry points hidden/disabled where web would block them
- ensure historical grade editing remains consistent with the current mobile sheet

## Manual User Test Script

### A. Current-year subject management

- [ ] Open the grades config sheet for the current editable year
- [ ] Add a new subject
- [ ] Remove a subject with no data
- [ ] Try to remove a subject with data and confirm the same block as web
- [ ] Reactivate a previously inactive subject

### B. Exam candidate management

- [ ] In the config sheet, toggle exam candidacy for a valid subject
- [ ] Confirm non-exam subjects do not expose that toggle
- [ ] Confirm mandatory-exam behavior remains protected

### C. Settings changes

- [ ] Change regime on a year with data
- [ ] Confirm the destructive reset warning appears before save
- [ ] Confirm the retry with confirmation succeeds
- [ ] Change scale in a safe convertible case if applicable
- [ ] Confirm converted data remains coherent after reload

### D. Past-year setup

- [ ] Open an unconfigured past year
- [ ] Select subjects and create the year
- [ ] Confirm the year becomes visible as historical
- [ ] Edit the final visible grades allowed for that historical year

### E. Historical restrictions

- [ ] Open a locked past year
- [ ] Confirm settings editing is blocked
- [ ] Confirm criteria/domain editing is not exposed
- [ ] Confirm only the final visible grade flow remains editable where allowed

## Acceptance Criteria

- current-year settings changes work end-to-end
- destructive reset confirmation matches web semantics
- subject add/remove/reactivate flows work end-to-end
- exam-candidate management is preserved in the config flow
- past-year setup works end-to-end
- historical-year restrictions match the agreed product rules
