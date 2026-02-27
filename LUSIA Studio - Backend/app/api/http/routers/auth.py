from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import HTMLResponse, JSONResponse
from supabase import Client

from app.api.http.schemas.auth import (
    EnrollmentAttachRequest,
    EnrollmentInfoRequest,
    EnrollmentInfoResponse,
    EnrollmentValidateRequest,
    EnrollmentValidateResponse,
    MemberCompleteRequest,
    MeResponse,
    OnboardingCompleteRequest,
    OrganizationRegisterRequest,
    OrganizationRegisterResponse,
    RoleOnboardingAdminRequest,
    RoleOnboardingStudentRequest,
    RoleOnboardingTeacherRequest,
)
from app.api.http.services.enrollment_service import (
    issue_enrollment_token,
    verify_enrollment_token,
)
from app.api.http.services.auth_service import (
    build_org_insert_payload,
    build_me_user,
    build_onboarding_update_payload,
    normalize_enrollment_code,
    normalize_slug,
)
from app.core.config import settings
from app.core.database import get_b2b_db
from app.core.security import get_authenticated_supabase_user, get_current_user

router = APIRouter()

ACTIVE_ENROLLMENT_ORG_STATUSES = {"trial", "active"}


def _is_missing_column_error(exc: Exception, column: str) -> bool:
    return column in str(exc).lower()


def _read_user_attr(user_obj, key: str):
    if isinstance(user_obj, dict):
        return user_obj.get(key)
    return getattr(user_obj, key, None)


def _raise_api_error(status_code: int, code: str, message: str):
    raise HTTPException(status_code=status_code, detail={"code": code, "message": message})


def _require_verified_email(auth_user: dict):
    if auth_user.get("email_verified"):
        return
    _raise_api_error(
        status.HTTP_403_FORBIDDEN,
        "EMAIL_NOT_VERIFIED",
        "Email is not verified. Verify your email before continuing.",
    )


def _profile_upsert_resilient(db: Client, payload: dict):
    try:
        return db.table("profiles").upsert(payload).execute()
    except Exception as exc:
        if not _is_missing_column_error(exc, "onboarding_completed"):
            raise
    fallback_payload = {k: v for k, v in payload.items() if k != "onboarding_completed"}
    return db.table("profiles").upsert(fallback_payload).execute()


def _profile_update_resilient(db: Client, user_id: str, payload: dict):
    try:
        return db.table("profiles").update(payload).eq("id", user_id).execute()
    except Exception as exc:
        if not _is_missing_column_error(exc, "onboarding_completed"):
            raise
    fallback_payload = {k: v for k, v in payload.items() if k != "onboarding_completed"}
    return db.table("profiles").update(fallback_payload).eq("id", user_id).execute()


def _find_org_from_enrollment_code(db: Client, raw_code: str):
    code = normalize_enrollment_code(raw_code)
    if not code:
        return None, None

    checks: list[tuple[str, Literal["teacher", "student"]]] = [
        ("teacher_enrollment_code", "teacher"),
        ("student_enrollment_code", "student"),
    ]
    for column, role_hint in checks:
        result = (
            db.table("organizations")
            .select("id,name,logo_url,status")
            .ilike(column, code)
            .limit(1)
            .execute()
        )
        if not result.data:
            continue

        org = result.data[0]
        if org.get("status") not in ACTIVE_ENROLLMENT_ORG_STATUSES:
            return None, None
        return org, role_hint

    return None, None


def _resolve_member_enrollment(db: Client, payload: MemberCompleteRequest):
    if payload.enrollment_token:
        try:
            token_payload = verify_enrollment_token(payload.enrollment_token)
            return token_payload["organization_id"], token_payload["role_hint"]
        except ValueError as exc:
            if not payload.enrollment_code:
                message = str(exc)
                if "expired" in message.lower():
                    _raise_api_error(
                        status.HTTP_400_BAD_REQUEST,
                        "ENROLLMENT_TOKEN_EXPIRED",
                        message,
                    )
                _raise_api_error(
                    status.HTTP_400_BAD_REQUEST,
                    "ENROLLMENT_TOKEN_INVALID",
                    message,
                )

    org, role_hint = _find_org_from_enrollment_code(db, payload.enrollment_code or "")
    if not org or not role_hint:
        _raise_api_error(
            status.HTTP_400_BAD_REQUEST,
            "ENROLLMENT_CODE_INVALID",
            "Enrollment code is invalid or unavailable.",
        )
    return str(org["id"]), role_hint


def _error_me_response(status_code: int, code: str, detail: str | None = None):
    body = {"authenticated": False, "user": None, "error_code": code}
    if detail:
        body["detail"] = detail
    return JSONResponse(status_code=status_code, content=body)


def _default_full_name(auth_user: dict) -> str:
    email = (auth_user.get("email") or "").strip()
    if not email:
        return "New Member"
    local_part = email.split("@", 1)[0]
    normalized = " ".join(part for part in local_part.replace(".", " ").replace("_", " ").split() if part)
    return normalized[:120] or "New Member"


def _build_me_from_profile(profile: dict, auth_user: dict, organization: dict | None):
    merged = {
        **profile,
        "id": str(profile.get("id") or auth_user["id"]),
        "email": profile.get("email") or auth_user.get("email"),
        "email_verified": bool(auth_user.get("email_verified", False)),
        "email_verified_at": auth_user.get("email_verified_at"),
        "profile_exists": True,
        "organization_name": (organization or {}).get("name"),
        "organization_logo_url": (organization or {}).get("logo_url"),
        "organization_status": (organization or {}).get("status"),
        "onboarding_completed": bool(profile.get("onboarding_completed", False)),
    }
    return MeResponse(authenticated=True, user=build_me_user(merged))


@router.get("/email/verified", response_class=HTMLResponse, include_in_schema=False)
async def email_verified_autoclose_page():
    return """
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Email verified</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 24px; background: #f4f7fb; color: #0f172a; }
          .card { max-width: 560px; margin: 8vh auto; background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08); }
          h1 { margin: 0 0 12px; font-size: 22px; }
          p { margin: 0; line-height: 1.5; }
        </style>
      </head>
      <body>
        <main class="card">
          <h1>Email verified</h1>
          <p>You can return to the app and continue onboarding. This window should close automatically.</p>
        </main>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: "lusia-email-verified" }, "*");
          }
          setTimeout(() => window.close(), 1500);
        </script>
      </body>
    </html>
    """


@router.get("/me", response_model=MeResponse)
async def me(
    authorization: str | None = Header(default=None),
    db: Client = Depends(get_b2b_db),
):
    if not authorization:
        return _error_me_response(status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED")

    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        return _error_me_response(
            status.HTTP_401_UNAUTHORIZED,
            "UNAUTHORIZED",
            "Invalid authorization header",
        )

    token = parts[1].strip()

    try:
        user_response = db.auth.get_user(token)
        supabase_user = getattr(user_response, "user", None)
    except Exception as exc:
        return _error_me_response(
            status.HTTP_401_UNAUTHORIZED,
            "UNAUTHORIZED",
            f"Could not validate credentials: {str(exc)}",
        )

    if not supabase_user:
        return _error_me_response(
            status.HTTP_401_UNAUTHORIZED,
            "UNAUTHORIZED",
            "Invalid authentication credentials",
        )

    email_verified_at = _read_user_attr(supabase_user, "email_confirmed_at") or _read_user_attr(
        supabase_user, "confirmed_at"
    )
    auth_user = {
        "id": str(_read_user_attr(supabase_user, "id")),
        "email": _read_user_attr(supabase_user, "email"),
        "email_verified": bool(email_verified_at),
        "email_verified_at": email_verified_at,
    }

    try:
        profile_resp = (
            db.table("profiles").select("*").eq("id", auth_user["id"]).limit(1).execute()
        )
        profile = profile_resp.data[0] if profile_resp.data else None

        if not profile:
            return MeResponse(
                authenticated=True,
                user=build_me_user(
                    {
                        "id": auth_user["id"],
                        "email": auth_user.get("email"),
                        "email_verified": auth_user.get("email_verified"),
                        "email_verified_at": auth_user.get("email_verified_at"),
                        "profile_exists": False,
                        "onboarding_completed": False,
                    }
                ),
            )

        org = None
        org_id = profile.get("organization_id")
        if org_id:
            org_resp = (
                db.table("organizations")
                .select("id,name,logo_url,status")
                .eq("id", org_id)
                .limit(1)
                .execute()
            )
            org = org_resp.data[0] if org_resp.data else None

        merged = {
            **profile,
            "id": str(profile.get("id") or auth_user["id"]),
            "email": profile.get("email") or auth_user.get("email"),
            "email_verified": bool(auth_user.get("email_verified", False)),
            "email_verified_at": auth_user.get("email_verified_at"),
            "profile_exists": True,
            "organization_name": (org or {}).get("name"),
            "organization_logo_url": (org or {}).get("logo_url"),
            "organization_status": (org or {}).get("status"),
            "onboarding_completed": bool(profile.get("onboarding_completed", False)),
        }

    except Exception:
        return _error_me_response(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "AUTH_ME_INTERNAL_ERROR",
            "Failed to load authenticated user state",
        )

    try:
        db.table("profiles").update(
            {"last_login_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", auth_user["id"]).execute()
    except Exception:
        pass

    return MeResponse(authenticated=True, user=build_me_user(merged))


@router.patch("/onboarding", response_model=MeResponse)
async def complete_onboarding(
    payload: OnboardingCompleteRequest,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    _require_verified_email(current_user)
    update_payload = build_onboarding_update_payload(payload)
    updated = _profile_update_resilient(db, current_user["id"], update_payload)
    updated_profile = updated.data[0] if updated.data else {**current_user, **update_payload}
    return MeResponse(authenticated=True, user=build_me_user(updated_profile))


@router.post("/org/register", response_model=OrganizationRegisterResponse)
async def register_organization(
    payload: OrganizationRegisterRequest,
    auth_user: dict = Depends(get_authenticated_supabase_user),
    db: Client = Depends(get_b2b_db),
):
    _require_verified_email(auth_user)
    existing_profile = (
        db.table("profiles").select("organization_id").eq("id", auth_user["id"]).limit(1).execute()
    )
    if existing_profile.data and existing_profile.data[0].get("organization_id"):
        existing_org_id = existing_profile.data[0]["organization_id"]
        existing_org = (
            db.table("organizations")
            .select("id,slug,teacher_enrollment_code,student_enrollment_code")
            .eq("id", existing_org_id)
            .limit(1)
            .execute()
        )
        if existing_org.data:
            org = existing_org.data[0]
            return OrganizationRegisterResponse(
                organization_id=str(org["id"]),
                slug=org["slug"],
                teacher_enrollment_code=org["teacher_enrollment_code"],
                student_enrollment_code=org["student_enrollment_code"],
            )

    requested_slug = payload.slug or payload.name
    slug_base = normalize_slug(requested_slug)
    slug = slug_base
    counter = 1
    while True:
        existing = (
            db.table("organizations").select("id").eq("slug", slug).limit(1).execute()
        )
        if not existing.data:
            break
        counter += 1
        slug = f"{slug_base}-{counter}"

    org_payload = build_org_insert_payload(payload, slug)
    org_insert = db.table("organizations").insert(org_payload).execute()
    if not org_insert.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create organization",
        )
    org = org_insert.data[0]

    profile_payload = {
        "id": auth_user["id"],
        "organization_id": org["id"],
        "role": "admin",
        "status": "active",
        "full_name": payload.full_name,
        "display_name": payload.display_name,
        "email": auth_user.get("email"),
        "onboarding_completed": False,
    }
    _profile_upsert_resilient(db, profile_payload)

    return OrganizationRegisterResponse(
        organization_id=str(org["id"]),
        slug=org["slug"],
        teacher_enrollment_code=org["teacher_enrollment_code"],
        student_enrollment_code=org["student_enrollment_code"],
    )


@router.post("/enrollment/validate", response_model=EnrollmentValidateResponse)
async def validate_enrollment_code(
    payload: EnrollmentValidateRequest,
    db: Client = Depends(get_b2b_db),
):
    org, role_hint = _find_org_from_enrollment_code(db, payload.code)
    if not org or not role_hint:
        return EnrollmentValidateResponse(valid=False)

    token = issue_enrollment_token(str(org["id"]), role_hint)
    return EnrollmentValidateResponse(
        valid=True,
        organization_id=str(org["id"]),
        organization_name=org.get("name"),
        role_hint=role_hint,
        enrollment_token=token,
        enrollment_token_expires_in=settings.ENROLLMENT_TOKEN_TTL_SECONDS,
    )


@router.post("/enrollment/attach", response_model=MeResponse)
async def attach_enrollment_code(
    payload: EnrollmentAttachRequest,
    auth_user: dict = Depends(get_authenticated_supabase_user),
    db: Client = Depends(get_b2b_db),
):
    _require_verified_email(auth_user)
    org, role_hint = _find_org_from_enrollment_code(db, payload.code)
    if not org or not role_hint:
        _raise_api_error(
            status.HTTP_400_BAD_REQUEST,
            "ENROLLMENT_CODE_INVALID",
            "Enrollment code is invalid or unavailable.",
        )

    org_id = str(org["id"])
    existing_profile_resp = (
        db.table("profiles")
        .select("*")
        .eq("id", auth_user["id"])
        .limit(1)
        .execute()
    )
    existing_profile = existing_profile_resp.data[0] if existing_profile_resp.data else None

    if existing_profile:
        existing_org = existing_profile.get("organization_id")
        existing_role = existing_profile.get("role")
        if existing_org and str(existing_org) != org_id:
            _raise_api_error(
                status.HTTP_409_CONFLICT,
                "ACCOUNT_ALREADY_LINKED",
                "This account is already attached to a different organization.",
            )
        if existing_role and existing_role != role_hint:
            _raise_api_error(
                status.HTTP_409_CONFLICT,
                "ACCOUNT_ROLE_MISMATCH",
                "This account is already linked with a different role.",
            )

        patch_payload = {
            "organization_id": org_id,
            "role": role_hint,
            "status": existing_profile.get("status") or "active",
            "email": existing_profile.get("email") or auth_user.get("email"),
        }
        if not existing_profile.get("full_name"):
            patch_payload["full_name"] = _default_full_name(auth_user)
        updated = _profile_update_resilient(db, auth_user["id"], patch_payload)
        profile = updated.data[0] if updated.data else {**existing_profile, **patch_payload}
        return _build_me_from_profile(profile, auth_user, org)

    profile_payload = {
        "id": auth_user["id"],
        "organization_id": org_id,
        "role": role_hint,
        "status": "active",
        "full_name": _default_full_name(auth_user),
        "email": auth_user.get("email"),
        "onboarding_completed": False,
    }
    created = _profile_upsert_resilient(db, profile_payload)
    profile = created.data[0] if created.data else profile_payload
    return _build_me_from_profile(profile, auth_user, org)


@router.post("/enrollment/info", response_model=EnrollmentInfoResponse)
async def get_enrollment_info(
    payload: EnrollmentInfoRequest,
    db: Client = Depends(get_b2b_db),
):
    """
    Get organization details from an enrollment token (before signup).
    No authentication required.
    """
    try:
        token_payload = verify_enrollment_token(payload.enrollment_token)
    except ValueError as exc:
        message = str(exc)
        if "expired" in message.lower():
            _raise_api_error(
                status.HTTP_400_BAD_REQUEST,
                "ENROLLMENT_TOKEN_EXPIRED",
                message,
            )
        _raise_api_error(
            status.HTTP_400_BAD_REQUEST,
            "ENROLLMENT_TOKEN_INVALID",
            message,
        )

    org_id = token_payload["organization_id"]
    role_hint = token_payload["role_hint"]

    org_result = (
        db.table("organizations")
        .select("id,name,logo_url,status")
        .eq("id", org_id)
        .limit(1)
        .execute()
    )

    if not org_result.data:
        _raise_api_error(
            status.HTTP_404_NOT_FOUND,
            "ORGANIZATION_NOT_FOUND",
            "Organization not found",
        )

    org = org_result.data[0]
    if org.get("status") not in ACTIVE_ENROLLMENT_ORG_STATUSES:
        _raise_api_error(
            status.HTTP_403_FORBIDDEN,
            "ENROLLMENT_ORGANIZATION_UNAVAILABLE",
            "Organization enrollment is not available",
        )

    return EnrollmentInfoResponse(
        organization_id=str(org["id"]),
        organization_name=org["name"],
        logo_url=org.get("logo_url"),
        role_hint=role_hint,
    )


@router.post("/member/complete", response_model=MeResponse)
async def complete_member(
    payload: MemberCompleteRequest,
    auth_user: dict = Depends(get_authenticated_supabase_user),
    db: Client = Depends(get_b2b_db),
):
    _require_verified_email(auth_user)
    org_id, role_hint = _resolve_member_enrollment(db, payload)

    existing_profile = (
        db.table("profiles")
        .select("organization_id,role")
        .eq("id", auth_user["id"])
        .limit(1)
        .execute()
    )
    if existing_profile.data:
        row = existing_profile.data[0] or {}
        existing_org = row.get("organization_id")
        if existing_org and str(existing_org) != str(org_id):
            _raise_api_error(
                status.HTTP_409_CONFLICT,
                "ACCOUNT_ALREADY_LINKED",
                "This account is already attached to a different organization.",
            )

        existing_role = row.get("role")
        if existing_org and str(existing_org) == str(org_id) and existing_role == role_hint:
            current_profile_resp = (
                db.table("profiles").select("*").eq("id", auth_user["id"]).limit(1).execute()
            )
            if current_profile_resp.data:
                current_profile = current_profile_resp.data[0]
                current_profile["email_verified"] = bool(auth_user.get("email_verified", False))
                current_profile["email_verified_at"] = auth_user.get("email_verified_at")
                return MeResponse(authenticated=True, user=build_me_user(current_profile))

    profile_payload = {
        "id": auth_user["id"],
        "organization_id": org_id,
        "role": role_hint,
        "status": "active",
        "full_name": payload.full_name,
        "display_name": payload.display_name,
        "email": auth_user.get("email"),
        "onboarding_completed": True,
    }

    if role_hint == "teacher":
        profile_payload["phone"] = payload.phone
        profile_payload["subjects_taught"] = payload.subjects_taught
    if role_hint == "student":
        profile_payload["grade_level"] = payload.grade_level
        profile_payload["course"] = payload.course
        profile_payload["subject_ids"] = payload.subject_ids
        profile_payload["school_name"] = payload.school_name
        profile_payload["parent_name"] = payload.parent_name
        profile_payload["parent_email"] = payload.parent_email
        profile_payload["parent_phone"] = payload.parent_phone

    updated = _profile_upsert_resilient(db, profile_payload)
    profile = updated.data[0] if updated.data else profile_payload
    profile["email_verified"] = bool(auth_user.get("email_verified", False))
    profile["email_verified_at"] = auth_user.get("email_verified_at")
    return MeResponse(authenticated=True, user=build_me_user(profile))


def _role_safe_update_payload(payload: dict):
    filtered = {k: v for k, v in payload.items() if v is not None}
    filtered["onboarding_completed"] = True
    return filtered


@router.patch("/onboarding/teacher", response_model=MeResponse)
async def teacher_onboarding(
    payload: RoleOnboardingTeacherRequest,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    if current_user.get("role") not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Teacher onboarding not allowed")
    _require_verified_email(current_user)
    update_payload = _role_safe_update_payload(payload.model_dump())
    updated = _profile_update_resilient(db, current_user["id"], update_payload)
    profile = updated.data[0] if updated.data else {**current_user, **update_payload}
    return MeResponse(authenticated=True, user=build_me_user(profile))


@router.patch("/onboarding/student", response_model=MeResponse)
async def student_onboarding(
    payload: RoleOnboardingStudentRequest,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    if current_user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Student onboarding not allowed")
    _require_verified_email(current_user)
    update_payload = _role_safe_update_payload(payload.model_dump())
    updated = _profile_update_resilient(db, current_user["id"], update_payload)
    profile = updated.data[0] if updated.data else {**current_user, **update_payload}
    return MeResponse(authenticated=True, user=build_me_user(profile))


@router.patch("/onboarding/admin", response_model=MeResponse)
async def admin_onboarding(
    payload: RoleOnboardingAdminRequest,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin onboarding not allowed")
    _require_verified_email(current_user)
    update_payload = _role_safe_update_payload(payload.model_dump())
    updated = _profile_update_resilient(db, current_user["id"], update_payload)
    profile = updated.data[0] if updated.data else {**current_user, **update_payload}
    return MeResponse(authenticated=True, user=build_me_user(profile))
