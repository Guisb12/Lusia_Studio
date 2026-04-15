"""
National exam readiness — aggregates + evidence (teachers and admins).
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import require_teacher
from app.api.http.schemas.exam_readiness import (
    ExamEvidenceResponse,
    ExamReadinessL1DrilldownPayload,
    ExamReadinessSubjectOut,
    ExamReadinessSubjectPayload,
)
from app.api.http.services.exam_readiness_service import (
    get_l1_drilldown_payload,
    get_subject_readiness_payload,
    list_evidence_for_topic,
    list_national_exam_subjects,
)
from app.core.database import get_b2b_db

router = APIRouter()


@router.get("/subjects", response_model=list[ExamReadinessSubjectOut])
async def list_exam_subjects(
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Subjects with national exams (global + org custom), pilot slugs first."""
    org_id = current_user.get("organization_id")
    if not org_id:
        return []
    return list_national_exam_subjects(db, org_id)


@router.get("/{subject_slug}/l2-insights", response_model=ExamReadinessL1DrilldownPayload)
async def get_l2_insights_for_l1(
    subject_slug: str,
    curriculum_code_l1: str = Query(..., min_length=1, max_length=256),
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """L2 summary + L2 year matrix for one L1 topic (drill-down, not main ranking)."""
    _ = current_user
    return get_l1_drilldown_payload(db, subject_slug, curriculum_code_l1)


@router.get("/{subject_slug}/evidence", response_model=ExamEvidenceResponse)
async def get_topic_evidence(
    subject_slug: str,
    curriculum_code_l1: str = Query(..., min_length=1, max_length=256),
    curriculum_code_l2: Optional[str] = Query(
        None,
        min_length=1,
        max_length=256,
        description="If set, only questions matching this L2 code (and L1) are returned.",
    ),
    limit: int = Query(20, ge=1, le=50),
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Example national-exam questions for L1, or narrowed to L2 when curriculum_code_l2 is set."""
    _ = current_user
    return list_evidence_for_topic(
        db,
        subject_slug,
        curriculum_code_l1,
        curriculum_code_l2=curriculum_code_l2,
        limit=limit,
    )


@router.get("/{subject_slug}", response_model=ExamReadinessSubjectPayload)
async def get_subject_exam_readiness(
    subject_slug: str,
    blueprint_year_from: Optional[int] = Query(
        None,
        description="Only include blueprints with exam_year >= this year",
    ),
    blueprint_limit: int = Query(
        24,
        ge=1,
        le=80,
        description="Max blueprint rows returned",
    ),
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """L1 topic summaries, L1 year matrix, and blueprints for one subject."""
    _ = current_user
    return get_subject_readiness_payload(
        db,
        subject_slug,
        blueprint_year_from=blueprint_year_from,
        blueprint_limit=blueprint_limit,
    )
