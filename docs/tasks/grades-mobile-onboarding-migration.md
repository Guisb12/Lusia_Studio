---
status: in-progress
created: 2026-04-03
updated: 2026-04-03
priority: p0
planned-by: codex
---

## Goal

Migrate the student grades onboarding flow from the Next.js frontend into the React Native mobile app with behavioral parity, while allowing mobile-native UI changes. Delivery must happen in gated phases, and each phase must end with a bounded, testable checkpoint before the next phase begins.

## User Intent

The user wants:

1. The existing web onboarding flow to remain the source of truth for behavior
2. The mobile onboarding to be delivered with the same phase-gated process used for the main grades migration
3. Each phase to end with a concrete test pass before the next phase begins
4. Mobile onboarding to support the full first-time setup experience, including current-year setup and historical setup

## Relationship to the Main Grades Migration

- Parent grades migration task: `docs/tasks/grades-mobile-migration.md`
- This onboarding task is a parallel migration track for the initial setup flow
- The onboarding flow must remain compatible with the mobile grades route and config flows already built

## Confirmed Product Direction

### Source of Truth

- Web onboarding behavior is authoritative
- Mobile may use sheets, stacked screens, or full-page steps instead of web cards/dialogs
- Behavioral parity matters more than visual parity

### Setup Scope

Mobile onboarding must eventually support:

- year/grade selection when the user profile lacks a grade level
- secundário course selection when required
- grade-scale selection for non-secundário flows
- regime selection
- current-year subject selection
- current-year exam-candidate selection
- historical-year setup when the student is above `10.º`
- past-year subject selection
- past-year final-grade entry
- completion and redirect into the grades experience

### Historical Rules

- Past-year setup remains part of onboarding for secundário students above `10.º`
- Historical years created through onboarding are locked-style historical setups
- Historical grading in onboarding is final-grade oriented, not criteria/domain oriented

## Source of Truth

### Web Feature Source

- `LUSIA Studio - Frontend/components/grades/SetupWizard.tsx`
- `LUSIA Studio - Frontend/lib/grades.ts`
- `LUSIA Studio - Frontend/lib/grades/exam-config.ts`
- `LUSIA Studio - Frontend/lib/grades/calculations.ts`
- `LUSIA Studio - Frontend/lib/queries/subjects.ts`
- `LUSIA Studio - Frontend/lib/curriculum.ts`

### Backend Source

- `LUSIA Studio - Backend/app/api/http/services/grades_service.py`
- `LUSIA Studio - Backend/app/api/http/schemas/grades.py`
- `LUSIA Studio - Backend/app/api/http/routers/grades.py`

### Mobile Target Surface

- `Mobile/app`
- `Mobile/components`
- `Mobile/lib/grades.ts`
- `Mobile/lib/queries/grades.ts`
- `Mobile/lib/queries/subjects.ts`

## Key Technical Findings From Phase O0 Audit

1. The web onboarding flow is centralized in `SetupWizard.tsx`
2. The web flow is driven by logical steps rather than a single flat list:
   - grade year when missing
   - course when needed
   - scale for non-secundário
   - regime
   - subjects
   - past grades when needed
3. Current-year subject selection and exam-candidate selection are coupled in the same step
4. Past-year setup uses a per-year state model:
   - selected subjects
   - final grades
   - exam grades in local UI state
5. `10.º` and `11.º` synchronization rules already exist in onboarding for past-year subject selection
6. Submission currently happens through `createGradeSettings(...)` with:
   - current-year settings
   - current-year subjects
   - current-year exam-candidate subject IDs
   - past-year grades payload
7. The onboarding flow depends on catalog filtering by year level and exam capability detection by subject slug and year level

## Behavior That Must Be Preserved

### Step Logic

- Step order must remain conditionally driven by the user profile and grade level
- The user must not see irrelevant steps
- Navigation must preserve already entered state while moving back and forth

### Current-Year Setup Rules

- Current-year selected subjects must initialize from the profile-selected subjects where valid
- `12.º` must preserve the mandatory Portuguese exam behavior
- Exam selection must only appear for subjects with real exam capability in that year

### Historical Setup Rules

- Past years must only appear when the student is above `10.º`
- Each historical year has its own subject selection and final-grade inputs
- Historical setup remains final-grade based
- `10.º` and `11.º` synchronization rules must remain intact where web applies them

### Submission Rules

- Mobile onboarding must ultimately create the same grades setup as web
- Completion must leave the user in a coherent grades-ready state
- The post-submit experience must refresh into the configured grades flow

## Open Risk To Validate During Implementation

- The web onboarding UI tracks `pastExamCandidateIds` and `examGrades` locally, but the current `createGradeSettings(...)` submission shown in `SetupWizard.tsx` only sends `past_year_grades`
- Before implementing historical exam onboarding on mobile, this must be checked against backend support and actual web behavior

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

### Phase O0: Migration Contract and Audit

#### Goal

Freeze the onboarding migration contract before implementation.

#### Scope

- audit the web onboarding flow
- document source-of-truth behavior
- document risks and unresolved backend assumptions
- define the phase gates

#### User Test

- read and approve the contract
- confirm that the proposed phase breakdown matches the desired rollout

#### Acceptance Criteria

- this task file is approved as the working onboarding migration contract
- the onboarding scope is explicit
- the historical setup scope is explicit

### Phase O1: Mobile Onboarding Shell

#### Goal

Build the mobile onboarding container and step-navigation shell without porting the full setup logic yet.

#### Scope

- route/screen entry point
- step container
- progress state
- back/next flow
- in-memory draft state shape aligned with the web setup model
- placeholder rendering for each logical onboarding step

#### Test Outcome

- the onboarding flow opens on mobile
- the user can move through the step shell
- state survives intra-flow navigation

### Phase O2: Current-Year Setup Parity

#### Goal

Port the current-year onboarding behavior from web to mobile.

#### Scope

- grade-year selection when needed
- course selection when needed
- scale selection for non-secundário
- regime selection
- current-year subject selection
- current-year exam-candidate selection
- step validation rules

### Phase O3: Historical Setup Parity

#### Goal

Port the past-year onboarding behavior from web to mobile.

#### Scope

- past-year tabs/steps
- historical subject selection
- historical final-grade inputs
- `10.º` and `11.º` synchronization rules where applicable
- verify and then port any supported historical exam onboarding behavior

### Phase O4: Submission, Integration, and Polish

#### Goal

Complete the onboarding flow and integrate it with the mobile grades experience.

#### Scope

- build the final submit payload
- call the mobile setup API path
- refresh grades queries after completion
- redirect into the correct grades surface
- empty-state and first-run integration
- polish loading/error UX

## Initial Parity Checklist

- [ ] grade-year step only appears when needed
- [ ] course step only appears when needed
- [ ] scale step only appears for non-secundário
- [ ] regime step behavior matches web
- [ ] current-year subject step matches web filtering rules
- [ ] current-year exam selection matches web capability rules
- [ ] historical setup appears only when needed
- [ ] historical final-grade inputs exist where web has them
- [ ] submit creates a valid grades setup
- [ ] completion redirects into the mobile grades experience cleanly
