"""
Pydantic schemas for assignments (TPC) and student_assignments.
"""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


class AssignmentCreateIn(BaseModel):
    title: Optional[str] = None
    instructions: Optional[str] = None
    artifact_ids: Optional[list[str]] = None
    class_id: Optional[str] = None
    student_ids: Optional[list[str]] = None
    due_date: Optional[datetime] = None
    status: str = Field(default="draft", pattern="^(draft|published)$")

    @field_validator("artifact_ids")
    @classmethod
    def validate_artifact_ids(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is not None and len(v) > 3:
            raise ValueError("Maximum 3 attachments per assignment")
        return v


class AssignmentStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(draft|published|closed)$")


class AssignmentAddStudentsIn(BaseModel):
    student_ids: list[str]


class AssignmentRemoveStudentsIn(BaseModel):
    student_ids: list[str]


class AssignmentSummaryOut(BaseModel):
    """Lightweight assignment payload for list/card views."""
    id: str
    organization_id: str
    teacher_id: str
    class_id: Optional[str] = None
    student_ids: Optional[list[str]] = None
    artifact_ids: Optional[list[str]] = None
    title: Optional[str] = None
    instructions: Optional[str] = None
    due_date: Optional[str] = None
    status: str
    grades_released_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    # Hydrated summary fields
    teacher_name: Optional[str] = None
    teacher_avatar: Optional[str] = None
    artifacts: Optional[list[dict]] = None
    student_count: Optional[int] = None
    submitted_count: Optional[int] = None
    student_preview: Optional[list[dict]] = None


class AssignmentOut(AssignmentSummaryOut):
    """Full assignment payload for detail/editor views."""
    # Additional hydrated detail fields
    students: Optional[list[dict]] = None


class AssignmentSummaryArchivePageOut(BaseModel):
    items: list[AssignmentSummaryOut]
    next_offset: Optional[int] = None
    has_more: bool = False


class AssignmentArchivePageOut(BaseModel):
    items: list[AssignmentOut]
    next_offset: Optional[int] = None
    has_more: bool = False


class StudentAssignmentOut(BaseModel):
    id: str
    assignment_id: str
    student_id: str
    organization_id: str
    progress: dict[str, Any] = Field(default_factory=dict)
    submission: Optional[dict[str, Any]] = None
    grade: Optional[float] = None
    feedback: Optional[str] = None
    status: str
    auto_graded: bool = False
    started_at: Optional[str] = None
    submitted_at: Optional[str] = None
    graded_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    # Hydrated
    student_name: Optional[str] = None
    student_avatar: Optional[str] = None


class StudentAssignmentUpdateIn(BaseModel):
    artifact_id: Optional[str] = None
    progress: Optional[dict[str, Any]] = None
    submission: Optional[dict[str, Any]] = None
    status: Optional[str] = Field(default=None, pattern="^(in_progress|submitted)$")


class TeacherGradeIn(BaseModel):
    artifact_id: Optional[str] = None
    grade: Optional[float] = None
    feedback: Optional[str] = None
    question_overrides: Optional[dict[str, bool]] = None
