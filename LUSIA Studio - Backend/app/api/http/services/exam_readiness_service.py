"""
Read-only queries for national exam readiness aggregates and evidence.
"""

from __future__ import annotations

import json
import re
from typing import Any

from fastapi import HTTPException, status
from supabase import Client

from app.api.http.schemas.exam_readiness import (
    ExamBlueprintRow,
    ExamEvidenceItemOut,
    ExamEvidenceResponse,
    ExamReadinessL1DrilldownPayload,
    ExamReadinessSubjectOut,
    ExamReadinessSubjectPayload,
    TopicSummaryL1Row,
    TopicSummaryL2Row,
    TopicYearMatrixL2Row,
    TopicYearMatrixRow,
)
from app.utils.db import supabase_execute

SUBJECT_SELECT_EXAM = (
    "id,name,slug,education_level,grade_levels,has_national_exam,active,organization_id"
)

# Pilot / priority ordering for landing (others follow by name)
PILOT_SUBJECT_SLUGS = ("secundario_mat_a", "secundario_port")


def _strip_md(s: str, max_len: int) -> str:
    t = re.sub(r"[#*_`]+", "", s)
    t = re.sub(r"\s+", " ", t).strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 1].rstrip() + "…"


def _preview_from_content(content: dict[str, Any] | None) -> tuple[str | None, str | None, float | None]:
    if not content or not isinstance(content, dict):
        return None, None, None
    q = content.get("question")
    question_preview = None
    if isinstance(q, str) and q.strip():
        question_preview = _strip_md(q, 320)
    crit = content.get("criteria")
    criteria_preview = None
    if isinstance(crit, str) and crit.strip():
        criteria_preview = _strip_md(crit, 400)
    points = content.get("original_grade")
    if points is not None:
        try:
            points_f = float(points)
        except (TypeError, ValueError):
            points_f = None
    else:
        points_f = None
    return question_preview, criteria_preview, points_f


def get_subject_by_slug(db: Client, subject_slug: str) -> dict[str, Any]:
    response = supabase_execute(
        db.table("subjects")
        .select(SUBJECT_SELECT_EXAM)
        .eq("slug", subject_slug)
        .eq("active", True)
        .limit(1),
        entity="subjects",
    )
    rows = response.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Subject not found: {subject_slug}",
        )
    return rows[0]


def subject_to_readiness_out(row: dict[str, Any]) -> ExamReadinessSubjectOut:
    return ExamReadinessSubjectOut(
        id=str(row["id"]),
        name=row.get("name") or "",
        slug=row.get("slug"),
        education_level=row.get("education_level"),
        grade_levels=row.get("grade_levels"),
        has_national_exam=bool(row.get("has_national_exam", False)),
    )


def list_national_exam_subjects(db: Client, organization_id: str) -> list[ExamReadinessSubjectOut]:
    """Global + org custom subjects that have national exams."""
    global_q = (
        db.table("subjects")
        .select(SUBJECT_SELECT_EXAM)
        .is_("organization_id", "null")
        .eq("active", True)
        .eq("has_national_exam", True)
        .order("name")
    )
    global_result = supabase_execute(global_q, entity="subjects")

    custom_q = (
        db.table("subjects")
        .select(SUBJECT_SELECT_EXAM)
        .eq("organization_id", organization_id)
        .eq("active", True)
        .eq("has_national_exam", True)
        .order("name")
    )
    custom_result = supabase_execute(custom_q, entity="subjects")

    rows = (global_result.data or []) + (custom_result.data or [])
    # De-dupe by id
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for r in rows:
        sid = str(r["id"])
        if sid in seen:
            continue
        seen.add(sid)
        unique.append(r)

    def sort_key(r: dict[str, Any]) -> tuple[int, str]:
        slug = r.get("slug") or ""
        try:
            pilot_idx = PILOT_SUBJECT_SLUGS.index(slug)
        except ValueError:
            pilot_idx = len(PILOT_SUBJECT_SLUGS)
        name = r.get("name") or ""
        return (pilot_idx, name.lower())

    unique.sort(key=sort_key)
    return [subject_to_readiness_out(r) for r in unique]


def list_topic_summary_l1(db: Client, subject_slug: str) -> list[TopicSummaryL1Row]:
    response = supabase_execute(
        db.table("exam_topic_summary_l1")
        .select("*")
        .eq("subject_slug", subject_slug)
        .order("total_points", desc=True)
        .order("exam_count", desc=True),
        entity="exam_topic_summary_l1",
    )
    rows = response.data or []
    return [TopicSummaryL1Row.model_validate(r) for r in rows]


def list_topic_year_matrix(db: Client, subject_slug: str) -> list[TopicYearMatrixRow]:
    response = supabase_execute(
        db.table("exam_topic_year_matrix")
        .select("*")
        .eq("subject_slug", subject_slug)
        .order("exam_year")
        .order("curriculum_code_l1"),
        entity="exam_topic_year_matrix",
    )
    rows = response.data or []
    return [TopicYearMatrixRow.model_validate(r) for r in rows]


def list_exam_blueprints(
    db: Client,
    subject_slug: str,
    *,
    year_from: int | None = None,
    limit: int = 24,
) -> list[ExamBlueprintRow]:
    q = (
        db.table("exam_blueprint")
        .select("*")
        .eq("subject_slug", subject_slug)
        .order("exam_year", desc=True)
        .order("exam_phase")
    )
    if year_from is not None:
        q = q.gte("exam_year", year_from)
    if limit > 0:
        q = q.limit(limit)
    response = supabase_execute(q, entity="exam_blueprint")
    rows = response.data or []
    return [ExamBlueprintRow.model_validate(r) for r in rows]


def list_topic_summary_l2(
    db: Client, subject_slug: str, curriculum_code_l1: str
) -> list[TopicSummaryL2Row]:
    response = supabase_execute(
        db.table("exam_topic_summary_l2")
        .select("*")
        .eq("subject_slug", subject_slug)
        .eq("curriculum_code_l1", curriculum_code_l1)
        .order("total_points", desc=True)
        .order("exam_count", desc=True),
        entity="exam_topic_summary_l2",
    )
    rows = response.data or []
    return [TopicSummaryL2Row.model_validate(r) for r in rows]


def list_topic_year_matrix_l2(
    db: Client, subject_slug: str, curriculum_code_l1: str
) -> list[TopicYearMatrixL2Row]:
    response = supabase_execute(
        db.table("exam_topic_year_matrix_l2")
        .select("*")
        .eq("subject_slug", subject_slug)
        .eq("curriculum_code_l1", curriculum_code_l1)
        .order("exam_year")
        .order("curriculum_code_l2"),
        entity="exam_topic_year_matrix_l2",
    )
    rows = response.data or []
    return [TopicYearMatrixL2Row.model_validate(r) for r in rows]


def get_l1_drilldown_payload(
    db: Client,
    subject_slug: str,
    curriculum_code_l1: str,
) -> ExamReadinessL1DrilldownPayload:
    """Validate subject exists; return L2 summary + L2 year matrix for one L1."""
    _ = get_subject_by_slug(db, subject_slug)
    return ExamReadinessL1DrilldownPayload(
        curriculum_code_l1=curriculum_code_l1,
        topic_summary_l2=list_topic_summary_l2(db, subject_slug, curriculum_code_l1),
        topic_year_matrix_l2=list_topic_year_matrix_l2(db, subject_slug, curriculum_code_l1),
    )


def get_subject_readiness_payload(
    db: Client,
    subject_slug: str,
    *,
    blueprint_year_from: int | None = None,
    blueprint_limit: int = 24,
) -> ExamReadinessSubjectPayload:
    row = get_subject_by_slug(db, subject_slug)
    subject = subject_to_readiness_out(row)
    return ExamReadinessSubjectPayload(
        subject=subject,
        topic_summary=list_topic_summary_l1(db, subject_slug),
        topic_year_matrix=list_topic_year_matrix(db, subject_slug),
        blueprints=list_exam_blueprints(
            db,
            subject_slug,
            year_from=blueprint_year_from,
            limit=blueprint_limit,
        ),
    )


def _matches_curriculum_level(codes: list[str], code: str) -> bool:
    for c in codes:
        if c == code:
            return True
        if c.startswith(code + ".") or c.startswith(code + ":"):
            return True
    return False


def list_evidence_for_topic(
    db: Client,
    subject_slug: str,
    curriculum_code_l1: str,
    *,
    curriculum_code_l2: str | None = None,
    limit: int = 20,
) -> ExamEvidenceResponse:
    sub = get_subject_by_slug(db, subject_slug)
    subject_id = sub["id"]

    lim = max(1, min(limit, 50))

    # Fetch recent national-exam questions for the subject; filter L1 / L2 in Python
    # (exact code or descendant codes under that level).
    response = supabase_execute(
        db.table("questions")
        .select("id,type,label,content,curriculum_codes,exam_year,exam_phase")
        .eq("subject_id", str(subject_id))
        .in_("source_type", ["national_exam", "national_exam_adapted"])
        .neq("type", "context_group")
        .order("exam_year", desc=True)
        .limit(300),
        entity="questions",
    )
    raw_rows = response.data or []

    items: list[ExamEvidenceItemOut] = []
    for r in raw_rows:
        codes = r.get("curriculum_codes")
        if not isinstance(codes, list):
            codes = []
        if not _matches_curriculum_level(codes, curriculum_code_l1):
            continue
        if curriculum_code_l2 and not _matches_curriculum_level(codes, curriculum_code_l2):
            continue
        content = r.get("content")
        if isinstance(content, str):
            try:
                content = json.loads(content)
            except json.JSONDecodeError:
                content = {}
        if not isinstance(content, dict):
            content = {}
        q_prev, c_prev, pts = _preview_from_content(content)
        items.append(
            ExamEvidenceItemOut(
                id=str(r["id"]),
                type=r.get("type") or "",
                label=r.get("label"),
                exam_year=r.get("exam_year"),
                exam_phase=r.get("exam_phase"),
                curriculum_codes=codes,
                question_preview=q_prev,
                criteria_preview=c_prev,
                points=pts,
            )
        )
        if len(items) >= lim:
            break

    return ExamEvidenceResponse(items=items)


def list_evidence_for_l1(
    db: Client,
    subject_slug: str,
    curriculum_code_l1: str,
    *,
    limit: int = 20,
) -> ExamEvidenceResponse:
    """Backward-compatible: evidence for an L1 topic (any code under L1)."""
    return list_evidence_for_topic(
        db, subject_slug, curriculum_code_l1, curriculum_code_l2=None, limit=limit
    )
