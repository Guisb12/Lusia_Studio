"""
Assignments (TPC) endpoints.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import require_teacher
from app.api.http.schemas.assignments import (
    AssignmentCreateIn,
    AssignmentOut,
    AssignmentStatusUpdate,
    StudentAssignmentOut,
    StudentAssignmentUpdateIn,
)
from app.api.http.services.assignments_service import (
    create_assignment,
    get_assignment_detail,
    get_my_assignments,
    list_assignments,
    list_student_assignments,
    update_assignment_status,
    update_student_assignment,
)
from app.core.database import get_b2b_db
from app.core.security import get_current_user

router = APIRouter()


# ── Assignments CRUD ─────────────────────────────────────────


@router.get("/", response_model=list[AssignmentOut])
async def list_assignments_endpoint(
    status: Optional[str] = Query(None, description="Filter by status"),
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """List assignments (role-aware)."""
    org_id = current_user["organization_id"]
    user_id = current_user["id"]
    role = current_user["role"]
    return list_assignments(db, org_id, user_id, role, status_filter=status)


@router.post("/", response_model=AssignmentOut, status_code=201)
async def create_assignment_endpoint(
    payload: AssignmentCreateIn,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Create a new assignment. Teachers and admins only."""
    org_id = current_user["organization_id"]
    teacher_id = current_user["id"]
    return create_assignment(db, org_id, teacher_id, payload)


@router.get("/{assignment_id}", response_model=AssignmentOut)
async def get_assignment_endpoint(
    assignment_id: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """Get a single assignment with details."""
    org_id = current_user["organization_id"]
    return get_assignment_detail(db, assignment_id, org_id)


@router.patch("/{assignment_id}/status", response_model=AssignmentOut)
async def update_assignment_status_endpoint(
    assignment_id: str,
    payload: AssignmentStatusUpdate,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Update assignment status (publish/close). Teachers only."""
    teacher_id = current_user["id"]
    return update_assignment_status(db, assignment_id, teacher_id, payload.status)


# ── Student submissions ──────────────────────────────────────


@router.get("/{assignment_id}/students", response_model=list[StudentAssignmentOut])
async def list_student_assignments_endpoint(
    assignment_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """List all student submissions for an assignment. Teachers only."""
    return list_student_assignments(
        db,
        assignment_id,
        current_user["organization_id"],
        current_user["id"],
        current_user.get("role", ""),
    )


# ── Student's own view ───────────────────────────────────────


@router.get("/student-assignments/mine")
async def get_my_assignments_endpoint(
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """Get the logged-in student's assignments."""
    student_id = current_user["id"]
    org_id = current_user["organization_id"]
    return get_my_assignments(db, student_id, org_id)


@router.patch("/student-assignments/{sa_id}", response_model=StudentAssignmentOut)
async def update_student_assignment_endpoint(
    sa_id: str,
    payload: StudentAssignmentUpdateIn,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """Update a student assignment (save progress or submit)."""
    student_id = current_user["id"]
    return update_student_assignment(db, sa_id, student_id, payload)
