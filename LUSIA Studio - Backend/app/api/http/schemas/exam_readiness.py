"""
Schemas for national exam readiness aggregates and evidence drill-down.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class ExamReadinessSubjectOut(BaseModel):
    """Subject row for exam readiness (catalog validation + UI)."""

    id: str
    name: str
    slug: Optional[str] = None
    education_level: Optional[str] = None
    grade_levels: Optional[list[str]] = None
    has_national_exam: bool = False


class TopicSummaryL1Row(BaseModel):
    model_config = {"extra": "allow"}

    subject_slug: str
    curriculum_code_l1: str
    topic_label: Optional[str] = None
    exam_count: Optional[int] = None
    question_count: Optional[int] = None
    total_points: Optional[float] = None
    avg_points_per_question: Optional[float] = None
    avg_points_per_exam: Optional[float] = None
    first_year: Optional[int] = None
    last_year: Optional[int] = None
    years_present: Optional[Any] = None
    phase_counts: Optional[dict[str, Any]] = None
    question_type_counts: Optional[dict[str, Any]] = None
    structure_counts: Optional[dict[str, Any]] = None


class TopicYearMatrixRow(BaseModel):
    model_config = {"extra": "allow"}

    subject_slug: str
    curriculum_code_l1: str
    topic_label: Optional[str] = None
    exam_year: Optional[int] = None
    exam_count: Optional[int] = None
    question_count: Optional[int] = None
    total_points: Optional[float] = None
    phase_counts: Optional[dict[str, Any]] = None


class ExamBlueprintRow(BaseModel):
    model_config = {"extra": "allow"}

    subject_slug: str
    exam_id: Optional[str] = None
    exam_year: Optional[int] = None
    exam_phase: Optional[str] = None
    question_count: Optional[int] = None
    total_points: Optional[float] = None
    question_type_counts: Optional[dict[str, Any]] = None
    scored_type_counts: Optional[dict[str, Any]] = None
    structure_counts: Optional[dict[str, Any]] = None
    distinct_l1_topics: Optional[int] = None
    top_l1_topics: Optional[Any] = None
    top_l1_topic_labels: Optional[Any] = None
    # DB may store a string hash or a structured list (e.g. per-item labels/points).
    question_order_signature: Optional[Any] = None


class ExamReadinessSubjectPayload(BaseModel):
    subject: ExamReadinessSubjectOut
    topic_summary: list[TopicSummaryL1Row] = Field(default_factory=list)
    topic_year_matrix: list[TopicYearMatrixRow] = Field(default_factory=list)
    blueprints: list[ExamBlueprintRow] = Field(default_factory=list)


class TopicSummaryL2Row(BaseModel):
    """L2 subtopics under one L1 — drill-down layer (not the main ranking)."""

    model_config = {"extra": "allow"}

    subject_slug: str
    curriculum_code_l1: str
    curriculum_code_l2: str
    topic_l1_label: Optional[str] = None
    topic_l2_label: Optional[str] = None
    share_within_l1: Optional[float] = None
    exam_count: Optional[int] = None
    question_count: Optional[int] = None
    total_points: Optional[float] = None
    avg_points_per_question: Optional[float] = None
    avg_points_per_exam: Optional[float] = None
    first_year: Optional[int] = None
    last_year: Optional[int] = None
    years_present: Optional[Any] = None
    phase_counts: Optional[dict[str, Any]] = None
    question_type_counts: Optional[dict[str, Any]] = None
    structure_counts: Optional[dict[str, Any]] = None


class TopicYearMatrixL2Row(BaseModel):
    model_config = {"extra": "allow"}

    subject_slug: str
    curriculum_code_l1: str
    curriculum_code_l2: str
    topic_l1_label: Optional[str] = None
    topic_l2_label: Optional[str] = None
    exam_year: Optional[int] = None
    exam_count: Optional[int] = None
    question_count: Optional[int] = None
    total_points: Optional[float] = None
    avg_points_per_exam: Optional[float] = None
    phase_counts: Optional[dict[str, Any]] = None


class ExamReadinessL1DrilldownPayload(BaseModel):
    """L2 aggregates for one selected L1 topic."""

    curriculum_code_l1: str
    topic_summary_l2: list[TopicSummaryL2Row] = Field(default_factory=list)
    topic_year_matrix_l2: list[TopicYearMatrixL2Row] = Field(default_factory=list)


class ExamEvidenceItemOut(BaseModel):
    id: str
    type: str
    label: Optional[str] = None
    exam_year: Optional[int] = None
    exam_phase: Optional[str] = None
    curriculum_codes: Optional[list[str]] = None
    question_preview: Optional[str] = None
    criteria_preview: Optional[str] = None
    points: Optional[float] = None


class ExamEvidenceResponse(BaseModel):
    items: list[ExamEvidenceItemOut] = Field(default_factory=list)
