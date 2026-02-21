"""
Pydantic schemas for artifacts (Docs).
"""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ArtifactCreateIn(BaseModel):
    artifact_type: str = Field(
        ...,
        description="Type of artifact: quiz, note, exercise_sheet, uploaded_file",
    )
    artifact_name: str = Field(..., min_length=1)
    icon: Optional[str] = None
    subject_ids: Optional[list[str]] = None
    content: dict[str, Any] = Field(default_factory=dict)
    source_type: str = "native"
    conversion_requested: bool = False
    storage_path: Optional[str] = None
    subject_id: Optional[str] = None
    year_level: Optional[str] = None
    subject_component: Optional[str] = None
    curriculum_codes: Optional[list[str]] = None
    is_public: bool = False


class ArtifactUpdateIn(BaseModel):
    artifact_name: Optional[str] = Field(default=None, min_length=1)
    icon: Optional[str] = None
    subject_ids: Optional[list[str]] = None
    content: Optional[dict[str, Any]] = None
    tiptap_json: Optional[dict[str, Any]] = None
    markdown_content: Optional[str] = None
    subject_id: Optional[str] = None
    year_level: Optional[str] = None
    subject_component: Optional[str] = None
    curriculum_codes: Optional[list[str]] = None
    is_public: Optional[bool] = None


class ArtifactOut(BaseModel):
    id: str
    organization_id: str
    user_id: str
    artifact_type: str
    artifact_name: str
    icon: Optional[str] = None
    subject_ids: Optional[list[str]] = None
    content: dict[str, Any] = Field(default_factory=dict)
    source_type: str = "native"
    conversion_requested: bool = False
    storage_path: Optional[str] = None
    tiptap_json: Optional[dict[str, Any]] = None
    markdown_content: Optional[str] = None
    is_processed: bool = False
    processing_failed: bool = False
    processing_error: Optional[str] = None
    subject_id: Optional[str] = None
    year_level: Optional[str] = None
    subject_component: Optional[str] = None
    curriculum_codes: Optional[list[str]] = None
    is_public: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    # Hydrated
    subjects: Optional[list[dict]] = None
