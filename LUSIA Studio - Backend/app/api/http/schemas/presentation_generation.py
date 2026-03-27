"""
Pydantic schemas for the presentation generation pipeline.

Covers: POST /presentations/start, GET /presentations/{id}/stream, GET /presentations/{id}.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


# ── POST /presentations/start ────────────────────────────────


class PresentationStartIn(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    size: str = Field(default="short", pattern="^(short|long)$")
    template: str = Field(
        default="explicative",
        pattern="^(explicative|interactive_explanation|step_by_step_exercise)$",
    )
    subject_id: Optional[str] = None
    year_level: Optional[str] = None
    subject_component: Optional[str] = None
    curriculum_codes: list[str] = Field(default_factory=list)
    upload_artifact_id: Optional[str] = None


class PresentationStartOut(BaseModel):
    artifact_id: str
    artifact_name: str
    artifact_type: str = "presentation"
    icon: Optional[str] = None
    source_type: str = "native"
    subject_id: Optional[str] = None
    subject_ids: Optional[list[str]] = None
    year_level: Optional[str] = None
    curriculum_codes: Optional[list[str]] = None
    is_processed: bool = False
    is_public: bool = False
    created_at: Optional[str] = None
