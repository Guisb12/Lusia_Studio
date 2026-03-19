---
last-updated: 2026-03-18
stability: stable
agent-routing: "Read FIRST before any work in the codebase"
---

# Documentation System

Canonical, mutable engineering reference for the LUSIA Studio codebase. This system externalizes architecture, standards, feature context, and data schemas so agents start informed instead of re-deriving knowledge from raw code each session. If docs contradict code, code wins — update the doc.

## Navigation Index

| Path | Description | Read When | Stability |
|------|-------------|-----------|-----------|
| `docs/README.md` | Doc system entry point, navigation, update protocol | Always — first doc any agent reads | stable |
| `docs/STANDARDS.md` | Engineering standards, conventions, anti-patterns, feature build checklist | Before implementing or refactoring any code | stable |
| `docs/ARCHITECTURE.md` | Tech stack, system boundaries, role/center-type matrix, feature inventory | When needing system-level context or working outside a known feature | semi-stable |
| `docs/PLAYBOOKS.md` | Step-by-step operational procedures for recurring multi-layer processes | When executing a standardized process (new feature, new endpoint, new migration) | semi-stable |
| `docs/features/calendar.md` | Calendar feature — reference implementation for all feature docs | Before working on calendar; also read as the canonical feature pattern | frequently-updated |
| `docs/features/grades.md` | Grades and evaluation feature | Before working on grades | frequently-updated |
| `docs/features/assignments.md` | Assignments feature | Before working on assignments | frequently-updated |
| `docs/features/students.md` | Students/members feature | Before working on students | frequently-updated |
| `docs/features/docs.md` | Documents/artifacts feature and processing pipeline | Before working on documents | frequently-updated |
| `docs/features/analytics.md` | Analytics feature | Before working on analytics | frequently-updated |
| `docs/features/chat.md` | Chat/AI agent feature | Before working on chat | frequently-updated |
| `docs/features/classes.md` | Classrooms feature | Before working on classes | frequently-updated |
| `docs/features/teachers.md` | Teachers feature | Before working on teachers | frequently-updated |
| `docs/features/profile.md` | User profile feature | Before working on profile | frequently-updated |
| `docs/features/session-types.md` | Session types feature | Before working on session types | frequently-updated |
| `docs/features/materials.md` | Curriculum, subjects, notes, subject preferences | Before working on materials/curriculum | frequently-updated |
| `docs/features/quiz.md` | Quiz generation and quiz questions | Before working on quizzes | frequently-updated |
| `docs/features/onboarding.md` | Enrollment flow, onboarding objectives, center creation | Before working on onboarding | frequently-updated |
| `docs/features/student-notes.md` | Student notes (post-it notes) feature | Before working on student notes | frequently-updated |
| `docs/data/overview.md` | DB architecture, Supabase conventions, PostgREST patterns | Before any data layer changes | stable |
| `docs/data/auth.md` | Entity catalog — profiles, organizations, auth tables | Before working on auth/org data layer | frequently-updated |
| `docs/data/calendar.md` | Entity catalog — calendar events, session types, recurrence | Before working on calendar data layer | frequently-updated |
| `docs/data/grades.md` | Entity catalog — enrollments, evaluation domains, periods, elements | Before working on grades data layer | frequently-updated |
| `docs/data/assignments.md` | Entity catalog — assignments, student assignments, submissions | Before working on assignments data layer | frequently-updated |
| `docs/data/documents.md` | Entity catalog — artifacts, document jobs | Before working on documents data layer | frequently-updated |
| `docs/data/chat.md` | Entity catalog — conversations, messages | Before working on chat data layer | frequently-updated |
| `docs/data/curriculum.md` | Entity catalog — subjects, materials, notes, preferences | Before working on curriculum data layer | frequently-updated |
| `docs/data/classes.md` | Entity catalog — classrooms, class members | Before working on classes data layer | frequently-updated |
| `docs/data/student-notes.md` | Entity catalog — student_notes table | Before working on student notes data layer | frequently-updated |
| `docs/DOCUMENTATION-IMPLEMENTATION-PLAN.md` | Original plan that defined this doc system — kept as reference | When understanding why the doc system is structured this way | stable |
| `docs/tasks/{task}.md` | Individual planned task files — planner creates, executor runs | When assigned a task or checking pending work | ephemeral |

## Agent Routing Decision Tree

1. **Always read first:** `docs/README.md`
2. **Working on a specific feature?**
   1. Read `docs/STANDARDS.md`
   2. Read `docs/features/{feature}.md`
   3. If touching the data layer: also read `docs/data/{domain}.md`
3. **Building something new?**
   1. Read `docs/STANDARDS.md`
   2. Read `docs/ARCHITECTURE.md`
   3. Read `docs/PLAYBOOKS.md` for the relevant playbook
   4. Read `docs/features/calendar.md` as the reference pattern
4. **Modifying the data layer?**
   1. Read `docs/data/overview.md`
   2. Read `docs/data/{domain}.md` for the affected domain
   3. Read `docs/features/{feature}.md` for the feature that owns the data
5. **Executing a planned task?**
   1. Read the task file in `docs/tasks/`
   2. Read all docs referenced in the task's Context section
6. **Needing system-level context?**
   1. Read `docs/ARCHITECTURE.md`
   2. If the question is about standards/conventions: read `docs/STANDARDS.md`

## Doc Update Protocol

| Code Change Type | Docs to Update |
|------------------|----------------|
| Feature logic (routes, components, queries, mutations) | `features/{feature}.md` |
| DB schema (new/modified table or column) | `data/{domain}.md` |
| New or modified index | `data/{domain}.md` |
| New API endpoint | `features/{feature}.md` — architecture section |
| New backend service pattern | `features/{feature}.md`; also `STANDARDS.md` if it establishes a new convention |
| Engineering standard changes | `STANDARDS.md` |
| New role or center type | `ARCHITECTURE.md` + affected `features/*.md` — availability section |
| New feature created | New `features/{feature}.md` + `ARCHITECTURE.md` — feature inventory + `README.md` — navigation index |
| New DB domain | New `data/{domain}.md`; also `data/overview.md` if conventions change |

**Rule:** if in doubt whether a change belongs in `STANDARDS.md` or `features/*.md`, it belongs in the feature doc. Standards change only when a *rule* changes.

## Doc Freshness Rules

Every doc uses this frontmatter:

```yaml
---
last-updated: YYYY-MM-DD
stability: stable | semi-stable | frequently-updated | ephemeral
agent-routing: "one-line description of when to read this doc"
---
```

**Stability levels:**

| Level | Meaning |
|-------|---------|
| `stable` | Changes rarely. Only when foundational rules or system structure change. |
| `semi-stable` | Changes when major decisions are made (new integrations, new roles, new processes). |
| `frequently-updated` | Changes whenever feature implementation changes. Expected to be updated often. |
| `ephemeral` | Temporary. Created, used, then deleted (task files). |

**Update rule:** when modifying a doc, always update the `last-updated` field to today's date.

## Cross-Reference Rules

- Reference other docs with a one-line summary + explicit path: *"See `STANDARDS.md` Cache Rules for the full contract."*
- Never copy-paste content between docs.
- If you are writing more than 2 sentences about knowledge owned by another doc, you are duplicating — stop and cross-reference instead.

### Ownership Matrix

| Knowledge Type | Authoritative Doc | Never Duplicated In |
|---------------|-------------------|---------------------|
| Engineering principles and rules | `STANDARDS.md` | Feature docs, playbooks, README |
| System-level architecture | `ARCHITECTURE.md` | Feature docs |
| Feature-specific architecture | `features/{feature}.md` | STANDARDS, ARCHITECTURE, data/ |
| Entity schemas and columns | `data/{domain}.md` | Feature docs |
| DB conventions and patterns | `data/overview.md` | Entity docs |
| Operational procedures | `PLAYBOOKS.md` | Feature docs, STANDARDS |
| Doc navigation and protocol | `README.md` | Nowhere else |
| Task instructions | `tasks/{task}.md` | Nowhere else |

**Conflict resolution:** if two docs disagree, the ownership matrix determines which is authoritative. The non-authoritative doc must be corrected. If ownership is unclear, escalate to the user.

## Task System Overview

The `docs/tasks/` directory enables work continuity between agent sessions.

- **Planner agents** analyze a request, gather context, and create a task file with status `planned`.
- **Executor agents** read the task file, execute the subtasks, update referenced docs, and mark the task `completed`.
- **Lifecycle:** `planned` → `in-progress` → `completed` → deleted after user confirms.
- **File format:** each task file is self-contained with goal, context, subtask plan, doc update checklist, and verification criteria. See the task file frontmatter and structure defined in the implementation plan.

Completed tasks are ephemeral — the knowledge they produce lives in the updated docs, not in the task file.
