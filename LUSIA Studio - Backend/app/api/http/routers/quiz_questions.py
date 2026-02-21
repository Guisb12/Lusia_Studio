"""
Quiz question bank endpoints.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from supabase import Client

from app.api.deps import require_teacher
from app.api.http.schemas.quiz_questions import (
    QuizImageUploadOut,
    QuizQuestionCreateIn,
    QuizQuestionOut,
    QuizQuestionUpdateIn,
)
from app.api.http.services.quiz_questions_service import (
    create_quiz_question,
    delete_quiz_question,
    get_quiz_question,
    list_quiz_questions,
    update_quiz_question,
    upload_quiz_image,
)
from app.core.database import get_b2b_db
from app.core.security import get_current_user

router = APIRouter()


@router.get("/", response_model=list[QuizQuestionOut])
async def list_quiz_questions_endpoint(
    ids: Optional[str] = Query(
        default=None,
        description="Comma-separated question ids",
    ),
    question_type: Optional[str] = Query(default=None, alias="type"),
    subject_id: Optional[str] = Query(default=None),
    year_level: Optional[str] = Query(default=None),
    subject_component: Optional[str] = Query(default=None),
    curriculum_code: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """List question bank entries with optional filters."""
    ids_list = None
    if ids:
        ids_list = [raw.strip() for raw in ids.split(",") if raw.strip()]

    return list_quiz_questions(
        db,
        current_user["organization_id"],
        current_user["id"],
        ids=ids_list,
        question_type=question_type,
        subject_id=subject_id,
        year_level=year_level,
        subject_component=subject_component,
        curriculum_code=curriculum_code,
    )


@router.post("/", response_model=QuizQuestionOut, status_code=201)
async def create_quiz_question_endpoint(
    payload: QuizQuestionCreateIn,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Create a new question."""
    return create_quiz_question(
        db,
        current_user["organization_id"],
        current_user["id"],
        payload,
    )


@router.post("/images/upload", response_model=QuizImageUploadOut)
async def upload_quiz_image_endpoint(
    request: Request,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Upload an image for quiz questions/options."""
    file_bytes = await request.body()
    filename = request.headers.get("x-file-name", "")
    content_type = request.headers.get("content-type", "application/octet-stream")
    return upload_quiz_image(
        db,
        current_user["organization_id"],
        current_user["id"],
        filename=filename,
        content_type=content_type,
        file_bytes=file_bytes,
    )


@router.get("/{question_id}", response_model=QuizQuestionOut)
async def get_quiz_question_endpoint(
    question_id: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """Get one question by id."""
    return get_quiz_question(
        db,
        question_id,
        current_user["organization_id"],
        current_user["id"],
    )


@router.patch("/{question_id}", response_model=QuizQuestionOut)
async def update_quiz_question_endpoint(
    question_id: str,
    payload: QuizQuestionUpdateIn,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Update a question."""
    return update_quiz_question(
        db,
        question_id,
        current_user["organization_id"],
        current_user["id"],
        current_user.get("role", ""),
        payload,
    )


@router.delete("/{question_id}", response_model=QuizQuestionOut)
async def delete_quiz_question_endpoint(
    question_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Delete a question."""
    return delete_quiz_question(
        db,
        question_id,
        current_user["organization_id"],
        current_user["id"],
        current_user.get("role", ""),
    )
