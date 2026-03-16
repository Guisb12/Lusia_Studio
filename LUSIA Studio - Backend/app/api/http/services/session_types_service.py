"""
Session types service — business logic for session type management.
"""

from __future__ import annotations

import logging

from fastapi import HTTPException, status
from supabase import Client

from app.api.http.schemas.session_types import SessionTypeCreate, SessionTypeUpdate
from app.utils.db import parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)

# Session types are a simple reference entity with a small, fixed payload.
# A summary/detail SELECT split is unnecessary — the full row is always
# returned and all fields are used in both list and detail views.
SESSION_TYPE_SELECT = (
    "id,organization_id,name,description,"
    "student_price_per_hour,teacher_cost_per_hour,"
    "color,icon,is_default,active,created_at,updated_at"
)


def _ensure_default_session_type(db: Client, org_id: str) -> None:
    """Create a default 'Geral' session type if no active types exist for the org."""
    try:
        resp = (
            db.table("session_types")
            .select("id")
            .eq("organization_id", org_id)
            .eq("active", True)
            .limit(1)
            .execute()
        )
        if resp.data:
            return  # At least one active type exists

        db.table("session_types").insert({
            "organization_id": org_id,
            "name": "Geral",
            "description": "Tipo de sessão predefinido",
            "student_price_per_hour": 0,
            "teacher_cost_per_hour": 0,
            "color": "#3b82f6",
            "is_default": True,
        }).execute()
        logger.info("Auto-created default 'Geral' session type for org %s", org_id)
    except Exception:
        logger.warning("Failed to ensure default session type for org %s", org_id)


def list_session_types(
    db: Client,
    org_id: str,
    *,
    active_only: bool = True,
) -> list[dict]:
    """List session types for an organization. Auto-creates a default if none exist."""
    def build_query():
        query = (
            db.table("session_types")
            .select(SESSION_TYPE_SELECT)
            .eq("organization_id", org_id)
            .order("is_default", desc=True)
            .order("name")
        )
        if active_only:
            query = query.eq("active", True)
        return query

    response = supabase_execute(build_query(), entity="session_types")
    rows = response.data or []
    if rows:
        return rows

    _ensure_default_session_type(db, org_id)

    fallback_response = supabase_execute(build_query(), entity="session_types")
    return fallback_response.data or []


def get_session_type(
    db: Client,
    org_id: str,
    session_type_id: str,
) -> dict:
    """Get a single session type by ID."""
    response = supabase_execute(
        db.table("session_types")
        .select(SESSION_TYPE_SELECT)
        .eq("organization_id", org_id)
        .eq("id", session_type_id)
        .limit(1),
        entity="session_type",
    )
    return parse_single_or_404(response, entity="session_type")


def create_session_type(
    db: Client,
    org_id: str,
    payload: SessionTypeCreate,
) -> dict:
    """Create a new session type. Handles is_default uniqueness."""
    if payload.is_default:
        _clear_default(db, org_id)

    insert_data = {
        "organization_id": org_id,
        "name": payload.name,
        "student_price_per_hour": payload.student_price_per_hour,
        "teacher_cost_per_hour": payload.teacher_cost_per_hour,
        "is_default": payload.is_default,
    }
    if payload.description is not None:
        insert_data["description"] = payload.description
    if payload.color is not None:
        insert_data["color"] = payload.color
    if payload.icon is not None:
        insert_data["icon"] = payload.icon

    response = supabase_execute(
        db.table("session_types").insert(insert_data),
        entity="session_type",
    )
    return parse_single_or_404(response, entity="session_type")


def update_session_type(
    db: Client,
    org_id: str,
    session_type_id: str,
    payload: SessionTypeUpdate,
) -> dict:
    """Update a session type. Handles is_default toggle."""
    # Verify it exists and belongs to this org
    get_session_type(db, org_id, session_type_id)

    provided = payload.model_fields_set
    update_data: dict = {}

    if "name" in provided and payload.name is not None:
        update_data["name"] = payload.name
    if "description" in provided:
        update_data["description"] = payload.description
    if "student_price_per_hour" in provided and payload.student_price_per_hour is not None:
        update_data["student_price_per_hour"] = payload.student_price_per_hour
    if "teacher_cost_per_hour" in provided and payload.teacher_cost_per_hour is not None:
        update_data["teacher_cost_per_hour"] = payload.teacher_cost_per_hour
    if "color" in provided:
        update_data["color"] = payload.color
    if "icon" in provided:
        update_data["icon"] = payload.icon
    if "active" in provided and payload.active is not None:
        update_data["active"] = payload.active
    if "is_default" in provided and payload.is_default is not None:
        if payload.is_default:
            _clear_default(db, org_id)
        update_data["is_default"] = payload.is_default

    if not update_data:
        return get_session_type(db, org_id, session_type_id)

    response = supabase_execute(
        db.table("session_types")
        .update(update_data)
        .eq("organization_id", org_id)
        .eq("id", session_type_id),
        entity="session_type",
    )
    return parse_single_or_404(response, entity="session_type")


def delete_session_type(
    db: Client,
    org_id: str,
    session_type_id: str,
) -> dict:
    """Soft-delete a session type (set active=false)."""
    existing = get_session_type(db, org_id, session_type_id)

    supabase_execute(
        db.table("session_types")
        .update({"active": False, "is_default": False})
        .eq("organization_id", org_id)
        .eq("id", session_type_id),
        entity="session_type",
    )
    existing["active"] = False
    existing["is_default"] = False
    return existing


def _clear_default(db: Client, org_id: str) -> None:
    """Unset the current default session type for the org (if any)."""
    try:
        db.table("session_types").update({"is_default": False}).eq(
            "organization_id", org_id
        ).eq("is_default", True).execute()
    except Exception:
        logger.warning("Failed to clear default session type for org %s", org_id)
