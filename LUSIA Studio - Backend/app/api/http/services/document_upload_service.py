"""
Document upload service — handles file validation, storage, artifact creation,
and job enqueue for the processing pipeline.
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import uuid4

from fastapi import HTTPException, status
from supabase import Client

from app.api.http.schemas.document_upload import DocumentUploadMeta
from app.utils.db import parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)

DOCUMENT_BUCKET = "documents"
DOCUMENT_MAX_BYTES = 50 * 1024 * 1024  # 50 MB
PDF_MAX_PAGES = 25

ALLOWED_DOCUMENT_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/markdown": ".md",
    "text/plain": ".txt",
}

# Magic bytes used to verify the actual file type matches the declared content-type.
# Prevents uploading an executable or HTML file disguised as a PDF/DOCX.
MAGIC_BYTES: dict[str, bytes] = {
    "application/pdf": b"%PDF-",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": b"PK\x03\x04",
}

MIME_TO_SOURCE_TYPE = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/markdown": "md",
    "text/plain": "txt",
}

ARTIFACT_SELECT = (
    "id,organization_id,user_id,artifact_type,artifact_name,"
    "icon,source_type,conversion_requested,"
    "storage_path,is_processed,processing_failed,processing_error,created_at"
)


# ── File validation ──────────────────────────────────────────


def validate_document_file(
    filename: str,
    content_type: str,
    file_bytes: bytes,
) -> str:
    """Validate file size, content-type, magic bytes, and (for PDFs) page count.

    Returns the file extension on success; raises HTTPException on failure.
    """
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O ficheiro está vazio.",
        )
    if len(file_bytes) > DOCUMENT_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"O ficheiro excede o limite de {DOCUMENT_MAX_BYTES // (1024 * 1024)}MB.",
        )
    if content_type not in ALLOWED_DOCUMENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato não suportado. Usa PDF, DOCX, MD ou TXT.",
        )

    # Verify actual file bytes match the declared content-type.
    # Prevents uploading arbitrary files disguised as documents.
    expected_magic = MAGIC_BYTES.get(content_type)
    if expected_magic and not file_bytes.startswith(expected_magic):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O ficheiro não corresponde ao formato declarado.",
        )

    # Enforce PDF page limit before enqueuing the pipeline.
    if content_type == "application/pdf":
        _validate_pdf_pages(file_bytes)

    return ALLOWED_DOCUMENT_TYPES[content_type]


def _validate_pdf_pages(file_bytes: bytes) -> None:
    """Reject PDFs that exceed PDF_MAX_PAGES pages."""
    import io

    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(file_bytes))
        page_count = len(reader.pages)
        if page_count > PDF_MAX_PAGES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"O PDF tem {page_count} páginas. "
                    f"O limite máximo é {PDF_MAX_PAGES} páginas."
                ),
            )
    except HTTPException:
        raise
    except Exception as exc:
        # Non-fatal — if pypdf can't read the file (encrypted, corrupted), let
        # the pipeline handle it and surface a clearer error later.
        logger.warning("Could not validate PDF page count: %s", exc)


# ── Storage upload ───────────────────────────────────────────


def upload_document_file(
    db: Client,
    org_id: str,
    user_id: str,
    filename: str,
    content_type: str,
    file_bytes: bytes,
) -> str:
    """Upload file to Supabase Storage, return the storage path."""
    ext = validate_document_file(filename, content_type, file_bytes)
    storage_path = f"{org_id}/{user_id}/{uuid4().hex}{ext}"

    try:
        db.storage.from_(DOCUMENT_BUCKET).upload(
            storage_path,
            file_bytes,
            {"content-type": content_type, "upsert": "false"},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Falha ao fazer upload: {str(exc)}",
        ) from exc

    return storage_path


# ── Artifact creation ────────────────────────────────────────


def create_upload_artifact(
    db: Client,
    org_id: str,
    user_id: str,
    storage_path: str,
    content_type: str,
    metadata: DocumentUploadMeta,
) -> dict:
    """Create the artifact row for an uploaded document."""
    source_type = MIME_TO_SOURCE_TYPE.get(content_type, "txt")

    insert_data = {
        "organization_id": org_id,
        "user_id": user_id,
        "artifact_type": "uploaded_file",
        "artifact_name": metadata.artifact_name,
        "icon": metadata.icon or "📄",
        "source_type": source_type,
        "conversion_requested": source_type == "docx",
        "storage_path": storage_path,
        "is_processed": False,
        "processing_failed": False,
        "content": {},
        "is_public": metadata.is_public,
        "subject_id": metadata.subject_id,
        "subject_ids": [metadata.subject_id],
    }
    # For exercises flow, year_level stays null on artifact (only questions carry year)
    if metadata.document_category != "exercises" and metadata.year_level:
        insert_data["year_level"] = metadata.year_level
    if metadata.subject_component:
        insert_data["subject_component"] = metadata.subject_component

    response = supabase_execute(
        db.table("artifacts").insert(insert_data),
        entity="artifact",
    )
    return parse_single_or_404(response, entity="artifact")


# ── Job creation ─────────────────────────────────────────────


def create_document_job(
    db: Client,
    artifact_id: str,
    org_id: str,
    user_id: str,
    document_category: Optional[str] = None,
    year_levels: Optional[list[str]] = None,
) -> dict:
    """Create a job tracking row. document_category and year_levels are stored in metadata for pipeline use."""
    job_metadata: dict = {"document_category": document_category}
    if year_levels:
        job_metadata["year_levels"] = year_levels

    insert_data = {
        "artifact_id": artifact_id,
        "organization_id": org_id,
        "user_id": user_id,
        "status": "pending",
        "metadata": job_metadata,
    }
    response = supabase_execute(
        db.table("document_jobs").insert(insert_data),
        entity="document_job",
    )
    return parse_single_or_404(response, entity="document_job")


# ── Queries ──────────────────────────────────────────────────


def get_job_status(db: Client, job_id: str, org_id: str) -> dict:
    """Get job status for polling."""
    response = supabase_execute(
        db.table("document_jobs")
        .select("*")
        .eq("id", job_id)
        .eq("organization_id", org_id)
        .limit(1),
        entity="document_job",
    )
    return parse_single_or_404(response, entity="document_job")


def list_processing_artifacts(
    db: Client, org_id: str, user_id: str
) -> list[dict]:
    """List artifacts that are not yet fully processed (includes failed ones).

    Failed artifacts are included so that on page reload the user still sees
    their error state and can retry, rather than the row silently disappearing.
    """
    response = supabase_execute(
        db.table("artifacts")
        .select(ARTIFACT_SELECT + ", document_jobs(id, status, error_message)")
        .eq("organization_id", org_id)
        .eq("user_id", user_id)
        .eq("artifact_type", "uploaded_file")
        .eq("is_processed", False)
        .order("created_at", desc=True),
        entity="artifacts",
    )
    artifacts = response.data or []

    # Flatten the nested document_jobs into job_id + job_status + error_message
    for art in artifacts:
        jobs = art.pop("document_jobs", None) or []
        if jobs:
            latest = jobs[-1]
            art["job_id"] = latest["id"]
            art["job_status"] = latest["status"]
            art["error_message"] = latest.get("error_message")
        else:
            art["job_id"] = None
            art["job_status"] = None
            art["error_message"] = art.get("processing_error")

    return artifacts


def retry_failed_artifact(
    db: Client,
    artifact_id: str,
    org_id: str,
    user_id: str,
) -> dict:
    """Reset a failed artifact for retry and create a new job."""
    # Verify ownership and failed state
    response = supabase_execute(
        db.table("artifacts")
        .select(ARTIFACT_SELECT)
        .eq("id", artifact_id)
        .eq("organization_id", org_id)
        .eq("user_id", user_id)
        .eq("processing_failed", True)
        .limit(1),
        entity="artifact",
    )
    parse_single_or_404(response, entity="artifact")

    # Recover document_category from the most recent job for this artifact
    prev_job_response = supabase_execute(
        db.table("document_jobs")
        .select("metadata")
        .eq("artifact_id", artifact_id)
        .order("created_at", desc=True)
        .limit(1),
        entity="document_job",
    )
    prev_job = parse_single_or_404(prev_job_response, entity="document_job")
    prev_metadata = prev_job.get("metadata") or {}
    document_category = prev_metadata.get("document_category")
    year_levels = prev_metadata.get("year_levels")

    # Reset processing state
    supabase_execute(
        db.table("artifacts")
        .update({
            "is_processed": False,
            "processing_failed": False,
            "processing_error": None,
        })
        .eq("id", artifact_id),
        entity="artifact",
    )

    # Create new job carrying the same category and year_levels
    job = create_document_job(
        db, artifact_id, org_id, user_id, document_category, year_levels
    )
    return job
