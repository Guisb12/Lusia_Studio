from typing import Optional

from pydantic import BaseModel, Field


class ClassroomCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    subject_ids: list[str] = []
    grade_levels: list[str] = []
    courses: list[str] = []
    is_primary: bool = False


class ClassroomUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    subject_ids: Optional[list[str]] = None
    grade_levels: Optional[list[str]] = None
    courses: Optional[list[str]] = None
    active: Optional[bool] = None


class ClassroomResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    description: Optional[str] = None
    subject_ids: list[str] = []
    grade_levels: list[str] = []
    courses: list[str] = []
    teacher_id: str
    active: bool = True
    is_primary: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ClassroomMembersUpdate(BaseModel):
    student_ids: list[str] = Field(..., min_length=1)


class ClassroomMemberResponse(BaseModel):
    id: str
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    grade_level: Optional[str] = None
    course: Optional[str] = None
    subject_ids: Optional[list[str]] = None


class StudentRecommendation(BaseModel):
    student_id: str
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    grade_level: Optional[str] = None
    course: Optional[str] = None
    subject_ids: list[str] = []
    matching_subject_ids: list[str] = []
    score: int = 0
