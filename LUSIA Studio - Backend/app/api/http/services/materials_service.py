"""
Materials service — reusable logic for standard base content navigation.

Flow:
1) Subject catalog tailored by user profile (selected first + load-more groups)
2) Curriculum navigation by subject/grade/component/parent
3) Base note retrieval by curriculum code or curriculum id
"""

from __future__ import annotations

import re
import unicodedata
from typing import Optional

from supabase import Client

from app.api.http.services.subject_service import get_subjects_for_org
from app.utils.db import parse_single_or_404, supabase_execute

EDUCATION_LEVEL_ORDER = [
    "basico_1_ciclo",
    "basico_2_ciclo",
    "basico_3_ciclo",
    "secundario",
    "superior",
]

EDUCATION_LEVEL_LABELS = {
    "basico_1_ciclo": "Basico 1o ciclo",
    "basico_2_ciclo": "Basico 2o ciclo",
    "basico_3_ciclo": "Basico 3o ciclo",
    "secundario": "Secundario",
    "superior": "Superior",
}


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    lowered = str(value).strip().casefold()
    return "".join(
        ch for ch in unicodedata.normalize("NFD", lowered) if unicodedata.category(ch) != "Mn"
    )


def _extract_grade_level(raw_grade_level: str | None) -> Optional[str]:
    if not raw_grade_level:
        return None
    match = re.search(r"\d+", raw_grade_level)
    if match:
        return match.group(0)
    cleaned = str(raw_grade_level).strip()
    return cleaned or None


def _selected_subject_inputs(current_user: dict) -> tuple[set[str], set[str], list[str]]:
    selected_subject_ids = {
        str(item).strip()
        for item in (current_user.get("subject_ids") or [])
        if str(item).strip()
    }
    selected_refs_raw = [
        str(item).strip()
        for item in (current_user.get("subjects_taught") or [])
        if str(item).strip()
    ]
    selected_refs_normalized = {_normalize_text(item) for item in selected_refs_raw}
    return selected_subject_ids, selected_refs_normalized, selected_refs_raw


def _is_selected_subject(
    subject: dict,
    *,
    selected_subject_ids: set[str],
    selected_subject_refs: set[str],
) -> bool:
    subject_id = str(subject.get("id") or "").strip()
    if subject_id and subject_id in selected_subject_ids:
        return True

    subject_tokens = {
        _normalize_text(subject_id),
        _normalize_text(subject.get("slug")),
        _normalize_text(subject.get("name")),
    }
    return any(token and token in selected_subject_refs for token in subject_tokens)


def _resolve_selected_grade(grade_levels: list[str], profile_grade: str | None) -> Optional[str]:
    if profile_grade and profile_grade in grade_levels:
        return profile_grade
    if grade_levels:
        return grade_levels[0]
    return None


def _education_label(level: str | None) -> str:
    if not level:
        return "Other"
    return EDUCATION_LEVEL_LABELS.get(level, level.replace("_", " ").title())


def _subject_sort_key(subject: dict) -> tuple:
    return (_normalize_text(subject.get("name")), str(subject.get("id") or ""))


def build_subject_catalog(subjects: list[dict], current_user: dict) -> dict:
    """
    Build frontend-friendly subject picker payload.

    - selected_subjects: what should appear first in the combobox
    - more_subjects.custom: org custom subjects not currently selected
    - more_subjects.by_education_level: remaining global subjects grouped by level
    """
    profile_grade = _extract_grade_level(current_user.get("grade_level"))
    selected_ids, selected_refs, selected_refs_raw = _selected_subject_inputs(current_user)

    selected_subjects: list[dict] = []
    non_selected_custom: list[dict] = []
    grouped_global: dict[str, list[dict]] = {}

    for row in subjects:
        grade_levels = [str(item) for item in (row.get("grade_levels") or [])]
        is_selected = _is_selected_subject(
            row,
            selected_subject_ids=selected_ids,
            selected_subject_refs=selected_refs,
        )
        item = {
            "id": str(row.get("id")),
            "name": row.get("name"),
            "slug": row.get("slug"),
            "color": row.get("color"),
            "icon": row.get("icon"),
            "education_level": row.get("education_level"),
            "education_level_label": _education_label(row.get("education_level")),
            "grade_levels": grade_levels,
            "is_custom": bool(row.get("is_custom", False)),
            "is_selected": is_selected,
            "selected_grade": _resolve_selected_grade(grade_levels, profile_grade)
            if is_selected
            else None,
        }

        if is_selected:
            selected_subjects.append(item)
            continue

        if item["is_custom"]:
            non_selected_custom.append(item)
            continue

        level = str(item.get("education_level") or "other")
        grouped_global.setdefault(level, []).append(item)

    selected_subjects.sort(key=_subject_sort_key)
    non_selected_custom.sort(key=_subject_sort_key)
    for level_subjects in grouped_global.values():
        level_subjects.sort(key=_subject_sort_key)

    known_groups = [
        {
            "education_level": level,
            "education_level_label": _education_label(level),
            "subjects": grouped_global[level],
        }
        for level in EDUCATION_LEVEL_ORDER
        if grouped_global.get(level)
    ]
    extra_levels = sorted(
        [level for level in grouped_global.keys() if level not in EDUCATION_LEVEL_ORDER],
        key=_normalize_text,
    )
    extra_groups = [
        {
            "education_level": level,
            "education_level_label": _education_label(level),
            "subjects": grouped_global[level],
        }
        for level in extra_levels
    ]

    return {
        "profile_context": {
            "role": current_user.get("role"),
            "grade_level_raw": current_user.get("grade_level"),
            "grade_level": profile_grade,
            "selected_subject_ids": sorted(selected_ids),
            "selected_subject_refs": selected_refs_raw,
        },
        "selected_subjects": selected_subjects,
        "more_subjects": {
            "custom": non_selected_custom,
            "by_education_level": known_groups + extra_groups,
        },
    }


def list_base_subject_catalog(db: Client, current_user: dict) -> dict:
    org_id = str(current_user["organization_id"])
    subjects = get_subjects_for_org(db, org_id)
    return build_subject_catalog(subjects, current_user)


def _map_curriculum_row(row: dict) -> dict:
    return {
        "id": str(row.get("id")),
        "subject_slug": None, 
        "year_level": row.get("year_level"),
        "subject_component": row.get("subject_component"),
        "code": row.get("code"),
        "parent_code": None,
        "level": row.get("level"),
        "sequence_order": row.get("sequence_order"),
        "title": row.get("title"),
        "description": row.get("description"),
        "keywords": row.get("keywords") or [],
        "has_children": bool(row.get("has_children", False)),
        "exercise_ids": row.get("exercise_ids") or [],
        "full_path": row.get("full_path"),
    }


def list_curriculum_nodes(
    db: Client,
    *,
    subject_id: str,
    year_level: str,
    parent_id: str | None = None,
    subject_component: str | None = None,
) -> dict:
    # Query curriculum by IDs directly
    query = (
        db.table("curriculum")
        .select("*")
        .eq("subject_id", subject_id)
        .eq("year_level", year_level)
    )

    if subject_component:
        query = query.eq("subject_component", subject_component)

    if parent_id is None:
        query = query.is_("parent_id", "null")
    else:
        query = query.eq("parent_id", parent_id)

    response = supabase_execute(
        query.order("sequence_order", desc=False).order("code", desc=False),
        entity="curriculum",
    )

    # Fetch available components
    components_response = supabase_execute(
        db.table("curriculum")
        .select("subject_component")
        .eq("subject_id", subject_id)
        .eq("year_level", year_level),
        entity="curriculum components",
    )
    available_components = sorted(
        {
            str(row.get("subject_component"))
            for row in (components_response.data or [])
            if row.get("subject_component")
        }
    )

    return {
        "subject_slug": None, # Deprecated/Not used
        "year_level": year_level,
        "parent_code": None, # Deprecated/Not used
        "subject_component": subject_component,
        "available_components": available_components,
        "nodes": [_map_curriculum_row(row) for row in (response.data or [])],
    }


def _map_base_note_row(row: dict | None) -> dict | None:
    if not row:
        return None
    return {
        "id": str(row.get("id")) if row.get("id") else None,
        "curriculum_id": str(row.get("curriculum_id")),
        "content_json": row.get("content_json") or {},
        "word_count": row.get("word_count"),
        "average_read_time": row.get("average_read_time"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _get_curriculum_by_code(db: Client, curriculum_code: str) -> dict:
    response = supabase_execute(
        db.table("curriculum").select("*").eq("code", curriculum_code).limit(1),
        entity="curriculum node",
    )
    return parse_single_or_404(response, entity="curriculum node")


def _get_curriculum_by_id(db: Client, curriculum_id: str) -> dict:
    response = supabase_execute(
        db.table("curriculum").select("*").eq("id", curriculum_id).limit(1),
        entity="curriculum node",
    )
    return parse_single_or_404(response, entity="curriculum node")


def _get_base_note_by_curriculum_id(db: Client, curriculum_id: str) -> dict | None:
    response = supabase_execute(
        db.table("base_content").select("*").eq("curriculum_id", curriculum_id).limit(1),
        entity="base note",
    )
    if not response.data:
        return None
    return response.data[0]


def get_base_note_by_code(db: Client, curriculum_code: str) -> dict:
    curriculum_row = _get_curriculum_by_code(db, curriculum_code)
    note_row = _get_base_note_by_curriculum_id(db, str(curriculum_row["id"]))
    return {
        "curriculum": _map_curriculum_row(curriculum_row),
        "note": _map_base_note_row(note_row),
    }


def get_base_note_by_curriculum_id(db: Client, curriculum_id: str) -> dict:
    curriculum_row = _get_curriculum_by_id(db, curriculum_id)
    note_row = _get_base_note_by_curriculum_id(db, curriculum_id)
    return {
        "curriculum": _map_curriculum_row(curriculum_row),
        "note": _map_base_note_row(note_row),
    }


def update_subject_preferences(db: Client, user_id: str, subject_ids: list[str]) -> None:
    """
    Update user's subject preferences (profiles.subject_ids).
    Stores the list of subject IDs the user has selected in "Meus Materiais".
    """
    from datetime import datetime, timezone
    
    supabase_execute(
        db.table("profiles")
        .update({
            "subject_ids": subject_ids,
            "updated_at": datetime.now(timezone.utc).isoformat()
        })
        .eq("id", user_id),
        entity="profile subject preferences",
    )
