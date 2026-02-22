"""
Pydantic schemas for the quiz generation pipeline.

Covers the 3 endpoints: start, stream (SSE), and match-curriculum.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


# ── POST /quiz-generation/start ──────────────────────────────


class QuizGenerationStartIn(BaseModel):
    subject_id: str
    year_level: str
    subject_component: Optional[str] = None
    curriculum_codes: list[str] = Field(default_factory=list)
    source_type: str = Field(
        default="dge", pattern="^(dge|upload)$"
    )
    upload_artifact_id: Optional[str] = None
    num_questions: int = Field(default=10, ge=1, le=30)
    difficulty: str = Field(
        default="Médio", pattern="^(Fácil|Médio|Difícil)$"
    )
    extra_instructions: Optional[str] = None
    theme_query: Optional[str] = None


class QuizGenerationStartOut(BaseModel):
    artifact_id: str
    artifact_name: str


# ── POST /quiz-generation/match-curriculum ────────────────────


class CurriculumMatchIn(BaseModel):
    query: str = Field(..., min_length=1)
    subject_id: str
    year_level: str
    subject_component: Optional[str] = None


class CurriculumMatchNodeOut(BaseModel):
    id: str
    code: str
    title: str
    full_path: Optional[str] = None
    level: Optional[int] = None


class CurriculumMatchOut(BaseModel):
    matched_nodes: list[CurriculumMatchNodeOut]


# ── POST /quiz-generation/resolve-codes ─────────────────────


class CurriculumResolveIn(BaseModel):
    subject_id: str
    year_level: str
    codes: list[str] = Field(..., min_length=1)


# ── Internal: instructor response model for streaming ─────────


class GeneratedQuestionChild(BaseModel):
    """A child question inside a context_group."""
    type: str
    label: str
    content: dict[str, Any]


class GeneratedQuestion(BaseModel):
    """Single question emitted by the LLM during streaming generation."""
    type: str
    label: str
    content: dict[str, Any]
    children: Optional[list[GeneratedQuestionChild]] = None
    quiz_name: Optional[str] = None
