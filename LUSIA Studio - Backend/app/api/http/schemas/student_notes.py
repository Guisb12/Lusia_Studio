from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class StudentNoteCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)
    color: Optional[str] = None
    shared_with_ids: Optional[list[str]] = None


class StudentNoteUpdate(BaseModel):
    content: Optional[str] = Field(None, min_length=1, max_length=2000)
    color: Optional[str] = None
    shared_with_ids: Optional[list[str]] = None


class SharedTeacher(BaseModel):
    id: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class StudentNoteOut(BaseModel):
    id: str
    student_id: str
    teacher_id: str
    content: str
    color: str
    shared_with_ids: list[str] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    teacher_name: Optional[str] = None
    teacher_avatar_url: Optional[str] = None
    shared_with: list[SharedTeacher] = []
