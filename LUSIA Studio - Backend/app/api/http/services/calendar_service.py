"""
Calendar service — business logic for session scheduling.
"""

from __future__ import annotations

import logging
import re
import uuid
from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import Literal, Optional

from fastapi import HTTPException, status
from supabase import Client

from app.api.http.schemas.calendar import RecurrenceRule, SessionCreate, SessionUpdate
from app.utils.db import parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)

SESSION_SELECT = (
    "id,organization_id,teacher_id,student_ids,class_id,"
    "session_type_id,snapshot_student_price,snapshot_teacher_cost,"
    "starts_at,ends_at,title,subject_ids,"
    "teacher_notes,teacher_summary,teacher_artifact_ids,"
    "summary_status,recurrence_group_id,recurrence_index,recurrence_rule,created_at,updated_at"
)

STUDENT_SEARCH_SELECT = (
    "id,full_name,display_name,avatar_url,grade_level,course,subject_ids"
)

_SEARCH_UNSAFE = re.compile(r"[%_,;'\"\\\x00]")


def _sanitize_search(query: str) -> str:
    """Strip PostgREST/SQL special characters from a user-supplied search string."""
    return _SEARCH_UNSAFE.sub("", query).strip()[:100]


def _validate_student_ids(db: Client, org_id: str, student_ids: list[str]) -> None:
    """Validate that all student_ids exist as active students in the org. Raises 422 on failure."""
    if not student_ids:
        return
    try:
        resp = (
            db.table("profiles")
            .select("id")
            .eq("organization_id", org_id)
            .eq("role", "student")
            .in_("id", student_ids)
            .execute()
        )
        found_ids = {row["id"] for row in (resp.data or [])}
        missing = set(student_ids) - found_ids
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid student IDs: {', '.join(sorted(missing))}",
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Failed to validate student_ids: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not validate student IDs",
        )


def _validate_teacher_id(db: Client, org_id: str, teacher_id: str) -> None:
    """Validate that teacher_id exists as an active teacher/admin in the org. Raises 422 on failure."""
    try:
        resp = (
            db.table("profiles")
            .select("id")
            .eq("organization_id", org_id)
            .in_("role", ["teacher", "admin"])
            .eq("id", teacher_id)
            .limit(1)
            .execute()
        )
        if not resp.data:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid teacher ID: {teacher_id}",
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Failed to validate teacher_id: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not validate teacher ID",
        )


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
    session_type_ids = list({s["session_type_id"] for s in sessions if s.get("session_type_id")})

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

    # Fetch session types
    session_type_map: dict[str, dict] = {}
    if session_type_ids:
        try:
            resp = (
                db.table("session_types")
                .select("id,name,color,icon,student_price_per_hour,teacher_cost_per_hour")
                .in_("id", session_type_ids)
                .execute()
            )
            for row in resp.data or []:
                session_type_map[row["id"]] = row
        except Exception:
            logger.warning("Failed to fetch session types for hydration")

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
        st_id = session.get("session_type_id")
        session["session_type"] = session_type_map.get(st_id) if st_id else None

    return sessions


def _hydrate_single(db: Client, session: dict) -> dict:
    """Hydrate a single session. Delegates to the batch helper."""
    return _batch_hydrate_sessions(db, [session])[0]


def _snapshot_session_type(db: Client, org_id: str, session_type_id: str) -> dict:
    """Fetch a session type and return snapshot fields. Raises 422 if not found."""
    try:
        resp = (
            db.table("session_types")
            .select("id,student_price_per_hour,teacher_cost_per_hour")
            .eq("organization_id", org_id)
            .eq("id", session_type_id)
            .eq("active", True)
            .limit(1)
            .execute()
        )
        if resp.data:
            row = resp.data[0]
            return {
                "session_type_id": row["id"],
                "snapshot_student_price": row["student_price_per_hour"],
                "snapshot_teacher_cost": row["teacher_cost_per_hour"],
            }
    except Exception:
        logger.warning("Failed to fetch session type %s", session_type_id)

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Session type not found or inactive",
    )


# ── Recurrence Utilities ──────────────────────────────────────────────────────

MAX_RECURRENCE_SESSIONS = 365


def _get_nth_weekday_in_month(year: int, month: int, nth: int, weekday: int) -> date | None:
    """Return the Nth occurrence of a weekday in a month, or None if it doesn't exist."""
    days_in_month = monthrange(year, month)[1]
    occurrences = [
        date(year, month, d)
        for d in range(1, days_in_month + 1)
        if date(year, month, d).weekday() == weekday
    ]
    if nth > len(occurrences):
        return None
    return occurrences[nth - 1]


def _nth_of_weekday_in_month(d: date) -> tuple[int, int]:
    """Return (nth, weekday) describing d's position. E.g. 2nd Thursday -> (2, 3)."""
    return (d.day - 1) // 7 + 1, d.weekday()


def _advance_month(year: int, month: int) -> tuple[int, int]:
    if month == 12:
        return year + 1, 1
    return year, month + 1


def generate_recurrence_dates(rule: RecurrenceRule, first_date: date) -> list[date]:
    """
    Generate all occurrence dates for a recurrence rule, starting from first_date.
    Hard cap: MAX_RECURRENCE_SESSIONS sessions.
    """
    try:
        end_date = date.fromisoformat(rule.end_date)
    except (ValueError, AttributeError):
        return []

    if end_date < first_date:
        return []

    freq = rule.freq
    interval = max(1, rule.interval or 1)
    dates: list[date] = []

    if freq == "daily":
        cursor = first_date
        while cursor <= end_date and len(dates) < MAX_RECURRENCE_SESSIONS:
            dates.append(cursor)
            cursor += timedelta(days=1)

    elif freq == "weekdays":
        cursor = first_date
        while cursor <= end_date and len(dates) < MAX_RECURRENCE_SESSIONS:
            if cursor.weekday() < 5:  # Mon=0 .. Fri=4
                dates.append(cursor)
            cursor += timedelta(days=1)

    elif freq == "weekly":
        cursor = first_date
        while cursor <= end_date and len(dates) < MAX_RECURRENCE_SESSIONS:
            dates.append(cursor)
            cursor += timedelta(weeks=1)

    elif freq == "biweekly":
        cursor = first_date
        while cursor <= end_date and len(dates) < MAX_RECURRENCE_SESSIONS:
            dates.append(cursor)
            cursor += timedelta(weeks=2)

    elif freq == "monthly_date":
        target_day = rule.month_day or first_date.day
        year, month = first_date.year, first_date.month
        while len(dates) < MAX_RECURRENCE_SESSIONS:
            days_in_month = monthrange(year, month)[1]
            day = min(target_day, days_in_month)
            candidate = date(year, month, day)
            if candidate < first_date:
                year, month = _advance_month(year, month)
                continue
            if candidate > end_date:
                break
            dates.append(candidate)
            year, month = _advance_month(year, month)

    elif freq == "monthly_weekday":
        nth, weekday = _nth_of_weekday_in_month(first_date)
        if rule.month_nth is not None:
            nth = rule.month_nth
        if rule.month_weekday is not None:
            weekday = rule.month_weekday
        year, month = first_date.year, first_date.month
        while len(dates) < MAX_RECURRENCE_SESSIONS:
            candidate = _get_nth_weekday_in_month(year, month, nth, weekday)
            if candidate is None or candidate < first_date:
                year, month = _advance_month(year, month)
                continue
            if candidate > end_date:
                break
            dates.append(candidate)
            year, month = _advance_month(year, month)

    elif freq == "yearly":
        cursor = first_date
        while len(dates) < MAX_RECURRENCE_SESSIONS:
            if cursor > end_date:
                break
            dates.append(cursor)
            next_year = cursor.year + 1
            # Handle Feb 29 in non-leap years by advancing until a valid year
            while True:
                try:
                    cursor = cursor.replace(year=next_year)
                    break
                except ValueError:
                    next_year += 1
                    if next_year > first_date.year + 50:
                        return dates

    elif freq == "custom":
        days_of_week = rule.days_of_week
        if days_of_week:
            # Every `interval` weeks on the specified days
            week_start = first_date - timedelta(days=first_date.weekday())
            cursor = first_date
            while cursor <= end_date and len(dates) < MAX_RECURRENCE_SESSIONS:
                weeks_since_start = (cursor - week_start).days // 7
                if weeks_since_start % interval == 0 and cursor.weekday() in days_of_week:
                    dates.append(cursor)
                cursor += timedelta(days=1)
        else:
            # Every `interval` days
            cursor = first_date
            while cursor <= end_date and len(dates) < MAX_RECURRENCE_SESSIONS:
                dates.append(cursor)
                cursor += timedelta(days=interval)

    return dates


# ── Session CRUD ──────────────────────────────────────────────────────────────


def create_session(
    db: Client,
    org_id: str,
    teacher_id: str,
    payload: SessionCreate,
) -> dict:
    """Create a calendar session and corresponding student_sessions rows."""
    _validate_student_ids(db, org_id, payload.student_ids)
    # Validate teacher_id if admin assigned a different teacher
    if payload.teacher_id:
        _validate_teacher_id(db, org_id, teacher_id)

    insert_data = {
        "organization_id": org_id,
        "teacher_id": teacher_id,
        "student_ids": payload.student_ids,
        "starts_at": payload.starts_at.isoformat(),
        "ends_at": payload.ends_at.isoformat(),
    }

    # Snapshot prices from session type
    snapshot = _snapshot_session_type(db, org_id, payload.session_type_id)
    insert_data.update(snapshot)

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
            logger.error("Failed to create student_sessions rows: %s", exc)
            # Compensating rollback: remove the orphaned calendar_session
            try:
                db.table("calendar_sessions").delete().eq("id", session["id"]).execute()
            except Exception:
                logger.error("Failed to rollback calendar_session %s", session["id"])
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to associate students with the session. Please try again.",
            )

    return _hydrate_single(db, session)


def create_session_batch(
    db: Client,
    org_id: str,
    teacher_id: str,
    payload: SessionCreate,
) -> dict:
    """
    Create all calendar_sessions + all student_sessions for a recurrence batch.
    Uses a generated UUID as recurrence_group_id — no separate table needed.
    Returns a BatchSessionOut-shaped dict.
    """
    _validate_student_ids(db, org_id, payload.student_ids)
    if payload.teacher_id:
        _validate_teacher_id(db, org_id, teacher_id)

    rule = payload.recurrence.rule  # type: ignore[union-attr]
    first_date = payload.starts_at.date()
    duration = payload.ends_at - payload.starts_at

    dates = generate_recurrence_dates(rule, first_date)
    if not dates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Recurrence rule produces no sessions in the given range",
        )

    # Snapshot session type pricing once (all sessions share the same snapshot)
    snapshot = _snapshot_session_type(db, org_id, payload.session_type_id)

    # Generate a shared group ID — no separate table needed
    group_id = str(uuid.uuid4())
    rule_dict = rule.model_dump()

    # Build all session rows
    base: dict = {
        "organization_id": org_id,
        "teacher_id": teacher_id,
        "student_ids": payload.student_ids,
        "recurrence_group_id": group_id,
        "recurrence_rule": rule_dict,
        **snapshot,
    }
    if payload.class_id:
        base["class_id"] = payload.class_id
    if payload.title:
        base["title"] = payload.title
    if payload.subject_ids:
        base["subject_ids"] = payload.subject_ids
    if payload.teacher_notes is not None:
        base["teacher_notes"] = payload.teacher_notes

    session_rows = []
    start_time = payload.starts_at.time()
    for idx, d in enumerate(dates):
        starts_at = datetime.combine(d, start_time)
        ends_at = starts_at + duration
        session_rows.append(
            {
                **base,
                "starts_at": starts_at.isoformat(),
                "ends_at": ends_at.isoformat(),
                "recurrence_index": idx,
            }
        )

    # Bulk insert sessions
    try:
        sessions_resp = (
            db.table("calendar_sessions")
            .insert(session_rows)
            .execute()
        )
        sessions: list[dict] = sessions_resp.data or []
    except Exception as exc:
        logger.error("Failed to bulk-insert calendar_sessions: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create recurring sessions. Please try again.",
        )

    if not sessions:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No sessions were created. Please try again.",
        )

    # Bulk insert student_sessions
    student_rows = [
        {
            "session_id": s["id"],
            "student_id": sid,
            "organization_id": org_id,
        }
        for s in sessions
        for sid in payload.student_ids
    ]
    if student_rows:
        try:
            db.table("student_sessions").insert(student_rows).execute()
        except Exception as exc:
            logger.error("Failed to create student_sessions rows for batch: %s", exc)
            # Compensating rollback: remove the orphaned sessions
            session_ids = [s["id"] for s in sessions]
            try:
                db.table("calendar_sessions").delete().in_("id", session_ids).execute()
            except Exception:
                pass
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to associate students with sessions. Rolled back.",
            )

    hydrated = _batch_hydrate_sessions(db, sessions)
    return {
        "sessions": hydrated,
        "recurrence_group_id": group_id,
        "count": len(hydrated),
    }


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

    max_results = 500 if role == "admin" else 200
    query = query.order("starts_at", desc=False).limit(max_results)

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


def _get_group_sessions(db: Client, org_id: str, group_id: str) -> list[dict]:
    """Fetch all sessions belonging to a recurrence group, ordered by recurrence_index."""
    resp = (
        db.table("calendar_sessions")
        .select(SESSION_SELECT)
        .eq("organization_id", org_id)
        .eq("recurrence_group_id", group_id)
        .order("recurrence_index", desc=False)
        .execute()
    )
    return resp.data or []


def update_session(
    db: Client,
    org_id: str,
    session_id: str,
    teacher_id: str,
    role: str,
    payload: SessionUpdate,
    scope: Literal["this", "this_and_future", "all"] = "this",
) -> dict | list[dict]:
    """
    Update a calendar session. Teachers can only update their own.
    scope controls how recurring sessions are affected:
      - "this": only this session (default)
      - "this_and_future": this session + all future ones in the group
      - "all": all sessions in the group
    """
    existing = get_session(db, org_id, session_id)

    if role == "teacher" and existing["teacher_id"] != teacher_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own sessions",
        )

    group_id = existing.get("recurrence_group_id")

    # Non-recurring or single-session scope → existing path
    if not group_id or scope == "this":
        return _update_single_session(db, org_id, session_id, existing, payload)

    if scope == "all":
        group_sessions = _get_group_sessions(db, org_id, group_id)
        updated = []
        for s in group_sessions:
            updated.append(_update_single_session(db, org_id, s["id"], s, payload))
        return updated

    # scope == "this_and_future"
    cutoff_index = existing.get("recurrence_index") or 0
    resp = (
        db.table("calendar_sessions")
        .select(SESSION_SELECT)
        .eq("organization_id", org_id)
        .eq("recurrence_group_id", group_id)
        .gte("recurrence_index", cutoff_index)
        .order("recurrence_index", desc=False)
        .execute()
    )
    future_sessions = resp.data or []
    updated = []
    for s in future_sessions:
        updated.append(_update_single_session(db, org_id, s["id"], s, payload))
    return updated


def _update_single_session(
    db: Client,
    org_id: str,
    session_id: str,
    existing: dict,
    payload: SessionUpdate,
) -> dict:
    """Core single-session update logic."""
    # Cross-field time validation: use existing DB values as fallback
    effective_starts = payload.starts_at or existing.get("starts_at")
    effective_ends = payload.ends_at or existing.get("ends_at")
    if effective_starts and effective_ends and effective_ends <= effective_starts:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="ends_at must be after starts_at",
        )

    provided = payload.model_fields_set
    update_data: dict = {}

    if "student_ids" in provided and payload.student_ids is not None:
        _validate_student_ids(db, org_id, payload.student_ids)
        update_data["student_ids"] = payload.student_ids
    if "session_type_id" in provided and payload.session_type_id is not None:
        snapshot = _snapshot_session_type(db, org_id, payload.session_type_id)
        update_data.update(snapshot)
    if "class_id" in provided:
        update_data["class_id"] = payload.class_id
    if "starts_at" in provided and payload.starts_at is not None:
        update_data["starts_at"] = payload.starts_at.isoformat()
    if "ends_at" in provided and payload.ends_at is not None:
        update_data["ends_at"] = payload.ends_at.isoformat()
    if "title" in provided:
        update_data["title"] = payload.title
    if "teacher_notes" in provided:
        update_data["teacher_notes"] = payload.teacher_notes
    if "subject_ids" in provided:
        update_data["subject_ids"] = payload.subject_ids

    if not update_data:
        return _hydrate_single(db, existing)

    response = supabase_execute(
        db.table("calendar_sessions")
        .update(update_data)
        .eq("organization_id", org_id)
        .eq("id", session_id),
        entity="calendar_session",
    )
    session = parse_single_or_404(response, entity="calendar_session")

    # Sync student_sessions if students changed
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
            logger.error("Failed to sync student_sessions: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Session updated but student associations may be inconsistent. Please verify.",
            )

    return _hydrate_single(db, session)


def delete_session(
    db: Client,
    org_id: str,
    session_id: str,
    teacher_id: str,
    role: str,
    scope: Literal["this", "this_and_future", "all"] = "this",
) -> dict | list[dict]:
    """
    Delete a calendar session. Teachers can only delete their own.
    scope controls how recurring sessions are affected.
    """
    existing = get_session(db, org_id, session_id)

    if role == "teacher" and existing["teacher_id"] != teacher_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own sessions",
        )

    group_id = existing.get("recurrence_group_id")

    if not group_id or scope == "this":
        supabase_execute(
            db.table("calendar_sessions")
            .delete()
            .eq("organization_id", org_id)
            .eq("id", session_id),
            entity="calendar_session",
        )
        return existing

    if scope == "all":
        group_sessions = _get_group_sessions(db, org_id, group_id)
        session_ids = [s["id"] for s in group_sessions]
        if session_ids:
            try:
                db.table("student_sessions").delete().in_("session_id", session_ids).execute()
            except Exception as exc:
                logger.warning("Failed to delete student_sessions for group: %s", exc)
            supabase_execute(
                db.table("calendar_sessions")
                .delete()
                .eq("recurrence_group_id", group_id)
                .eq("organization_id", org_id),
                entity="calendar_sessions",
            )
        return group_sessions

    # scope == "this_and_future"
    cutoff_index = existing.get("recurrence_index") or 0
    resp = (
        db.table("calendar_sessions")
        .select(SESSION_SELECT)
        .eq("organization_id", org_id)
        .eq("recurrence_group_id", group_id)
        .gte("recurrence_index", cutoff_index)
        .execute()
    )
    future_sessions = resp.data or []
    future_ids = [s["id"] for s in future_sessions]

    if future_ids:
        try:
            db.table("student_sessions").delete().in_("session_id", future_ids).execute()
        except Exception as exc:
            logger.warning("Failed to delete student_sessions: %s", exc)
        try:
            db.table("calendar_sessions").delete().in_("id", future_ids).execute()
        except Exception as exc:
            logger.error("Failed to delete future sessions: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete sessions. Please try again.",
            )

    return future_sessions


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
