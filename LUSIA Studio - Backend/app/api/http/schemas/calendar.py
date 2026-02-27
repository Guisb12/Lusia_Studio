"""
Pydantic schemas for calendar sessions.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class SessionCreate(BaseModel):
    student_ids: list[str] = Field(..., min_length=1)
    class_id: Optional[str] = None
    starts_at: datetime
    ends_at: datetime
    title: Optional[str] = None
    subject_ids: Optional[list[str]] = None
    teacher_notes: Optional[str] = None

    @model_validator(mode="after")
    def validate_times(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class SessionUpdate(BaseModel):
    student_ids: Optional[list[str]] = None
    class_id: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    title: Optional[str] = None
    subject_ids: Optional[list[str]] = None
    teacher_notes: Optional[str] = None
    # Note: cross-field time validation (against existing DB values) is handled
    # in the service layer where the full existing session is available.


class SessionOut(BaseModel):
    id: str
    organization_id: str
    teacher_id: str
    student_ids: list[str]
    class_id: Optional[str] = None
    starts_at: str
    ends_at: str
    title: Optional[str] = None
    subject_ids: Optional[list[str]] = None
    teacher_notes: Optional[str] = None
    teacher_summary: Optional[str] = None
    teacher_artifact_ids: Optional[list[str]] = None
    summary_status: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    # Hydrated fields
    teacher_name: Optional[str] = None
    students: Optional[list[dict]] = None
    subjects: Optional[list[dict]] = None


class StudentSessionOut(BaseModel):
    id: str
    session_id: str
    student_id: str
    organization_id: str
    student_summary: Optional[str] = None
    student_artifact_ids: Optional[list[str]] = None
    summary_status: Optional[str] = None
    created_at: Optional[str] = None


class StudentSearchResult(BaseModel):
    id: str
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    grade_level: Optional[str] = None
    course: Optional[str] = None
    subject_ids: Optional[list[str]] = None
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None
