from typing import Optional

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import require_admin, require_teacher
from app.api.http.schemas.classrooms import (
    ClassroomCreate,
    ClassroomResponse,
    ClassroomUpdate,
)
from app.api.http.services.classrooms_service import (
    create_classroom,
    delete_classroom,
    get_classroom,
    list_classrooms,
    update_classroom,
)
from app.core.database import get_b2b_db
from app.core.security import get_current_organization
from app.schemas.pagination import PaginatedResponse, PaginationParams

router = APIRouter()


@router.get("", response_model=PaginatedResponse[ClassroomResponse])
async def list_classrooms_endpoint(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None, description="Filter by status: active, archived"),
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """List classrooms for the current user's organization."""
    org_id = current_user["organization_id"]
    pagination = PaginationParams(page=page, per_page=per_page)
    return list_classrooms(
        db, org_id, status_filter=status, pagination=pagination,
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
    """Create a new classroom. The current user is set as the teacher."""
    org_id = current_user["organization_id"]
    teacher_id = str(current_user["id"])
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
    return update_classroom(db, org_id, classroom_id, payload)


@router.delete("/{classroom_id}", response_model=ClassroomResponse)
async def delete_classroom_endpoint(
    classroom_id: str,
    current_user: dict = Depends(require_admin),
    db: Client = Depends(get_b2b_db),
):
    """Archive a classroom (soft delete). Admin only."""
    org_id = current_user["organization_id"]
    return delete_classroom(db, org_id, classroom_id)
