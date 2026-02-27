from typing import Optional

from pydantic import BaseModel


class MemberListItem(BaseModel):
    id: str
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    avatar_url: Optional[str] = None
    grade_level: Optional[str] = None
    course: Optional[str] = None
    school_name: Optional[str] = None
    phone: Optional[str] = None
    subjects_taught: Optional[list[str]] = None
    subject_ids: Optional[list[str]] = None
    class_ids: Optional[list[str]] = None
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None
    hourly_rate: Optional[float] = None
    onboarding_completed: bool = False
    created_at: Optional[str] = None


class MemberUpdateRequest(BaseModel):
    status: Optional[str] = None
    class_ids: Optional[list[str]] = None
    role: Optional[str] = None
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    grade_level: Optional[str] = None
    course: Optional[str] = None
    school_name: Optional[str] = None
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None
    subjects_taught: Optional[list[str]] = None
    subject_ids: Optional[list[str]] = None
    hourly_rate: Optional[float] = None
