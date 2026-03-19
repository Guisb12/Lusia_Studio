---
last-updated: 2026-03-19
stability: semi-stable
agent-routing: "Read when needing system-level context. Read before features/ when you don't know which feature area you're working in."
---

# System Architecture

## 1. System Overview

LUSIA Studio is an educational SaaS platform for tutoring centers and schools. It provides session management, grading, assignments, document management, AI-powered content generation (quiz and worksheet creation), a curriculum-aware chat agent, and analytics. Three roles use the system: admins (organization owners), teachers, and students — all scoped to a single organization via multi-tenancy.

## 2. Tech Stack

### Frontend

| Technology | Purpose | Key Files |
|---|---|---|
| Next.js 14 | Framework, SSR, file-based routing | `next.config.js` |
| React 18 | UI library | — |
| TypeScript 5 | Type safety | `tsconfig.json` |
| Tailwind CSS 4 | Utility-first styling | `globals.css` |
| Supabase SSR (`@supabase/ssr`) | Auth session management (browser + server) | `lib/supabase/client.ts`, `lib/supabase/server.ts` |
| Custom query client | Client-side cache, queries, mutations, optimistic updates. **This is NOT React Query / TanStack Query.** | `lib/query-client.ts` |
| TipTap 3 | Rich text editor (documents, notes, worksheets) | `lib/tiptap/` |
| Radix UI | Accessible headless UI primitives | `components/ui/` |
| TanStack Table | Data table logic (headless) | Used in grades, students, docs |
| Recharts | Charts and data visualization | Used in analytics |
| Framer Motion | Animations | — |
| date-fns | Date utilities | — |
| Playwright | E2E testing | `e2e/` |
| `@next/bundle-analyzer` | Bundle analysis (`ANALYZE=true`) | `next.config.js` |

### Backend

| Technology | Purpose | Key Files |
|---|---|---|
| FastAPI | API framework | `app/main.py` |
| Python 3.13 | Runtime | — |
| Uvicorn | ASGI server | `requirements.txt` |
| Supabase Python SDK | PostgREST client for DB access | `app/core/database.py` |
| LangChain + LangGraph | Chat agent framework (tool-calling loop) | `app/chat/agent.py` |
| OpenRouter (via ChatOpenAI) | LLM provider for chat agent, quiz generation, worksheet planner | `app/chat/llm.py`, `app/pipeline/clients/openrouter.py` |
| Mistral AI | PDF OCR (document processing pipeline) | `app/pipeline/clients/mistral_ocr.py` |
| Instructor | Structured LLM output (worksheet planning) | `app/api/http/services/worksheet_planner.py` |
| Pydantic / pydantic-settings | Request/response validation, settings management | `app/core/config.py` |
| pypandoc | DOCX-to-Markdown conversion | `app/pipeline/steps/parse_document.py` |

### Database

Supabase PostgreSQL — **B2B instance only**. All application data lives in a single Supabase project accessed via the PostgREST API.

A B2C Supabase instance previously existed for a content library feature. It is **deprecated** — `get_content_db()` in `app/core/database.py` now redirects to the B2B client. Do not use B2C configuration or create new references to it. The B2C configuration variables (`SUPABASE_URL_B2C`, `SUPABASE_SERVICE_KEY_B2C`) and builder function (`_build_content_client()`) still exist in `config.py` and `database.py` but are unused at runtime. `get_content_db()` redirects to the B2B client.

## 3. System Boundaries

```
Browser ──→ Next.js (SSR + Client) ──→ Next.js API Routes ──→ FastAPI Backend ──→ Supabase PostgreSQL
                                                                     │
                                                                     ├──→ OpenRouter (chat, quiz gen, worksheet planner, categorization)
                                                                     ├──→ Mistral (PDF OCR)
                                                                     └──→ Supabase Storage (file uploads)
```

### Browser ↔ Next.js

Next.js handles SSR for first paint — route pages fetch critical data server-side via `*.server.ts` functions. After hydration, the custom query client manages all subsequent data fetching and caching on the client. The client communicates exclusively through Next.js API routes — it never calls the FastAPI backend directly.

### Next.js API Routes ↔ FastAPI

Every Next.js API route under `app/api/` is a **thin auth proxy**. It reads the Supabase session from cookies, extracts the access token, attaches it as a `Bearer` header, and forwards the request to the FastAPI backend. No business logic lives in API routes.

Backend base URL: configured via `NEXT_PUBLIC_API_BASE_URL` or `BACKEND_API_URL` env vars.

### FastAPI ↔ Supabase

The backend uses the Supabase Python SDK with the **service role key** (`SUPABASE_SERVICE_KEY_B2B`). This provides full database access bypassing Row Level Security. User identity is verified by calling `db.auth.get_user(token)` with the access token received from the frontend, then loading the user's profile from the `profiles` table.

### FastAPI ↔ External AI APIs

AI integrations are used for:
- **Document processing:** Mistral (OCR), OpenRouter (categorization, question extraction)
- **Chat:** OpenRouter via LangChain ChatOpenAI
- **Quiz generation:** OpenRouter via the pipeline's OpenRouter client
- **Worksheet generation:** OpenRouter (planner + blueprint agent + resolution)

All AI calls are server-side only. SSE (Server-Sent Events) is used to stream AI responses to the frontend for chat, quiz generation, and worksheet resolution.

## 4. Authentication Architecture

### Identity Provider

Supabase Auth handles identity management. Supports email/password signup and email verification. Magic link is available via the recover flow.

### Auth Flow

1. **Browser** → Supabase Auth SDK creates/refreshes session, stores tokens in cookies
2. **Middleware** (`middleware.ts`) runs on every navigation:
   - Calls `updateSession()` to refresh Supabase cookies
   - For auth-decision paths (`/`, `/dashboard/*`, `/student/*`, `/onboarding/*`, auth pages):
     - Extracts `access_token` from the Supabase session
     - Calls FastAPI `/api/v1/auth/me` directly (not via API route) to get user identity
     - Redirects based on user state (profile exists? email verified? has organization? onboarded? role? status?)
   - After identity verification, checks additional user states:
     - `suspended` — user is redirected to `/login?suspended=1`
     - `pending_approval` — user is redirected to onboarding flow
   - Injects user identity into request headers (`X-Auth-User`) for downstream server components
3. **Next.js API routes** → Read Supabase session from cookies, forward access token to backend
4. **FastAPI backend** → `get_current_user()` dependency validates the token via `db.auth.get_user()`, loads the profile from the `profiles` table, and returns the merged user object

### Route Protection

| Path Pattern | Protection | Audience |
|---|---|---|
| `/login`, `/signup`, `/enroll`, `/create-center`, `/auth/recover` | Public (redirect away if authenticated) | Unauthenticated users |
| `/confirm-enrollment` | Public (auth-decision page, redirect away if authenticated) | Unauthenticated users |
| `/verify-email` | Requires auth, no profile needed | Users pending verification |
| `/verified` | Special handling (authenticated users pass through with headers injected, dedicated `MANUAL_VERIFICATION_PAGE` constant in middleware) | Users completing verification |
| `/onboarding/*` | Requires auth + verified email | Users completing setup |
| `/dashboard/*` | Requires auth + profile + org + onboarded + role=admin\|teacher | Teachers and admins |
| `/student/*` | Requires auth + profile + org + onboarded + role=student | Students |

### Role Determination

Roles are stored in the `profiles.role` column (`admin`, `teacher`, `student`). Set during:
- **Admin:** Automatically assigned when creating an organization (`/auth/org/register`)
- **Teacher/Student:** Determined by which enrollment code was used (each organization has separate `teacher_enrollment_code` and `student_enrollment_code`)

### Organization Scoping (Multi-tenancy)

Every user belongs to one organization via `profiles.organization_id`. Backend services filter queries by `organization_id` from the authenticated user's profile. The `require_teacher` and `require_admin` dependencies in `app/api/deps.py` enforce role-based access at the endpoint level.

## 5. Directory Structure

### Frontend

```
LUSIA Studio - Frontend/
├── app/
│   ├── (auth)/                  # Public auth routes
│   │   ├── login/
│   │   ├── signup/
│   │   ├── enroll/              # Student/teacher enrollment via code
│   │   ├── create-center/       # Organization creation
│   │   ├── confirm-enrollment/
│   │   ├── onboarding/          # Role-specific onboarding (admin/, teacher/, student/)
│   │   ├── verify-email/
│   │   └── verified/            # Post-verification landing
│   ├── (teacher)/               # Teacher/admin protected routes
│   │   └── dashboard/
│   │       ├── calendar/        # Session scheduling
│   │       ├── assignments/     # Assignment management
│   │       ├── docs/            # Document management + worksheet generation
│   │       │   └── worksheet/[artifactId]/  # Blueprint + resolve views
│   │       ├── students/        # Student roster
│   │       ├── teachers/        # Teacher management (admin only)
│   │       ├── analytics/       # Usage and performance analytics
│   │       └── profile/         # Teacher/admin profile
│   ├── (student)/               # Student protected routes
│   │   └── student/
│   │       ├── assignments/     # View + submit assignments
│   │       ├── grades/          # View grades + CFS reports
│   │       │   └── cfs/         # CFS (student grade report) view
│   │       ├── sessions/        # View upcoming/past sessions
│   │       ├── chat/            # AI chat agent
│   │       └── profile/         # Student profile
│   ├── api/                     # Next.js API routes (thin auth proxies)
│   │   ├── auth/                # Auth endpoints (me, onboarding, enrollment, org)
│   │   ├── calendar/            # Calendar session proxies
│   │   ├── assignments/         # Assignment proxies
│   │   ├── grades/              # Grade board, periods, elements, enrollments, CFS
│   │   ├── members/             # Member CRUD + per-member grades/sessions/stats
│   │   ├── artifacts/           # Document CRUD + file upload
│   │   ├── documents/           # Document upload + processing status
│   │   ├── chat/                # Chat conversations + streaming
│   │   ├── materials/           # Curriculum, subjects, notes, subject-preferences
│   │   ├── classes/             # Classroom CRUD
│   │   ├── quiz-generation/     # Quiz generation start + stream
│   │   ├── quiz-questions/      # Quiz question CRUD
│   │   ├── quiz-images/         # Quiz image uploads
│   │   ├── worksheet-generation/ # Worksheet blueprint + resolve
│   │   ├── session-types/       # Session type CRUD
│   │   ├── analytics/           # Analytics proxies (admin, teacher, student)
│   │   ├── organizations/       # Org settings + enrollment codes
│   │   ├── student-assignments/ # Student-facing assignment proxies
│   │   ├── subjects/            # Subject catalog proxy
│   │   ├── onboarding-objectives/ # Onboarding objective tracking
│   │   └── health/              # Health check
│   └── auth/                    # Supabase auth callback + password recovery
├── components/                  # React components organized by feature
│   ├── calendar/                # Calendar views, session forms, session type manager
│   ├── assignments/             # Assignment list, detail, student assignment views
│   ├── docs/                    # Document list, editor, preview, upload
│   ├── grades/                  # Grade board, period editor, element forms, CFS
│   ├── students/                # Student list, detail, enrollment management
│   ├── teachers/                # Teacher list, management
│   ├── analytics/               # Charts, dashboards, stat cards
│   ├── chat/                    # Chat interface, message list, input
│   ├── classes/                 # Classroom CRUD, member assignment
│   ├── quiz/                    # Quiz editor, question cards, generation UI
│   ├── worksheet/               # Worksheet blueprint editor, resolution UI
│   ├── subjects/                # Subject gallery, subject picker
│   ├── materiais/               # Curriculum browser, notes viewer
│   ├── profile/                 # Profile editor (teacher/admin)
│   ├── student-profile/         # Profile editor (student)
│   ├── student-home/            # Student dashboard home
│   ├── dashboard/               # Dashboard shell, sidebar, navigation, bootstrap
│   ├── providers/               # Context providers (theme, auth, query client)
│   ├── shared/                  # Cross-feature shared components
│   └── ui/                      # Base UI primitives (buttons, dialogs, inputs, etc.)
├── lib/
│   ├── queries/                 # Feature query modules (one file per feature)
│   │   ├── calendar.ts          # Reference implementation for query module pattern
│   │   ├── grades.ts
│   │   ├── assignments.ts
│   │   ├── docs.ts
│   │   ├── members.ts
│   │   ├── students.ts
│   │   ├── teachers.ts
│   │   ├── classes.ts
│   │   ├── chat.ts
│   │   ├── analytics.ts
│   │   ├── profile.ts
│   │   ├── session-types.ts
│   │   ├── subjects.ts
│   │   └── organizations.ts
│   ├── hooks/                   # Shared React hooks
│   │   ├── use-chat-stream.ts
│   │   ├── use-deferred-query-enabled.ts
│   │   ├── use-processing-documents.ts
│   │   ├── use-session-storage-query-seed.ts
│   │   ├── usePrimaryClass.ts
│   │   ├── useStudents.ts
│   │   └── useSubjects.ts
│   ├── supabase/                # Supabase client setup (browser + server)
│   ├── tiptap/                  # TipTap editor extensions and utilities
│   ├── query-client.ts          # Custom query client (NOT React Query)
│   ├── *.server.ts              # Server-side fetch functions (SSR data loading)
│   └── *.ts                     # Client-side utilities, types, helpers
├── types/                       # TypeScript type definitions
│   ├── database.ts
│   └── subjects.ts
└── e2e/                         # Playwright E2E tests
    ├── grades.spec.ts
    └── route-compliance.spec.ts
```

### Backend

```
LUSIA Studio - Backend/
├── app/
│   ├── main.py                  # FastAPI entry point, CORS, lifespan, router mount
│   ├── core/
│   │   ├── config.py            # Settings (env vars, API keys, pipeline config)
│   │   ├── database.py          # Supabase client initialization (B2B + deprecated B2C)
│   │   └── security.py          # Auth dependencies (get_current_user, get_authenticated_supabase_user)
│   ├── api/
│   │   ├── deps.py              # Role-based dependencies (require_admin, require_teacher, require_student)
│   │   └── http/
│   │       ├── router.py        # Main router registry (all API routers included here)
│   │       ├── routers/         # API endpoint handlers (thin validation + delegation)
│   │       │   ├── auth.py              # Auth: /me, onboarding, org registration, enrollment
│   │       │   ├── calendar.py          # Calendar sessions CRUD
│   │       │   ├── assignments.py       # Assignment CRUD
│   │       │   ├── grades.py            # Grade board, periods, elements, enrollments, CFS
│   │       │   ├── members.py           # Member CRUD, per-member stats/grades/sessions
│   │       │   ├── classrooms.py        # Classroom CRUD
│   │       │   ├── artifacts.py         # Document/artifact CRUD
│   │       │   ├── document_upload.py   # File upload + pipeline trigger
│   │       │   ├── chat.py              # Chat conversations, message streaming
│   │       │   ├── materials.py         # Curriculum, notes, subject preferences
│   │       │   ├── subjects.py          # Subject catalog
│   │       │   ├── quiz_generation.py   # Quiz generation start + streaming
│   │       │   ├── quiz_questions.py    # Quiz question CRUD
│   │       │   ├── worksheet_generation.py  # Worksheet blueprint + resolution
│   │       │   ├── session_types.py     # Session type CRUD
│   │       │   ├── analytics.py         # Analytics aggregation endpoints
│   │       │   ├── organizations.py     # Organization settings, enrollment codes
│   │       │   ├── onboarding_objectives.py # Onboarding objective tracking
│   │       │   └── health.py            # Health check
│   │       ├── services/        # Business logic layer
│   │       │   ├── auth_service.py
│   │       │   ├── enrollment_service.py
│   │       │   ├── calendar_service.py
│   │       │   ├── assignments_service.py
│   │       │   ├── grades_service.py
│   │       │   ├── members_service.py
│   │       │   ├── classrooms_service.py
│   │       │   ├── artifacts_service.py
│   │       │   ├── document_upload_service.py
│   │       │   ├── materials_service.py
│   │       │   ├── subject_service.py
│   │       │   ├── quiz_generation_service.py
│   │       │   ├── quiz_questions_service.py
│   │       │   ├── worksheet_generation_service.py
│   │       │   ├── worksheet_planner.py         # Blueprint planning agent
│   │       │   ├── worksheet_blueprint_agent.py # Blueprint chat agent (LangChain)
│   │       │   ├── worksheet_resolution.py      # Blueprint → full questions
│   │       │   ├── worksheet_templates.py       # Worksheet template registry
│   │       │   ├── generation_context.py        # Shared context assembly for quiz/worksheet
│   │       │   ├── session_types_service.py
│   │       │   └── analytics_service.py
│   │       └── schemas/         # Pydantic request/response models
│   │           ├── auth.py
│   │           ├── calendar.py
│   │           ├── assignments.py
│   │           ├── grades.py
│   │           ├── members.py
│   │           ├── classrooms.py
│   │           ├── artifacts.py
│   │           ├── document_upload.py
│   │           ├── materials.py
│   │           ├── subjects.py
│   │           ├── quiz_generation.py
│   │           ├── quiz_questions.py
│   │           ├── worksheet_generation.py
│   │           ├── session_types.py
│   │           ├── analytics.py
│   │           └── onboarding_objectives.py
│   ├── chat/                    # LLM chat agent (LangGraph)
│   │   ├── agent.py             # Graph definition (START → agent → tools → agent loop)
│   │   ├── llm.py               # LLM factory (ChatOpenAI → OpenRouter)
│   │   ├── prompts.py           # System prompt builder
│   │   ├── tools.py             # Agent tools (get_curriculum_index, get_curriculum_content)
│   │   ├── service.py           # Conversation/message CRUD (DB operations)
│   │   ├── streaming.py         # SSE streaming translator
│   │   └── schemas.py           # Chat-specific Pydantic models
│   ├── pipeline/                # Document processing pipeline
│   │   ├── task_manager.py      # Async task queue (enqueue, concurrency control)
│   │   ├── tasks.py             # Pipeline orchestrator (flow routing, step execution)
│   │   ├── clients/
│   │   │   ├── mistral_ocr.py   # Mistral API client for PDF OCR
│   │   │   └── openrouter.py    # OpenRouter API client for LLM calls
│   │   └── steps/
│   │       ├── parse_document.py      # Step 1: PDF→Mistral OCR, DOCX→Pandoc, MD/TXT→passthrough
│   │       ├── extract_images.py      # Step 2: Extract and upload inline images
│   │       ├── categorize_document.py # Step 3: AI categorization + curriculum matching
│   │       ├── extract_questions.py   # Step 4: AI question extraction (exercises flows)
│   │       ├── convert_tiptap.py      # Step 5: Markdown → TipTap JSON (DOCX only)
│   │       ├── structure_markdown.py  # Markdown structuring utilities
│   │       └── image_utils.py         # Image processing helpers
│   ├── models/                  # ORM models (if any)
│   ├── schemas/                 # Shared schemas
│   └── utils/                   # Utility modules (db helpers, etc.)
├── migrations/                  # SQL migration files (numbered: 001_, 002_, ...)
└── tests/                       # Python tests (if any)
```

## 6. Role Definitions and Access Matrix

### Role Definitions

- **Admin:** Organization owner. Created when registering a new organization. Full access to all features within their organization. Can manage teachers, students, classes, and organization settings.
- **Teacher:** Joins via teacher enrollment code. Access to calendar, assignments, docs, students (scoped to own classes), analytics, and profile. Cannot manage other teachers or organization settings.
- **Student:** Joins via student enrollment code. Access to assignments (view + submit), grades (view own), sessions (view own), chat (AI agent), and profile.

### Access Matrix

| Feature | Admin | Teacher | Student |
|---|---|---|---|
| Calendar | Full | Full | View own sessions |
| Assignments | Full | Full (own classes) | View + submit |
| Docs (Documents) | Full | Full | — |
| Grades | Full | Full (own classes) | View own |
| Students | Full | View own classes | — |
| Teachers | Full (manage) | — | — |
| Classes | Full (CRUD) | View assigned | — |
| Analytics | Full (org-wide) | Own classes | — |
| Chat (AI) | — | — | Full |
| Quiz Generation | Full | Full | — |
| Worksheet Generation | Full | Full | — |
| Session Types | Full | Full | — |
| Materials (Curriculum) | Full | Full | Via chat agent |
| Profile | Own profile | Own profile | Own profile |
| Organization Settings | Full | — | — |

## 7. Center Type Definitions

Currently, only the **trial** center type exists. It is the default status assigned to new organizations upon registration (set in `auth.py` during org creation).

Center types are intended to gate feature access in the future — certain features or capabilities would be restricted based on the organization's plan/tier. The organization status is stored in the `organizations.status` column and is checked during enrollment validation (`ACTIVE_ENROLLMENT_ORG_STATUSES = {"trial", "active"}`).

This section will expand as new center types (e.g., `active`, `premium`) are added and feature-gating logic is implemented.

## 8. AI Integration Architecture

### Document Processing Pipeline (`app/pipeline/`)

Processes uploaded files (PDF, DOCX, MD, TXT) through a multi-step async pipeline:

```
Upload → Parse → Extract Images → [Category-specific flow] → Finalize
```

Three flows based on `document_category`:

| Flow | Category | Steps |
|---|---|---|
| A | `study` | Parse → Images → Categorize → [Convert TipTap] → Finalize |
| B | `study_exercises` | Parse → Images → Categorize → Extract Questions → [Convert TipTap] → Finalize |
| C | `exercises` | Parse → Images → Extract Questions → Categorize Questions → [Convert TipTap] → Finalize |

**[Convert TipTap]** only runs for DOCX files (DOCX is promoted to a native note after conversion).

Pipeline steps and their AI providers:
- **Parse:** Mistral OCR (PDF), Pandoc (DOCX), passthrough (MD/TXT)
- **Categorize:** OpenRouter — matches document to curriculum codes
- **Extract Questions:** OpenRouter — extracts structured questions from document content
- **Convert TipTap:** Local (Markdown → TipTap JSON, no AI)

Pipeline runs asynchronously via `PipelineTaskManager` with configurable concurrency (`PIPELINE_MAX_CONCURRENCY`, default 3). Orphaned jobs from server crashes are recovered on startup.

### Chat Agent (`app/chat/`)

LangGraph-based conversational AI agent for students:

- **Graph:** `START → agent → should_continue? → tools → agent (loop) / END`
- **LLM:** OpenRouter via LangChain `ChatOpenAI` (model configurable via `CHAT_MODEL` or `OPENROUTER_MODEL`, default `google/gemini-3-flash-preview`)
- **Streaming:** SSE via `astream_events` — tokens, tool calls, and tool results are streamed in real time
- **Tools:** Two curriculum-querying tools:
  - `get_curriculum_index` — hierarchical overview (levels 0-2) for a subject + year
  - `get_curriculum_content` — fetch leaf content under any curriculum node
- **Persistence:** Conversations and messages stored in DB. History is loaded on each turn.

### Quiz Generation (`routers/quiz_generation.py`, `services/quiz_generation_service.py`)

AI-powered quiz creation from curriculum context and/or uploaded documents:

- **Flow:** Create artifact → Stream question generation via SSE → Questions inserted to DB in real time
- **LLM:** OpenRouter (via `pipeline/clients/openrouter.py`)
- **Access:** Teachers and admins only (`require_teacher` dependency)

### Worksheet Generation (`routers/worksheet_generation.py`, `services/worksheet_*.py`)

Two-phase AI worksheet creation:

1. **Blueprint phase** (planner): Assembles context (curriculum, bank questions, teacher documents) → LLM generates a structured blueprint of question blocks → Teacher reviews and edits via chat agent
2. **Resolution phase**: Confirmed blueprint → Bank questions fetched from DB, AI-generated questions produced in parallel → Streamed via SSE

- **Planner:** OpenRouter via `chat_completion_stream` (Instructor `create_iterable` for structured output)
- **Blueprint agent:** LangChain `ChatOpenAI` with tool-calling for interactive blueprint editing
- **Resolution:** OpenRouter, parallel generation grouped by L1 curriculum ancestor
- **Access:** Teachers and admins only

## 9. Feature Inventory

| Feature | Frontend Route(s) | Backend Router | Backend Service | Feature Doc |
|---|---|---|---|---|
| Calendar | `/dashboard/calendar` | `calendar.py` | `calendar_service.py` | `features/calendar.md` |
| Grades | `/dashboard/students` (teacher), `/student/grades` | `grades.py` | `grades_service.py` | `features/grades.md` |
| Assignments | `/dashboard/assignments`, `/student/assignments` | `assignments.py` | `assignments_service.py` | `features/assignments.md` |
| Docs (Documents) | `/dashboard/docs` | `artifacts.py`, `document_upload.py` | `artifacts_service.py`, `document_upload_service.py` | `features/docs.md` |
| Students | `/dashboard/students` | `members.py` | `members_service.py` | `features/students.md` |
| Teachers | `/dashboard/teachers` | `members.py` | `members_service.py` | `features/teachers.md` |
| Classes | (managed via students/teachers) | `classrooms.py` | `classrooms_service.py` | `features/classes.md` |
| Analytics | `/dashboard/analytics` | `analytics.py` | `analytics_service.py` | `features/analytics.md` |
| Chat | `/student/chat` | `chat.py` | `app/chat/service.py` | `features/chat.md` |
| Quiz Generation | `/dashboard/docs` (quiz editor view) | `quiz_generation.py`, `quiz_questions.py` | `quiz_generation_service.py`, `quiz_questions_service.py` | `features/quiz.md` |
| Worksheet Generation | `/dashboard/docs/worksheet/[artifactId]` | `worksheet_generation.py` | `worksheet_generation_service.py`, `worksheet_planner.py`, `worksheet_resolution.py` | — |
| Session Types | `/dashboard/calendar` (settings) | `session_types.py` | `session_types_service.py` | `features/session-types.md` |
| Materials | (curriculum browser, accessed via docs/chat) | `materials.py`, `subjects.py` | `materials_service.py`, `subject_service.py` | `features/materials.md` |
| Onboarding | `/onboarding/*`, `/enroll`, `/create-center` | `auth.py` | `auth_service.py`, `enrollment_service.py` | `features/onboarding.md` |
| Profile | `/dashboard/profile`, `/student/profile` | (via `auth.py` onboarding endpoints) | `auth_service.py` | `features/profile.md` |
| Student Notes | `/dashboard/students` (Anotações tab) | `members.py` (notes endpoints) | `student_notes_service.py` | `features/student-notes.md` |
| Organizations | (admin settings) | `organizations.py` | — | — |
