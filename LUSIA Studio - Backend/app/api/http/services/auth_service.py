import re
import secrets

from app.api.http.schemas.auth import (
    MeUser,
    OnboardingCompleteRequest,
    OrganizationRegisterRequest,
)


def _coerce_optional_str(value):
    if value is None:
        return None
    return str(value)


def build_me_user(current_user: dict) -> MeUser:
    return MeUser(
        id=str(current_user.get("id", "")),
        email=current_user.get("email"),
        email_verified=bool(current_user.get("email_verified", False)),
        email_verified_at=_coerce_optional_str(current_user.get("email_verified_at")),
        full_name=current_user.get("full_name"),
        display_name=current_user.get("display_name"),
        avatar_url=current_user.get("avatar_url"),
        role=current_user.get("role"),
        status=current_user.get("status"),
        phone=current_user.get("phone"),
        grade_level=_coerce_optional_str(current_user.get("grade_level")),
        course=current_user.get("course"),
        subject_ids=current_user.get("subject_ids"),
        subjects_taught=current_user.get("subjects_taught"),
        organization_id=_coerce_optional_str(current_user.get("organization_id")),
        organization_name=current_user.get("organization_name"),
        organization_status=current_user.get("organization_status"),
        profile_exists=bool(current_user.get("profile_exists", True)),
        onboarding_completed=bool(current_user.get("onboarding_completed", False)),
    )


def build_onboarding_update_payload(payload: OnboardingCompleteRequest) -> dict:
    return {
        "role": payload.role,
        "organization_id": payload.organization_id,
        "onboarding_completed": True,
    }


def normalize_slug(raw: str) -> str:
    base = re.sub(r"[^a-z0-9-]+", "-", raw.lower().strip())
    base = re.sub(r"-{2,}", "-", base).strip("-")
    return base or "center"


def normalize_enrollment_code(raw: str) -> str:
    cleaned = re.sub(r"\s+", "", (raw or "").strip().lower())
    cleaned = cleaned.replace("_", "-")
    cleaned = re.sub(r"[^a-z0-9-]+", "-", cleaned)
    cleaned = re.sub(r"-{2,}", "-", cleaned).strip("-")
    return cleaned


def generate_enrollment_code(slug: str, role_hint: str) -> str:
    suffix = secrets.token_hex(3)
    role_part = "prof" if role_hint == "teacher" else "aluno"
    return normalize_enrollment_code(f"{slug}-{role_part}-{suffix}")


def build_org_insert_payload(payload: OrganizationRegisterRequest, slug: str) -> dict:
    return {
        "name": payload.name,
        "slug": slug,
        "email": payload.email,
        "phone": payload.phone,
        "address": payload.address,
        "district": payload.district,
        "city": payload.city,
        "postal_code": payload.postal_code,
        "billing_email": payload.billing_email,
        "teacher_enrollment_code": generate_enrollment_code(slug, "teacher"),
        "student_enrollment_code": generate_enrollment_code(slug, "student"),
    }
