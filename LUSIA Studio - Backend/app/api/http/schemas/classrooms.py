from typing import Optional

from pydantic import BaseModel, Field


class ClassroomCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    grade_level: Optional[str] = None
    subject_id: Optional[str] = None
    school_year: Optional[str] = None


class ClassroomUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    grade_level: Optional[str] = None
    subject_id: Optional[str] = None
    school_year: Optional[str] = None
    status: Optional[str] = None


class ClassroomResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    description: Optional[str] = None
    grade_level: Optional[str] = None
    subject_id: Optional[str] = None
    teacher_id: Optional[str] = None
    school_year: Optional[str] = None
    status: str = "active"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
