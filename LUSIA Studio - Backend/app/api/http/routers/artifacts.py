"""
Artifacts endpoints.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from supabase import Client

from app.api.deps import require_teacher
from app.api.http.schemas.artifacts import ArtifactCreateIn, ArtifactOut, ArtifactUpdateIn
from app.api.http.services.artifacts_service import (
    create_artifact,
    delete_artifact,
    get_artifact,
    list_artifacts,
    update_artifact,
)
from app.core.database import get_b2b_db
from app.core.security import get_current_user

router = APIRouter()


@router.get("/", response_model=list[ArtifactOut])
async def list_artifacts_endpoint(
    artifact_type: Optional[str] = Query(None, description="Filter by artifact type"),
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """List artifacts visible to the current user."""
    org_id = current_user["organization_id"]
    user_id = current_user["id"]
    return list_artifacts(db, org_id, user_id, artifact_type=artifact_type)


@router.post("/", response_model=ArtifactOut, status_code=201)
async def create_artifact_endpoint(
    payload: ArtifactCreateIn,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Create a new artifact. Teachers and admins only."""
    org_id = current_user["organization_id"]
    user_id = current_user["id"]
    return create_artifact(db, org_id, user_id, payload)


@router.get("/{artifact_id}", response_model=ArtifactOut)
async def get_artifact_endpoint(
    artifact_id: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """Get a single artifact by ID."""
    org_id = current_user["organization_id"]
    return get_artifact(db, artifact_id, org_id)


@router.patch("/{artifact_id}", response_model=ArtifactOut)
async def update_artifact_endpoint(
    artifact_id: str,
    payload: ArtifactUpdateIn,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Update an artifact. Only the owner can edit."""
    user_id = current_user["id"]
    return update_artifact(db, artifact_id, user_id, payload)


@router.delete("/{artifact_id}", response_model=ArtifactOut)
async def delete_artifact_endpoint(
    artifact_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Delete an artifact. Only the owner can delete."""
    user_id = current_user["id"]
    return delete_artifact(db, artifact_id, user_id)


@router.get("/{artifact_id}/images/{image_path:path}")
async def get_artifact_image(
    artifact_id: str,
    image_path: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """Generate a short-lived signed URL for a private artifact image and redirect to it."""
    org_id = current_user["organization_id"]
    # Verify the image path belongs to this org/artifact to prevent enumeration
    expected_prefix = f"{org_id}/{artifact_id}/images/"
    full_path = f"{org_id}/{artifact_id}/images/{image_path}"
    if not full_path.startswith(expected_prefix):
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        result = db.storage.from_("documents").create_signed_url(full_path, expires_in=3600)
        signed_url = result.get("signedURL") or result.get("signed_url")
        if not signed_url:
            raise HTTPException(status_code=404, detail="Image not found")
        return RedirectResponse(url=signed_url)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Image not found") from exc
