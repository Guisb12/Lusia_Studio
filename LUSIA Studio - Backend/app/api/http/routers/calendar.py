"""
Calendar session endpoints.
"""

from typing import Literal, Optional, Union

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import require_teacher
from app.api.http.schemas.calendar import (
    BatchSessionOut,
    SessionCreate,
    SessionOut,
    SessionUpdate,
    StudentSearchResult,
)
from app.api.http.services.calendar_service import (
    create_session,
    create_session_batch,
    delete_session,
    get_session,
    list_sessions,
    search_students,
    update_session,
)
from app.core.database import get_b2b_db
from app.core.security import get_current_user

router = APIRouter()


# ── Sessions CRUD ───────────────────────────────────────────────


@router.post("/sessions", status_code=201)
async def create_session_endpoint(
    payload: SessionCreate,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
) -> Union[BatchSessionOut, SessionOut]:
    """Create a new calendar session. If recurrence is provided, creates a batch."""
    org_id = current_user["organization_id"]
    role = current_user["role"]

    # Admin can assign a session to a different teacher
    if role == "admin" and payload.teacher_id:
        teacher_id = payload.teacher_id
    else:
        teacher_id = current_user["id"]

    if payload.recurrence:
        return create_session_batch(db, org_id, teacher_id, payload)
    return create_session(db, org_id, teacher_id, payload)


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions_endpoint(
    start_date: Optional[str] = Query(None, description="ISO date filter start"),
    end_date: Optional[str] = Query(None, description="ISO date filter end"),
    teacher_id: Optional[str] = Query(None, description="Filter by teacher (admin only)"),
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """
    List calendar sessions (role-aware).
    - Admin: all org sessions, optionally filtered by teacher_id
    - Teacher: own sessions only
    - Student: sessions where they are a participant
    """
    org_id = current_user["organization_id"]
    role = current_user["role"]
    user_id = current_user["id"]

    return list_sessions(
        db,
        org_id,
        role=role,
        user_id=user_id,
        start_date=start_date,
        end_date=end_date,
        teacher_id_filter=teacher_id if role == "admin" else None,
    )


@router.get("/sessions/{session_id}", response_model=SessionOut)
async def get_session_endpoint(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """Get a single session by ID."""
    org_id = current_user["organization_id"]
    return get_session(db, org_id, session_id)


@router.patch("/sessions/{session_id}", status_code=200)
async def update_session_endpoint(
    session_id: str,
    payload: SessionUpdate,
    scope: Literal["this", "this_and_future", "all"] = Query("this"),
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
) -> Union[SessionOut, list[SessionOut]]:
    """
    Update a calendar session. Teachers can only update their own.
    scope: 'this' | 'this_and_future' | 'all' (only relevant for recurring sessions)
    """
    org_id = current_user["organization_id"]
    return update_session(
        db,
        org_id,
        session_id,
        teacher_id=current_user["id"],
        role=current_user["role"],
        payload=payload,
        scope=scope,
    )


@router.delete("/sessions/{session_id}", status_code=200)
async def delete_session_endpoint(
    session_id: str,
    scope: Literal["this", "this_and_future", "all"] = Query("this"),
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
) -> Union[SessionOut, list[SessionOut]]:
    """
    Delete a calendar session. Teachers can only delete their own.
    scope: 'this' | 'this_and_future' | 'all' (only relevant for recurring sessions)
    """
    org_id = current_user["organization_id"]
    return delete_session(
        db,
        org_id,
        session_id,
        teacher_id=current_user["id"],
        role=current_user["role"],
        scope=scope,
    )


# ── Student Search ──────────────────────────────────────────────


@router.get("/students/search", response_model=list[StudentSearchResult])
async def search_students_endpoint(
    q: str = Query("", description="Search query for student name"),
    limit: int = Query(30, ge=1, le=500),
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Search students by name within the organization. Teachers/admins only."""
    org_id = current_user["organization_id"]
    return search_students(db, org_id, q, limit=limit)
