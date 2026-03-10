"""
Worksheet generation endpoints — AI-powered worksheet creation pipeline.

Provides endpoints for:
- POST /start: create artifact, assemble context, generate initial blueprint
- GET /{artifact_id}/blueprint: fetch current blueprint state (session recovery)
- POST /{artifact_id}/blueprint/chat: process one chat turn during review
- PATCH /{artifact_id}/blueprint: direct UI edits (drag-reorder, etc.)
- GET /{artifact_id}/resolve/stream: SSE stream for resolution progress
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from supabase import Client

from app.api.deps import require_teacher
from app.api.http.schemas.worksheet_generation import (
    BlueprintChatIn,
    BlueprintStateOut,
    BlueprintUpdateIn,
    ContextSummary,
    TemplateInfo,
    TemplateListOut,
    WorksheetStartIn,
    WorksheetStartOut,
)
from app.api.http.services.worksheet_blueprint_agent import (
    stream_blueprint_chat_turn,
)
from app.api.http.services.generation_context import (
    fetch_bank_questions,
    validate_generation_possible,
)
from app.api.http.services.worksheet_generation_service import (
    create_worksheet_artifact,
    get_worksheet_artifact,
    update_worksheet_content,
)
from app.api.http.services.worksheet_planner import generate_initial_blueprint, stream_initial_blueprint
from app.api.http.services.worksheet_resolution import resolve_worksheet_stream
from app.core.database import get_b2b_db

router = APIRouter()


@router.get("/templates", response_model=TemplateListOut)
async def get_templates():
    """Return all available worksheet templates."""
    from app.api.http.services.worksheet_templates import (
        get_template_info,
        list_templates,
    )

    templates = list_templates()
    return TemplateListOut(
        templates=[TemplateInfo(**get_template_info(t)) for t in templates]
    )


@router.post("/start", response_model=WorksheetStartOut, status_code=201)
async def start_worksheet_generation(
    payload: WorksheetStartIn,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """
    Create a worksheet artifact and return its ID immediately.

    Blueprint generation is triggered by the client connecting to
    GET /{artifact_id}/blueprint/stream right after navigation.
    """
    can_proceed, reason = validate_generation_possible(
        db, payload.subject_id, payload.upload_artifact_id
    )
    if not can_proceed:
        raise HTTPException(status_code=400, detail=reason)

    artifact = create_worksheet_artifact(
        db,
        current_user["organization_id"],
        current_user["id"],
        payload,
    )

    return WorksheetStartOut(
        artifact_id=artifact["id"],
        artifact_name=artifact["artifact_name"],
    )


@router.get("/{artifact_id}/blueprint", response_model=BlueprintStateOut)
async def get_blueprint(
    artifact_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """
    Fetch the current blueprint state, conversation history, and context
    summary. Used for page load and session recovery.
    """
    artifact = get_worksheet_artifact(db, artifact_id, current_user["id"])
    content = artifact.get("content", {})

    from app.api.http.schemas.worksheet_generation import Blueprint

    raw_blueprint = content.get("blueprint", {})
    blueprint = Blueprint(**(raw_blueprint or {}))
    conversation = content.get("conversation_history", [])
    generation_params = content.get("generation_params", {})

    # Build context summary
    summary_data = content.get("assembled_context_summary", {})
    context_summary = ContextSummary(
        subject_name=summary_data.get("subject_name", ""),
        subject_status=summary_data.get("subject_status", ""),
        has_national_exam=summary_data.get("has_national_exam", False),
        bank_question_count=summary_data.get("bank_question_count", 0),
        document_attached=summary_data.get("document_attached", False),
        curriculum_code_count=summary_data.get("curriculum_code_count", 0),
    )

    return BlueprintStateOut(
        blueprint=blueprint,
        conversation=conversation,
        generation_params=generation_params,
        context_summary=context_summary,
    )


@router.get("/{artifact_id}/blueprint/stream")
async def stream_blueprint_generation(
    artifact_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """
    SSE stream for initial blueprint generation.

    Assembles context and runs the planner LLM via instructor's create_iterable,
    emitting each BlueprintBlock as it completes. If the blueprint was already
    generated, replays existing blocks immediately.

    Events: {"type": "block", "block": {...}} | {"type": "done"} | {"type": "error", "message": "..."}
    """
    generator = stream_initial_blueprint(
        db,
        artifact_id,
        current_user["organization_id"],
        current_user["id"],
    )
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{artifact_id}/blueprint/chat")
async def blueprint_chat(
    artifact_id: str,
    payload: BlueprintChatIn,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """
    SSE stream for one teacher chat turn during blueprint review.

    Streams upsert/delete events as each tool call is applied, then
    a final 'done' event with the full blueprint. Persists state after
    the stream completes.
    """
    artifact = get_worksheet_artifact(db, artifact_id, current_user["id"])
    content = artifact.get("content", {})
    conversation = content.get("conversation_history", [])

    # Fetch bank questions for the agent context
    subject_id = artifact["subject_id"]
    year_level = artifact["year_level"]
    curriculum_codes = artifact.get("curriculum_codes") or []

    bank_questions = fetch_bank_questions(
        db, subject_id, year_level, curriculum_codes
    )

    async def generate():
        import json as _json

        all_tool_calls = []
        final_blueprint = None

        async for chunk in stream_blueprint_chat_turn(
            message=payload.message,
            block_id=payload.block_id,
            current_blueprint=payload.blueprint,
            conversation_history=conversation,
            bank_questions=bank_questions,
        ):
            yield chunk

            # Parse the done event to persist state
            stripped = chunk.strip()
            if stripped.startswith("data: "):
                try:
                    event = _json.loads(stripped[6:])
                    if event.get("type") == "done":
                        final_blueprint = event.get("blueprint")
                        all_tool_calls = event.get("tool_calls", [])
                except _json.JSONDecodeError:
                    pass

        # Persist after stream completes
        if final_blueprint is not None:
            from app.api.http.schemas.worksheet_generation import Blueprint

            bp = Blueprint(**final_blueprint)

            user_entry = {"role": "user", "content": payload.message}
            if payload.block_id:
                user_entry["block_id"] = payload.block_id

            conversation.append(user_entry)
            conversation.append({
                "role": "assistant",
                "content": "",
                "tool_calls": all_tool_calls,
            })

            content["blueprint"] = bp.model_dump()
            content["conversation_history"] = conversation
            content["phase"] = "blueprint_review"
            update_worksheet_content(db, artifact_id, content)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.patch("/{artifact_id}/blueprint")
async def update_blueprint_direct(
    artifact_id: str,
    payload: BlueprintUpdateIn,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """
    Direct blueprint update from the UI (drag-reorder, manual block edits).

    Called by the frontend on a debounce. Does not involve AI.
    """
    artifact = get_worksheet_artifact(db, artifact_id, current_user["id"])
    content = artifact.get("content", {})

    content["blueprint"] = payload.blueprint.model_dump()
    update_worksheet_content(db, artifact_id, content)

    return {"status": "ok"}


@router.get("/{artifact_id}/resolve/stream")
async def stream_resolution(
    artifact_id: str,
    current_user: dict = Depends(require_teacher),
    db: Client = Depends(get_b2b_db),
):
    """
    SSE endpoint for worksheet resolution.

    Streams events as bank blocks are fetched and AI blocks are generated
    in parallel. The frontend receives events for each resolved question.
    """
    generator = resolve_worksheet_stream(
        db,
        artifact_id,
        current_user["organization_id"],
        current_user["id"],
    )
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
