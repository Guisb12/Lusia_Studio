from typing import Optional

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import require_admin, require_teacher
from app.api.http.schemas.members import MemberListItem, MemberUpdateRequest
from app.api.http.services.members_service import (
    get_member,
    list_members,
    remove_member,
    update_member,
)
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


@router.get("/{member_id}", response_model=MemberListItem)
async def get_member_endpoint(
    member_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Get a single member's profile."""
    org_id = current_user["organization_id"]
    return get_member(db, org_id, member_id)


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
