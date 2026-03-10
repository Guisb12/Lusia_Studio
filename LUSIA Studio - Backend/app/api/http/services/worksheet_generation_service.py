"""
Worksheet generation service — artifact creation and high-level orchestration.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from supabase import Client

from app.api.http.schemas.worksheet_generation import WorksheetStartIn
from app.pipeline.steps.categorize_document import get_subject_name
from app.utils.db import parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)


def create_worksheet_artifact(
    db: Client,
    org_id: str,
    user_id: str,
    payload: WorksheetStartIn,
) -> dict:
    """
    Create an exercise_sheet artifact row with is_processed=False.

    Stores generation parameters in the content JSONB so downstream
    endpoints (blueprint, resolution) can pick them up.
    """
    # Inherit tags from upload artifact when not provided by the frontend
    subject_id = payload.subject_id
    year_level = payload.year_level
    subject_component = payload.subject_component
    curriculum_codes = payload.curriculum_codes

    if payload.upload_artifact_id and not curriculum_codes:
        doc_resp = supabase_execute(
            db.table("artifacts")
            .select("subject_id,year_level,subject_component,curriculum_codes")
            .eq("id", payload.upload_artifact_id)
            .limit(1),
            entity="artifact",
        )
        doc_rows = doc_resp.data or []
        if doc_rows:
            doc = doc_rows[0]
            curriculum_codes = doc.get("curriculum_codes") or []
            if not subject_id and doc.get("subject_id"):
                subject_id = doc["subject_id"]
            if not year_level and doc.get("year_level"):
                year_level = doc["year_level"]
            if not subject_component and doc.get("subject_component"):
                subject_component = doc["subject_component"]

    if subject_id:
        subject_name = get_subject_name(db, subject_id) or "Ficha"
        artifact_name = f"Ficha · {subject_name}"
        if year_level:
            artifact_name += f" · {year_level}º ano"
    else:
        artifact_name = "Ficha de Exercícios"

    now = datetime.now(timezone.utc).isoformat()

    insert_data = {
        "organization_id": org_id,
        "user_id": user_id,
        "artifact_type": "exercise_sheet",
        "source_type": "native",
        "artifact_name": artifact_name,
        "icon": "✏️",
        "content": {
            "generation_params": {
                "prompt": payload.prompt,
                "template_id": payload.template_id,
                "difficulty": payload.difficulty,
                "upload_artifact_id": payload.upload_artifact_id,
                "year_range": payload.year_range,
            },
            "blueprint": None,
            "conversation_history": [],
            "phase": "generating_blueprint",
        },
        "subject_id": subject_id,
        "subject_ids": [subject_id] if subject_id else [],
        "year_level": year_level,
        "curriculum_codes": curriculum_codes,
        "is_processed": False,
        "processing_failed": False,
        "is_public": False,
        "created_at": now,
        "updated_at": now,
    }

    if subject_component:
        insert_data["subject_component"] = subject_component

    response = supabase_execute(
        db.table("artifacts").insert(insert_data),
        entity="artifact",
    )
    return parse_single_or_404(response, entity="artifact")


def get_worksheet_artifact(
    db: Client,
    artifact_id: str,
    user_id: str,
) -> dict:
    """Fetch a worksheet artifact and verify ownership."""
    response = supabase_execute(
        db.table("artifacts")
        .select(
            "id,user_id,content,subject_id,year_level,"
            "subject_component,curriculum_codes,"
            "is_processed,processing_failed,artifact_name"
        )
        .eq("id", artifact_id)
        .eq("artifact_type", "exercise_sheet")
        .limit(1),
        entity="artifact",
    )
    artifact = parse_single_or_404(response, entity="artifact")

    if artifact["user_id"] != user_id:
        from fastapi import HTTPException

        raise HTTPException(status_code=403, detail="Not authorized for this artifact")

    return artifact


def update_worksheet_content(
    db: Client,
    artifact_id: str,
    content: dict,
) -> None:
    """Update the content JSONB on a worksheet artifact."""
    supabase_execute(
        db.table("artifacts")
        .update({
            "content": content,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", artifact_id),
        entity="artifact",
    )


def mark_worksheet_failed(
    db: Client,
    artifact_id: str,
    error: str,
) -> None:
    """Mark a worksheet artifact as failed."""
    supabase_execute(
        db.table("artifacts")
        .update({
            "processing_failed": True,
            "processing_error": error[:500],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", artifact_id),
        entity="artifact",
    )
