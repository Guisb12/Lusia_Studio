from typing import Literal, Optional

from pydantic import BaseModel, model_validator


class MeUser(BaseModel):
    id: str
    email: Optional[str] = None
    email_verified: bool = False
    email_verified_at: Optional[str] = None
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    phone: Optional[str] = None
    grade_level: Optional[str] = None
    course: Optional[str] = None
    subject_ids: Optional[list[str]] = None
    subjects_taught: Optional[list[str]] = None
    organization_id: Optional[str] = None
    organization_name: Optional[str] = None
    organization_logo_url: Optional[str] = None
    organization_status: Optional[str] = None
    profile_exists: bool = False
    onboarding_completed: bool = False


class MeResponse(BaseModel):
    authenticated: bool
    user: Optional[MeUser] = None


class OnboardingCompleteRequest(BaseModel):
    role: Literal["admin", "teacher", "student"]
    organization_id: Optional[str] = None


class OrganizationRegisterRequest(BaseModel):
    name: str
    slug: Optional[str] = None
    email: str
    phone: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    billing_email: Optional[str] = None
    logo_url: Optional[str] = None
    full_name: str
    display_name: Optional[str] = None


class OrganizationRegisterResponse(BaseModel):
    organization_id: str
    slug: str
    teacher_enrollment_code: str
    student_enrollment_code: str


class EnrollmentValidateRequest(BaseModel):
    code: str


class EnrollmentAttachRequest(BaseModel):
    code: str


class EnrollmentValidateResponse(BaseModel):
    valid: bool
    organization_id: Optional[str] = None
    organization_name: Optional[str] = None
    role_hint: Optional[Literal["teacher", "student"]] = None
    enrollment_token: Optional[str] = None
    enrollment_token_expires_in: Optional[int] = None


class MemberCompleteRequest(BaseModel):
    enrollment_token: Optional[str] = None
    enrollment_code: Optional[str] = None
    full_name: str
    display_name: Optional[str] = None

    # Teacher
    phone: Optional[str] = None
    subjects_taught: Optional[list[str]] = None

    # Student
    grade_level: Optional[str] = None
    course: Optional[str] = None
    subject_ids: Optional[list[str]] = None
    school_name: Optional[str] = None
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None

    @model_validator(mode="after")
    def ensure_enrollment_source(self):
        if not self.enrollment_token and not self.enrollment_code:
            raise ValueError("Either enrollment_token or enrollment_code must be provided")
        return self


class RoleOnboardingTeacherRequest(BaseModel):
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    phone: Optional[str] = None
    subjects_taught: Optional[list[str]] = None
    subject_ids: Optional[list[str]] = None
    avatar_url: Optional[str] = None


class RoleOnboardingStudentRequest(BaseModel):
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    grade_level: Optional[str] = None
    course: Optional[str] = None
    subject_ids: Optional[list[str]] = None
    subjects_taught: Optional[list[str]] = None
    school_name: Optional[str] = None
    parent_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None
    avatar_url: Optional[str] = None


class RoleOnboardingAdminRequest(BaseModel):
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None


class EnrollmentInfoRequest(BaseModel):
    enrollment_token: str


class EnrollmentInfoResponse(BaseModel):
    organization_id: str
    organization_name: str
    logo_url: Optional[str] = None
    role_hint: Literal["teacher", "student"]
