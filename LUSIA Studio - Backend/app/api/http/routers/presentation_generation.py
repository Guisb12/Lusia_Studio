"""
Presentation generation endpoints.

POST /start        — Create artifact + enqueue async generation
GET  /{id}/stream  — SSE endpoint for detailed generation progress (Channel A)
GET  /{id}         — Return completed presentation artifact
"""

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from supabase import Client

from app.api.deps import require_teacher
from app.api.http.schemas.presentation_generation import (
    PresentationStartIn,
    PresentationStartOut,
)
from app.api.http.services.presentation_generation_service import (
    create_presentation_artifact,
    generate_presentation_task,
    get_presentation,
)
from app.core.database import get_b2b_db
from app.pipeline.task_manager import pipeline_manager

router = APIRouter()


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ── POST /start ──────────────────────────────────────────────


@router.post("/start", response_model=PresentationStartOut, status_code=201)
async def start_presentation_generation(
    payload: PresentationStartIn,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Create a presentation artifact and enqueue background generation."""
    org_id = current_user["organization_id"]
    user_id = current_user["id"]

    artifact = create_presentation_artifact(db, org_id, user_id, payload)

    # Enqueue async task — category carries org_id for the custom task_fn
    await pipeline_manager.enqueue(
        artifact_id=artifact["id"],
        job_id=artifact["job_id"],
        user_id=user_id,
        category=org_id,  # Passed as org_id to task_fn
        task_fn=generate_presentation_task,
    )

    return PresentationStartOut(
        artifact_id=artifact["id"],
        artifact_name=artifact["artifact_name"],
        artifact_type="presentation",
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


# ── GET /{artifact_id}/stream — Dedicated SSE (Channel A) ───


@router.get("/{artifact_id}/stream")
async def stream_presentation_generation(
    artifact_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """SSE endpoint for detailed presentation generation progress.

    Subscribes to PipelineTaskManager events for this specific artifact.
    If generation already completed, sends a ``done`` event immediately.
    """
    org_id = current_user["organization_id"]
    user_id = current_user["id"]

    # Check if already completed
    try:
        artifact = get_presentation(db, artifact_id, org_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Presentation not found")

    content = artifact.get("content") or {}
    phase = content.get("phase", "pending")

    async def event_generator():
        # If already done, send immediately
        if phase == "completed":
            plan = content.get("plan", {})
            total_slides = plan.get("total_slides", len(content.get("slides", [])))
            yield _sse({"type": "plan_complete", "plan": plan})
            yield _sse({"type": "done", "artifact_id": artifact_id, "total_slides": total_slides})
            return

        if phase == "failed":
            yield _sse({
                "type": "error",
                "message": artifact.get("processing_error") or "A geração falhou.",
            })
            return

        # Subscribe to real-time updates
        queue = pipeline_manager.subscribe(user_id)
        try:
            # Send current status
            if phase == "planning":
                yield _sse({"type": "planning", "message": "A planear estrutura pedagógica..."})
            elif phase == "generating_slides":
                plan = content.get("plan", {})
                total = plan.get("total_slides", 0)
                yield _sse({"type": "plan_complete", "plan": plan})
                yield _sse({"type": "generating_slides", "message": "A gerar slides...", "total": total})

            # Stream events
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue

                # Only forward events for this artifact
                if event.get("artifact_id") != artifact_id:
                    continue

                event_type = event.get("type")
                step = event.get("step", "")

                if event_type == "status":
                    if step == "planning":
                        yield _sse({"type": "planning", "message": event.get("step_label", "A planear...")})
                    elif step == "generating_slides":
                        # Re-read artifact to get plan
                        try:
                            updated = get_presentation(db, artifact_id, org_id)
                            plan = (updated.get("content") or {}).get("plan", {})
                            total = plan.get("total_slides", 0)
                            yield _sse({"type": "plan_complete", "plan": plan})
                            yield _sse({"type": "generating_slides", "message": "A gerar slides...", "total": total})
                        except Exception:
                            yield _sse({"type": "generating_slides", "message": event.get("step_label", "A gerar slides..."), "total": 0})

                elif event_type == "completed":
                    try:
                        final = get_presentation(db, artifact_id, org_id)
                        final_content = final.get("content") or {}
                        total_slides = len(final_content.get("slides", []))
                        yield _sse({"type": "done", "artifact_id": artifact_id, "total_slides": total_slides})
                    except Exception:
                        yield _sse({"type": "done", "artifact_id": artifact_id})
                    return

                elif event_type == "failed":
                    yield _sse({
                        "type": "error",
                        "message": event.get("error_message", "A geração falhou."),
                    })
                    return

                elif event_type in {"slide_progress", "slide_html_snapshot", "slide_html_done"}:
                    yield _sse(event)

                elif event_type == "plan_partial":
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


# ── GET /{artifact_id} — Full presentation data ─────────────


@router.get("/{artifact_id}")
async def get_presentation_artifact(
    artifact_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """Return the full presentation artifact (plan + slides)."""
    org_id = current_user["organization_id"]
    return get_presentation(db, artifact_id, org_id)
