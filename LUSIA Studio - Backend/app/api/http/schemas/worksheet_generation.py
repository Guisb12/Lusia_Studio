"""
Pydantic schemas for the worksheet generation pipeline.

Covers: start, blueprint management (get/chat/patch), resolution, and streaming.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


# ── POST /worksheet-generation/start ─────────────────────────


class WorksheetStartIn(BaseModel):
    subject_id: Optional[str] = None
    year_level: Optional[str] = None
    subject_component: Optional[str] = None
    curriculum_codes: list[str] = Field(default_factory=list)
    upload_artifact_id: Optional[str] = None
    prompt: str = Field(..., min_length=1, max_length=2000)
    template_id: str = Field(default="practice", min_length=1)
    difficulty: str = Field(
        default="Médio", pattern="^(Fácil|Médio|Difícil)$"
    )
    year_range: Optional[list[int]] = None


class WorksheetStartOut(BaseModel):
    artifact_id: str
    artifact_name: str
    artifact_type: str = "exercise_sheet"
    icon: Optional[str] = None
    source_type: str = "native"
    subject_id: Optional[str] = None
    subject_ids: Optional[list[str]] = None
    year_level: Optional[str] = None
    curriculum_codes: Optional[list[str]] = None
    is_processed: bool = False
    is_public: bool = False
    created_at: Optional[str] = None


# ── Blueprint block structure ────────────────────────────────


class BlueprintBlock(BaseModel):
    """A single question slot in the worksheet blueprint."""

    id: str
    order: int
    source: str = Field(pattern="^(bank|ai_generated)$")
    question_id: Optional[str] = None
    curriculum_code: str = ""
    curriculum_path: Optional[str] = None
    type: str
    goal: str = ""
    difficulty: Optional[str] = None
    group_label: Optional[str] = None
    reference_question_ids: list[str] = Field(default_factory=list)
    comments: list[str] = Field(default_factory=list)
    children: Optional[list[BlueprintBlock]] = None


class Blueprint(BaseModel):
    """The full worksheet blueprint — an ordered set of question blocks."""

    blocks: list[BlueprintBlock] = Field(default_factory=list)
    version: int = 1


# ── GET /worksheet-generation/{artifactId}/blueprint ─────────


class ContextSummary(BaseModel):
    """Summary of what context is available for this worksheet session."""

    subject_name: Optional[str] = None
    subject_status: Optional[str] = None
    has_national_exam: bool
    bank_question_count: int
    document_attached: bool
    curriculum_code_count: int


class BlueprintStateOut(BaseModel):
    blueprint: Blueprint
    conversation: list[dict[str, Any]]
    generation_params: dict[str, Any]
    context_summary: ContextSummary


# ── POST /worksheet-generation/{artifactId}/blueprint/chat ───


class BlueprintChatIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    block_id: Optional[str] = None
    blueprint: Blueprint


class BlueprintChatOut(BaseModel):
    message: str
    blueprint: Blueprint
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)


# ── PATCH /worksheet-generation/{artifactId}/blueprint ───────


class BlueprintUpdateIn(BaseModel):
    blueprint: Blueprint


# ── Internal: instructor response model for streaming ────────


class GeneratedQuestionChild(BaseModel):
    """A child question inside a context_group."""

    block_id: str
    type: str
    label: str
    order_in_parent: int
    content: dict[str, Any]


class GeneratedQuestion(BaseModel):
    """Single question emitted by the LLM during resolution streaming."""

    block_id: str
    type: str
    label: str
    order_in_parent: Optional[int] = None
    content: dict[str, Any]
    children: Optional[list[GeneratedQuestionChild]] = None


# ── GET /worksheet-generation/templates ──────────────────────


class TemplateInfo(BaseModel):
    """Lightweight template summary for the template picker UI."""

    id: str
    name: str
    tier: str
    description: str
    estimated_minutes: str
    group_count: int
    total_slots: int


class TemplateListOut(BaseModel):
    templates: list[TemplateInfo]
