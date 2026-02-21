"""
Calendar service — business logic for session scheduling.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import HTTPException, status
from supabase import Client

from app.api.http.schemas.calendar import SessionCreate, SessionUpdate
from app.utils.db import parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)

SESSION_SELECT = (
    "id,organization_id,teacher_id,student_ids,class_id,"
    "starts_at,ends_at,title,subject_ids,"
    "teacher_notes,teacher_summary,teacher_artifact_ids,"
    "summary_status,created_at,updated_at"
)

STUDENT_SEARCH_SELECT = (
    "id,full_name,display_name,avatar_url,grade_level,course,"
    "subject_ids,parent_name,parent_email,parent_phone"
)


def _hydrate_session(db: Client, session: dict) -> dict:
    """Add teacher name, student details, and subject details to a session."""
    # Teacher name
    try:
        teacher_resp = (
            db.table("profiles")
            .select("full_name,display_name")
            .eq("id", session["teacher_id"])
            .limit(1)
            .execute()
        )
        if teacher_resp.data:
            t = teacher_resp.data[0]
            session["teacher_name"] = t.get("display_name") or t.get("full_name")
    except Exception:
        session["teacher_name"] = None

    # Students
    student_ids = session.get("student_ids") or []
    if student_ids:
        try:
            students_resp = (
                db.table("profiles")
                .select("id,full_name,display_name,avatar_url,grade_level,course")
                .in_("id", student_ids)
                .execute()
            )
            session["students"] = students_resp.data or []
        except Exception:
            session["students"] = []
    else:
        session["students"] = []

    # Subjects
    subject_ids = session.get("subject_ids") or []
    if subject_ids:
        try:
            subjects_resp = (
                db.table("subjects")
                .select("id,name,color,icon")
                .in_("id", subject_ids)
                .execute()
            )
            session["subjects"] = subjects_resp.data or []
        except Exception:
            session["subjects"] = []
    else:
        session["subjects"] = []

    return session


def create_session(
    db: Client,
    org_id: str,
    teacher_id: str,
    payload: SessionCreate,
) -> dict:
    """Create a calendar session and corresponding student_sessions rows."""
    insert_data = {
        "organization_id": org_id,
        "teacher_id": teacher_id,
        "student_ids": payload.student_ids,
        "starts_at": payload.starts_at.isoformat(),
        "ends_at": payload.ends_at.isoformat(),
    }
    if payload.class_id:
        insert_data["class_id"] = payload.class_id
    if payload.title:
        insert_data["title"] = payload.title
    if payload.subject_ids:
        insert_data["subject_ids"] = payload.subject_ids
    if payload.teacher_notes is not None:
        insert_data["teacher_notes"] = payload.teacher_notes

    # NOTE:
    # Newer versions of the Supabase Python client return the inserted rows by
    # default from `insert().execute()`, but the `insert()` builder no longer
    # exposes a `.select(...)` method (unlike `select()` / `update()` builders).
    # Calling `.select(...)` here was raising:
    #   AttributeError: 'SyncQueryRequestBuilder' object has no attribute 'select'
    #
    # We simply execute the insert and rely on the returned row data.
    response = supabase_execute(
        db.table("calendar_sessions").insert(insert_data),
        entity="calendar_session",
    )
    session = parse_single_or_404(response, entity="calendar_session")

    # Create student_sessions rows
    student_rows = [
        {
            "session_id": session["id"],
            "student_id": sid,
            "organization_id": org_id,
        }
        for sid in payload.student_ids
    ]
    if student_rows:
        try:
            db.table("student_sessions").insert(student_rows).execute()
        except Exception as exc:
            logger.warning("Failed to create student_sessions rows: %s", exc)

    return _hydrate_session(db, session)


def list_sessions(
    db: Client,
    org_id: str,
    *,
    role: str,
    user_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    teacher_id_filter: Optional[str] = None,
) -> list[dict]:
    """List sessions, role-aware."""
    query = db.table("calendar_sessions").select(SESSION_SELECT).eq("organization_id", org_id)

    if role == "student":
        # Students: sessions where they appear in student_ids
        query = query.contains("student_ids", [user_id])
    elif role == "teacher":
        # Teachers see only their own sessions
        query = query.eq("teacher_id", user_id)
    elif role == "admin":
        # Admins see all org sessions, optionally filtered by teacher
        if teacher_id_filter:
            query = query.eq("teacher_id", teacher_id_filter)

    if start_date:
        query = query.gte("starts_at", start_date)
    if end_date:
        query = query.lte("ends_at", end_date)

    query = query.order("starts_at", desc=False)

    response = supabase_execute(query, entity="calendar_sessions")
    sessions = response.data or []

    # Hydrate each session
    return [_hydrate_session(db, s) for s in sessions]


def get_session(db: Client, org_id: str, session_id: str) -> dict:
    """Get single session by ID."""
    response = supabase_execute(
        db.table("calendar_sessions")
        .select(SESSION_SELECT)
        .eq("organization_id", org_id)
        .eq("id", session_id)
        .limit(1),
        entity="calendar_session",
    )
    session = parse_single_or_404(response, entity="calendar_session")
    return _hydrate_session(db, session)


def update_session(
    db: Client,
    org_id: str,
    session_id: str,
    teacher_id: str,
    role: str,
    payload: SessionUpdate,
) -> dict:
    """Update a calendar session. Teachers can only update their own."""
    # Verify ownership for teachers
    if role == "teacher":
        existing = get_session(db, org_id, session_id)
        if existing["teacher_id"] != teacher_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only edit your own sessions",
            )

    update_data = {}
    if payload.student_ids is not None:
        update_data["student_ids"] = payload.student_ids
    if payload.class_id is not None:
        update_data["class_id"] = payload.class_id
    if payload.starts_at is not None:
        update_data["starts_at"] = payload.starts_at.isoformat()
    if payload.ends_at is not None:
        update_data["ends_at"] = payload.ends_at.isoformat()
    if payload.title is not None:
        update_data["title"] = payload.title
    if payload.subject_ids is not None:
        update_data["subject_ids"] = payload.subject_ids
    if payload.teacher_notes is not None:
        update_data["teacher_notes"] = payload.teacher_notes

    if not update_data:
        return get_session(db, org_id, session_id)

    # Similar to `insert()`, the `update()` builder in the current Supabase
    # client returns the updated rows from `execute()` without needing an
    # extra `.select(...)` call, so we avoid chaining `.select(...)` here to
    # keep compatibility with the client API.
    response = supabase_execute(
        db.table("calendar_sessions")
        .update(update_data)
        .eq("organization_id", org_id)
        .eq("id", session_id),
        entity="calendar_session",
    )
    session = parse_single_or_404(response, entity="calendar_session")

    # Sync student_sessions if students changed
    if payload.student_ids is not None:
        try:
            # Delete existing student_sessions
            db.table("student_sessions").delete().eq("session_id", session_id).execute()
            # Re-create
            student_rows = [
                {
                    "session_id": session_id,
                    "student_id": sid,
                    "organization_id": org_id,
                }
                for sid in payload.student_ids
            ]
            if student_rows:
                db.table("student_sessions").insert(student_rows).execute()
        except Exception as exc:
            logger.warning("Failed to sync student_sessions: %s", exc)

    return _hydrate_session(db, session)


def delete_session(
    db: Client,
    org_id: str,
    session_id: str,
    teacher_id: str,
    role: str,
) -> dict:
    """Delete a calendar session. Teachers can only delete their own."""
    existing = get_session(db, org_id, session_id)

    if role == "teacher" and existing["teacher_id"] != teacher_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own sessions",
        )

    # Delete (cascades to student_sessions via FK)
    supabase_execute(
        db.table("calendar_sessions")
        .delete()
        .eq("organization_id", org_id)
        .eq("id", session_id),
        entity="calendar_session",
    )
    return existing


def search_students(
    db: Client,
    org_id: str,
    query: str,
    limit: int = 20,
) -> list[dict]:
    """Search students by name within the organization."""
    q = db.table("profiles").select(STUDENT_SEARCH_SELECT).eq("organization_id", org_id).eq("role", "student").eq("status", "active")

    if query:
        # Use ilike for case-insensitive search on full_name
        q = q.or_(f"full_name.ilike.%{query}%,display_name.ilike.%{query}%")

    q = q.order("full_name").limit(limit)

    response = supabase_execute(q, entity="students")
    return response.data or []
