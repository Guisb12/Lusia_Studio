"""
Wizard agent router — SSE streaming for content-finding and instructions-building.
"""

import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.deps import require_teacher
from app.core.database import get_b2b_db
from app.wizard.prompts import (
    build_content_finding_prompt,
    build_final_instructions_prompt,
    build_instructions_prompt,
)
from app.wizard.schemas import InstructionsStreamIn, WizardStreamIn
from app.wizard.streaming import stream_instructions, stream_wizard_response

logger = logging.getLogger(__name__)

router = APIRouter()

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def _get_curriculum_tree(db, subject_id: str, year_level: str, subject_component: str | None) -> str:
    """Fetch and serialize the curriculum tree for embedding in the prompt."""
    from app.pipeline.steps.categorize_document import get_curriculum_tree, serialize_tree

    tree = get_curriculum_tree(db, subject_id, year_level, subject_component)
    if not tree:
        return ""
    return serialize_tree(tree)


def _get_subject_name(db, subject_id: str) -> str | None:
    """Fetch subject name by ID."""
    from app.utils.db import supabase_execute

    resp = supabase_execute(
        db.table("subjects").select("name").eq("id", subject_id).limit(1),
        entity="subject",
    )
    rows = resp.data or []
    return rows[0]["name"] if rows else None


def _get_document_summary(db, artifact_id: str) -> str:
    """Fetch a brief content summary of an uploaded document."""
    from app.utils.db import supabase_execute

    resp = supabase_execute(
        db.table("artifacts")
        .select("artifact_name, markdown_content")
        .eq("id", artifact_id)
        .limit(1),
        entity="artifact",
    )
    rows = resp.data or []
    if not rows:
        return ""
    row = rows[0]
    name = row.get("artifact_name", "")
    md = row.get("markdown_content") or ""
    # Truncate to ~4000 chars for prompt context
    if len(md) > 4000:
        md = md[:4000] + "\n\n[... conteúdo truncado ...]"
    return f"Documento: {name}\n\n{md}" if md else f"Documento: {name}"


@router.post("/stream")
async def stream_wizard(
    body: WizardStreamIn,
    current_user: dict = Depends(require_teacher),
    db=Depends(get_b2b_db),
):
    """Stream wizard agent response (Phase 1 or Phase 2)."""

    subject_name = None
    if body.subject_id:
        subject_name = _get_subject_name(db, body.subject_id)

    if body.phase == "content_finding":
        # Phase 1: embed curriculum tree in prompt
        curriculum_tree = ""
        if body.subject_id and body.year_level:
            curriculum_tree = _get_curriculum_tree(
                db, body.subject_id, body.year_level, body.subject_component
            )

        system_prompt = build_content_finding_prompt(
            subject_name=subject_name or "Disciplina",
            year_level=body.year_level or "?",
            curriculum_tree=curriculum_tree or "Currículo não disponível.",
            document_type=body.document_type,
        )
    else:
        # Phase 2: instructions builder
        has_document = bool(body.upload_artifact_id)
        doc_context = ""
        if body.upload_artifact_id:
            doc_context = _get_document_summary(db, body.upload_artifact_id)

        system_prompt = build_instructions_prompt(
            document_type=body.document_type,
            subject_name=subject_name,
            year_level=body.year_level,
            content_summary=body.content_summary,
            has_document=has_document,
        )

        # If there's document content, prepend it as context in the first message
        if doc_context and body.messages:
            enriched_messages = list(body.messages)
            # Add document context as a system-like first user message if not already present
            if not any("Documento:" in m.content for m in enriched_messages):
                from app.wizard.schemas import WizardMessage
                enriched_messages.insert(0, WizardMessage(
                    role="user",
                    content=f"[Conteúdo do documento para contexto]\n\n{doc_context}",
                ))
            body_messages = [m.model_dump() for m in enriched_messages]
        else:
            body_messages = [m.model_dump() for m in body.messages]

        generator = stream_wizard_response(
            messages=body_messages,
            system_prompt=system_prompt,
        )
        return StreamingResponse(
            generator, media_type="text/event-stream", headers=_SSE_HEADERS
        )

    # Phase 1 path
    generator = stream_wizard_response(
        messages=[m.model_dump() for m in body.messages],
        system_prompt=system_prompt,
    )
    return StreamingResponse(
        generator, media_type="text/event-stream", headers=_SSE_HEADERS
    )


@router.post("/instructions/stream")
async def stream_final_instructions(
    body: InstructionsStreamIn,
    current_user: dict = Depends(require_teacher),
    db=Depends(get_b2b_db),
):
    """Stream the final instruction paragraph for the summary."""

    subject_name = None
    if body.subject_id:
        subject_name = _get_subject_name(db, body.subject_id)

    system_prompt = build_final_instructions_prompt(
        document_type=body.document_type,
        subject_name=subject_name,
        year_level=body.year_level,
        curriculum_codes=body.curriculum_codes,
        num_questions=body.num_questions,
        difficulty=body.difficulty,
        template_id=body.template_id,
        pres_size=body.pres_size,
        pres_template=body.pres_template,
    )

    # Build conversation summary from history
    conversation_lines = []
    for msg in body.conversation_history:
        prefix = "Professor" if msg.role == "user" else "Lusia"
        conversation_lines.append(f"{prefix}: {msg.content}")
    conversation_summary = "\n".join(conversation_lines)

    generator = stream_instructions(
        conversation_summary=conversation_summary,
        system_prompt=system_prompt,
    )
    return StreamingResponse(
        generator, media_type="text/event-stream", headers=_SSE_HEADERS
    )
