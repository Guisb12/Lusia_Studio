"""
Session types router — CRUD for session types (tipos de sessao).
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import require_admin, require_teacher
from app.api.http.schemas.session_types import (
    SessionTypeCreate,
    SessionTypeOut,
    SessionTypeUpdate,
)
from app.api.http.services.session_types_service import (
    create_session_type,
    delete_session_type,
    get_session_type,
    list_session_types,
    update_session_type,
)
from app.core.database import get_b2b_db

router = APIRouter()


@router.get("", response_model=list[SessionTypeOut])
async def list_types(
    active_only: bool = Query(True, description="Only return active session types"),
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """List session types for the current user's organization."""
    org_id = current_user["organization_id"]
    return list_session_types(db, org_id, active_only=active_only)


@router.get("/{session_type_id}", response_model=SessionTypeOut)
async def get_type(
    session_type_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Get a single session type."""
    org_id = current_user["organization_id"]
    return get_session_type(db, org_id, session_type_id)


@router.post("", response_model=SessionTypeOut, status_code=201)
async def create_type(
    payload: SessionTypeCreate,
    current_user: dict = Depends(require_admin),
    db: Client = Depends(get_b2b_db),
):
    """Create a new session type. Admin only."""
    org_id = current_user["organization_id"]
    return create_session_type(db, org_id, payload)


@router.patch("/{session_type_id}", response_model=SessionTypeOut)
async def update_type(
    session_type_id: str,
    payload: SessionTypeUpdate,
    current_user: dict = Depends(require_admin),
    db: Client = Depends(get_b2b_db),
):
    """Update an existing session type. Admin only."""
    org_id = current_user["organization_id"]
    return update_session_type(db, org_id, session_type_id, payload)


@router.delete("/{session_type_id}", response_model=SessionTypeOut)
async def delete_type(
    session_type_id: str,
    current_user: dict = Depends(require_admin),
    db: Client = Depends(get_b2b_db),
):
    """Soft-delete a session type (sets active=false). Admin only."""
    org_id = current_user["organization_id"]
    return delete_session_type(db, org_id, session_type_id)
