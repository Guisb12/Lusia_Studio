"""
Artifacts service — business logic for doc/artifact CRUD.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from supabase import Client

from app.api.http.schemas.artifacts import ArtifactCreateIn, ArtifactUpdateIn
from app.utils.db import parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)

ARTIFACT_SELECT = (
    "id,organization_id,user_id,artifact_type,artifact_name,"
    "icon,subject_ids,content,source_type,"
    "conversion_requested,storage_path,tiptap_json,markdown_content,"
    "is_processed,processing_failed,processing_error,"
    "subject_id,year_level,subject_component,curriculum_codes,"
    "is_public,created_at,updated_at"
)


def _hydrate_artifact(db: Client, artifact: dict) -> dict:
    """Add subject details to an artifact."""
    subject_ids = artifact.get("subject_ids") or []
    if subject_ids:
        try:
            resp = (
                db.table("subjects")
                .select("id,name,color,icon")
                .in_("id", subject_ids)
                .execute()
            )
            artifact["subjects"] = resp.data or []
        except Exception:
            artifact["subjects"] = []
    else:
        artifact["subjects"] = []
    return artifact


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
        .select(ARTIFACT_SELECT)
        .eq("organization_id", org_id)
        .or_(f"user_id.eq.{user_id},is_public.eq.true")
        .order("created_at", desc=True)
    )

    if artifact_type:
        query = query.eq("artifact_type", artifact_type)

    response = supabase_execute(query, entity="artifacts")
    artifacts = response.data or []
    return [_hydrate_artifact(db, a) for a in artifacts]


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
    }
    if payload.icon:
        insert_data["icon"] = payload.icon
    if payload.subject_ids:
        insert_data["subject_ids"] = payload.subject_ids

    response = supabase_execute(
        db.table("artifacts").insert(insert_data),
        entity="artifact",
    )
    artifact = parse_single_or_404(response, entity="artifact")
    return _hydrate_artifact(db, artifact)


def get_artifact(db: Client, artifact_id: str, org_id: str) -> dict:
    """Get a single artifact by ID."""
    response = supabase_execute(
        db.table("artifacts")
        .select(ARTIFACT_SELECT)
        .eq("id", artifact_id)
        .eq("organization_id", org_id)
        .limit(1),
        entity="artifact",
    )
    artifact = parse_single_or_404(response, entity="artifact")
    return _hydrate_artifact(db, artifact)


def delete_artifact(db: Client, artifact_id: str, user_id: str) -> dict:
    """Delete an artifact. Only the owner can delete."""
    # Verify ownership
    response = supabase_execute(
        db.table("artifacts")
        .select(ARTIFACT_SELECT)
        .eq("id", artifact_id)
        .eq("user_id", user_id)
        .limit(1),
        entity="artifact",
    )
    artifact = parse_single_or_404(response, entity="artifact")

    supabase_execute(
        db.table("artifacts")
        .delete()
        .eq("id", artifact_id)
        .eq("user_id", user_id),
        entity="artifact",
    )
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
        .select(ARTIFACT_SELECT)
        .eq("id", artifact_id)
        .eq("user_id", user_id)
        .limit(1),
        entity="artifact",
    )
    existing = parse_single_or_404(response, entity="artifact")

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return _hydrate_artifact(db, existing)

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    response = supabase_execute(
        db.table("artifacts")
        .update(update_data)
        .eq("id", artifact_id)
        .eq("user_id", user_id),
        entity="artifact",
    )
    artifact = parse_single_or_404(response, entity="artifact")
    return _hydrate_artifact(db, artifact)
