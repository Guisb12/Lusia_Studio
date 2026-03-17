from typing import Optional

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import require_admin, require_teacher
from app.api.http.schemas.classrooms import (
    ClassroomCreate,
    ClassroomMemberResponse,
    ClassroomMembersUpdate,
    ClassroomResponse,
    ClassroomUpdate,
    StudentRecommendation,
)
from app.api.http.services.classrooms_service import (
    add_students_to_classroom,
    assert_classroom_access,
    create_classroom,
    delete_classroom,
    get_classroom,
    get_classroom_members,
    get_smart_recommendations,
    list_classrooms,
    remove_students_from_classroom,
    update_classroom,
)
from app.core.database import get_b2b_db
from app.schemas.pagination import PaginatedResponse, PaginationParams

router = APIRouter()


# ── Recommendations (must be BEFORE /{classroom_id} to avoid path conflict) ──


@router.get("/recommendations", response_model=list[StudentRecommendation])
async def get_recommendations_endpoint(
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Get smart student recommendations based on subject overlap with teacher."""
    org_id = current_user["organization_id"]
    teacher_id = str(current_user["id"])
    return get_smart_recommendations(db, org_id, teacher_id)


# ── CRUD ──


@router.get("", response_model=PaginatedResponse[ClassroomResponse])
async def list_classrooms_endpoint(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    active: Optional[bool] = Query(None, description="Filter by active status"),
    own: Optional[bool] = Query(None, description="When true, admins only see their own classes"),
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """List classrooms. Teachers see their own, admins see all (unless own=true)."""
    org_id = current_user["organization_id"]
    role = current_user.get("role")
    teacher_id = str(current_user["id"]) if role == "teacher" or own else None
    pagination = PaginationParams(page=page, per_page=per_page)
    return list_classrooms(
        db, org_id, teacher_id=teacher_id, active_filter=active, pagination=pagination,
    )


@router.get("/{classroom_id}", response_model=ClassroomResponse)
async def get_classroom_endpoint(
    classroom_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Get a single classroom by ID."""
    org_id = current_user["organization_id"]
    return get_classroom(db, org_id, classroom_id)


@router.post("", response_model=ClassroomResponse, status_code=201)
async def create_classroom_endpoint(
    payload: ClassroomCreate,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Create a new classroom. Admins may assign it to another teacher."""
    org_id = current_user["organization_id"]
    role = current_user.get("role")
    teacher_id = str(payload.teacher_id) if role == "admin" and payload.teacher_id else str(current_user["id"])
    return create_classroom(db, org_id, teacher_id, payload)


@router.patch("/{classroom_id}", response_model=ClassroomResponse)
async def update_classroom_endpoint(
    classroom_id: str,
    payload: ClassroomUpdate,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Update a classroom (partial update)."""
    org_id = current_user["organization_id"]
    assert_classroom_access(
        db,
        org_id,
        classroom_id,
        user_id=str(current_user["id"]),
        role=current_user.get("role"),
    )
    return update_classroom(db, org_id, classroom_id, payload)


@router.delete("/{classroom_id}", response_model=ClassroomResponse)
async def delete_classroom_endpoint(
    classroom_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Archive a classroom (soft delete). Cannot archive primary classes."""
    org_id = current_user["organization_id"]
    assert_classroom_access(
        db,
        org_id,
        classroom_id,
        user_id=str(current_user["id"]),
        role=current_user.get("role"),
    )
    return delete_classroom(db, org_id, classroom_id)


# ── Members ──


@router.get("/{classroom_id}/members", response_model=list[ClassroomMemberResponse])
async def get_members_endpoint(
    classroom_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """List students in a classroom."""
    org_id = current_user["organization_id"]
    assert_classroom_access(
        db,
        org_id,
        classroom_id,
        user_id=str(current_user["id"]),
        role=current_user.get("role"),
    )
    return get_classroom_members(db, org_id, classroom_id)


@router.post("/{classroom_id}/members", status_code=200)
async def add_members_endpoint(
    classroom_id: str,
    payload: ClassroomMembersUpdate,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Add students to a classroom."""
    org_id = current_user["organization_id"]
    assert_classroom_access(
        db,
        org_id,
        classroom_id,
        user_id=str(current_user["id"]),
        role=current_user.get("role"),
    )
    added = add_students_to_classroom(db, org_id, classroom_id, payload.student_ids)
    return {"added": len(added)}


@router.delete("/{classroom_id}/members")
async def remove_members_endpoint(
    classroom_id: str,
    payload: ClassroomMembersUpdate,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Remove students from a classroom."""
    org_id = current_user["organization_id"]
    assert_classroom_access(
        db,
        org_id,
        classroom_id,
        user_id=str(current_user["id"]),
        role=current_user.get("role"),
    )
    removed = remove_students_from_classroom(db, org_id, classroom_id, payload.student_ids)
    return {"removed": len(removed)}
