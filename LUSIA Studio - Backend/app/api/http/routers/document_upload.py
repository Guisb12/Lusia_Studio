"""
Document upload endpoints.
"""

import json
from urllib.parse import unquote

from fastapi import APIRouter, Depends, Request
from supabase import Client

from app.api.deps import require_teacher
from app.api.http.schemas.document_upload import (
    DocumentJobStatusOut,
    DocumentUploadMeta,
    DocumentUploadOut,
)
from app.api.http.services.document_upload_service import (
    create_document_job,
    create_upload_artifact,
    get_job_status,
    list_processing_artifacts,
    retry_failed_artifact,
    upload_document_file,
)
from app.core.database import get_b2b_db
from app.pipeline.worker import enqueue_pipeline_job

router = APIRouter()


@router.post("/upload", response_model=DocumentUploadOut, status_code=201)
async def upload_document_endpoint(
    request: Request,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Upload a single document and start processing pipeline."""
    org_id = current_user["organization_id"]
    user_id = current_user["id"]

    # Parse metadata from header
    metadata_raw = unquote(request.headers.get("x-upload-metadata", "{}"))
    metadata = DocumentUploadMeta(**json.loads(metadata_raw))

    filename = request.headers.get("x-file-name", "document")
    content_type = request.headers.get("content-type", "application/octet-stream")
    file_bytes = await request.body()

    # 1. Upload to storage
    storage_path = upload_document_file(
        db, org_id, user_id, filename, content_type, file_bytes,
    )

    # 2. Create artifact row
    artifact = create_upload_artifact(
        db, org_id, user_id, storage_path, content_type, metadata,
    )

    # 3. Create job row (category + year_levels stored in metadata for pipeline use)
    year_levels = metadata.year_levels
    job = create_document_job(
        db, artifact["id"], org_id, user_id, metadata.document_category, year_levels
    )

    # 4. Enqueue pipeline
    await enqueue_pipeline_job(
        artifact["id"], job["id"], metadata.document_category, year_levels
    )

    return {
        **artifact,
        "job_id": job["id"],
    }


@router.get("/jobs/{job_id}", response_model=DocumentJobStatusOut)
async def get_job_status_endpoint(
    job_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Poll job processing status."""
    org_id = current_user["organization_id"]
    return get_job_status(db, job_id, org_id)


@router.get("/processing", response_model=list[DocumentUploadOut])
async def list_processing_endpoint(
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """List documents currently being processed."""
    return list_processing_artifacts(
        db,
        current_user["organization_id"],
        current_user["id"],
    )


@router.post("/{artifact_id}/retry", response_model=DocumentJobStatusOut, status_code=201)
async def retry_artifact_endpoint(
    artifact_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Retry a failed document processing pipeline."""
    org_id = current_user["organization_id"]
    user_id = current_user["id"]

    job = retry_failed_artifact(db, artifact_id, org_id, user_id)

    # Recover category and year_levels from job metadata and re-enqueue
    job_metadata = job.get("metadata") or {}
    document_category = job_metadata.get("document_category")
    year_levels = job_metadata.get("year_levels")
    await enqueue_pipeline_job(
        artifact_id, job["id"], document_category, year_levels
    )

    return job
