"""
Classrooms service — business logic for classroom CRUD operations.
"""

from __future__ import annotations

from supabase import Client

from app.api.http.schemas.classrooms import ClassroomCreate, ClassroomUpdate
from app.schemas.pagination import PaginatedResponse, PaginationParams
from app.utils.db import paginated_query, parse_single_or_404, supabase_execute

CLASSROOM_SELECT = (
    "id,organization_id,name,description,grade_level,"
    "subject_id,teacher_id,school_year,status,created_at,updated_at"
)


def list_classrooms(
    db: Client,
    org_id: str,
    *,
    status_filter: str | None = None,
    pagination: PaginationParams,
) -> PaginatedResponse:
    filters: dict = {"organization_id": org_id}
    if status_filter:
        filters["status"] = status_filter

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
    teacher_id: str | None,
    payload: ClassroomCreate,
) -> dict:
    insert_data = {
        "organization_id": org_id,
        "name": payload.name,
        "description": payload.description,
        "grade_level": payload.grade_level,
        "subject_id": payload.subject_id,
        "school_year": payload.school_year,
        "status": "active",
    }
    if teacher_id:
        insert_data["teacher_id"] = teacher_id

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
    """Soft-delete: set status to 'archived'."""
    response = supabase_execute(
        db.table("classrooms")
        .update({"status": "archived"})
        .eq("organization_id", org_id)
        .eq("id", classroom_id),
        entity="classroom",
    )
    return parse_single_or_404(response, entity="classroom")
