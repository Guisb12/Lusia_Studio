"""
Pydantic schemas for assignments (TPC) and student_assignments.
"""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class AssignmentCreateIn(BaseModel):
    title: Optional[str] = None
    instructions: Optional[str] = None
    artifact_id: Optional[str] = None
    class_id: Optional[str] = None
    student_ids: Optional[list[str]] = None
    due_date: Optional[datetime] = None
    status: str = Field(default="draft", pattern="^(draft|published)$")


class AssignmentStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(draft|published|closed)$")


class AssignmentOut(BaseModel):
    id: str
    organization_id: str
    teacher_id: str
    class_id: Optional[str] = None
    student_ids: Optional[list[str]] = None
    artifact_id: Optional[str] = None
    title: Optional[str] = None
    instructions: Optional[str] = None
    due_date: Optional[str] = None
    status: str
    grades_released_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    # Hydrated fields
    teacher_name: Optional[str] = None
    artifact: Optional[dict] = None
    students: Optional[list[dict]] = None
    student_count: Optional[int] = None
    submitted_count: Optional[int] = None


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
    progress: Optional[dict[str, Any]] = None
    submission: Optional[dict[str, Any]] = None
    status: Optional[str] = Field(default=None, pattern="^(in_progress|submitted)$")
