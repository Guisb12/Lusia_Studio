from typing import Optional

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import require_teacher
from app.api.http.schemas.subjects import SubjectCreateRequest, SubjectOut
from app.api.http.services.subject_service import (
    create_custom_subject,
    get_global_subjects,
    get_subjects_for_org,
)
from app.core.database import get_b2b_db
from app.core.security import get_current_user

router = APIRouter()


# ── Public: global subjects only (onboarding, unauthenticated pages) ────

@router.get("", response_model=list[SubjectOut])
async def list_global_subjects(
    education_level: Optional[str] = Query(
        None,
        description="Filter by education level: basico_1_ciclo, basico_2_ciclo, basico_3_ciclo, secundario, superior",
    ),
    grade: Optional[str] = Query(
        None,
        description="Filter by grade level (e.g. '10'). Returns subjects whose grade_levels array contains this value.",
    ),
    db: Client = Depends(get_b2b_db),
):
    """
    List global subjects (organization_id IS NULL).
    No authentication required — used during onboarding and public pages.
    """
    return get_global_subjects(db, education_level=education_level, grade=grade)


# ── Authenticated: global + org custom subjects ────────────────────────

@router.get("/me", response_model=list[SubjectOut])
async def list_my_subjects(
    education_level: Optional[str] = Query(None),
    grade: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """
    List all subjects available to the authenticated user:
    global subjects + custom subjects belonging to the user's organization.
    Available to all roles (admin, teacher, student).
    """
    org_id = current_user["organization_id"]
    return get_subjects_for_org(
        db, org_id, education_level=education_level, grade=grade,
    )


# ── Create custom subject (teacher / admin) ────────────────────────────

@router.post("/custom", response_model=SubjectOut, status_code=201)
async def create_subject(
    payload: SubjectCreateRequest,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """
    Create a custom subject for the current user's organization.
    Only admins and teachers can create custom subjects.
    """
    org_id = current_user["organization_id"]
    return create_custom_subject(db, org_id, payload)
