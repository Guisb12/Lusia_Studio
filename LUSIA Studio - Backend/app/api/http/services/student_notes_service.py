"""
Student notes service — per-student post-it notes written by teachers.

Visibility:
  - Teacher sees: own notes + notes shared with them (shared_with_ids @> [teacher_id])
  - Admin sees: all notes for the student
Only the note author can update or delete their notes.
"""

import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from supabase import Client

from app.utils.db import parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)

STUDENT_NOTE_SELECT = (
    "id,student_id,teacher_id,content,color,shared_with_ids,created_at,updated_at"
)

DEFAULT_NOTE_COLOR = "#FFF9B1"


# ---------------------------------------------------------------------------
# Hydration
# ---------------------------------------------------------------------------

def _hydrate_notes(db: Client, notes: list[dict]) -> list[dict]:
    """Batch-resolve teacher profiles for author + shared_with attribution."""
    if not notes:
        return notes

    # Collect all unique profile IDs (authors + shared_with)
    all_ids: set[str] = set()
    for n in notes:
        if n.get("teacher_id"):
            all_ids.add(n["teacher_id"])
        for sid in n.get("shared_with_ids") or []:
            all_ids.add(sid)

    profile_map: dict[str, dict] = {}
    if all_ids:
        try:
            resp = (
                db.table("profiles")
                .select("id,full_name,display_name,avatar_url")
                .in_("id", list(all_ids))
                .execute()
            )
            for row in resp.data or []:
                profile_map[row["id"]] = row
        except Exception:
            logger.warning("Failed to hydrate profiles for student notes")

    for note in notes:
        # Author
        author = profile_map.get(note.get("teacher_id", ""))
        if author:
            note["teacher_name"] = author.get("display_name") or author.get("full_name")
            note["teacher_avatar_url"] = author.get("avatar_url")
        else:
            note["teacher_name"] = None
            note["teacher_avatar_url"] = None

        # Shared with
        shared_with = []
        for sid in note.get("shared_with_ids") or []:
            profile = profile_map.get(sid)
            if profile:
                shared_with.append({
                    "id": sid,
                    "name": profile.get("display_name") or profile.get("full_name"),
                    "avatar_url": profile.get("avatar_url"),
                })
            else:
                shared_with.append({"id": sid, "name": None, "avatar_url": None})
        note["shared_with"] = shared_with

    return notes


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

def list_notes(
    db: Client,
    org_id: str,
    student_id: str,
    teacher_id: str,
    role: str,
) -> list[dict]:
    """
    List notes for a student with role-aware visibility.

    Teacher: own notes + notes shared with them.
    Admin: all notes for the student.
    """
    if role == "admin":
        response = supabase_execute(
            db.table("student_notes")
            .select(STUDENT_NOTE_SELECT)
            .eq("organization_id", org_id)
            .eq("student_id", student_id)
            .order("created_at", desc=True),
            entity="student_note",
        )
        notes = response.data or []
    else:
        # Own notes
        own_resp = supabase_execute(
            db.table("student_notes")
            .select(STUDENT_NOTE_SELECT)
            .eq("organization_id", org_id)
            .eq("student_id", student_id)
            .eq("teacher_id", teacher_id)
            .order("created_at", desc=True),
            entity="student_note",
        )
        own_notes = own_resp.data or []

        # Notes shared with this teacher
        shared_resp = supabase_execute(
            db.table("student_notes")
            .select(STUDENT_NOTE_SELECT)
            .eq("organization_id", org_id)
            .eq("student_id", student_id)
            .neq("teacher_id", teacher_id)
            .contains("shared_with_ids", [teacher_id])
            .order("created_at", desc=True),
            entity="student_note",
        )
        shared_notes = shared_resp.data or []

        notes = own_notes + shared_notes
        notes.sort(key=lambda n: n.get("created_at", ""), reverse=True)

    return _hydrate_notes(db, notes)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

def create_note(
    db: Client,
    org_id: str,
    student_id: str,
    teacher_id: str,
    data: dict,
) -> dict:
    """Create a new student note."""
    insert_data = {
        "organization_id": org_id,
        "student_id": student_id,
        "teacher_id": teacher_id,
        "content": data["content"],
        "color": data.get("color") or DEFAULT_NOTE_COLOR,
        "shared_with_ids": data.get("shared_with_ids") or [],
    }

    response = supabase_execute(
        db.table("student_notes").insert(insert_data),
        entity="student_note",
    )
    note = parse_single_or_404(response, entity="student_note")
    return _hydrate_notes(db, [note])[0]


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

def update_note(
    db: Client,
    org_id: str,
    note_id: str,
    teacher_id: str,
    data: dict,
) -> dict:
    """Update a student note. Only the author can update."""
    update_data: dict = {}
    if data.get("content") is not None:
        update_data["content"] = data["content"]
    if data.get("color") is not None:
        update_data["color"] = data["color"]
    if "shared_with_ids" in data:
        update_data["shared_with_ids"] = data["shared_with_ids"] or []

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No fields to update",
        )

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    response = supabase_execute(
        db.table("student_notes")
        .update(update_data)
        .eq("organization_id", org_id)
        .eq("id", note_id)
        .eq("teacher_id", teacher_id),
        entity="student_note",
    )
    note = parse_single_or_404(response, entity="student_note")
    return _hydrate_notes(db, [note])[0]


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

def delete_note(
    db: Client,
    org_id: str,
    note_id: str,
    teacher_id: str,
) -> None:
    """Delete a student note. Only the author can delete."""
    response = supabase_execute(
        db.table("student_notes")
        .delete()
        .eq("organization_id", org_id)
        .eq("id", note_id)
        .eq("teacher_id", teacher_id),
        entity="student_note",
    )
    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found or not owned by you",
        )
