from typing import Optional

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import require_admin, require_teacher
from app.core.security import get_current_user
from app.api.http.schemas.members import MemberListItem, MemberUpdateRequest
from app.api.http.services.members_service import (
    get_member,
    get_member_assignments,
    get_member_sessions,
    get_member_stats,
    get_teacher_stats,
    list_members,
    remove_member,
    update_member,
)
from app.api.http.services import grades_service
from app.core.database import get_b2b_db
from app.schemas.pagination import PaginatedResponse, PaginationParams

router = APIRouter()


@router.get("", response_model=PaginatedResponse[MemberListItem])
async def list_members_endpoint(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    role: Optional[str] = Query(None, description="Filter by role: admin, teacher, student"),
    status: Optional[str] = Query(None, description="Filter by status: active, pending_approval, suspended"),
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """List organization members. Admins and teachers can view."""
    org_id = current_user["organization_id"]
    pagination = PaginationParams(page=page, per_page=per_page)
    return list_members(
        db, org_id, role_filter=role, status_filter=status, pagination=pagination,
    )


@router.get("/me", response_model=MemberListItem)
async def get_own_profile_endpoint(
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """Get the current user's own profile. Any authenticated user."""
    org_id = current_user["organization_id"]
    return get_member(db, org_id, current_user["id"])


@router.get("/{member_id}", response_model=MemberListItem)
async def get_member_endpoint(
    member_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Get a single member's profile."""
    org_id = current_user["organization_id"]
    return get_member(db, org_id, member_id)


@router.get("/{member_id}/sessions")
async def list_member_sessions_endpoint(
    member_id: str,
    as_teacher: bool = Query(False, description="If true, list sessions taught by this member"),
    date_from: Optional[str] = Query(None, description="ISO date lower bound for starts_at"),
    date_to: Optional[str] = Query(None, description="ISO date upper bound for starts_at"),
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """List calendar sessions for a member (as student or as teacher)."""
    org_id = current_user["organization_id"]
    return get_member_sessions(
        db, org_id, member_id,
        as_teacher=as_teacher,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/{member_id}/assignments")
async def list_member_assignments_endpoint(
    member_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """List assignment records for a specific student."""
    org_id = current_user["organization_id"]
    return get_member_assignments(
        db, org_id, member_id, current_user["id"], current_user["role"],
    )


@router.get("/{member_id}/stats")
async def get_member_stats_endpoint(
    member_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Get aggregated statistics for a student."""
    org_id = current_user["organization_id"]
    return get_member_stats(
        db, org_id, member_id, current_user["id"], current_user["role"],
    )


@router.get("/{member_id}/teacher-stats")
async def get_teacher_stats_endpoint(
    member_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Get aggregated statistics for a teacher. Admin can view any; teachers can view their own."""
    from fastapi import HTTPException, status as http_status

    if current_user["role"] != "admin" and current_user["id"] != member_id:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Teachers can only view their own stats.",
        )
    org_id = current_user["organization_id"]
    return get_teacher_stats(db, org_id, member_id)


# ── Student grades (read-only for teachers) ──────────────────


@router.get("/{member_id}/grades/cfs")
async def get_member_cfs_dashboard_endpoint(
    member_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Get CFS dashboard data for a student. Read-only access for teachers."""
    org_id = current_user["organization_id"]
    get_member(db, org_id, member_id)  # validate org membership
    return grades_service.get_cfs_dashboard(db, member_id)


@router.get("/{member_id}/grades/{academic_year}")
async def get_member_grades_board_endpoint(
    member_id: str,
    academic_year: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Get grade board data for a student. Read-only access for teachers."""
    org_id = current_user["organization_id"]
    get_member(db, org_id, member_id)  # validate org membership
    return grades_service.get_board_data(db, member_id, academic_year)


@router.patch("/me", response_model=MemberListItem)
async def update_own_profile_endpoint(
    payload: MemberUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """Update the current user's own profile. Role-based field restrictions apply."""
    role = current_user.get("role")
    org_id = current_user["organization_id"]
    raw = payload.model_dump()

    # Fields every role can edit
    allowed = {"full_name", "display_name", "avatar_url", "phone"}

    if role in ("teacher", "admin"):
        allowed |= {"subjects_taught", "hourly_rate"}
    if role == "student":
        allowed |= {
            "school_name", "subject_ids",
            "parent_name", "parent_email", "parent_phone",
        }

    # Strip fields not allowed for this role — keep only allowed, non-None values
    filtered = {k: (raw[k] if k in allowed else None) for k in raw}
    if role in ("teacher", "admin") and filtered.get("subjects_taught") is not None:
        filtered["subject_ids"] = filtered["subjects_taught"]
    filtered_payload = MemberUpdateRequest(**filtered)
    return update_member(db, org_id, current_user["id"], filtered_payload)


@router.patch("/{member_id}", response_model=MemberListItem)
async def update_member_endpoint(
    member_id: str,
    payload: MemberUpdateRequest,
    current_user: dict = Depends(require_admin),
    db: Client = Depends(get_b2b_db),
):
    """Update a member's status or class assignments. Admin only."""
    org_id = current_user["organization_id"]
    return update_member(db, org_id, member_id, payload)


@router.delete("/{member_id}", response_model=MemberListItem)
async def remove_member_endpoint(
    member_id: str,
    current_user: dict = Depends(require_admin),
    db: Client = Depends(get_b2b_db),
):
    """Suspend a member (soft remove). Admin only."""
    org_id = current_user["organization_id"]
    return remove_member(db, org_id, member_id)
