"""
Pydantic schemas for the note generation pipeline.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class NoteStartIn(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)
    subject_id: Optional[str] = None
    year_level: Optional[str] = None
    subject_component: Optional[str] = None
    curriculum_codes: list[str] = Field(default_factory=list)
    upload_artifact_id: Optional[str] = None


class NoteStartOut(BaseModel):
    artifact_id: str
    artifact_name: str
    artifact_type: str = "note"
    icon: Optional[str] = None
    source_type: str = "native"
    subject_id: Optional[str] = None
    subject_ids: Optional[list[str]] = None
    year_level: Optional[str] = None
    curriculum_codes: Optional[list[str]] = None
    is_processed: bool = False
    is_public: bool = False
    created_at: Optional[str] = None
