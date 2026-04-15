"""
Analytics router — financial dashboards for admin, teacher, and student.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client

from app.api.deps import require_admin, require_teacher
from app.api.http.schemas.analytics import (
    AdminDashboardData,
    StudentDashboardData,
    TeacherDashboardData,
)
from app.api.http.schemas.student_billing import (
    StudentBillingSettingOut,
    StudentBillingSettingUpsert,
    StudentMonthlyAdjustmentCreate,
    StudentMonthlyAdjustmentOut,
    StudentMonthlyAdjustmentUpdate,
    StudentMonthlyPaymentStatusOut,
    StudentMonthlyPaymentStatusUpsert,
)
from app.api.http.services.analytics_service import (
    get_admin_dashboard,
    get_student_dashboard,
    get_teacher_dashboard,
)
from app.api.http.services.student_billing_service import (
    create_monthly_adjustment,
    delete_monthly_adjustment,
    update_monthly_adjustment,
    upsert_monthly_payment_status,
    upsert_student_billing_setting,
)
from app.core.database import get_b2b_db
from app.core.security import get_current_user

router = APIRouter()


@router.get("/admin", response_model=AdminDashboardData)
async def admin_dashboard(
    date_from: Optional[str] = Query(None, description="ISO date string"),
    date_to: Optional[str] = Query(None, description="ISO date string"),
    teacher_id: Optional[str] = Query(None),
    session_type_id: Optional[str] = Query(None),
    granularity: str = Query("monthly", description="monthly or weekly"),
    current_user: dict = Depends(require_admin),
    db: Client = Depends(get_b2b_db),
):
    """Full organization financial dashboard. Admin only."""
    org_id = current_user["organization_id"]
    return get_admin_dashboard(
        db,
        org_id,
        date_from=date_from,
        date_to=date_to,
        teacher_id=teacher_id,
        session_type_id=session_type_id,
        granularity=granularity,
    )


@router.get("/teacher/{teacher_id}", response_model=TeacherDashboardData)
async def teacher_dashboard(
    teacher_id: str,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    granularity: str = Query("monthly"),
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Teacher earnings dashboard. Teachers can only view their own."""
    if current_user["role"] == "teacher" and current_user["id"] != teacher_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own dashboard",
        )
    org_id = current_user["organization_id"]
    return get_teacher_dashboard(
        db,
        org_id,
        teacher_id,
        date_from=date_from,
        date_to=date_to,
        granularity=granularity,
    )


@router.get("/student/{student_id}", response_model=StudentDashboardData)
async def student_dashboard(
    student_id: str,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    granularity: str = Query("monthly"),
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """Student cost dashboard. Students view own; teachers/admins view any."""
    role = current_user.get("role")
    if role == "student" and current_user["id"] != student_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own dashboard",
        )
    org_id = current_user["organization_id"]
    return get_student_dashboard(
        db,
        org_id,
        student_id,
        date_from=date_from,
        date_to=date_to,
        granularity=granularity,
    )


@router.put("/billing/settings", response_model=StudentBillingSettingOut)
async def upsert_billing_setting(
    payload: StudentBillingSettingUpsert,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Upsert student billing mode/settings from an effective month."""
    org_id = current_user["organization_id"]
    return upsert_student_billing_setting(db, org_id, current_user["id"], payload)


@router.post(
    "/billing/adjustments", response_model=StudentMonthlyAdjustmentOut, status_code=201
)
async def create_billing_adjustment(
    payload: StudentMonthlyAdjustmentCreate,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Create a monthly student billing adjustment (e.g. boleia/subscription)."""
    org_id = current_user["organization_id"]
    return create_monthly_adjustment(db, org_id, current_user["id"], payload)


@router.patch(
    "/billing/adjustments/{adjustment_id}", response_model=StudentMonthlyAdjustmentOut
)
async def update_billing_adjustment(
    adjustment_id: str,
    payload: StudentMonthlyAdjustmentUpdate,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Update a monthly student billing adjustment."""
    org_id = current_user["organization_id"]
    return update_monthly_adjustment(db, org_id, adjustment_id, payload)


@router.delete(
    "/billing/adjustments/{adjustment_id}", response_model=StudentMonthlyAdjustmentOut
)
async def delete_billing_adjustment(
    adjustment_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Delete a monthly student billing adjustment."""
    org_id = current_user["organization_id"]
    return delete_monthly_adjustment(db, org_id, adjustment_id)


@router.put("/billing/payment-status", response_model=StudentMonthlyPaymentStatusOut)
async def upsert_billing_payment_status(
    payload: StudentMonthlyPaymentStatusUpsert,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Set paid/unpaid state for a student in a specific month."""
    org_id = current_user["organization_id"]
    return upsert_monthly_payment_status(db, org_id, current_user["id"], payload)
