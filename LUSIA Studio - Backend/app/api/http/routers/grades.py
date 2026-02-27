"""
Grades (Calculadora de Médias) endpoints.
All endpoints are student-only and scoped to the authenticated user.
"""

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import require_student
from app.api.http.schemas.grades import (
    AnnualGradeOut,
    AnnualGradeUpdateIn,
    BasicoExamGradeUpdateIn,
    CFSDashboardOut,
    CFSSnapshotCreateIn,
    CFSSnapshotOut,
    ElementGradeUpdateIn,
    EnrollmentCreateIn,
    EnrollmentUpdateIn,
    EvaluationElementOut,
    EvaluationElementsReplaceIn,
    ExamGradeUpdateIn,
    GradeBoardOut,
    GradeSettingsCreateIn,
    GradeSettingsOut,
    PastYearSetupIn,
    PeriodGradeOverrideIn,
    PeriodGradeUpdateIn,
    SubjectCFDOut,
    SubjectEnrollmentOut,
    SubjectPeriodOut,
)
from app.api.http.services import grades_service
from app.core.database import get_b2b_db

router = APIRouter()


# ── Settings ─────────────────────────────────────────────────


@router.get("/settings/{academic_year}", response_model=GradeSettingsOut)
async def get_settings_endpoint(
    academic_year: str,
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Get grade settings for an academic year. Returns 404 if none exist."""
    result = grades_service.get_settings(db, current_user["id"], academic_year)
    if not result:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="No settings for this year")
    return result


@router.post("/settings", response_model=GradeSettingsOut, status_code=201)
async def create_settings_endpoint(
    payload: GradeSettingsCreateIn,
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Create grade settings + enrollments + empty periods."""
    return grades_service.create_settings(db, current_user["id"], payload)


@router.post("/setup-past-year", response_model=GradeBoardOut, status_code=201)
async def setup_past_year_endpoint(
    payload: PastYearSetupIn,
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Initialize a past academic year with subjects and optional grades."""
    return grades_service.setup_past_year(db, current_user["id"], payload)


@router.patch("/settings/{settings_id}/lock", response_model=GradeSettingsOut)
async def lock_settings_endpoint(
    settings_id: str,
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Lock settings for the year."""
    return grades_service.lock_settings(db, current_user["id"], settings_id)


# ── Enrollments ──────────────────────────────────────────────


@router.get("/enrollments", response_model=list[SubjectEnrollmentOut])
async def list_enrollments_endpoint(
    academic_year: str = Query(...),
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """List subject enrollments for an academic year."""
    return grades_service.list_enrollments(db, current_user["id"], academic_year)


@router.post("/enrollments", response_model=SubjectEnrollmentOut, status_code=201)
async def create_enrollment_endpoint(
    payload: EnrollmentCreateIn,
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Add a subject enrollment."""
    settings = grades_service.get_settings(
        db, current_user["id"], payload.academic_year
    )
    if not settings:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="No settings for this year")
    return grades_service.create_enrollment(
        db, current_user["id"], payload, settings["id"]
    )


@router.patch("/enrollments/{enrollment_id}", response_model=SubjectEnrollmentOut)
async def update_enrollment_endpoint(
    enrollment_id: str,
    payload: EnrollmentUpdateIn,
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Update enrollment flags."""
    return grades_service.update_enrollment(
        db, current_user["id"], enrollment_id, payload
    )


# ── Board ────────────────────────────────────────────────────


@router.get("/board/{academic_year}", response_model=GradeBoardOut)
async def get_board_endpoint(
    academic_year: str,
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Get full kanban board data for an academic year."""
    return grades_service.get_board_data(db, current_user["id"], academic_year)


# ── Period Grades ────────────────────────────────────────────


@router.patch("/periods/{period_id}", response_model=SubjectPeriodOut)
async def update_period_grade_endpoint(
    period_id: str,
    payload: PeriodGradeUpdateIn,
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Set/update pauta grade directly (Mode A)."""
    return grades_service.update_period_grade(
        db, current_user["id"], period_id, payload
    )


@router.patch("/periods/{period_id}/override", response_model=SubjectPeriodOut)
async def override_period_grade_endpoint(
    period_id: str,
    payload: PeriodGradeOverrideIn,
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Override calculated grade with manual pauta + reason."""
    return grades_service.override_period_grade(
        db, current_user["id"], period_id, payload
    )


# ── Evaluation Elements ──────────────────────────────────────


@router.get("/periods/{period_id}/elements", response_model=list[EvaluationElementOut])
async def get_elements_endpoint(
    period_id: str,
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Get evaluation elements for a period."""
    return grades_service.get_elements(db, current_user["id"], period_id)


@router.put("/periods/{period_id}/elements", response_model=list[EvaluationElementOut])
async def replace_elements_endpoint(
    period_id: str,
    payload: EvaluationElementsReplaceIn,
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Replace all evaluation elements for a period."""
    return grades_service.replace_elements(
        db, current_user["id"], period_id, payload.elements
    )


@router.patch("/elements/{element_id}", response_model=EvaluationElementOut)
async def update_element_grade_endpoint(
    element_id: str,
    payload: ElementGradeUpdateIn,
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Update a single element's grade."""
    return grades_service.update_element_grade(
        db, current_user["id"], element_id, payload.raw_grade
    )


@router.post("/periods/{period_id}/copy-elements")
async def copy_elements_endpoint(
    period_id: str,
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Copy element structure to other periods of the same enrollment."""
    count = grades_service.copy_elements_to_other_periods(
        db, current_user["id"], period_id
    )
    return {"copied_to_periods": count}


# ── Annual Grades ────────────────────────────────────────────


@router.get("/annual/{academic_year}")
async def get_annual_grades_endpoint(
    academic_year: str,
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Get all annual grades (CAFs) for an academic year."""
    return grades_service.get_annual_grades(db, current_user["id"], academic_year)


@router.patch("/annual-grade", response_model=AnnualGradeOut)
async def update_annual_grade_endpoint(
    payload: AnnualGradeUpdateIn,
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Update a past-year annual grade directly."""
    return grades_service.update_annual_grade(
        db,
        current_user["id"],
        payload.subject_id,
        payload.academic_year,
        payload.annual_grade,
    )


# ── CFS Dashboard ────────────────────────────────────────────


@router.get("/cfs", response_model=CFSDashboardOut)
async def get_cfs_dashboard_endpoint(
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Get CFS dashboard data (all years, CIF, CFD, CFS)."""
    return grades_service.get_cfs_dashboard(db, current_user["id"])


@router.patch("/cfd/{cfd_id}/exam", response_model=SubjectCFDOut)
async def update_exam_grade_endpoint(
    cfd_id: str,
    payload: ExamGradeUpdateIn,
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Enter/update national exam grade for a CFD."""
    return grades_service.update_exam_grade(
        db, current_user["id"], cfd_id, payload
    )


@router.patch("/cfd/{cfd_id}/basico-exam", response_model=SubjectCFDOut)
async def update_basico_exam_grade_endpoint(
    cfd_id: str,
    payload: BasicoExamGradeUpdateIn,
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Enter/update Prova Final grade for a Básico 3º Ciclo CFD."""
    return grades_service.update_basico_exam_grade(
        db, current_user["id"], cfd_id, payload
    )


@router.post("/cfs/snapshot", response_model=CFSSnapshotOut, status_code=201)
async def create_cfs_snapshot_endpoint(
    payload: CFSSnapshotCreateIn,
    current_user: dict = Depends(require_student),
    db: Client = Depends(get_b2b_db),
):
    """Finalize and snapshot the CFS."""
    return grades_service.create_cfs_snapshot(
        db, current_user["id"], payload.academic_year
    )
