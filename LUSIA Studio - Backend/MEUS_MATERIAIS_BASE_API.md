# Meus Materiais (Standard Base) - Backend API Contract

This document describes the backend contract implemented for the standard base flow used by both teacher/admin and student clients.

## Base URL

- ` /api/v1/materials `

## Auth

- All endpoints require `Authorization: Bearer <supabase_access_token>`.
- Role access: authenticated users only (`admin`, `teacher`, `student`).

## 1) Subject Catalog (profile-prioritized)

### Endpoint

- `GET /api/v1/materials/base/subjects`

### Behavior

- Uses current profile context:
  - `profiles.subject_ids` (mainly students)
  - `profiles.subjects_taught` (mainly teachers/admins)
  - `profiles.grade_level` (used to compute subject grade tag)
- Returns selected subjects first.
- Returns non-selected subjects split into:
  - `more_subjects.custom`: org custom subjects (`subjects.organization_id = current org`)
  - `more_subjects.by_education_level`: global subjects grouped by education level

### Response shape

```json
{
  "profile_context": {
    "role": "teacher",
    "grade_level_raw": "10o ano",
    "grade_level": "10",
    "selected_subject_ids": [],
    "selected_subject_refs": ["secundario_econ_a", "portugues"]
  },
  "selected_subjects": [
    {
      "id": "76908513-e072-481e-ac9a-c8f3f5d84af8",
      "name": "Economia A",
      "slug": "secundario_econ_a",
      "color": "#059669",
      "icon": "trending-up",
      "education_level": "secundario",
      "education_level_label": "Secundario",
      "grade_levels": ["10", "11"],
      "is_custom": false,
      "is_selected": true,
      "selected_grade": "10"
    }
  ],
  "more_subjects": {
    "custom": [
      {
        "id": "custom-subject-id",
        "name": "Projeto Integrado",
        "slug": "projeto_integrado",
        "color": "#111827",
        "icon": "book",
        "education_level": "secundario",
        "education_level_label": "Secundario",
        "grade_levels": ["10"],
        "is_custom": true,
        "is_selected": false,
        "selected_grade": null
      }
    ],
    "by_education_level": [
      {
        "education_level": "secundario",
        "education_level_label": "Secundario",
        "subjects": []
      }
    ]
  }
}
```

### Frontend notes

- Use `selected_subjects` as initial combobox section.
- Show `selected_grade` as the grade tag for selected rows.
- Use `more_subjects.custom` as the dedicated "Custom" collapsible.
- Use `more_subjects.by_education_level` for level-based collapsibles.
- Use each subject's `grade_levels` to render the right-side grade picker/popover.

## 2) Curriculum Listing

### Endpoint

- `GET /api/v1/materials/base/curriculum`

### Query params

- `subject_slug` (required) - ex: `secundario_econ_a`
- `year_level` (required) - ex: `10`
- `parent_code` (optional) - if omitted, returns root nodes
- `subject_component` (optional) - ex: `Biologia`, `Geologia`, `Fisica`, `Quimica`

### Behavior

- Returns direct children for the requested parent node.
- Returns available components for the selected subject/year (`available_components`) to support component filter UI.
- Ordering: `sequence_order`, then `code`.

### Response shape

```json
{
  "subject_slug": "secundario_econ_a",
  "year_level": "10",
  "parent_code": "secundario_econ_a_10_1",
  "subject_component": null,
  "available_components": [],
  "nodes": [
    {
      "id": "99ceb991-85ec-488e-96b8-11f17e3d228c",
      "subject_slug": "secundario_econ_a",
      "year_level": "10",
      "subject_component": null,
      "code": "secundario_econ_a_10_1_1_1",
      "parent_code": "secundario_econ_a_10_1_1",
      "level": 2,
      "sequence_order": 1,
      "title": "A Realidade Social e as Ciencias Sociais",
      "description": "....",
      "keywords": ["...."],
      "has_children": false,
      "exercise_ids": ["ECON_A_EX1"],
      "full_path": null
    }
  ]
}
```

### Frontend notes

- For tree navigation:
  - Initial load: call without `parent_code`.
  - Expand node: call with node `code` as `parent_code`.
- Open note only when user selects a level-3 code in your UX flow.

## 3) Open Note (primary: by curriculum code)

### Endpoint

- `GET /api/v1/materials/base/notes/by-code/{curriculum_code}`

### Behavior

- Finds curriculum node by `code`.
- Fetches note from `base_content` by `curriculum_id`.
- Returns both curriculum metadata and note payload.

### Response shape

```json
{
  "curriculum": {
    "id": "eba87d0c-20c5-5c77-a9cf-6ecc432bc9d2",
    "subject_slug": "secundario_econ_a",
    "year_level": "10",
    "subject_component": null,
    "code": "secundario_econ_a_10_1_1_1_1",
    "parent_code": "secundario_econ_a_10_1_1_1",
    "level": 3,
    "sequence_order": 1,
    "title": "A Realidade Social e a Interdisciplinaridade",
    "description": "...",
    "keywords": ["..."],
    "has_children": false,
    "exercise_ids": [],
    "full_path": null
  },
  "note": {
    "id": "content-row-id",
    "curriculum_id": "eba87d0c-20c5-5c77-a9cf-6ecc432bc9d2",
    "content_json": {
      "curriculum_code": "secundario_econ_a_10_1_1_1_1",
      "title": "A Realidade Social e a Interdisciplinaridade",
      "sections": []
    },
    "word_count": 1154,
    "average_read_time": 6,
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00"
  }
}
```

## 4) Open Note (direct: by curriculum id)

### Endpoint

- `GET /api/v1/materials/base/notes/by-curriculum/{curriculum_id}`

### Behavior

- For direct-link/specific cases where client already has `curriculum_id`.
- Same response shape as `by-code`.

## Error contract

- `404 Not Found`
  - curriculum code/id not found
  - note not found for curriculum
- `500 Internal Server Error`
  - Supabase query failures or misconfiguration

## Implementation files

- Router: `app/api/http/routers/materials.py`
- Service: `app/api/http/services/materials_service.py`
- Schemas: `app/api/http/schemas/materials.py`
- API registration: `app/api/http/router.py`
