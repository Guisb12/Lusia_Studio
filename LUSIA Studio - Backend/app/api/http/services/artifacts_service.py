"""
Artifacts service — business logic for doc/artifact CRUD.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import HTTPException, status
from postgrest.exceptions import APIError
from supabase import Client

from app.api.http.schemas.artifacts import ArtifactCreateIn, ArtifactUpdateIn
from app.utils.db import parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)

ARTIFACT_SUMMARY_SELECT = (
    "id,organization_id,user_id,artifact_type,artifact_name,"
    "icon,subject_ids,source_type,"
    "conversion_requested,storage_path,"
    "is_processed,processing_failed,processing_error,"
    "subject_id,year_level,year_levels,subject_component,curriculum_codes,"
    "is_public,created_at,updated_at"
)

ARTIFACT_SUMMARY_SELECT_FALLBACK = (
    "id,organization_id,user_id,artifact_type,artifact_name,"
    "icon,subject_ids,source_type,"
    "conversion_requested,storage_path,"
    "is_processed,processing_failed,processing_error,"
    "subject_id,year_level,subject_component,curriculum_codes,"
    "is_public,created_at,updated_at"
)

ARTIFACT_DETAIL_SELECT = (
    "id,organization_id,user_id,artifact_type,artifact_name,"
    "icon,subject_ids,content,source_type,"
    "conversion_requested,storage_path,tiptap_json,markdown_content,"
    "is_processed,processing_failed,processing_error,"
    "subject_id,year_level,year_levels,subject_component,curriculum_codes,"
    "is_public,created_at,updated_at"
)

ARTIFACT_DETAIL_SELECT_FALLBACK = (
    "id,organization_id,user_id,artifact_type,artifact_name,"
    "icon,subject_ids,content,source_type,"
    "conversion_requested,storage_path,tiptap_json,markdown_content,"
    "is_processed,processing_failed,processing_error,"
    "subject_id,year_level,subject_component,curriculum_codes,"
    "is_public,created_at,updated_at"
)

_ARTIFACTS_HAS_YEAR_LEVELS: Optional[bool] = None


def _is_missing_year_levels_error(exc: Exception) -> bool:
    return (
        isinstance(exc, APIError)
        and exc.code == "42703"
        and "artifacts.year_levels" in (exc.message or "")
    )


def _artifacts_support_year_levels(db: Client) -> bool:
    global _ARTIFACTS_HAS_YEAR_LEVELS

    if _ARTIFACTS_HAS_YEAR_LEVELS is not None:
        return _ARTIFACTS_HAS_YEAR_LEVELS

    try:
        db.table("artifacts").select("year_levels").limit(1).execute()
        _ARTIFACTS_HAS_YEAR_LEVELS = True
    except Exception as exc:
        if not _is_missing_year_levels_error(exc):
            raise
        logger.warning(
            "artifacts.year_levels column is missing; falling back to year_level-only artifact queries"
        )
        _ARTIFACTS_HAS_YEAR_LEVELS = False

    return _ARTIFACTS_HAS_YEAR_LEVELS


def _artifact_summary_select(db: Client) -> str:
    if _artifacts_support_year_levels(db):
        return ARTIFACT_SUMMARY_SELECT
    return ARTIFACT_SUMMARY_SELECT_FALLBACK


def _artifact_detail_select(db: Client) -> str:
    if _artifacts_support_year_levels(db):
        return ARTIFACT_DETAIL_SELECT
    return ARTIFACT_DETAIL_SELECT_FALLBACK


def _hydrate_artifacts(db: Client, artifacts: list[dict]) -> list[dict]:
    """Add subject details to artifacts with one batch query."""
    if not artifacts:
        return artifacts

    subject_ids = sorted(
        {
            str(subject_id)
            for artifact in artifacts
            for subject_id in (artifact.get("subject_ids") or [])
            if subject_id
        }
    )
    subject_map: dict[str, dict] = {}

    if subject_ids:
        try:
            response = supabase_execute(
                db.table("subjects")
                .select("id,name,color,icon")
                .in_("id", subject_ids),
                entity="subjects",
            )
            subject_map = {
                str(subject["id"]): subject
                for subject in (response.data or [])
                if subject.get("id")
            }
        except Exception:
            subject_map = {}

    for artifact in artifacts:
        artifact.setdefault("year_levels", None)
        artifact["subjects"] = [
            subject_map[str(subject_id)]
            for subject_id in (artifact.get("subject_ids") or [])
            if str(subject_id) in subject_map
        ]

    return artifacts


def _get_artifact_assignment_references(db: Client, artifact_id: str, user_id: str) -> tuple[int, str | None]:
    response = supabase_execute(
        db.table("assignments")
        .select("id,title", count="exact")
        .eq("artifact_id", artifact_id)
        .eq("teacher_id", user_id)
        .limit(3),
        entity="assignments",
    )
    assignments = response.data or []
    first_title = None
    if assignments:
        raw_title = assignments[0].get("title")
        if isinstance(raw_title, str) and raw_title.strip():
            first_title = raw_title.strip()
        else:
            first_title = "Sem titulo"
    return response.count or len(assignments), first_title


def list_artifacts(
    db: Client,
    org_id: str,
    user_id: str,
    *,
    artifact_type: Optional[str] = None,
) -> list[dict]:
    """List artifacts: user's own + public artifacts in the org."""
    # Own artifacts
    query = (
        db.table("artifacts")
        .select(_artifact_summary_select(db))
        .eq("organization_id", org_id)
        .or_(f"user_id.eq.{user_id},is_public.eq.true")
        .order("created_at", desc=True)
    )

    if artifact_type:
        query = query.eq("artifact_type", artifact_type)

    response = supabase_execute(query, entity="artifacts")
    artifacts = response.data or []
    return _hydrate_artifacts(db, artifacts)


def create_artifact(
    db: Client,
    org_id: str,
    user_id: str,
    payload: ArtifactCreateIn,
) -> dict:
    """Create a new artifact."""
    insert_data = {
        "organization_id": org_id,
        "user_id": user_id,
        "artifact_type": payload.artifact_type,
        "artifact_name": payload.artifact_name,
        "content": payload.content,
        "is_public": payload.is_public,
        "is_processed": payload.artifact_type != "uploaded_file",
    }
    if payload.icon:
        insert_data["icon"] = payload.icon
    if payload.subject_ids:
        insert_data["subject_ids"] = payload.subject_ids
    if payload.subject_id:
        insert_data["subject_id"] = payload.subject_id
    if payload.year_level:
        insert_data["year_level"] = payload.year_level
    supports_year_levels = _artifacts_support_year_levels(db)
    if payload.year_levels and supports_year_levels:
        insert_data["year_levels"] = payload.year_levels
    elif payload.year_levels and not payload.year_level and len(payload.year_levels) == 1:
        insert_data["year_level"] = payload.year_levels[0]
    if payload.subject_component:
        insert_data["subject_component"] = payload.subject_component
    if payload.curriculum_codes:
        insert_data["curriculum_codes"] = payload.curriculum_codes

    response = supabase_execute(
        db.table("artifacts").insert(insert_data),
        entity="artifact",
    )
    artifact = parse_single_or_404(response, entity="artifact")
    return _hydrate_artifacts(db, [artifact])[0]


def get_artifact(db: Client, artifact_id: str, org_id: str) -> dict:
    """Get a single artifact by ID."""
    response = supabase_execute(
        db.table("artifacts")
        .select(_artifact_detail_select(db))
        .eq("id", artifact_id)
        .eq("organization_id", org_id)
        .limit(1),
        entity="artifact",
    )
    artifact = parse_single_or_404(response, entity="artifact")
    return _hydrate_artifacts(db, [artifact])[0]


def delete_artifact(db: Client, artifact_id: str, user_id: str) -> dict:
    """Delete an artifact. Only the owner can delete."""
    # Verify ownership
    response = supabase_execute(
        db.table("artifacts")
        .select(_artifact_detail_select(db))
        .eq("id", artifact_id)
        .eq("user_id", user_id)
        .limit(1),
        entity="artifact",
    )
    artifact = parse_single_or_404(response, entity="artifact")

    try:
        supabase_execute(
            db.table("artifacts")
            .delete()
            .eq("id", artifact_id)
            .eq("user_id", user_id),
            entity="artifact",
        )
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        if exc.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR and (
            "assignments_artifact_id_fkey" in detail or "23503" in detail
        ):
            assignment_count, first_assignment_title = _get_artifact_assignment_references(
                db,
                artifact_id,
                user_id,
            )
            if assignment_count > 1 and first_assignment_title:
                message = (
                    f'Este documento esta a ser usado em {assignment_count} fichas/TPCs, '
                    f'incluindo "{first_assignment_title}", e nao pode ser apagado.'
                )
            elif first_assignment_title:
                message = (
                    f'Este documento esta a ser usado na ficha/TPC "{first_assignment_title}" '
                    "e nao pode ser apagado."
                )
            else:
                message = "Este documento esta a ser usado numa ficha/TPC e nao pode ser apagado."
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "artifact_in_use",
                    "message": message,
                },
            ) from exc
        raise
    return artifact


def update_artifact(
    db: Client,
    artifact_id: str,
    user_id: str,
    payload: ArtifactUpdateIn,
) -> dict:
    """Update an artifact. Only the owner can edit."""
    response = supabase_execute(
        db.table("artifacts")
        .select(_artifact_detail_select(db))
        .eq("id", artifact_id)
        .eq("user_id", user_id)
        .limit(1),
        entity="artifact",
    )
    existing = parse_single_or_404(response, entity="artifact")

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return _hydrate_artifacts(db, [existing])[0]

    if "year_levels" in update_data and not _artifacts_support_year_levels(db):
        year_levels = update_data.pop("year_levels") or []
        if year_levels and "year_level" not in update_data and len(year_levels) == 1:
            update_data["year_level"] = year_levels[0]

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    response = supabase_execute(
        db.table("artifacts")
        .update(update_data)
        .eq("id", artifact_id)
        .eq("user_id", user_id),
        entity="artifact",
    )
    artifact = parse_single_or_404(response, entity="artifact")
    return _hydrate_artifacts(db, [artifact])[0]


# ── Artifact image upload ──

ARTIFACT_IMAGE_BUCKET = "documents"
ARTIFACT_IMAGE_MAX_BYTES = 8 * 1024 * 1024  # 8 MB
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def upload_artifact_image(
    db: Client,
    org_id: str,
    artifact_id: str,
    *,
    filename: str,
    content_type: str,
    file_bytes: bytes,
) -> dict:
    """Upload an image for an artifact note and return its storage path."""
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image file is empty.",
        )
    if len(file_bytes) > ARTIFACT_IMAGE_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image exceeds {ARTIFACT_IMAGE_MAX_BYTES // (1024 * 1024)}MB limit.",
        )
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported image format. Use JPEG, PNG, WEBP or GIF.",
        )

    suffix = ALLOWED_IMAGE_TYPES[content_type]
    original_suffix = Path(filename or "").suffix.lower()
    if original_suffix in {".jpeg", ".jpg"}:
        suffix = ".jpg"
    elif original_suffix in {".png", ".webp", ".gif"}:
        suffix = original_suffix

    image_name = f"{uuid4().hex}{suffix}"
    image_path = f"{org_id}/{artifact_id}/images/{image_name}"

    try:
        db.storage.from_(ARTIFACT_IMAGE_BUCKET).upload(
            image_path,
            file_bytes,
            {
                "content-type": content_type,
                "upsert": "false",
                "cache-control": "3600",
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload image: {str(exc)}",
        ) from exc

    return {
        "path": image_path,
        "image_name": image_name,
    }
