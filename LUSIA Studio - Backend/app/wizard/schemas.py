"""
Pydantic models for the wizard agent endpoints.
"""

from __future__ import annotations

from pydantic import BaseModel


class WizardMessage(BaseModel):
    role: str  # "user" | "assistant" | "tool"
    content: str
    tool_call_id: str | None = None


class WizardStreamIn(BaseModel):
    """Request body for POST /api/v1/wizard/stream."""

    messages: list[WizardMessage]
    phase: str  # "content_finding" | "instructions_builder"
    document_type: str  # "quiz" | "worksheet" | "presentation" | "note" | "diagram"
    subject_id: str | None = None
    year_level: str | None = None
    subject_component: str | None = None
    # Phase 2 carry-over from Phase 1
    selected_codes: list[str] = []
    content_summary: str = ""
    # For upload/existing doc path
    upload_artifact_id: str | None = None


class InstructionsStreamIn(BaseModel):
    """Request body for POST /api/v1/wizard/instructions/stream."""

    conversation_history: list[WizardMessage]
    document_type: str  # "quiz" | "worksheet" | "presentation" | "note" | "diagram"
    subject_id: str | None = None
    year_level: str | None = None
    subject_component: str | None = None
    curriculum_codes: list[str] = []
    upload_artifact_id: str | None = None
    # Type-specific options
    num_questions: int | None = None
    difficulty: str | None = None
    template_id: str | None = None
    pres_size: str | None = None
    pres_template: str | None = None
