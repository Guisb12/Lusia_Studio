"""
Note generation endpoints.
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from supabase import Client

from app.api.deps import require_teacher
from app.api.http.schemas.note_generation import NoteStartIn, NoteStartOut
from app.api.http.services.note_generation_service import (
    create_note_artifact,
    generate_note_task,
)
from app.api.http.services.artifacts_service import get_artifact
from app.core.database import get_b2b_db
from app.pipeline.task_manager import pipeline_manager

router = APIRouter()


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/start", response_model=NoteStartOut, status_code=201)
async def start_note_generation(
    payload: NoteStartIn,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    org_id = current_user["organization_id"]
    user_id = current_user["id"]

    artifact = create_note_artifact(db, org_id, user_id, payload)

    await pipeline_manager.enqueue(
        artifact_id=artifact["id"],
        job_id=artifact["job_id"],
        user_id=user_id,
        category=org_id,
        task_fn=generate_note_task,
    )

    return NoteStartOut(
        artifact_id=artifact["id"],
        artifact_name=artifact["artifact_name"],
        artifact_type="note",
        icon=artifact.get("icon"),
        source_type="native",
        subject_id=artifact.get("subject_id"),
        subject_ids=artifact.get("subject_ids"),
        year_level=artifact.get("year_level"),
        curriculum_codes=artifact.get("curriculum_codes"),
        is_processed=False,
        is_public=False,
        created_at=artifact.get("created_at"),
    )


@router.get("/{artifact_id}/stream")
async def stream_note_generation(
    artifact_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    org_id = current_user["organization_id"]
    user_id = current_user["id"]

    try:
        artifact = get_artifact(db, artifact_id, org_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Note not found")

    content = artifact.get("content") or {}
    phase = content.get("phase", "pending")
    blocks = content.get("blocks") or []

    async def event_generator():
        yield _sse({
            "type": "hydrate",
            "phase": phase,
            "blocks": blocks,
            "is_processed": bool(artifact.get("is_processed")),
            "processing_failed": bool(artifact.get("processing_failed")),
        })

        if phase == "completed" or artifact.get("is_processed"):
            yield _sse({"type": "done", "artifact_id": artifact_id})
            return

        if phase == "failed" or artifact.get("processing_failed"):
            yield _sse({
                "type": "error",
                "message": artifact.get("processing_error") or "A geração falhou.",
            })
            return

        queue = pipeline_manager.subscribe(user_id)
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue

                if event.get("artifact_id") != artifact_id:
                    continue

                event_type = event.get("type")
                if event_type == "status":
                    yield _sse({
                        "type": "status",
                        "step": event.get("step"),
                        "step_label": event.get("step_label"),
                    })
                    continue

                if event_type == "completed":
                    yield _sse({"type": "done", "artifact_id": artifact_id})
                    return

                if event_type == "failed":
                    yield _sse({
                        "type": "error",
                        "message": event.get("error_message", "A geração falhou."),
                    })
                    return

                yield _sse(event)
        except asyncio.CancelledError:
            pass
        finally:
            pipeline_manager.unsubscribe(user_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
