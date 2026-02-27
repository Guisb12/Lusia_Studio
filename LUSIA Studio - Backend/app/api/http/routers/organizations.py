from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client

from app.api.deps import require_admin
from app.api.http.services.auth_service import (
    generate_enrollment_code,
    normalize_enrollment_code,
    normalize_slug,
)
from app.core.database import get_b2b_db

router = APIRouter()


class SetEnrollmentCodeRequest(BaseModel):
    code: str


class OrgUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    logo_url: Optional[str] = None


@router.get("/{organization_id}")
async def get_organization(
    organization_id: str,
    current_user: dict = Depends(require_admin),
    db: Client = Depends(get_b2b_db),
):
    _ensure_org_access(current_user, organization_id)
    org = db.table("organizations").select("*").eq("id", organization_id).limit(1).execute()
    if not org.data:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org.data[0]


@router.patch("/{organization_id}")
async def update_organization(
    organization_id: str,
    payload: OrgUpdateRequest,
    current_user: dict = Depends(require_admin),
    db: Client = Depends(get_b2b_db),
):
    _ensure_org_access(current_user, organization_id)
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        org = db.table("organizations").select("*").eq("id", organization_id).limit(1).execute()
        return org.data[0] if org.data else {}
    updated = (
        db.table("organizations")
        .update(update_data)
        .eq("id", organization_id)
        .execute()
    )
    return updated.data[0] if updated.data else {}


def _ensure_org_access(current_user: dict, organization_id: str):
    if str(current_user.get("organization_id")) != str(organization_id):
        raise HTTPException(status_code=403, detail="Cannot manage another organization")


def _normalize_or_raise(code: str) -> str:
    normalized = normalize_enrollment_code(code)
    if not normalized:
        raise HTTPException(status_code=400, detail="Enrollment code cannot be empty")
    return normalized


@router.post("/{organization_id}/codes/rotate-teacher")
async def rotate_teacher_code(
    organization_id: str,
    current_user: dict = Depends(require_admin),
    db: Client = Depends(get_b2b_db),
):
    _ensure_org_access(current_user, organization_id)
    org_resp = (
        db.table("organizations").select("id,slug").eq("id", organization_id).limit(1).execute()
    )
    if not org_resp.data:
        raise HTTPException(status_code=404, detail="Organization not found")
    org = org_resp.data[0]
    new_code = generate_enrollment_code(normalize_slug(org["slug"]), "teacher")
    updated = (
        db.table("organizations")
        .update({"teacher_enrollment_code": new_code})
        .eq("id", organization_id)
        .execute()
    )
    row = updated.data[0] if updated.data else {"teacher_enrollment_code": new_code}
    return {"teacher_enrollment_code": row["teacher_enrollment_code"]}


@router.post("/{organization_id}/codes/rotate-student")
async def rotate_student_code(
    organization_id: str,
    current_user: dict = Depends(require_admin),
    db: Client = Depends(get_b2b_db),
):
    _ensure_org_access(current_user, organization_id)
    org_resp = (
        db.table("organizations").select("id,slug").eq("id", organization_id).limit(1).execute()
    )
    if not org_resp.data:
        raise HTTPException(status_code=404, detail="Organization not found")
    org = org_resp.data[0]
    new_code = generate_enrollment_code(normalize_slug(org["slug"]), "student")
    updated = (
        db.table("organizations")
        .update({"student_enrollment_code": new_code})
        .eq("id", organization_id)
        .execute()
    )
    row = updated.data[0] if updated.data else {"student_enrollment_code": new_code}
    return {"student_enrollment_code": row["student_enrollment_code"]}


@router.patch("/{organization_id}/codes/teacher")
async def set_teacher_code(
    organization_id: str,
    payload: SetEnrollmentCodeRequest,
    current_user: dict = Depends(require_admin),
    db: Client = Depends(get_b2b_db),
):
    _ensure_org_access(current_user, organization_id)
    new_code = _normalize_or_raise(payload.code)
    try:
        updated = (
            db.table("organizations")
            .update({"teacher_enrollment_code": new_code})
            .eq("id", organization_id)
            .execute()
        )
    except Exception as exc:
        if "duplicate" in str(exc).lower():
            raise HTTPException(status_code=409, detail="Enrollment code already in use") from exc
        raise
    row = updated.data[0] if updated.data else {"teacher_enrollment_code": new_code}
    return {"teacher_enrollment_code": row["teacher_enrollment_code"]}


@router.patch("/{organization_id}/codes/student")
async def set_student_code(
    organization_id: str,
    payload: SetEnrollmentCodeRequest,
    current_user: dict = Depends(require_admin),
    db: Client = Depends(get_b2b_db),
):
    _ensure_org_access(current_user, organization_id)
    new_code = _normalize_or_raise(payload.code)
    try:
        updated = (
            db.table("organizations")
            .update({"student_enrollment_code": new_code})
            .eq("id", organization_id)
            .execute()
        )
    except Exception as exc:
        if "duplicate" in str(exc).lower():
            raise HTTPException(status_code=409, detail="Enrollment code already in use") from exc
        raise
    row = updated.data[0] if updated.data else {"student_enrollment_code": new_code}
    return {"student_enrollment_code": row["student_enrollment_code"]}
