---
last-updated: 2026-03-19
stability: frequently-updated
agent-routing: "Read before working on materials, curriculum, subjects, or subject preferences code."
---

# Materials

## 1. Overview

The materials feature is the reference data and curriculum browsing system for LUSIA Studio. It provides three interconnected capabilities: (1) a **subject catalog** — a queryable registry of global and org-custom subjects used across calendar sessions, grades, enrollments, and the AI chat agent; (2) a **curriculum navigator** — a hierarchical tree browser that lets teachers explore the Portuguese national curriculum organized by subject, year, and topic level; and (3) **base content notes** — study notes linked to curriculum leaf nodes, rendered as structured Markdown with LaTeX math, callouts, and GFM tables. Teachers use the "Meus Materiais" page to select preferred subjects, browse curriculum trees, and read study notes. The subject catalog is also consumed as picker data by the calendar session form, the grades enrollment flow, the onboarding objectives, the quiz/worksheet generation context, and the AI chat agent's curriculum tools.

This is largely **read-only reference data** — the only mutation is saving the user's subject preferences. There are no optimistic updates, no snapshot/restore flows, and no summary/detail payload split.

## 2. Availability

| Attribute | Value |
|---|---|
| **Roles** | Admin (full), Teacher (full), Student (read-only via chat agent's curriculum tools) |
| **Center types** | All (trial included) |
| **Teacher route** | No dedicated route — accessed as part of the docs/materials page or inline via pickers in other features |
| **Subject catalog consumers** | Calendar (SubjectSelector, SubjectPicker), Grades (enrollment subjects), Quiz/Worksheet generation context, Chat agent (curriculum tools), Onboarding objectives |

**Role-based access:**
- **Admin/Teacher:** Full access to subject catalog, curriculum navigator, notes viewer, and subject preference mutation. Can create custom subjects.
- **Student:** No direct UI access. Curriculum data is exposed indirectly through the AI chat agent's `get_curriculum_index` and `get_curriculum_content` tools.

## 3. Architecture

### 3.1 Frontend Components — `components/materiais/`

The "materiais" directory (Portuguese spelling) contains the UI for curriculum browsing and subject management. There is no dedicated route page or feature shell — these components are embedded within other feature views.

**Component tree:**

```
SubjectsGallery              (horizontal scrollable card gallery of selected subjects)
├── SubjectCard              (folder-icon SVG card per subject)
└── AddSubjectCard           (dashed "add subject" card)
SubjectSelector              (dialog for selecting/deselecting subjects from the full catalog)
├── CollapsibleGroup         ("Minhas disciplinas", "Personalizadas", education level groups)
└── SubjectRow               (shared ui component — checkbox row with color, icon, grade badges)
CurriculumNavigator          (dialog with left tree panel + right note viewer)
├── TreeNode                 (recursive expand/collapse tree)
└── NoteViewer               (Markdown renderer with callouts, math, tables)
IntegratedCurriculumViewer   (inline version of CurriculumNavigator — same tree + note layout without dialog)
├── TreeNode                 (same recursive tree pattern)
└── NoteViewer
BaseStandardTable            (accordion table of subjects with expandable curriculum rows)
├── SubjectSection           (collapsible subject row with grade selector)
└── CurriculumRow            (recursive expand/collapse curriculum node)
PageHeader                   (page title + search-style subject selector trigger)
```

**Key patterns:**
- **No feature shell.** Materials components manage their own local state via `useState`/`useEffect`. There is no shell component that orchestrates queries and mutations.
- **Imperative fetch via `lib/materials.ts`.** Curriculum nodes and notes are fetched imperatively using `fetchCurriculumNodes()` and `fetchNoteByCurriculumId()` rather than through the custom query client's `useQuery`. These functions use a legacy `cachedFetch` from `lib/cache.ts`.
- **Two curriculum viewers.** `CurriculumNavigator` renders inside a `Dialog`; `IntegratedCurriculumViewer` renders inline. Both share the same data fetching pattern and `NoteViewer`.
- **Tree state is local.** Each tree instance manages `rootNodes`, `treeState` (per-node expanded/loading/children), `activeId`, `noteData`, and `noteLoading` in local `useState`. Children are fetched lazily on expand.
- **Level-based leaf detection.** Curriculum nodes at level 0-2 are treated as folders (expandable); level 3+ are treated as leaf notes (clickable to load content).

### 3.2 Frontend Components — `components/subjects/`

**`SubjectCombobox.tsx`** — A multi-select combobox for picking subjects. Groups subjects into "Disciplinas" (global) and "Personalizadas" (custom). Uses the shared `Combobox` UI primitive. Consumes `Subject` type from `types/subjects.ts`. Used in enrollment flows and grade configuration.

### 3.3 Client Libraries

**`lib/materials.ts`** — Types and API client for the materials feature. Exports:
- TypeScript types: `MaterialSubject`, `SubjectCatalog`, `CurriculumNode`, `CurriculumListResponse`, `CurriculumNoteResponse`, `BaseContentNote`, `ContentJson`, `SubjectStatus`
- Fetch functions: `fetchSubjectCatalog()`, `fetchCurriculumNodes()`, `fetchNoteByCode()`, `fetchNoteByCurriculumId()`, `fetchCurriculumTitlesBatch()`, `updateSubjectPreferences()`
- All fetch functions use `cachedFetch` from `lib/cache.ts` (legacy pattern — not the custom query client)

**`lib/queries/subjects.ts`** — Query module for the subject catalog. Uses the custom query client. Exports:
- `SUBJECT_CATALOG_QUERY_KEY = "reference:subject-catalog"` — single static key (no params)
- `useSubjectCatalogQuery(enabled?)` — `staleTime: 10 * 60_000` (10 minutes)
- `prefetchSubjectCatalogQuery()` — imperative prefetch

**`lib/hooks/useSubjects.ts`** — Hook for the flat subject list (global + org-custom). Used by `SubjectCombobox` and enrollment flows. Exports:
- `buildSubjectsQueryKey({ educationLevel, grade, includeCustom })` — pattern: `reference:subjects?...`
- `useSubjects({ educationLevel?, grade?, includeCustom?, enabled? })` — `staleTime: 10 * 60_000` (10 minutes)
- `prefetchSubjectsQuery(options?)` — imperative prefetch

**`types/subjects.ts`** — Minimal `Subject` type (id, name, slug, color, icon, education_level, grade_levels, is_custom). Used by `SubjectCombobox` and `useSubjects`.

### 3.4 Next.js API Routes

All thin auth proxies:

| Route | Method | Backend Path | Auth | Purpose |
|---|---|---|---|---|
| `api/materials/subjects` | `GET` | `/api/v1/materials/base/subjects` | Required | Subject catalog (profile-prioritized) |
| `api/materials/subject-preferences` | `PATCH` | `/api/v1/materials/base/subject-preferences` | Required | Save user's subject preferences |
| `api/materials/curriculum` | `GET` | `/api/v1/materials/base/curriculum` | Required | List curriculum nodes (subject+year+parent) |
| `api/materials/curriculum/titles` | `GET` | `/api/v1/materials/base/curriculum/titles` | Required | Batch resolve curriculum codes to titles |
| `api/materials/notes/by-code/[code]` | `GET` | `/api/v1/materials/base/notes/by-code/{code}` | Required | Get note by curriculum code |
| `api/materials/notes/by-curriculum/[id]` | `GET` | `/api/v1/materials/base/notes/by-curriculum/{id}` | Required | Get note by curriculum ID |
| `api/subjects` | `GET` | `/api/v1/subjects` or `/api/v1/subjects/me` | Optional (required for `scope=me`) | Flat subject list (global, or global+custom) |

**Note on `api/subjects`:** When `scope=me` is passed, the route calls the authenticated `/api/v1/subjects/me` endpoint. Without `scope`, it calls the public `/api/v1/subjects` endpoint (no auth required — used during onboarding).

### 3.5 Backend Router — `routers/materials.py`

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| `GET` | `/base/subjects` | `get_current_user` | `list_base_subject_catalog()` |
| `PATCH` | `/base/subject-preferences` | `get_current_user` | `update_subject_preferences()` |
| `GET` | `/base/curriculum` | `get_current_user` | `list_curriculum_nodes()` |
| `GET` | `/base/curriculum/titles` | `get_current_user` | `get_curriculum_titles_batch()` |
| `GET` | `/base/notes/by-code/{code}` | `get_current_user` | `get_base_note_by_code()` |
| `GET` | `/base/notes/by-curriculum/{id}` | `get_current_user` | `get_base_note_by_curriculum_id()` |

**Key details:**
- All endpoints use `get_current_user` (all roles can access).
- Curriculum and notes endpoints use `get_content_db` (the content database). Subject catalog and preferences use `get_b2b_db` (the B2B database).
- The content DB call (`get_content_db`) now redirects to the B2B client — the former B2C content library is deprecated.

### 3.6 Backend Router — `routers/subjects.py`

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| `GET` | `/subjects` | None (public) | `get_global_subjects()` |
| `GET` | `/subjects/me` | `get_current_user` | `get_subjects_for_org()` |
| `POST` | `/subjects/custom` | `require_teacher` | `create_custom_subject()` |

**Key details:**
- `GET /subjects` is the only public (unauthenticated) endpoint — used during onboarding for subject selection.
- `GET /subjects/me` returns global subjects plus the user's org-custom subjects.
- `POST /subjects/custom` creates org-scoped custom subjects. Only admins and teachers can create.

### 3.7 Backend Service — `services/materials_service.py`

**Subject catalog assembly** (`list_base_subject_catalog` / `build_subject_catalog`):
- Calls `get_subjects_for_org()` to get global + org-custom subjects.
- Cross-references the user's profile (`subject_ids`, `subjects_taught`, `grade_level`) to identify "selected" subjects.
- Builds a structured catalog response with three buckets: `selected_subjects` (profile-matched), `more_subjects.custom` (org custom, not selected), and `more_subjects.by_education_level` (remaining global subjects grouped by education level).
- Subjects in each bucket are sorted alphabetically. Education level groups follow a predefined order: `basico_1_ciclo`, `basico_2_ciclo`, `basico_3_ciclo`, `secundario`, `superior`.
- Each subject includes a computed `selected_grade` based on the user's `grade_level` profile field.

**Curriculum navigation** (`list_curriculum_nodes`):
- Queries the `curriculum` table by `subject_id`, `year_level`, and optional `parent_id` (null for root nodes) and `subject_component`.
- Orders by `sequence_order` then `code`.
- Also fetches available `subject_component` values for the given subject+year (for multi-component subjects).
- Returns mapped nodes with: `id`, `code`, `level`, `sequence_order`, `title`, `description`, `keywords`, `has_children`, `exercise_ids`, `full_path`.

**Note retrieval** (`get_base_note_by_code`, `get_base_note_by_curriculum_id`):
- Resolves curriculum by code or ID from the `curriculum` table.
- Fetches the associated note from the `base_content` table by `curriculum_id`.
- Returns both the curriculum node and the note (null if no note exists).
- Notes contain structured JSON: `content_json` with `title` and `sections[]` (each section has `section_title` and `content` as Markdown).

**Batch title resolution** (`get_curriculum_titles_batch`):
- Resolves multiple curriculum codes to titles in a single query using `.in_("code", codes)`.
- Unknown codes fall back to the code itself — no error state needed.

**Subject preferences** (`update_subject_preferences`):
- Updates `profiles.subject_ids` with the new list of subject IDs.
- Sets `updated_at` timestamp.

### 3.8 Backend Service — `services/subject_service.py`

**No summary/detail split.** Subjects are small reference data — a single `SUBJECT_SELECT` constant covers all views:

```
SUBJECT_SELECT = "id,name,slug,color,icon,education_level,grade_levels,status,organization_id,has_national_exam"
```

**`get_global_subjects(db, education_level?, grade?)`:**
- Queries `subjects` table where `organization_id IS NULL` and `active = true`.
- Optional filters: `education_level`, `grade` (client-side array filter since Supabase REST doesn't support array-contains easily).
- Annotates each row with `is_custom = false`.

**`get_subjects_for_org(db, org_id, education_level?, grade?)`:**
- Runs two queries: global subjects + org-custom subjects (`organization_id = org_id, active = true`).
- Merges results and annotates with `is_custom`.

**`create_custom_subject(db, org_id, payload)`:**
- Inserts a new subject with `organization_id = org_id`.
- Returns the created row with `is_custom = true`.

### 3.9 Backend Schemas

**`schemas/materials.py`:**

| Schema | Purpose |
|---|---|
| `MaterialsSubjectCatalogOut` | Full subject catalog response: `profile_context`, `selected_subjects[]`, `more_subjects` |
| `MaterialSubjectOut` | Single subject: id, name, slug, color, icon, education_level, education_level_label, grade_levels, status, has_national_exam, is_custom, is_selected, selected_grade |
| `MaterialSubjectEducationGroupOut` | Education level group: level, label, subjects[] |
| `MaterialSubjectMoreOut` | Load-more bucket: custom[], by_education_level[] |
| `ProfileMaterialsContextOut` | Profile context: role, grade_level, selected_subject_ids, selected_subject_refs |
| `CurriculumNodeOut` | Curriculum node: id, code, level, sequence_order, title, description, keywords, has_children, exercise_ids, full_path |
| `CurriculumListOut` | Curriculum list response: year_level, subject_component, available_components, nodes[] |
| `BaseContentNoteOut` | Base note: id, curriculum_id, content_json, word_count, average_read_time |
| `CurriculumNoteOut` | Note response: curriculum node + optional note |
| `UpdateSubjectPreferencesIn` | Preference mutation input: subject_ids[] |

**`schemas/subjects.py`:**

| Schema | Purpose |
|---|---|
| `SubjectOut` | Flat subject: id, name, slug, color, icon, education_level, grade_levels, status, is_custom |
| `SubjectCreateRequest` | Custom subject creation: education_level (required), name (required), slug, color, icon, grade_levels |

## 4. Cache Contract

| Attribute | Value |
|---|---|
| **Query namespace** | `reference:subject-catalog` (catalog), `reference:subjects?...` (flat list) |
| **Catalog staleTime** | 600,000ms (10 minutes) |
| **Subjects staleTime** | 600,000ms (10 minutes) |

**Subject catalog query key:**

Static key: `reference:subject-catalog`

No params — the catalog is personalized server-side based on the authenticated user's profile. The long `staleTime` reflects that subject data is stable reference data that rarely changes within a session.

**Flat subject list query keys:**

Pattern: `buildSubjectsQueryKey({ educationLevel, grade, includeCustom })`

Shape: `reference:subjects?education_level=...&grade=...&scope=me`

Encodes filter dimensions. The `scope=me` param triggers the authenticated endpoint.

**Curriculum and notes caching:**

Curriculum nodes and notes do NOT use the custom query client. They use a legacy `cachedFetch` from `lib/cache.ts`:
- `curriculum:{subjectId}:{yearLevel}:{parentId}:{component}` — curriculum node trees
- `noteByCurriculum:{curriculumId}` — notes by curriculum ID (5-minute cache)
- `noteByCode:{code}` — notes by curriculum code (5-minute cache)
- `curriculumTitlesBatch:{codes}` — batch title resolution (5-minute cache)
- `subjectCatalog` — legacy cache key for the materials page catalog (separate from query client key)

**Invalidation rules:**

| Trigger | What is invalidated |
|---|---|
| Subject preferences saved | `cacheInvalidate("subjectCatalog")` from legacy cache |
| Custom subject created | No automatic invalidation (the subjects query stale time handles it) |

## 5. Optimistic Update Strategy

**Not applicable.** The materials feature is read-only except for subject preference saves, which use a simple fire-and-forget PATCH without optimistic updates. The only cache interaction on mutation is invalidating the legacy `subjectCatalog` cache key after a successful preference save.

## 6. Payload Shapes

### Subject Catalog Payload (MaterialsSubjectCatalogOut)

Used by `GET /api/v1/materials/base/subjects`. Single payload shape — no summary/detail split.

| Field | Type | Purpose |
|---|---|---|
| `profile_context` | `object` | User's role, grade_level, selected_subject_ids, selected_subject_refs |
| `selected_subjects` | `MaterialSubject[]` | Subjects matching user's profile preferences — displayed first |
| `more_subjects.custom` | `MaterialSubject[]` | Org-custom subjects not currently selected |
| `more_subjects.by_education_level` | `EducationGroup[]` | Remaining global subjects grouped by education level |

**MaterialSubject fields:**

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Subject UUID |
| `name` | `string` | Display name |
| `slug` | `string \| null` | URL-friendly identifier |
| `color` | `string \| null` | Hex color for UI |
| `icon` | `string \| null` | Icon identifier for `getSubjectIcon()` |
| `education_level` | `string` | Education level key (e.g. `secundario`) |
| `education_level_label` | `string` | Human-readable label (e.g. "Secundario") |
| `grade_levels` | `string[]` | Applicable grade years (e.g. `["10", "11", "12"]`) |
| `status` | `string \| null` | Content status: `full`, `structure`, `viable`, `gpa_only` |
| `has_national_exam` | `boolean` | Whether subject has a national exam |
| `is_custom` | `boolean` | True if org-created, false if global |
| `is_selected` | `boolean` | True if matches user's profile preferences |
| `selected_grade` | `string \| null` | Pre-resolved grade based on user's profile |

### Flat Subject Payload (SubjectOut)

Used by `GET /api/v1/subjects` and `GET /api/v1/subjects/me`. Simpler shape than the catalog — no profile context, no grouping, no selected_grade.

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Subject UUID |
| `name` | `string` | Display name |
| `slug` | `string \| null` | URL-friendly identifier |
| `color` | `string \| null` | Hex color |
| `icon` | `string \| null` | Icon identifier |
| `education_level` | `string` | Education level key |
| `grade_levels` | `string[] \| null` | Applicable grades |
| `status` | `string \| null` | Content status |
| `is_custom` | `boolean` | Computed: `organization_id IS NOT NULL` |

### Curriculum Node Payload (CurriculumNodeOut)

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Curriculum node UUID |
| `code` | `string` | Curriculum code (hierarchical) |
| `level` | `int \| null` | Depth level (0=domain, 1=subdomain, 2=topic, 3+=leaf) |
| `sequence_order` | `int \| null` | Sort position within parent |
| `title` | `string` | Node title |
| `description` | `string \| null` | Optional description |
| `keywords` | `string[]` | Search keywords |
| `has_children` | `boolean` | Whether this node has child nodes |
| `exercise_ids` | `string[]` | Linked exercise IDs |
| `full_path` | `string \| null` | Full hierarchical path |
| `year_level` | `string \| null` | Grade year |
| `subject_component` | `string \| null` | Component for multi-discipline subjects |

### Base Content Note Payload (BaseContentNoteOut)

| Field | Type | Purpose |
|---|---|---|
| `id` | `string \| null` | Note UUID |
| `curriculum_id` | `string` | Linked curriculum node |
| `content_json` | `object` | Structured content: `{ title, sections: [{ section_title, content }] }` |
| `word_count` | `int \| null` | Total word count |
| `average_read_time` | `int \| null` | Estimated read time in minutes |
| `created_at` | `string \| null` | Creation timestamp |
| `updated_at` | `string \| null` | Last update timestamp |

## 7. Database

### Tables Involved

| Table | Database | Description |
|---|---|---|
| `subjects` | B2B | Subject registry — global (org_id IS NULL) and org-custom subjects |
| `curriculum` | B2B (via content DB redirect) | Hierarchical curriculum tree nodes by subject, year, and component |
| `base_content` | B2B (via content DB redirect) | Study notes linked to curriculum leaf nodes |
| `profiles` | B2B | User profiles — `subject_ids` column stores subject preferences |

Cross-reference: See `data/curriculum.md` for full entity schemas.

### Schema — `subjects` (from `002_subjects.sql`)

| Column | Type | Purpose |
|---|---|---|
| `id` | `uuid` (PK) | Subject ID |
| `name` | `text` | Subject name |
| `slug` | `text` | URL-friendly identifier |
| `color` | `text` | Hex color |
| `icon` | `text` | Icon identifier |
| `education_level` | `text` | Education level key |
| `grade_levels` | `text[]` | Array of applicable grade years |
| `organization_id` | `uuid` (FK) | NULL for global subjects, org UUID for custom |
| `active` | `boolean` | Soft delete flag |
| `created_at` | `timestamptz` | Creation timestamp |
| `status` | `text` | Content availability status |
| `has_national_exam` | `boolean` | National exam flag |

### Indexes

| Index | Table | Columns | Serves |
|---|---|---|---|
| `idx_subjects_org` | `subjects` | `(organization_id)` | Fetching org-custom subjects |
| `idx_subjects_slug` | `subjects` | `(slug)` | Lookup by slug |

### Read Patterns

| Pattern | Query Shape |
|---|---|
| Global subjects | `.is_("organization_id", "null").eq("active", True).order("name")` |
| Org subjects | `.eq("organization_id", org_id).eq("active", True).order("name")` |
| Curriculum root nodes | `.eq("subject_id", sid).eq("year_level", yr).is_("parent_id", "null").order("sequence_order")` |
| Curriculum children | `.eq("subject_id", sid).eq("year_level", yr).eq("parent_id", pid).order("sequence_order")` |
| Note by curriculum ID | `.eq("curriculum_id", cid).limit(1)` |
| Curriculum by code | `.eq("code", code).limit(1)` |
| Batch title resolution | `.in_("code", codes)` |

## 8. Edge Cases and Notes

### Two Type Systems for Subjects

The codebase has two parallel type representations for subjects:
- `MaterialSubject` (from `lib/materials.ts`) — used by the materials page components. Includes `education_level_label`, `is_selected`, `selected_grade`, `has_national_exam`. Richer type for the catalog picker.
- `Subject` (from `types/subjects.ts`) — used by `SubjectCombobox` and `useSubjects`. Simpler flat type without profile-derived fields.

These correspond to two different backend endpoints: `GET /materials/base/subjects` returns `MaterialsSubjectCatalogOut` (grouped catalog with profile context), while `GET /subjects` and `GET /subjects/me` return `list[SubjectOut]` (flat list).

### Two Caching Mechanisms

Subject data uses two different caching approaches:
- `lib/queries/subjects.ts` uses the custom query client (`useQuery`, `queryClient.fetchQuery`) — the standard pattern.
- `lib/materials.ts` uses a legacy `cachedFetch` from `lib/cache.ts` — a simpler key-value cache with TTL.

Curriculum nodes and notes use only the legacy `cachedFetch`. The subject catalog is cached in both systems (different keys). This dual caching is a known inconsistency.

### Grade-Level Filtering Is Client-Side

`subject_service.py` filters by `grade` on the client side (`_filter_by_grade`) rather than in the database query. The comment explains: "Supabase REST doesn't support array-contains easily." This is acceptable because the full subject list is small (hundreds, not thousands).

### Content DB Redirect

The `get_content_db()` function historically returned a separate B2C Supabase client. It now redirects to the B2B client. Curriculum and notes endpoints still call `get_content_db` via `Depends(get_content_db)` in the router, but this resolves to the same database.

### Subject Status Meanings

| Status | Meaning |
|---|---|
| `full` | Full curriculum content available |
| `structure` | Curriculum structure exists but no notes |
| `viable` | Subject exists but no curriculum — shown with warning in selectors |
| `gpa_only` | Subject exists only for GPA calculation — shown with warning |

### No Server-Side Initial Data

Unlike the calendar reference implementation, the materials feature does not use server-side initial data fetching. There is no `*.server.ts` file and no `page.tsx` that passes `initialData` to a shell. All data is fetched client-side. This is acceptable because materials data has a 10-minute stale time — on revisit, cached data renders immediately.

### Public Subject Endpoint

`GET /api/v1/subjects` (no auth) is the only public endpoint in this feature. It returns global subjects only and is used during onboarding so users can select subjects before full authentication is complete.

## 9. Reference Status

Materials is **not** the reference implementation for the codebase's engineering standards. It deviates from the calendar pattern in several ways that are acceptable given its read-only, reference-data nature:

| Pattern | Calendar (Reference) | Materials |
|---|---|---|
| Feature shell | `CalendarShell.tsx` orchestrates all queries/mutations | No shell — components self-manage |
| Query module | Full contract with snapshot/restore/sync/invalidation | Minimal: `useSubjectCatalogQuery` + `useSubjects` (read-only) |
| Caching | Custom query client only | Dual: query client + legacy `cachedFetch` |
| Server initial data | `page.tsx` → `*.server.ts` → shell `initialData` | None — client-side only |
| Summary/detail split | `SESSION_LIST_SELECT` vs `SESSION_DETAIL_SELECT` | Single `SUBJECT_SELECT` (small payload) |
| Optimistic updates | Full snapshot/restore/sync flow | None (read-only except preferences PATCH) |
| Batch hydration | `_batch_hydrate_session_summaries()` | Not needed (subjects are self-contained) |

**What read-only features can skip:** Per `STANDARDS.md` Section 5, read-only features can omit snapshot/restore, cache sync functions, and optimistic helpers. Materials documents why these are omitted: the feature has no mutations that require them.
