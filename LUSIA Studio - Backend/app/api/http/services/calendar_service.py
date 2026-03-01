"""
Calendar service — business logic for session scheduling.
"""

from __future__ import annotations

import logging
import re
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
    "id,full_name,display_name,avatar_url,grade_level,course"
)

_SEARCH_UNSAFE = re.compile(r"[%_,;'\"\\\x00]")


def _sanitize_search(query: str) -> str:
    """Strip PostgREST/SQL special characters from a user-supplied search string."""
    return _SEARCH_UNSAFE.sub("", query).strip()[:100]


def _batch_hydrate_sessions(db: Client, sessions: list[dict]) -> list[dict]:
    """
    Hydrate a list of sessions with teacher, student, and subject data using
    exactly 3 DB queries regardless of how many sessions there are.
    """
    if not sessions:
        return sessions

    # Collect unique IDs across all sessions
    teacher_ids = list({s["teacher_id"] for s in sessions if s.get("teacher_id")})
    student_ids = list({sid for s in sessions for sid in (s.get("student_ids") or [])})
    subject_ids = list({sid for s in sessions for sid in (s.get("subject_ids") or [])})

    # Fetch teachers
    teacher_map: dict[str, str] = {}
    if teacher_ids:
        try:
            resp = (
                db.table("profiles")
                .select("id,full_name,display_name")
                .in_("id", teacher_ids)
                .execute()
            )
            for row in resp.data or []:
                teacher_map[row["id"]] = row.get("display_name") or row.get("full_name") or ""
        except Exception:
            logger.warning("Failed to fetch teacher profiles for hydration")

    # Fetch students
    student_map: dict[str, dict] = {}
    if student_ids:
        try:
            resp = (
                db.table("profiles")
                .select("id,full_name,display_name,avatar_url,grade_level,course")
                .in_("id", student_ids)
                .execute()
            )
            for row in resp.data or []:
                student_map[row["id"]] = row
        except Exception:
            logger.warning("Failed to fetch student profiles for hydration")

    # Fetch subjects
    subject_map: dict[str, dict] = {}
    if subject_ids:
        try:
            resp = (
                db.table("subjects")
                .select("id,name,color,icon")
                .in_("id", subject_ids)
                .execute()
            )
            for row in resp.data or []:
                subject_map[row["id"]] = row
        except Exception:
            logger.warning("Failed to fetch subjects for hydration")

    # Attach hydrated data to each session
    for session in sessions:
        session["teacher_name"] = teacher_map.get(session.get("teacher_id", ""))
        session["students"] = [
            student_map[sid]
            for sid in (session.get("student_ids") or [])
            if sid in student_map
        ]
        session["subjects"] = [
            subject_map[sid]
            for sid in (session.get("subject_ids") or [])
            if sid in subject_map
        ]

    return sessions


def _hydrate_single(db: Client, session: dict) -> dict:
    """Hydrate a single session. Delegates to the batch helper."""
    return _batch_hydrate_sessions(db, [session])[0]


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

    return _hydrate_single(db, session)


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
    """List sessions, role-aware. Uses batch hydration — O(1) queries regardless of result size."""
    query = db.table("calendar_sessions").select(SESSION_SELECT).eq("organization_id", org_id)

    if role == "student":
        query = query.contains("student_ids", [user_id])
    elif role == "teacher":
        query = query.eq("teacher_id", user_id)
    elif role == "admin":
        if teacher_id_filter:
            query = query.eq("teacher_id", teacher_id_filter)

    if start_date:
        query = query.gte("starts_at", start_date)
    if end_date:
        query = query.lte("ends_at", end_date)

    query = query.order("starts_at", desc=False).limit(200)

    response = supabase_execute(query, entity="calendar_sessions")
    sessions = response.data or []

    return _batch_hydrate_sessions(db, sessions)


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
    return _hydrate_single(db, session)


def update_session(
    db: Client,
    org_id: str,
    session_id: str,
    teacher_id: str,
    role: str,
    payload: SessionUpdate,
) -> dict:
    """Update a calendar session. Teachers can only update their own."""
    # Always fetch the existing session — needed for ownership check and time validation
    existing = get_session(db, org_id, session_id)

    if role == "teacher" and existing["teacher_id"] != teacher_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own sessions",
        )

    # Cross-field time validation: use existing DB values as fallback
    effective_starts = payload.starts_at or existing.get("starts_at")
    effective_ends = payload.ends_at or existing.get("ends_at")
    if effective_starts and effective_ends and effective_ends <= effective_starts:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="ends_at must be after starts_at",
        )

    # Build update dict — use model_fields_set to include fields that were
    # explicitly set to null (clearing them) vs. fields that were omitted.
    provided = payload.model_fields_set
    update_data: dict = {}

    if "student_ids" in provided and payload.student_ids is not None:
        update_data["student_ids"] = payload.student_ids
    if "class_id" in provided:
        update_data["class_id"] = payload.class_id
    if "starts_at" in provided and payload.starts_at is not None:
        update_data["starts_at"] = payload.starts_at.isoformat()
    if "ends_at" in provided and payload.ends_at is not None:
        update_data["ends_at"] = payload.ends_at.isoformat()
    # title and teacher_notes support explicit null to clear the field
    if "title" in provided:
        update_data["title"] = payload.title  # may be None → clears the field
    if "teacher_notes" in provided:
        update_data["teacher_notes"] = payload.teacher_notes  # may be None → clears

    if not update_data:
        return existing

    response = supabase_execute(
        db.table("calendar_sessions")
        .update(update_data)
        .eq("organization_id", org_id)
        .eq("id", session_id),
        entity="calendar_session",
    )
    session = parse_single_or_404(response, entity="calendar_session")

    # Sync student_sessions if students changed — delete then re-insert
    if "student_ids" in provided and payload.student_ids is not None:
        try:
            db.table("student_sessions").delete().eq("session_id", session_id).execute()
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

    return _hydrate_single(db, session)


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
    q = (
        db.table("profiles")
        .select(STUDENT_SEARCH_SELECT)
        .eq("organization_id", org_id)
        .eq("role", "student")
        .eq("status", "active")
    )

    if query:
        safe_query = _sanitize_search(query)
        if safe_query:
            q = q.or_(f"full_name.ilike.%{safe_query}%,display_name.ilike.%{safe_query}%")

    q = q.order("full_name").limit(limit)

    response = supabase_execute(q, entity="students")
    return response.data or []
