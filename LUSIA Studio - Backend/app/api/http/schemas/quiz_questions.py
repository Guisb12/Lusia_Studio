"""
Pydantic schemas for the unified question bank and image uploads.
"""

from typing import Any, Optional

from pydantic import BaseModel, Field

QUESTION_TYPE_PATTERN = (
    "^(multiple_choice|true_false|fill_blank|matching|short_answer"
    "|multiple_response|ordering|open_extended|context_group)$"
)


class QuestionCreateIn(BaseModel):
    type: str = Field(..., pattern=QUESTION_TYPE_PATTERN)
    content: dict[str, Any] = Field(default_factory=dict)
    source_type: str = Field(default="teacher_uploaded")
    artifact_id: Optional[str] = None
    parent_id: Optional[str] = None
    order_in_parent: Optional[int] = None
    label: Optional[str] = None
    subject_id: Optional[str] = None
    year_level: Optional[str] = None
    subject_component: Optional[str] = None
    curriculum_codes: Optional[list[str]] = None
    is_public: bool = False


class QuestionUpdateIn(BaseModel):
    type: Optional[str] = Field(default=None, pattern=QUESTION_TYPE_PATTERN)
    content: Optional[dict[str, Any]] = None
    source_type: Optional[str] = None
    parent_id: Optional[str] = None
    order_in_parent: Optional[int] = None
    label: Optional[str] = None
    subject_id: Optional[str] = None
    year_level: Optional[str] = None
    subject_component: Optional[str] = None
    curriculum_codes: Optional[list[str]] = None
    is_public: Optional[bool] = None


class QuestionOut(BaseModel):
    id: str
    organization_id: str
    created_by: Optional[str] = None
    source_type: str
    artifact_id: Optional[str] = None
    type: str
    parent_id: Optional[str] = None
    order_in_parent: Optional[int] = None
    label: Optional[str] = None
    content: dict[str, Any] = Field(default_factory=dict)
    subject_id: Optional[str] = None
    year_level: Optional[str] = None
    subject_component: Optional[str] = None
    curriculum_codes: Optional[list[str]] = None
    is_public: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class QuizImageUploadOut(BaseModel):
    bucket: str
    path: str
    public_url: str


# ── Backwards-compatible aliases (used by existing router imports) ──

QuizQuestionCreateIn = QuestionCreateIn
QuizQuestionUpdateIn = QuestionUpdateIn
QuizQuestionOut = QuestionOut
