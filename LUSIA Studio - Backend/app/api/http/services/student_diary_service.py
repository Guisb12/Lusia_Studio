"""
Student diary service — shared, date-attached entries about a student.

Visibility and permissions:
  - Teachers/Admins can list entries for students in their organization.
  - Teachers/Admins can create entries.
  - Teachers/Admins can update and delete any entry in their organization.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from supabase import Client

from app.utils.db import parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)

STUDENT_DIARY_SELECT = (
    "id,student_id,teacher_id,subject_id,entry_date,content,created_at,updated_at"
)

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


def _hydrate_entries(db: Client, entries: list[dict]) -> list[dict]:
    if not entries:
        return entries

    teacher_ids = {e.get("teacher_id") for e in entries if e.get("teacher_id")}
    subject_ids = {e.get("subject_id") for e in entries if e.get("subject_id")}

    teacher_map: dict[str, dict] = {}
    if teacher_ids:
        try:
            resp = (
                db.table("profiles")
                .select("id,full_name,display_name,avatar_url")
                .in_("id", list(teacher_ids))
                .execute()
            )
            for row in resp.data or []:
                teacher_map[row["id"]] = row
        except Exception:
            logger.warning("Failed to hydrate teacher profiles for student diary")

    subject_map: dict[str, dict] = {}
    if subject_ids:
        try:
            resp = (
                db.table("subjects")
                .select("id,name,color,icon")
                .in_("id", list(subject_ids))
                .execute()
            )
            for row in resp.data or []:
                subject_map[row["id"]] = row
        except Exception:
            logger.warning("Failed to hydrate subject metadata for student diary")

    for entry in entries:
        teacher = teacher_map.get(entry.get("teacher_id", ""))
        if teacher:
            entry["teacher_name"] = teacher.get("display_name") or teacher.get(
                "full_name"
            )
            entry["teacher_avatar_url"] = teacher.get("avatar_url")
        else:
            entry["teacher_name"] = None
            entry["teacher_avatar_url"] = None

        subject = subject_map.get(entry.get("subject_id", ""))
        if subject:
            entry["subject_name"] = subject.get("name")
            entry["subject_color"] = subject.get("color")
            entry["subject_icon"] = subject.get("icon")
        else:
            entry["subject_name"] = None
            entry["subject_color"] = None
            entry["subject_icon"] = None

    return entries


def list_entries(
    db: Client,
    org_id: str,
    student_id: str,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    subject_id: str | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> list[dict]:
    safe_limit = max(1, min(limit, MAX_LIMIT))
    safe_offset = max(0, offset)

    query = (
        db.table("student_diary_entries")
        .select(STUDENT_DIARY_SELECT)
        .eq("organization_id", org_id)
        .eq("student_id", student_id)
    )

    if date_from is not None:
        query = query.gte("entry_date", date_from.isoformat())
    if date_to is not None:
        query = query.lte("entry_date", date_to.isoformat())
    if subject_id:
        query = query.eq("subject_id", subject_id)

    query = query.order("entry_date", desc=True).order("created_at", desc=True)
    query = query.range(safe_offset, safe_offset + safe_limit - 1)

    response = supabase_execute(query, entity="student_diary_entry")
    return _hydrate_entries(db, response.data or [])


def create_entry(
    db: Client,
    org_id: str,
    student_id: str,
    teacher_id: str,
    data: dict,
) -> dict:
    content = (data.get("content") or "").strip()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Content cannot be empty",
        )

    entry_date = data.get("entry_date")
    if not entry_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="entry_date is required",
        )

    if isinstance(entry_date, datetime):
        parsed_date = entry_date.date()
    elif isinstance(entry_date, date):
        parsed_date = entry_date
    else:
        parsed_date = date.fromisoformat(str(entry_date))

    insert_data = {
        "organization_id": org_id,
        "student_id": student_id,
        "teacher_id": teacher_id,
        "entry_date": parsed_date.isoformat(),
        "content": content,
    }

    raw_subject_id = data.get("subject_id")
    if raw_subject_id is not None:
        subject_id = str(raw_subject_id).strip()
        if subject_id:
            subject_resp = supabase_execute(
                db.table("subjects")
                .select("id")
                .eq("id", subject_id)
                .or_(f"organization_id.eq.{org_id},organization_id.is.null")
                .limit(1),
                entity="subject",
            )
            if not subject_resp.data:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Invalid subject_id",
                )
            insert_data["subject_id"] = subject_id
        else:
            insert_data["subject_id"] = None
    else:
        insert_data["subject_id"] = None

    response = supabase_execute(
        db.table("student_diary_entries").insert(insert_data),
        entity="student_diary_entry",
    )
    entry = parse_single_or_404(response, entity="student_diary_entry")
    return _hydrate_entries(db, [entry])[0]


def update_entry(
    db: Client,
    org_id: str,
    student_id: str,
    entry_id: str,
    data: dict,
) -> dict:
    update_data: dict = {}

    if data.get("content") is not None:
        trimmed = str(data["content"]).strip()
        if not trimmed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Content cannot be empty",
            )
        update_data["content"] = trimmed

    if data.get("subject_id") is not None:
        subject_id = str(data.get("subject_id")).strip()
        subject_resp = supabase_execute(
            db.table("subjects")
            .select("id")
            .eq("id", subject_id)
            .or_(f"organization_id.eq.{org_id},organization_id.is.null")
            .limit(1),
            entity="subject",
        )
        if not subject_resp.data:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid subject_id",
            )
        update_data["subject_id"] = subject_id
    elif "subject_id" in data:
        update_data["subject_id"] = None

    if data.get("entry_date") is not None:
        raw_date = data["entry_date"]
        if isinstance(raw_date, datetime):
            parsed_date = raw_date.date()
        elif isinstance(raw_date, date):
            parsed_date = raw_date
        else:
            parsed_date = date.fromisoformat(str(raw_date))
        update_data["entry_date"] = parsed_date.isoformat()

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No fields to update",
        )

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    response = supabase_execute(
        db.table("student_diary_entries")
        .update(update_data)
        .eq("organization_id", org_id)
        .eq("student_id", student_id)
        .eq("id", entry_id),
        entity="student_diary_entry",
    )
    entry = parse_single_or_404(response, entity="student_diary_entry")
    return _hydrate_entries(db, [entry])[0]


def delete_entry(
    db: Client,
    org_id: str,
    student_id: str,
    entry_id: str,
) -> None:
    response = supabase_execute(
        db.table("student_diary_entries")
        .delete()
        .eq("organization_id", org_id)
        .eq("student_id", student_id)
        .eq("id", entry_id),
        entity="student_diary_entry",
    )
    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Diary entry not found",
        )
