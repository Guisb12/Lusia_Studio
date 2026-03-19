# Documentation System — Implementation Plan

---
last-updated: 2026-03-18
status: approved-plan
owner: planning-agent
---

## 1. Documentation System Goals

### What This System Is

A mutable, canonical engineering reference for the LUSIA Studio codebase. It is the single source of truth for how the application works, how it should be built, and how agents and engineers should operate within it.

### Primary Consumer

AI agents. Every document is optimized for agent navigation: structured headers, explicit routing metadata, rule-dense content, and machine-parseable sections. Human engineers are secondary readers — they benefit from the same structure, but the design priority is agent efficiency.

### Operational Problems It Solves

1. **Pattern drift.** Without documented standards, each feature evolves its own conventions. The calendar feature is the reference implementation, but no document explains *why* or *how* to replicate it. New features diverge.
2. **Context loss between sessions.** Agents start fresh each conversation. Without persistent docs, every agent must re-derive architecture, conventions, and feature context from raw code — slow, error-prone, and duplicated work.
3. **Inconsistent refactoring.** Refactoring tasks require understanding the target pattern, the current state, and the gap. Without docs, agents guess or ask the user for context that should be self-service.
4. **Hidden domain knowledge.** Role permissions, center-type feature gates, entity relationships, and Supabase access patterns live only in code or in the user's head. Docs externalize this knowledge.
5. **No task continuity.** Work planned in one session has no structured way to carry into the next. The task system solves this.

### Design Principles

- **Fewer, stronger docs over many scattered docs.** Every file must earn its existence.
- **Clear ownership.** Each piece of knowledge has exactly one authoritative doc. No duplication.
- **Agent-first navigation.** Every doc starts with metadata that tells agents what it contains and when to read it.
- **Mutation-safe.** Docs are designed to be updated by agents as code changes, not to become stale artifacts.
- **No noise.** If a doc doesn't change how agents or engineers work, it doesn't exist.

---

## 2. Final Agreed Structure

```
docs/
├── README.md                          # Agent onboarding, doc purpose, navigation guide, update protocol
├── STANDARDS.md                       # Engineering standards (absorbs + expands UI-EX-BIBLE.md)
├── ARCHITECTURE.md                    # High-level system architecture, tech stack, role/center-type matrix
├── PLAYBOOKS.md                       # Agent-executable operational playbooks (single file, may split later)
│
├── features/                          # One file per feature — architecture, cache, payloads, role access
│   ├── calendar.md
│   ├── grades.md
│   ├── assignments.md
│   ├── students.md
│   ├── docs.md
│   ├── analytics.md
│   ├── chat.md
│   ├── classes.md
│   ├── teachers.md
│   ├── profile.md
│   ├── session-types.md
│   ├── materials.md                   # Curriculum, subjects, notes, subject preferences
│   ├── quiz.md                        # Quiz generation, quiz questions, quiz images
│   └── onboarding.md                  # Enrollment flow, onboarding objectives, center creation
│
├── data/                              # Entity docs grouped by feature domain
│   ├── overview.md                    # DB architecture, Supabase conventions, PostgREST patterns
│   └── (feature-grouped entity files) # Created by agent via Supabase MCP — see Task Breakdown
│
└── tasks/                             # Task system — one file per planned task
    └── (task files)                   # Created by planner agents, executed by executor agents
```

### What Gets Deleted After Implementation

Once the new docs system is fully populated:

| File | Action |
|------|--------|
| `docs/UI-EX-BIBLE.md` | Delete. Absorbed into `STANDARDS.md`. |
| `docs/REFACTORING-PLAN.md` | Delete. Relevant knowledge absorbed into feature docs + `STANDARDS.md`. |
| `docs/AGENT-EXECUTION-PROMPT.md` | Delete. Replaced by `PLAYBOOKS.md` and `README.md` update protocol. |
| `Backend/ARCHITECTURE_ALIGNMENT.md` | Delete. Not trustworthy — features have changed. |
| `Backend/AUTH_INTEGRATION_CONTRACT.md` | Delete. Same reason. |
| `Backend/FRONTEND_AUTH_FLOW_REPORT.md` | Delete. Same reason. |
| `Backend/SUPABASE_AUTH_SETUP.md` | Delete. Same reason. |
| `Backend/MEUS_MATERIAIS_BASE_API.md` | Delete. Same reason. |
| `Backend/INTEGRATED_CURRICULUM_VIEWER.md` | Delete. Same reason. |
| `Backend/MULTI_GRADE_CURRICULUM_NAVIGATION.md` | Delete. Same reason. |
| `Backend/MULTI_GRADE_SUBJECTS_UPDATE.md` | Delete. Same reason. |
| `Backend/SUBJECT_PREFERENCES_IMPLEMENTATION.md` | Delete. Same reason. |

**Important:** Deletion happens only after the new system fully captures the relevant knowledge. Not before.

---

## 3. Purpose of Each Document

### docs/README.md

| Attribute | Value |
|-----------|-------|
| **Purpose** | Agent onboarding entry point. Explains what the docs system is, why it exists, how to navigate it, and the rules for reading and updating docs. |
| **What belongs here** | Doc system goals. Navigation index with one-liner descriptions of each doc. Agent routing rules ("read this first when doing X"). Doc update protocol. |
| **What does NOT belong here** | Engineering standards, architecture details, feature specifics, entity schemas. No actual technical content — only navigation and protocol. |
| **Stability** | Stable. Changes only when docs are added/removed or protocol changes. |
| **Agent routing metadata** | This is the first doc any agent should read when entering the codebase. |

### docs/STANDARDS.md

| Attribute | Value |
|-----------|-------|
| **Purpose** | The canonical engineering standard for building and maintaining features. Defines how every layer of the stack should behave. Replaces and expands `UI-EX-BIBLE.md`. |
| **What belongs here** | Non-negotiable architecture principles. Layer responsibilities (route → shell → component → API → router → service → DB). Cache rules. Optimistic update contract. Payload design rules. Performance budgets. Error handling standards. Testing standards (high-level). Code style conventions (high-level). Anti-patterns. Feature build checklist. |
| **What does NOT belong here** | Feature-specific architecture. Per-feature cache keys. Entity schemas. Playbook procedures. Task tracking. |
| **Stability** | Stable. Changes only when engineering standards evolve. Should be the least-frequently-mutated doc. |
| **Agent routing metadata** | Read before implementing any feature or refactoring any code. The authoritative reference for "how should this be built?" |

### docs/ARCHITECTURE.md

| Attribute | Value |
|-----------|-------|
| **Purpose** | High-level system architecture. How the pieces fit together. Tech stack. System boundaries. Role and center-type access matrix. |
| **What belongs here** | Tech stack overview (Next.js 14, FastAPI, Supabase B2B, custom query client). System boundary diagram (browser → Next API routes → FastAPI backend → Supabase PostgreSQL). Authentication flow (Supabase Auth → middleware → route protection). Role definitions (Admin, Teacher, Student) and what each can access. Center-type definitions (currently: trial) and how they gate features. AI integration architecture (LangChain, Mistral OCR, OpenRouter, document pipeline). Directory structure overview (frontend app/, components/, lib/ — backend routers/, services/, schemas/). |
| **What does NOT belong here** | Per-feature deep dives (those go in `features/`). Engineering standards (those go in `STANDARDS.md`). Entity schemas (those go in `data/`). |
| **Stability** | Semi-stable. Changes when major architectural decisions are made (new integrations, new roles, new center types). |
| **Agent routing metadata** | Read when needing system-level context. Read before `features/` when the agent doesn't know which feature area they're working in. |

### docs/PLAYBOOKS.md

| Attribute | Value |
|-----------|-------|
| **Purpose** | Agent-executable operational procedures for standardized processes. Each playbook is a step-by-step protocol an agent follows to complete a recurring type of work. |
| **What belongs here** | Playbooks for processes that are (a) recurring, (b) error-prone without standardization, and (c) applicable across multiple features. Examples: "How to build a new feature," "How to add a new backend endpoint," "How to create a data migration." |
| **What does NOT belong here** | One-off procedures. Feature-specific logic. Standards (those go in `STANDARDS.md`). Task-specific instructions (those go in `tasks/`). |
| **Stability** | Semi-stable. Playbooks are added when new recurring processes are identified. Existing playbooks are updated when the process changes. |
| **Agent routing metadata** | Read when executing a standardized process. The agent should know which playbook applies before reading this doc. |

### docs/features/{feature}.md

| Attribute | Value |
|-----------|-------|
| **Purpose** | Complete feature documentation. Architecture, data flow, cache contract, payload shapes, role access, known patterns. One file per feature. |
| **What belongs here** | Feature overview. Role and center-type availability. Route structure (frontend paths). Architecture walkthrough (route → shell → queries → API → service → DB). Cache contract (query keys, invalidation rules, optimistic behavior). Summary vs detail payload shapes. Supabase access patterns used by this feature. Known edge cases. Per-feature architecture details that don't belong in `ARCHITECTURE.md`. |
| **What does NOT belong here** | Cross-cutting engineering standards (those go in `STANDARDS.md`). Entity schema definitions (those go in `data/`). Raw code dumps. |
| **Stability** | Frequently updated. Must be updated whenever feature architecture changes. |
| **Agent routing metadata** | Read before working on a specific feature. The agent should read `STANDARDS.md` first (for rules), then the relevant `features/X.md` (for context). |

### docs/data/overview.md

| Attribute | Value |
|-----------|-------|
| **Purpose** | Database architecture, conventions, and Supabase-specific patterns used across the codebase. |
| **What belongs here** | Supabase B2B setup overview. PostgREST access patterns (`.select()`, `.eq()`, `.in_()`, `.contains()`, `.order()`, `.range()`). Naming conventions for tables, columns, indexes. Index strategy (when to use composite, GIN, partial indexes). Migration conventions (how to create, naming, numbering). RPC/function usage patterns. Row-level security notes if applicable. |
| **What does NOT belong here** | Individual entity definitions (those go in feature-grouped entity files). Feature-specific query logic. |
| **Stability** | Stable. Changes when DB conventions or Supabase patterns change. |
| **Agent routing metadata** | Read before working on any data layer changes. Read before creating entity docs. |

### docs/data/{domain}.md (feature-grouped entity files)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Complete entity catalog for a domain. Every table, every column, access patterns, relationships to other entities within and across domains. |
| **What belongs here** | Table name. Column definitions (name, type, purpose). Primary and foreign keys. Indexes and why they exist. Relationships explained in domain terms ("a classroom has many enrollments; an enrollment connects a student to subjects"). Supabase PostgREST access patterns used by backend services for these tables. |
| **What does NOT belong here** | Feature architecture (that goes in `features/`). Engineering standards. Migration history. |
| **Stability** | Updated when schema changes. |
| **Agent routing metadata** | Read when working on data layer for a specific domain. Cross-reference with the relevant `features/` doc. |
| **Grouping logic** | Tables are grouped by feature domain. Features with many tables (grades, auth) get their own file. Features with few tables may be combined. Exact grouping is determined by the agent during entity doc creation via Supabase MCP access. |

### docs/tasks/{task-name}.md

| Attribute | Value |
|-----------|-------|
| **Purpose** | Individual task files created by planner agents, executed by executor agents. Each file is a self-contained work unit. |
| **What belongs here** | See Task System Protocol below (Section 8). |
| **What does NOT belong here** | Completed tasks (archived or deleted after completion). Standards, architecture, or feature documentation. |
| **Stability** | Ephemeral. Created, executed, completed, archived. |
| **Agent routing metadata** | Planner agents create these. Executor agents read and follow them. |

---

## 4. Source Mapping

This defines which existing knowledge sources feed which new document.

| Target Document | Primary Sources | Secondary Sources |
|-----------------|----------------|-------------------|
| `README.md` | New content (agent protocol, navigation) | Structure derived from this plan |
| `STANDARDS.md` | `UI-EX-BIBLE.md` (full absorption + expansion) | `REFACTORING-PLAN.md` §2 (Refactoring Principles), §6 (Shared Pattern Extraction) |
| `ARCHITECTURE.md` | Live codebase analysis (frontend `app/`, backend `app/`, `middleware.ts`, `main.py`) | `REFACTORING-PLAN.md` §1 (Executive Summary — for architecture overview) |
| `PLAYBOOKS.md` | `AGENT-EXECUTION-PROMPT.md` (restructured as playbook), `REFACTORING-PLAN.md` §6 (pattern templates) | `STANDARDS.md` (for checklist references) |
| `features/*.md` | Live codebase analysis per feature (routes, components, queries, services, schemas) | `REFACTORING-PLAN.md` §4 (Feature Audits — for post-refactor context) |
| `data/overview.md` | Backend service code patterns, migration SQL files | Supabase MCP schema access |
| `data/{domain}.md` | Supabase MCP (live schema), backend service `SELECT` constants, migration SQL | Backend schemas (`app/api/http/schemas/`) |
| `tasks/*.md` | User requests, planner agent analysis | Relevant docs for context |

### Source Trust Hierarchy

1. **Live codebase** — always authoritative. If docs contradict code, code wins and docs must be updated.
2. **Supabase MCP** — authoritative for schema and data.
3. **`UI-EX-BIBLE.md`** — authoritative for engineering principles (to be absorbed, not blindly copied).
4. **`REFACTORING-PLAN.md`** — useful for architectural context and pattern descriptions, but feature-specific compliance scores are historical (refactoring is complete).
5. **Backend `.md` files** — NOT trustworthy. Features have changed since these were written. Use only as hints, verify against live code.

---

## 5. Recommended Creation Order

The order optimizes for: (a) docs that other docs depend on are created first, (b) fast usefulness, (c) agents can start using the system as early as possible.

### Phase 1 — Foundation (creates the framework agents need to operate)

| Order | Document | Why First |
|-------|----------|-----------|
| 1 | `README.md` | Entry point. Defines the doc system itself. Agents need this to navigate everything else. |
| 2 | `STANDARDS.md` | Every other doc references standards. Feature docs and playbooks assume the reader knows the standards. Must exist before feature docs are written. |
| 3 | `ARCHITECTURE.md` | Defines the system-level context that feature docs specialize. Feature doc writers need this as a frame. |

### Phase 2 — Feature Docs (creates the feature-specific knowledge base)

| Order | Document | Why This Order |
|-------|----------|----------------|
| 4 | `features/calendar.md` | Reference implementation. All other feature docs should reference calendar as the pattern to follow. Must be documented first so other feature doc authors can cross-reference. |
| 5-17 | Remaining `features/*.md` | Order within this group is flexible. Can be parallelized — one agent per feature. Suggested priority: grades, assignments, docs, chat, students, analytics, classes, teachers, profile, session-types, materials, quiz, onboarding. |

### Phase 3 — Data Layer (requires Supabase MCP access)

| Order | Document | Why This Order |
|-------|----------|----------------|
| 18 | `data/overview.md` | Defines the conventions before entity docs are written. |
| 19+ | `data/{domain}.md` | Created by agent with Supabase MCP access. Can be parallelized by domain. Exact file list determined during creation based on actual schema. |

### Phase 4 — Operations

| Order | Document | Why This Order |
|-------|----------|----------------|
| Last | `PLAYBOOKS.md` | Depends on everything else being documented. Playbooks reference standards, architecture, and feature patterns. Writing them last means they can reference concrete docs. |

### Phase 5 — Cleanup

| Action | Details |
|--------|---------|
| Delete `UI-EX-BIBLE.md` | After `STANDARDS.md` is verified complete. |
| Delete `REFACTORING-PLAN.md` | After relevant knowledge is absorbed. |
| Delete `AGENT-EXECUTION-PROMPT.md` | After `PLAYBOOKS.md` and `README.md` cover its content. |
| Delete backend `.md` files | After feature docs are complete. |

---

## 6. Task Breakdown

Each task below is implementation-ready for a downstream agent.

---

### TASK 1: Create docs/README.md

**Target file:** `docs/README.md`

**Purpose:** Agent onboarding entry point. Explains the doc system, navigation, and update rules.

**Required source material:**
- This plan (for structure, purpose of each doc, navigation rules)
- No codebase reading required

**Expected output:** A markdown file containing:
- Doc system purpose (2-3 sentences)
- Navigation index (every doc with one-liner description and "read when" guidance)
- Agent routing rules (decision tree: "working on feature X → read STANDARDS then features/X.md")
- Doc update protocol (when and how to update each doc type after code changes)
- Doc freshness rules (frontmatter metadata expectations)

**Dependencies:** None.

**Metadata format for all docs:**
```markdown
---
last-updated: YYYY-MM-DD
stability: stable | semi-stable | frequently-updated | ephemeral
agent-routing: "one-line description of when to read this doc"
---
```

---

### TASK 2: Create docs/STANDARDS.md

**Target file:** `docs/STANDARDS.md`

**Purpose:** Canonical engineering standards. Absorbs and expands `UI-EX-BIBLE.md`.

**Required source material:**
- `docs/UI-EX-BIBLE.md` — full content (absorb, restructure, expand)
- `docs/REFACTORING-PLAN.md` §2 (Refactoring Principles) and §6 (Shared Pattern Extraction)
- Live codebase: `lib/query-client.ts` (custom query client API), `lib/queries/calendar.ts` (reference query module), calendar feature files (reference implementation)

**Expected output:** A markdown file containing:
- **Core goals** (from Bible, refined)
- **Non-negotiable principles** (from Bible, kept tight — first paint, layer responsibilities, cache contracts, optimistic rules, payload discipline, backend-matches-frontend, repeatability)
- **Frontend patterns** (route, feature shell, UI component — responsibilities and boundaries)
- **Cache rules** (foundation, design rules, behavior rules, memory management — from Bible, tightened)
- **Optimistic update contract** (allowed operations, required contract, anti-patterns)
- **Payload rules** (summary vs detail, discipline rules)
- **API design rules** (Next API routes, backend routers, backend services)
- **Database rules** (query discipline, write rules, set-based operations)
- **Performance rules** (first screen budget, rendering rules, background work rules)
- **Error handling rules** (from Bible)
- **Testing standards** (high-level: what to test, Playwright patterns, verification expectations)
- **Code style conventions** (high-level: file naming, import ordering, TypeScript patterns)
- **Feature build checklist** (from Bible §"Feature Build Checklist", kept here not in playbooks)
- **Anti-patterns** (from Bible, expanded with patterns discovered during refactoring)
- **Custom query client API reference** (key APIs from `lib/query-client.ts` — this is NOT React Query)
- **Feature query module contract** (required exports: key builders, hooks, prefetch, snapshot, sync, invalidation)
- **Backend service contract** (required patterns: SELECT constants, batch hydration, summary/detail split)

**Key expansion areas beyond the Bible:**
- The Bible doesn't cover testing, code style, or the custom query client API. These should be added.
- The Bible references calendar implicitly. STANDARDS should make the reference explicit with file paths.
- The shared pattern extraction from the refactoring plan (§6) should be absorbed as standard patterns.

**Dependencies:** None.

---

### TASK 3: Create docs/ARCHITECTURE.md

**Target file:** `docs/ARCHITECTURE.md`

**Purpose:** High-level system architecture. Tech stack, system boundaries, role/center-type matrix.

**Required source material:**
- Live codebase: `package.json` (frontend deps), `requirements.txt` (backend deps), `next.config.js`, `main.py`, `middleware.ts`, `core/config.py`
- Frontend `app/` directory structure (route groups, API routes)
- Backend `app/` directory structure (routers, services, schemas, pipeline, chat)
- `docs/REFACTORING-PLAN.md` §1 (Executive Summary — for overview context)

**Expected output:** A markdown file containing:
- **Tech stack** — Frontend: Next.js 14, React 18, TypeScript, Tailwind, Supabase client, custom query client, TipTap. Backend: FastAPI, Python, Supabase (PostgREST), LangChain/LangGraph, OpenAI, Mistral OCR, OpenRouter. Database: Supabase PostgreSQL (B2B instance only).
- **System boundaries** — How requests flow: Browser → Next.js (SSR + API routes) → FastAPI backend → Supabase PostgreSQL. Where auth happens. Where AI integrations plug in.
- **Directory structure overview** — Frontend: `app/(auth)`, `app/(teacher)`, `app/(student)`, `app/api`, `components/`, `lib/queries/`, `lib/hooks/`, `lib/*.server.ts`. Backend: `routers/`, `services/`, `schemas/`, `pipeline/`, `chat/`, `migrations/`.
- **Role definitions and access matrix** — Admin, Teacher, Student. What routes each can access. What features each can use. How role is determined (Supabase auth + middleware).
- **Center-type definitions** — Currently: trial only. How center type will gate feature access in the future. Where this logic lives in code.
- **AI integration architecture** — Document processing pipeline (upload → OCR → categorize → extract → convert). Chat agent (LangGraph). Quiz generation. Worksheet generation (blueprint → resolve). Which external APIs are used where.
- **Feature inventory** — Table listing all features with: name, frontend route, backend router, brief description. This is the master list that `features/` docs expand on.

**Dependencies:** None (but benefits from TASK 2 being done first for standards context).

---

### TASK 4: Create docs/features/calendar.md

**Target file:** `docs/features/calendar.md`

**Purpose:** Reference implementation feature doc. Sets the pattern for all other feature docs.

**Required source material:**
- `app/(teacher)/dashboard/calendar/page.tsx` (route)
- `components/calendar/CalendarShell.tsx` (feature shell)
- `lib/queries/calendar.ts` (query module)
- `lib/calendar.server.ts` (server fetch)
- `app/api/calendar/sessions/route.ts` (API route)
- `app/api/calendar/students/route.ts` (API route)
- Backend: `routers/calendar.py`, `services/calendar_service.py`, `schemas/calendar.py`
- `migrations/014_session_types.sql`, `015_recurrence.sql`, `016_calendar_perf_indexes.sql`, `017_calendar_student_ids_gin.sql`

**Expected output:** A markdown file following this template (which all feature docs should follow):

```
---
last-updated: YYYY-MM-DD
stability: frequently-updated
agent-routing: "Read before working on calendar feature code"
---

## Overview
Brief description of what the feature does for the user.

## Availability
- Roles: [which roles can access this feature]
- Center types: [which center types have this feature]
- Routes: [frontend route paths]

## Architecture
Route → Shell → Queries → API → Service → DB walkthrough.
File paths for each layer.

## Cache Contract
- Query namespace and prefix
- List query keys (with params)
- Detail query keys
- staleTime configuration
- Invalidation rules
- Optimistic update strategy (snapshot → apply → success/rollback)
- Prefetch behavior (what, when, deferred or immediate)

## Payload Shapes
- Summary payload (what fields, used where)
- Detail payload (what fields, used where)

## Backend Patterns
- Service SELECT constants
- Batch hydration approach
- Key DB access patterns

## Database
- Tables involved (reference to data/ docs)
- Indexes and why they exist
- Read patterns the indexes serve

## Edge Cases / Notes
Anything non-obvious about this feature.
```

**This template becomes the standard for all feature docs.**

**Dependencies:** TASK 2 (STANDARDS.md — so the feature doc can reference standards).

---

### TASKS 5-17: Create remaining docs/features/*.md

Each of these follows the same pattern as TASK 4, one per feature.

| Task | Target File | Key Source Files |
|------|-------------|-----------------|
| 5 | `features/grades.md` | `components/grades/`, `lib/queries/grades.ts`, `routers/grades.py`, `services/grades_service.py`, grade migrations |
| 6 | `features/assignments.md` | `components/assignments/`, `lib/queries/assignments.ts`, `routers/assignments.py`, `services/assignments_service.py` |
| 7 | `features/docs.md` | `components/docs/`, `lib/queries/docs.ts`, `routers/artifacts.py`, `services/artifacts_service.py`, document pipeline |
| 8 | `features/chat.md` | `components/chat/`, `lib/queries/chat.ts` (if exists), `backend/chat/`, `routers/chat.py` |
| 9 | `features/students.md` | `components/students/`, `lib/queries/students.ts`, `lib/queries/members.ts`, `routers/members.py`, `services/members_service.py` |
| 10 | `features/analytics.md` | `components/analytics/`, `lib/queries/analytics.ts`, `services/analytics_service.py` |
| 11 | `features/classes.md` | `components/classes/`, `lib/queries/classes.ts`, `routers/classrooms.py`, `services/classrooms_service.py` |
| 12 | `features/teachers.md` | `components/teachers/`, `lib/queries/teachers.ts`, related members queries |
| 13 | `features/profile.md` | `components/profile/`, `lib/queries/profile.ts`, profile API routes |
| 14 | `features/session-types.md` | `components/calendar/SessionTypeManager*`, `lib/queries/session-types.ts`, `routers/session_types.py` |
| 15 | `features/materials.md` | `components/materiais/`, `components/subjects/`, `lib/queries/subjects.ts`, `routers/materials.py`, `services/materials_service.py` |
| 16 | `features/quiz.md` | `components/quiz/`, quiz generation API routes, `routers/quiz_generation.py`, `services/quiz_generation_service.py` |
| 17 | `features/onboarding.md` | `app/(auth)/onboarding/`, `app/(auth)/enroll/`, `routers/auth.py`, `services/auth_service.py`, `services/enrollment_service.py` |

**Each task has the same structure:**
- Title: Create `features/{name}.md`
- Purpose: Document this feature following the template from TASK 4
- Required source: The feature's route, components, query module, API routes, backend router, service, and schemas
- Expected output: A complete feature doc following the standard template
- Dependencies: TASK 2 (STANDARDS.md), TASK 4 (calendar.md as the template reference)

**Tasks 5-17 can be parallelized.** Each agent works independently on one feature.

---

### TASK 18: Create docs/data/overview.md

**Target file:** `docs/data/overview.md`

**Purpose:** Database architecture, Supabase conventions, PostgREST access patterns.

**Required source material:**
- `core/config.py` (Supabase B2B configuration)
- `core/database.py` (DB initialization)
- Backend service files (for PostgREST usage patterns — `.select()`, `.eq()`, `.in_()`, `.contains()`, `.order()`, `.range()`, `.execute()`)
- Migration SQL files (for naming conventions, numbering scheme)
- `utils/db.py` (DB utilities)

**Expected output:** A markdown file containing:
- Supabase B2B setup (single instance, PostgREST API)
- PostgREST access pattern reference (with examples from actual service code)
- Table naming conventions
- Column naming conventions
- Index naming conventions and strategy
- Migration conventions (numbering, naming, how to create new ones)
- RPC/function usage (if any)
- Connection and auth patterns (how services authenticate to Supabase)

**Dependencies:** None.

---

### TASK 19: Create docs/data/{domain}.md entity files

**Target file:** `docs/data/` — multiple files, grouped by domain

**Purpose:** Complete entity catalog. Every table, every column, access patterns, relationships.

**Required source material:**
- **Supabase MCP access** (live schema — this is the authoritative source)
- Backend service `SELECT` constants (for understanding which columns matter for what)
- Backend service query patterns (for understanding access patterns)
- Migration SQL files (for understanding indexes and their purpose)

**Expected output:** One file per domain group. The agent determines the exact grouping based on the actual schema, but expected groups include:
- `data/auth.md` — profiles, organizations, related auth tables
- `data/calendar.md` — calendar events, session types, recurrence
- `data/grades.md` — enrollments, evaluation domains, subject periods, elements, etc.
- `data/assignments.md` — assignments, student assignments, submissions
- `data/documents.md` — artifacts, document jobs
- `data/chat.md` — chat conversations, messages
- `data/curriculum.md` — subjects, materials, notes, subject preferences
- (others as discovered via Supabase MCP)

Each file must contain for each table:
- Table name
- Every column: name, type, purpose
- Primary key, foreign keys
- Indexes (name, columns, type, why it exists)
- Relationships in domain language ("an enrollment connects a student profile to a classroom's subject")
- PostgREST access patterns used by the backend service for this table

**Dependencies:** TASK 18 (data/overview.md — for convention context). Requires Supabase MCP access.

---

### TASK 20: Create docs/PLAYBOOKS.md

**Target file:** `docs/PLAYBOOKS.md`

**Purpose:** Agent-executable operational procedures for standardized, recurring processes.

**Required source material:**
- `docs/STANDARDS.md` (completed — for reference)
- `docs/ARCHITECTURE.md` (completed — for reference)
- `features/calendar.md` (completed — as the reference pattern)
- `docs/AGENT-EXECUTION-PROMPT.md` (to absorb and restructure)
- `docs/REFACTORING-PLAN.md` §6 (Shared Pattern Extraction — for template patterns)

**Expected output:** Agent-executable playbooks. The agent creating this should determine which playbooks are genuinely useful based on the codebase, but candidate playbooks include:

- **"Build a new feature"** — Step-by-step from route to service, following the calendar pattern. References STANDARDS.md, includes file paths to create, query module exports to define, backend service pattern to follow.
- **"Add a new backend endpoint"** — Router → service → schema pattern. Thin router validation → service delegation → batch hydration → SELECT constants.
- **"Add a new database table"** — Migration creation, naming, index strategy, updating entity docs.
- **"Extend the document processing pipeline"** — Adding a new pipeline step, client integration.

**Noise filter:** The agent should only include playbooks for processes that (a) happen more than once, (b) are error-prone without a guide, (c) require touching multiple layers. If a process is obvious from reading STANDARDS.md + the relevant feature doc, it doesn't need a playbook.

**Dependencies:** TASKS 1-4 (README, STANDARDS, ARCHITECTURE, calendar feature doc).

---

## 7. Duplication Prevention Rules

### Ownership Matrix

| Knowledge Type | Authoritative Doc | Never Duplicated In |
|---------------|-------------------|---------------------|
| Engineering principles and rules | `STANDARDS.md` | Feature docs, playbooks, README |
| System-level architecture | `ARCHITECTURE.md` | Feature docs (they reference it) |
| Feature-specific architecture | `features/{feature}.md` | STANDARDS, ARCHITECTURE, data/ |
| Entity schemas and columns | `data/{domain}.md` | Feature docs (they cross-reference) |
| DB conventions and patterns | `data/overview.md` | Entity docs (they follow it) |
| Operational procedures | `PLAYBOOKS.md` | Feature docs, STANDARDS |
| Doc navigation and protocol | `README.md` | Nowhere else |
| Task instructions | `tasks/{task}.md` | Nowhere else |

### Cross-Reference Rules

When a doc needs to reference knowledge owned by another doc:
- Use a one-line summary + explicit cross-reference: `"See STANDARDS.md §Cache Rules for the full contract."`
- Never copy-paste sections between docs.
- If you find yourself writing more than 2 sentences about knowledge owned by another doc, you're duplicating.

### Conflict Resolution

If two docs disagree:
1. The ownership matrix above determines which doc is authoritative.
2. The non-authoritative doc must be corrected.
3. If the knowledge doesn't clearly belong to one doc, escalate to the user.

---

## 8. Task System Protocol

### Overview

The task system enables continuity between agent sessions. A planner agent analyzes a request, gathers context, and creates a structured task file. An executor agent picks it up and implements it.

### Task File Format

Each task is a standalone markdown file in `docs/tasks/`.

**Filename convention:** `{short-kebab-description}.md`
Examples: `add-pagination-to-teachers.md`, `fix-chat-cache-persistence.md`

**File structure:**

```markdown
---
status: planned | in-progress | completed | blocked
created: YYYY-MM-DD
updated: YYYY-MM-DD
priority: p0 | p1 | p2
planned-by: planner-agent
---

## Goal
One paragraph: what the user wants and why.

## User Intent
What the user said, clarified. Why this matters. What "done" looks like from the user's perspective.

## Context
What the planner agent discovered during analysis. Key files, current state, relevant patterns.
References to docs the executor should read first.

## Plan

### Subtask 1: [title]
- **What:** concrete action to take
- **Files:** specific files to read and/or modify
- **Pattern:** reference to STANDARDS.md or features/ doc if applicable
- **Acceptance:** how to verify this subtask is done

### Subtask 2: [title]
...

## Doc Updates Required
Which docs must be updated after this task is complete:
- [ ] `features/X.md` — update section Y because Z changed
- [ ] `data/X.md` — update if schema changed

## Verification
How the executor agent verifies the work is correct. Test commands, expected behavior, etc.
```

### Planner Agent Protocol

When a user requests work:

1. **Clarify intent.** If the request is ambiguous, ask the user before creating a task.
2. **Gather context.** Read relevant docs (`STANDARDS.md`, `features/X.md`, `data/X.md`). Read relevant code. Use subagents for deep analysis if needed.
3. **Create the task file** in `docs/tasks/` with status `planned`.
4. **Report back** to the user with a summary of the plan and ask for approval before execution begins.

### Executor Agent Protocol

When executing a task:

1. **Read the task file** completely.
2. **Read all referenced docs** (STANDARDS, feature docs, data docs listed in Context).
3. **Execute subtasks** in order, checking dependencies.
4. **Update task status** to `in-progress` when starting, `completed` when done.
5. **Update all docs** listed in "Doc Updates Required."
6. **Verify** using the task's verification criteria.

### Task Lifecycle

```
planned → in-progress → completed → (deleted or archived)
         → blocked (if dependencies aren't met)
```

Completed tasks should be deleted after the user confirms the work. They are ephemeral — the knowledge they produced lives in the updated docs.

---

## 9. Agent Update Rules

### Which doc to read first

Decision tree for agents entering the codebase:

```
1. Always read: docs/README.md (navigation + protocol)
2. Working on a specific feature?
   → Read docs/STANDARDS.md (rules)
   → Read docs/features/{feature}.md (feature context)
   → If touching data layer: read docs/data/{domain}.md
3. Building something new?
   → Read docs/STANDARDS.md
   → Read docs/ARCHITECTURE.md (system context)
   → Read docs/PLAYBOOKS.md (for the relevant playbook)
4. Need system-level context?
   → Read docs/ARCHITECTURE.md
5. Working on a task?
   → Read the task file in docs/tasks/
   → Read all docs referenced in the task's Context section
```

### Which doc to update when code changes

| Code Change | Docs to Update |
|-------------|----------------|
| Feature logic changes (routes, components, queries, mutations) | `features/{feature}.md` |
| New or modified DB table/column | `data/{domain}.md` |
| New or modified index | `data/{domain}.md` |
| New API endpoint | `features/{feature}.md` (architecture section) |
| New backend service pattern | `features/{feature}.md` + potentially `STANDARDS.md` if it establishes a new convention |
| Engineering standard changes | `STANDARDS.md` |
| New role or center type | `ARCHITECTURE.md` + affected `features/*.md` (availability section) |
| New feature created | New `features/{feature}.md` + `ARCHITECTURE.md` (feature inventory) + `README.md` (navigation index) |
| New DB domain | New `data/{domain}.md` + `data/overview.md` (if conventions change) |

### When to update standards vs feature docs

- **STANDARDS.md** changes when a *rule* changes — a principle, a convention, a required pattern. This should be rare.
- **features/*.md** changes when a *feature's implementation* changes — new routes, new cache keys, new payload shapes, new endpoints. This is common.
- **If in doubt:** the change probably belongs in a feature doc, not in STANDARDS.md.

---

## 10. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Feature docs become implementation dumps.** Agents copy-paste code details instead of documenting architecture and patterns. | High | Medium | The feature doc template constrains what goes in each section. Review first few feature docs (especially calendar.md) before parallelizing the rest. |
| **Standards doc becomes vague.** Over time, standards are written too abstractly and lose connection to actual code patterns. | Medium | High | STANDARDS.md must include concrete file path references to the reference implementation (calendar). Abstract rules must be grounded in examples. |
| **Data docs go stale.** Schema changes happen but entity docs aren't updated. | High | Medium | Agent update rules require data doc updates when schema changes. Task system's "Doc Updates Required" section enforces this. |
| **Playbooks accumulate noise.** Playbooks are added for processes that don't need them. | Medium | Low | Noise filter: only add playbooks for recurring, error-prone, multi-layer processes. Review periodically. |
| **Task files accumulate.** Completed tasks aren't cleaned up. | Medium | Low | Task lifecycle requires deletion after user confirms completion. Planner agents should check for stale tasks. |
| **Over-fragmentation in data/ directory.** Too many small entity files for trivial tables. | Low | Low | Agent creating entity docs uses judgment to group small related tables. Single-table files only for complex domains. |
| **Docs system itself becomes maintenance burden.** Too many docs, too many update rules, agents spend more time on docs than code. | Low | High | The structure is deliberately flat (2 levels max). Only 4 top-level docs + 2 subdirectories. If maintenance burden grows, consolidate. |

---

## 11. Recommended Next Execution Step

After this plan is approved:

1. **Create `docs/README.md`** (TASK 1) — takes 15 minutes, immediately usable.
2. **Create `docs/STANDARDS.md`** (TASK 2) — the heaviest single doc, requires careful absorption of the Bible. Should be reviewed before proceeding.
3. **Create `docs/ARCHITECTURE.md`** (TASK 3) — can begin in parallel with TASK 2 since they draw from different sources.
4. **Create `docs/features/calendar.md`** (TASK 4) — sets the template. Review this before parallelizing the remaining feature docs.

After calendar.md is reviewed and approved, launch parallel agents for the remaining 13 feature docs (TASKS 5-17).

Data docs (TASKS 18-19) require Supabase MCP access and should begin once feature docs are underway.

Playbooks (TASK 20) come last.

**First concrete action:** Execute TASK 1 (README.md) and TASK 2 (STANDARDS.md).
