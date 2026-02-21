"""
Question bank service and quiz image upload helpers.

Uses the unified `questions` table (formerly quiz_questions).
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import HTTPException, status
from supabase import Client

from app.api.http.schemas.quiz_questions import QuestionCreateIn, QuestionUpdateIn
from app.utils.db import parse_single_or_404, supabase_execute

QUESTION_SELECT = (
    "id,organization_id,created_by,source_type,artifact_id,"
    "type,parent_id,order_in_parent,label,content,"
    "subject_id,year_level,subject_component,curriculum_codes,"
    "is_public,created_at,updated_at"
)

QUIZ_IMAGE_BUCKET = "quiz-images"
QUIZ_IMAGE_MAX_BYTES = 8 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def _can_administer_question(role: str) -> bool:
    return role == "admin"


def list_quiz_questions(
    db: Client,
    org_id: str,
    user_id: str,
    *,
    ids: Optional[list[str]] = None,
    question_type: Optional[str] = None,
    subject_id: Optional[str] = None,
    year_level: Optional[str] = None,
    subject_component: Optional[str] = None,
    curriculum_code: Optional[str] = None,
) -> list[dict]:
    """List question bank entries (own + public) with optional filters."""
    query = (
        db.table("questions")
        .select(QUESTION_SELECT)
        .eq("organization_id", org_id)
        .or_(f"created_by.eq.{user_id},is_public.eq.true")
    )

    if ids:
        query = query.in_("id", ids)
    if question_type:
        query = query.eq("type", question_type)
    if subject_id:
        query = query.eq("subject_id", subject_id)
    if year_level:
        query = query.eq("year_level", year_level)
    if subject_component:
        query = query.eq("subject_component", subject_component)
    if curriculum_code:
        query = query.contains("curriculum_codes", [curriculum_code])

    response = supabase_execute(
        query.order("created_at", desc=True),
        entity="questions",
    )
    return response.data or []


def create_quiz_question(
    db: Client,
    org_id: str,
    user_id: str,
    payload: QuestionCreateIn,
) -> dict:
    """Create a question entry in the question bank."""
    insert_data = {
        "organization_id": org_id,
        "created_by": user_id,
        "type": payload.type,
        "content": payload.content,
        "source_type": payload.source_type,
        "is_public": payload.is_public,
    }
    if payload.artifact_id:
        insert_data["artifact_id"] = payload.artifact_id
    if payload.parent_id:
        insert_data["parent_id"] = payload.parent_id
    if payload.order_in_parent is not None:
        insert_data["order_in_parent"] = payload.order_in_parent
    if payload.label:
        insert_data["label"] = payload.label
    if payload.subject_id:
        insert_data["subject_id"] = payload.subject_id
    if payload.year_level:
        insert_data["year_level"] = payload.year_level
    if payload.subject_component:
        insert_data["subject_component"] = payload.subject_component
    if payload.curriculum_codes is not None:
        insert_data["curriculum_codes"] = payload.curriculum_codes

    response = supabase_execute(
        db.table("questions").insert(insert_data),
        entity="question",
    )
    return parse_single_or_404(response, entity="question")


def get_quiz_question(
    db: Client,
    question_id: str,
    org_id: str,
    user_id: str,
) -> dict:
    """Get one question if the user can view it."""
    response = supabase_execute(
        db.table("questions")
        .select(QUESTION_SELECT)
        .eq("id", question_id)
        .eq("organization_id", org_id)
        .or_(f"created_by.eq.{user_id},is_public.eq.true")
        .limit(1),
        entity="question",
    )
    return parse_single_or_404(response, entity="question")


def update_quiz_question(
    db: Client,
    question_id: str,
    org_id: str,
    user_id: str,
    role: str,
    payload: QuestionUpdateIn,
) -> dict:
    """Update a question. Teachers can edit own questions, admins can edit any."""
    query = (
        db.table("questions")
        .select(QUESTION_SELECT)
        .eq("id", question_id)
        .eq("organization_id", org_id)
    )
    if not _can_administer_question(role):
        query = query.eq("created_by", user_id)

    response = supabase_execute(query.limit(1), entity="question")
    existing = parse_single_or_404(response, entity="question")

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return existing

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    update_query = (
        db.table("questions")
        .update(update_data)
        .eq("id", question_id)
        .eq("organization_id", org_id)
    )
    if not _can_administer_question(role):
        update_query = update_query.eq("created_by", user_id)

    response = supabase_execute(update_query, entity="question")
    return parse_single_or_404(response, entity="question")


def delete_quiz_question(
    db: Client,
    question_id: str,
    org_id: str,
    user_id: str,
    role: str,
) -> dict:
    """Delete a question from the bank."""
    query = (
        db.table("questions")
        .select(QUESTION_SELECT)
        .eq("id", question_id)
        .eq("organization_id", org_id)
    )
    if not _can_administer_question(role):
        query = query.eq("created_by", user_id)

    response = supabase_execute(query.limit(1), entity="question")
    question = parse_single_or_404(response, entity="question")

    delete_query = (
        db.table("questions")
        .delete()
        .eq("id", question_id)
        .eq("organization_id", org_id)
    )
    if not _can_administer_question(role):
        delete_query = delete_query.eq("created_by", user_id)

    supabase_execute(delete_query, entity="question")
    return question


def _ensure_quiz_image_bucket(db: Client) -> None:
    try:
        db.storage.get_bucket(QUIZ_IMAGE_BUCKET)
        return
    except Exception:
        pass

    try:
        db.storage.create_bucket(
            QUIZ_IMAGE_BUCKET,
            options={
                "public": True,
                "file_size_limit": QUIZ_IMAGE_MAX_BYTES,
                "allowed_mime_types": sorted(ALLOWED_IMAGE_TYPES.keys()),
            },
        )
    except Exception as exc:
        message = str(exc).lower()
        if "exists" not in message and "already" not in message:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Could not initialize quiz image bucket: {str(exc)}",
            ) from exc


def upload_quiz_image(
    db: Client,
    org_id: str,
    user_id: str,
    *,
    filename: str,
    content_type: str,
    file_bytes: bytes,
) -> dict:
    """Upload a quiz image and return its public URL."""
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image file is empty.",
        )
    if len(file_bytes) > QUIZ_IMAGE_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image exceeds {QUIZ_IMAGE_MAX_BYTES // (1024 * 1024)}MB limit.",
        )
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported image format. Use JPEG, PNG, WEBP or GIF.",
        )

    _ensure_quiz_image_bucket(db)

    suffix = ALLOWED_IMAGE_TYPES[content_type]
    original_suffix = Path(filename or "").suffix.lower()
    if original_suffix in {".jpeg", ".jpg"}:
        suffix = ".jpg"
    elif original_suffix in {".png", ".webp", ".gif"}:
        suffix = original_suffix

    image_path = f"{org_id}/{user_id}/{uuid4().hex}{suffix}"

    try:
        db.storage.from_(QUIZ_IMAGE_BUCKET).upload(
            image_path,
            file_bytes,
            {
                "content-type": content_type,
                "upsert": "false",
                "cache-control": "3600",
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload image: {str(exc)}",
        ) from exc

    public_url = db.storage.from_(QUIZ_IMAGE_BUCKET).get_public_url(image_path)
    return {
        "bucket": QUIZ_IMAGE_BUCKET,
        "path": image_path,
        "public_url": public_url,
    }
