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


def _get_curriculum_context(
    db, subject_id: str, year_level: str,
    subject_component: str | None, selected_codes: list[str],
) -> str:
    """Fetch the actual curriculum content for the selected codes.

    1. Find all curriculum nodes matching the selected codes
    2. Find their leaf descendants (has_children=false)
    3. Fetch base_content for those leaves
    4. Format as structured text
    """
    import json as _json
    from app.utils.db import supabase_execute

    if not selected_codes:
        return ""

    # 1. Fetch all nodes matching selected codes
    nodes_resp = supabase_execute(
        db.table("curriculum")
        .select("id, code, title, level, has_children, subject_component")
        .eq("subject_id", subject_id)
        .eq("year_level", year_level)
        .in_("code", selected_codes)
        .order("code"),
        entity="curriculum",
    )
    selected_nodes = nodes_resp.data or []
    if not selected_nodes:
        return "\n".join(f"- {c}" for c in selected_codes)

    # 2. For each selected node, find leaf descendants
    all_leaf_ids: list[str] = []
    leaf_to_parent: dict[str, str] = {}  # leaf_id → parent code/title for context

    for node in selected_nodes:
        code = node["code"]
        title = node.get("title", code)
        node_id = node["id"]

        if not node.get("has_children", False):
            # This IS a leaf
            all_leaf_ids.append(node_id)
            leaf_to_parent[node_id] = f"{code} — {title}"
        else:
            # Find leaf descendants by code prefix
            leaf_query = (
                db.table("curriculum")
                .select("id, code, title")
                .like("code", f"{code}%")
                .eq("subject_id", subject_id)
                .eq("year_level", year_level)
                .eq("has_children", False)
                .order("code")
            )
            if subject_component:
                leaf_query = leaf_query.eq("subject_component", subject_component)
            leaf_resp = supabase_execute(leaf_query, entity="curriculum")
            for leaf in (leaf_resp.data or []):
                all_leaf_ids.append(leaf["id"])
                leaf_to_parent[leaf["id"]] = f"{leaf.get('code', '')} — {leaf.get('title', '')}"

    if not all_leaf_ids:
        # Fallback: just show codes and titles
        return "\n".join(
            f"- [{n['code']}] {n.get('title', '')}" for n in selected_nodes
        )

    # 3. Fetch base_content for all leaves
    content_resp = supabase_execute(
        db.table("base_content")
        .select("curriculum_id, content_json")
        .in_("curriculum_id", all_leaf_ids),
        entity="base_content",
    )
    content_by_id = {
        row["curriculum_id"]: row.get("content_json", {})
        for row in (content_resp.data or [])
    }

    # 4. Format as readable text
    parts: list[str] = []
    for node in selected_nodes:
        code = node["code"]
        title = node.get("title", code)
        parts.append(f"## {code} — {title}\n")

    # Add leaf content
    for leaf_id in all_leaf_ids:
        label = leaf_to_parent.get(leaf_id, "")
        content_json = content_by_id.get(leaf_id)
        if not content_json:
            parts.append(f"### {label}\n_Sem conteúdo disponível._\n")
            continue

        if isinstance(content_json, str):
            try:
                content_json = _json.loads(content_json)
            except (ValueError, TypeError):
                parts.append(f"### {label}\n{content_json}\n")
                continue

        # Extract text from content_json
        text = _extract_content_text(content_json)
        if text.strip():
            parts.append(f"### {label}\n{text}\n")
        else:
            parts.append(f"### {label}\n_Sem conteúdo disponível._\n")

    return "\n".join(parts)


def _extract_content_text(content_json: dict) -> str:
    """Extract readable text from a base_content content_json structure."""
    parts: list[str] = []

    title = content_json.get("title", "")
    if title:
        parts.append(title)

    # Try common content structures
    sections = content_json.get("sections") or []
    if isinstance(sections, list):
        for section in sections:
            if isinstance(section, dict):
                s_title = section.get("title", "")
                s_body = section.get("body", "")
                if s_title:
                    parts.append(f"**{s_title}**")
                if s_body:
                    parts.append(s_body)
            elif isinstance(section, str):
                parts.append(section)

    # Fallback: try body or text directly
    body = content_json.get("body") or content_json.get("text") or ""
    if body and not sections:
        parts.append(body)

    return "\n\n".join(parts)


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

        # Build user settings string from hardcoded choices
        settings_parts = []
        if body.num_questions:
            settings_parts.append(f"- Número de questões: {body.num_questions}")
        if body.difficulty:
            diff_labels = {"easy": "Fácil", "medium": "Média", "hard": "Difícil",
                           "Fácil": "Fácil", "Médio": "Média", "Difícil": "Difícil"}
            settings_parts.append(f"- Dificuldade: {diff_labels.get(body.difficulty, body.difficulty)}")
        if body.template_id:
            ws_templates = {
                "quick": "Mini Ficha (~15 min, questões fechadas e rápidas)",
                "practice": "Ficha de Trabalho (~45-60 min, questões mistas)",
                "exam": "Ficha de Exame (~90-120 min, estrutura completa com critérios)",
            }
            settings_parts.append(f"- Formato: {ws_templates.get(body.template_id, body.template_id)}")
        if body.pres_template:
            pres_templates = {
                "explicative": "Explicativo (apresentação longa e estruturada, cobertura completa do tema)",
                "interactive_explanation": "Explicação Interativa (1-5 slides práticos, exploração hands-on)",
            }
            settings_parts.append(f"- Formato: {pres_templates.get(body.pres_template, body.pres_template)}")
        user_settings = "\n".join(settings_parts)

        # Build curriculum context from selected codes
        curriculum_context = ""
        if body.selected_codes and body.subject_id and body.year_level:
            curriculum_context = _get_curriculum_context(
                db, body.subject_id, body.year_level,
                body.subject_component, body.selected_codes,
            )
        elif body.content_summary:
            curriculum_context = body.content_summary

        # Build document context
        document_context = ""
        if body.upload_artifact_id:
            document_context = _get_document_summary(db, body.upload_artifact_id)

        system_prompt = build_instructions_prompt(
            document_type=body.document_type,
            subject_name=subject_name,
            year_level=body.year_level,
            user_settings=user_settings,
            curriculum_context=curriculum_context,
            document_context=document_context,
            pres_template=body.pres_template,
        )

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
