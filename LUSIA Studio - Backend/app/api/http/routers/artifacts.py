"""
Artifacts endpoints.
"""

import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse, Response
from supabase import Client

from app.api.deps import require_teacher
from app.api.http.schemas.artifacts import (
    ArtifactCreateIn,
    ArtifactOut,
    ArtifactSummaryOut,
    ArtifactUpdateIn,
)
from app.api.http.services.artifacts_service import (
    create_artifact,
    delete_artifact,
    get_artifact,
    list_artifacts,
    update_artifact,
    upload_artifact_image,
)
from app.core.database import get_b2b_db
from app.core.security import get_current_user

router = APIRouter()

NOTE_VISUAL_STAGE_STYLE = """
<style>
  .sl-stage-fit {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .sl-stage[data-note-visual-stage] {
    width: 720px;
    height: 450px;
    position: relative;
    transform-origin: center center;
    will-change: transform;
  }
  .sl-stage-content {
    width: 720px;
    height: 450px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sl-stage-content > .sl-visual {
    width: 100%;
    height: 100%;
    min-height: 0;
  }
  .sl-stage-content svg,
  .sl-stage-content iframe,
  .sl-stage-content canvas {
    max-width: 100%;
    max-height: 100%;
    margin: 0 auto;
  }
</style>
"""

NOTE_VISUAL_STAGE_SCRIPT = """
<script>
  (function () {
    function fitStage() {
      var canvas = document.querySelector('.sl-canvas');
      var stage = document.querySelector('[data-note-visual-stage]');
      if (!canvas || !stage) return;
      var outerScale = Math.min(canvas.clientWidth / 720, canvas.clientHeight / 450);
      if (!isFinite(outerScale) || outerScale <= 0) outerScale = 1;
      stage.style.transform = 'scale(' + outerScale + ')';
    }
    window.addEventListener('load', fitStage);
    window.addEventListener('resize', fitStage);
    if (window.ResizeObserver) {
      var canvas = document.querySelector('.sl-canvas');
      if (canvas) {
        new ResizeObserver(fitStage).observe(canvas);
      }
    }
    requestAnimationFrame(fitStage);
  })();
</script>
"""


def _normalize_note_visual_html(html: str) -> str:
    if 'data-note-visual-stage' in html or '<div class="sl-canvas">' not in html:
        return html

    normalized = html
    normalized = normalized.replace(
        '<div class="sl-canvas">',
        '<div class="sl-canvas"><div class="sl-stage-fit"><div class="sl-stage" data-note-visual-stage><div class="sl-stage-content">',
        1,
    )

    body_close = normalized.rfind("</body>")
    if body_close != -1:
        canvas_close = normalized.rfind("</div>", 0, body_close)
        if canvas_close != -1:
            normalized = normalized[:canvas_close] + "</div></div></div>" + normalized[canvas_close:]

    if "</head>" in normalized:
        normalized = normalized.replace("</head>", NOTE_VISUAL_STAGE_STYLE + "</head>", 1)
    if "</body>" in normalized:
        normalized = normalized.replace("</body>", NOTE_VISUAL_STAGE_SCRIPT + "</body>", 1)

    return normalized


@router.get("/", response_model=list[ArtifactSummaryOut])
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


@router.get("/{artifact_id}/file")
async def get_artifact_file(
    artifact_id: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """Generate a short-lived signed URL for the artifact's original uploaded file."""
    org_id = current_user["organization_id"]
    artifact = get_artifact(db, artifact_id, org_id)
    storage_path = artifact.get("storage_path")
    if not storage_path:
        raise HTTPException(status_code=404, detail="No file associated with this artifact")
    # Validate the storage path belongs to the current org
    if not storage_path.startswith(f"{org_id}/"):
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        result = db.storage.from_("documents").create_signed_url(storage_path, expires_in=3600)
        signed_url = result.get("signedURL") or result.get("signed_url")
        if not signed_url:
            raise HTTPException(status_code=404, detail="File not found")
        return {"signed_url": signed_url}
    except Exception as exc:
        raise HTTPException(status_code=404, detail="File not found") from exc


@router.post("/{artifact_id}/images/upload")
async def upload_artifact_image_endpoint(
    artifact_id: str,
    request: Request,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Upload an image for an artifact note."""
    org_id = current_user["organization_id"]
    # Verify artifact exists and belongs to org
    get_artifact(db, artifact_id, org_id)

    file_bytes = await request.body()
    filename = request.headers.get("x-file-name", "")
    content_type = request.headers.get("content-type", "application/octet-stream")

    return upload_artifact_image(
        db,
        org_id,
        artifact_id,
        filename=filename,
        content_type=content_type,
        file_bytes=file_bytes,
    )


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


@router.get("/{artifact_id}/visuals/{block_id}.html")
async def get_artifact_visual_html(
    artifact_id: str,
    block_id: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_b2b_db),
):
    """Serve stored note visual HTML by block id."""
    org_id = current_user["organization_id"]
    artifact = get_artifact(db, artifact_id, org_id)

    content = artifact.get("content") or {}
    blocks = content.get("blocks") if isinstance(content, dict) else None
    if not isinstance(blocks, list):
        raise HTTPException(status_code=404, detail="Visual not found")

    def find_block(items: list[dict]) -> dict | None:
        for item in items:
            if not isinstance(item, dict):
                continue
            if item.get("id") == block_id and item.get("type") in {"visual", "svg"}:
                return item
            if item.get("type") == "columns":
                for column in item.get("columns") or []:
                    if isinstance(column, list):
                        found = find_block(column)
                        if found:
                            return found
        return None

    block = find_block(blocks)
    if not block:
        raise HTTPException(status_code=404, detail="Visual not found")

    html = block.get("html")
    if not isinstance(html, str) or not html.strip():
        raise HTTPException(status_code=404, detail="Visual not found")

    return Response(content=_normalize_note_visual_html(html), media_type="text/html; charset=utf-8")
