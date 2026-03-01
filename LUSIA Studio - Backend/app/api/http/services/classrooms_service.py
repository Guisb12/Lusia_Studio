"""
Classrooms service — business logic for classroom CRUD and member management.
"""

from __future__ import annotations

import logging

from fastapi import HTTPException, status
from supabase import Client

from app.api.http.schemas.classrooms import ClassroomCreate, ClassroomUpdate
from app.schemas.pagination import PaginatedResponse, PaginationParams
from app.utils.db import paginated_query, parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)

CLASSROOM_SELECT = (
    "id,organization_id,name,description,subject_ids,"
    "grade_levels,courses,teacher_id,active,is_primary,created_at,updated_at"
)

MEMBER_SELECT = (
    "id,full_name,display_name,avatar_url,grade_level,course,subject_ids"
)


def list_classrooms(
    db: Client,
    org_id: str,
    *,
    teacher_id: str | None = None,
    active_filter: bool | None = None,
    pagination: PaginationParams,
) -> PaginatedResponse:
    filters: dict = {"organization_id": org_id}
    if teacher_id:
        filters["teacher_id"] = teacher_id
    if active_filter is not None:
        filters["active"] = active_filter

    return paginated_query(
        db,
        "classrooms",
        select=CLASSROOM_SELECT,
        filters=filters,
        order_by="created_at",
        ascending=False,
        pagination=pagination,
        entity="classrooms",
    )


def get_classroom(db: Client, org_id: str, classroom_id: str) -> dict:
    response = supabase_execute(
        db.table("classrooms")
        .select(CLASSROOM_SELECT)
        .eq("organization_id", org_id)
        .eq("id", classroom_id)
        .limit(1),
        entity="classroom",
    )
    return parse_single_or_404(response, entity="classroom")


def create_classroom(
    db: Client,
    org_id: str,
    teacher_id: str,
    payload: ClassroomCreate,
) -> dict:
    insert_data = {
        "organization_id": org_id,
        "teacher_id": teacher_id,
        "name": payload.name,
        "description": payload.description,
        "subject_ids": payload.subject_ids,
        "grade_levels": payload.grade_levels,
        "courses": payload.courses,
        "is_primary": payload.is_primary,
        "active": True,
    }

    response = supabase_execute(
        db.table("classrooms").insert(insert_data),
        entity="classroom",
    )
    return parse_single_or_404(response, entity="classroom")


def update_classroom(
    db: Client,
    org_id: str,
    classroom_id: str,
    payload: ClassroomUpdate,
) -> dict:
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        return get_classroom(db, org_id, classroom_id)

    response = supabase_execute(
        db.table("classrooms")
        .update(update_data)
        .eq("organization_id", org_id)
        .eq("id", classroom_id),
        entity="classroom",
    )
    return parse_single_or_404(response, entity="classroom")


def delete_classroom(db: Client, org_id: str, classroom_id: str) -> dict:
    """Soft-delete: set active to false. Cannot delete primary classes."""
    classroom = get_classroom(db, org_id, classroom_id)
    if classroom.get("is_primary"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot archive the primary class (Meus Alunos).",
        )

    response = supabase_execute(
        db.table("classrooms")
        .update({"active": False})
        .eq("organization_id", org_id)
        .eq("id", classroom_id),
        entity="classroom",
    )
    return parse_single_or_404(response, entity="classroom")


# ── Member management ──────────────────────────────────────────────


def get_classroom_members(db: Client, org_id: str, classroom_id: str) -> list[dict]:
    """Get all students belonging to a classroom via class_ids array."""
    response = supabase_execute(
        db.table("profiles")
        .select(MEMBER_SELECT)
        .eq("organization_id", org_id)
        .eq("role", "student")
        .eq("status", "active")
        .contains("class_ids", [classroom_id])
        .order("full_name")
        .limit(500),
        entity="classroom members",
    )
    return response.data or []


def add_students_to_classroom(
    db: Client,
    org_id: str,
    classroom_id: str,
    student_ids: list[str],
) -> list[dict]:
    """Add students to a classroom by appending classroom_id to their class_ids."""
    # Verify classroom exists
    get_classroom(db, org_id, classroom_id)

    updated = []
    for sid in student_ids:
        try:
            # Fetch current class_ids
            profile_resp = supabase_execute(
                db.table("profiles")
                .select("id,class_ids")
                .eq("id", sid)
                .eq("organization_id", org_id)
                .eq("role", "student")
                .limit(1),
                entity="student profile",
            )
            if not profile_resp.data:
                continue

            current_ids = profile_resp.data[0].get("class_ids") or []
            if classroom_id in current_ids:
                updated.append(profile_resp.data[0])
                continue

            new_ids = current_ids + [classroom_id]
            resp = supabase_execute(
                db.table("profiles")
                .update({"class_ids": new_ids})
                .eq("id", sid)
                .eq("organization_id", org_id),
                entity="student profile",
            )
            if resp.data:
                updated.append(resp.data[0])
        except Exception:
            logger.warning("Failed to add student %s to classroom %s", sid, classroom_id)
            continue

    return updated


def remove_students_from_classroom(
    db: Client,
    org_id: str,
    classroom_id: str,
    student_ids: list[str],
) -> list[dict]:
    """Remove students from a classroom by removing classroom_id from their class_ids."""
    removed = []
    for sid in student_ids:
        try:
            profile_resp = supabase_execute(
                db.table("profiles")
                .select("id,class_ids")
                .eq("id", sid)
                .eq("organization_id", org_id)
                .limit(1),
                entity="student profile",
            )
            if not profile_resp.data:
                continue

            current_ids = profile_resp.data[0].get("class_ids") or []
            if classroom_id not in current_ids:
                continue

            new_ids = [cid for cid in current_ids if cid != classroom_id]
            resp = supabase_execute(
                db.table("profiles")
                .update({"class_ids": new_ids})
                .eq("id", sid)
                .eq("organization_id", org_id),
                entity="student profile",
            )
            if resp.data:
                removed.append(resp.data[0])
        except Exception:
            logger.warning("Failed to remove student %s from classroom %s", sid, classroom_id)
            continue

    return removed


# ── Smart recommendations ──────────────────────────────────────────


def get_smart_recommendations(
    db: Client,
    org_id: str,
    teacher_id: str,
) -> list[dict]:
    """
    Get student recommendations based on subject overlap between teacher
    and students. Uses the get_student_recommendations RPC function.
    Falls back to fetching all active students if teacher has no subjects.
    """
    # Get teacher's subject_ids
    teacher_resp = supabase_execute(
        db.table("profiles")
        .select("subject_ids,subjects_taught")
        .eq("id", teacher_id)
        .limit(1),
        entity="teacher profile",
    )
    if not teacher_resp.data:
        return []

    teacher = teacher_resp.data[0]
    # Both subject_ids and subjects_taught are UUID arrays — merge them
    teacher_subject_ids = list(
        {
            *(teacher.get("subject_ids") or []),
            *(teacher.get("subjects_taught") or []),
        }
    )

    if not teacher_subject_ids:
        # No subjects to match — return all active students as fallback
        resp = supabase_execute(
            db.table("profiles")
            .select(MEMBER_SELECT)
            .eq("organization_id", org_id)
            .eq("role", "student")
            .eq("status", "active")
            .order("full_name")
            .limit(200),
            entity="students",
        )
        return [
            {
                "student_id": s["id"],
                "full_name": s.get("full_name"),
                "display_name": s.get("display_name"),
                "avatar_url": s.get("avatar_url"),
                "grade_level": s.get("grade_level"),
                "course": s.get("course"),
                "subject_ids": s.get("subject_ids") or [],
                "matching_subject_ids": [],
                "score": 0,
            }
            for s in (resp.data or [])
        ]

    # Call the RPC function
    try:
        resp = db.rpc(
            "get_student_recommendations",
            {"p_org_id": org_id, "p_teacher_subject_ids": teacher_subject_ids},
        ).execute()
        return resp.data or []
    except Exception:
        logger.exception("RPC get_student_recommendations failed, falling back")
        # Fallback: return all students
        resp = supabase_execute(
            db.table("profiles")
            .select(MEMBER_SELECT)
            .eq("organization_id", org_id)
            .eq("role", "student")
            .eq("status", "active")
            .order("full_name")
            .limit(200),
            entity="students",
        )
        return [
            {
                "student_id": s["id"],
                "full_name": s.get("full_name"),
                "display_name": s.get("display_name"),
                "avatar_url": s.get("avatar_url"),
                "grade_level": s.get("grade_level"),
                "course": s.get("course"),
                "subject_ids": s.get("subject_ids") or [],
                "matching_subject_ids": [],
                "score": 0,
            }
            for s in (resp.data or [])
        ]
