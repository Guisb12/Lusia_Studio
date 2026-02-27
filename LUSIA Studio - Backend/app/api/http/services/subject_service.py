"""
Subject service — reusable query logic for subjects.

Subjects come in two flavours:
  • Global  — organization_id IS NULL, visible to everyone.
  • Custom  — organization_id set, visible only to members of that org.
"""

from __future__ import annotations

from supabase import Client

from app.api.http.schemas.subjects import SubjectCreateRequest
from app.utils.db import parse_single_or_404, supabase_execute

SUBJECT_SELECT = (
    "id,name,slug,color,icon,education_level,grade_levels,status,organization_id"
)


def _add_is_custom(row: dict) -> dict:
    """Annotate a subject row with a computed is_custom flag."""
    row["is_custom"] = row.get("organization_id") is not None
    row.pop("organization_id", None)
    return row


def _filter_by_grade(subjects: list[dict], grade: str) -> list[dict]:
    """Client-side filter because Supabase REST doesn't support array-contains easily."""
    return [s for s in subjects if grade in (s.get("grade_levels") or [])]


# ── Public: global subjects only ────────────────────────────────────────

def get_global_subjects(
    db: Client,
    *,
    education_level: str | None = None,
    grade: str | None = None,
) -> list[dict]:
    query = (
        db.table("subjects")
        .select(SUBJECT_SELECT)
        .is_("organization_id", "null")
        .eq("active", True)
        .order("name")
    )

    if education_level:
        query = query.eq("education_level", education_level)

    result = supabase_execute(query, entity="subjects")
    subjects = [_add_is_custom(s) for s in (result.data or [])]

    if grade:
        subjects = _filter_by_grade(subjects, grade)

    return subjects


# ── Authenticated: global + org-custom subjects ─────────────────────────

def get_subjects_for_org(
    db: Client,
    org_id: str,
    *,
    education_level: str | None = None,
    grade: str | None = None,
) -> list[dict]:
    """Return global subjects PLUS custom subjects belonging to *org_id*."""
    # 1. Global subjects
    global_q = (
        db.table("subjects")
        .select(SUBJECT_SELECT)
        .is_("organization_id", "null")
        .eq("active", True)
        .order("name")
    )
    if education_level:
        global_q = global_q.eq("education_level", education_level)
    global_result = supabase_execute(global_q, entity="subjects")

    # 2. Org-custom subjects
    custom_q = (
        db.table("subjects")
        .select(SUBJECT_SELECT)
        .eq("organization_id", org_id)
        .eq("active", True)
        .order("name")
    )
    if education_level:
        custom_q = custom_q.eq("education_level", education_level)
    custom_result = supabase_execute(custom_q, entity="subjects")

    subjects = [
        _add_is_custom(s)
        for s in (global_result.data or []) + (custom_result.data or [])
    ]

    if grade:
        subjects = _filter_by_grade(subjects, grade)

    return subjects


# ── Create custom subject ───────────────────────────────────────────────

def create_custom_subject(
    db: Client,
    org_id: str,
    payload: SubjectCreateRequest,
) -> dict:
    insert_data = {
        "organization_id": org_id,
        "education_level": payload.education_level,
        "name": payload.name,
        "slug": payload.slug,
        "color": payload.color,
        "icon": payload.icon,
        "grade_levels": payload.grade_levels,
    }

    response = supabase_execute(
        db.table("subjects").insert(insert_data),
        entity="subject",
    )
    row = parse_single_or_404(response, entity="subject")
    return _add_is_custom(row)
