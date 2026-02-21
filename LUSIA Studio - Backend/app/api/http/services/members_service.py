"""
Members service — business logic for listing and managing org members.
"""

from __future__ import annotations

from supabase import Client

from app.api.http.schemas.members import MemberUpdateRequest
from app.schemas.pagination import PaginatedResponse, PaginationParams
from app.utils.db import paginated_query, parse_single_or_404, supabase_execute

MEMBER_SELECT = (
    "id,full_name,display_name,email,role,status,"
    "grade_level,course,school_name,phone,"
    "subjects_taught,subject_ids,class_ids,"
    "onboarding_completed,created_at"
)


def list_members(
    db: Client,
    org_id: str,
    *,
    role_filter: str | None = None,
    status_filter: str | None = None,
    pagination: PaginationParams,
) -> PaginatedResponse:
    filters: dict = {"organization_id": org_id}
    if role_filter:
        filters["role"] = role_filter
    if status_filter:
        filters["status"] = status_filter

    return paginated_query(
        db,
        "profiles",
        select=MEMBER_SELECT,
        filters=filters,
        order_by="created_at",
        ascending=False,
        pagination=pagination,
        entity="members",
    )


def get_member(db: Client, org_id: str, member_id: str) -> dict:
    response = supabase_execute(
        db.table("profiles")
        .select(MEMBER_SELECT)
        .eq("organization_id", org_id)
        .eq("id", member_id)
        .limit(1),
        entity="member",
    )
    return parse_single_or_404(response, entity="member")


def update_member(
    db: Client,
    org_id: str,
    member_id: str,
    payload: MemberUpdateRequest,
) -> dict:
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        return get_member(db, org_id, member_id)

    response = supabase_execute(
        db.table("profiles")
        .update(update_data)
        .eq("organization_id", org_id)
        .eq("id", member_id),
        entity="member",
    )
    return parse_single_or_404(response, entity="member")


def remove_member(db: Client, org_id: str, member_id: str) -> dict:
    """Soft-remove: set status to 'suspended'."""
    response = supabase_execute(
        db.table("profiles")
        .update({"status": "suspended"})
        .eq("organization_id", org_id)
        .eq("id", member_id),
        entity="member",
    )
    return parse_single_or_404(response, entity="member")
