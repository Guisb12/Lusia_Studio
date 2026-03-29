"""
Note generation service — artifact creation + async direct-generation pipeline.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from supabase import Client

from app.api.http.schemas.note_generation import NoteStartIn
from app.api.http.services.generation_context import assemble_generation_context
from app.core.config import settings
from app.core.database import get_b2b_db
from app.api.http.services.image_generation_service import build_image_prompt
from app.api.http.services.visual_generation_service import generate_visual
from app.pipeline.clients.openrouter import (
    chat_completion_text,
    chat_completion_text_stream,
    generate_image,
    parse_json_text,
)
from app.pipeline.steps.categorize_document import get_subject_name
from app.utils.db import parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parents[3] / "prompts" / "notes"
IMAGE_BUCKET = "documents"
NOTE_MODEL = settings.OPENROUTER_MODEL or "google/gemini-3-flash-preview"
DB_ALLOWED_JOB_STATUSES = {
    "pending",
    "parsing",
    "extracting_images",
    "structuring",
    "categorizing",
    "extracting_questions",
    "categorizing_questions",
    "converting_tiptap",
    "completed",
    "failed",
}
ALLOWED_CALLOUT_KINDS = {
    "definition",
    "key-idea",
    "example",
    "procedure",
    "warning",
    "tip",
    "question",
    "evidence",
    "summary",
}
ALLOWED_BLOCK_TYPES = {
    "heading",
    "paragraph",
    "list",
    "callout",
    "columns",
    "image",
    "svg",
}
STREAMABLE_BLOCK_TYPES = {"heading", "paragraph", "list", "callout"}
WIKILINK_RE = re.compile(r"!\[\[(.*?)\]\]|\[\[(.*?)(?:\|.*?)?\]\]")
SVG_RE = re.compile(r"<svg[\s\S]*?</svg>", re.IGNORECASE)
TITLE_RE = re.compile(r"<<TITLE>>(.*?)<<END_TITLE>>", re.DOTALL)
RAW_BLOCK_START_RE = re.compile(
    r"^\s*<<BLOCK_START\|(paragraph|heading)\|([A-Za-z0-9_-]+)(?:\|([1-4]))?>>\s*\n?",
    re.MULTILINE,
)
RAW_BLOCK_END_TEMPLATE = "<<BLOCK_END|{block_id}>>"


def _load_prompt_file(filename: str) -> str:
    return (PROMPTS_DIR / filename).read_text(encoding="utf-8")


def create_note_artifact(
    db: Client,
    org_id: str,
    user_id: str,
    payload: NoteStartIn,
) -> dict:
    subject_id = payload.subject_id
    year_level = payload.year_level
    subject_component = payload.subject_component
    curriculum_codes = payload.curriculum_codes

    if payload.upload_artifact_id and (
        not subject_id or not year_level or not curriculum_codes
    ):
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
            if not curriculum_codes:
                curriculum_codes = doc.get("curriculum_codes") or []
            if not subject_id and doc.get("subject_id"):
                subject_id = doc["subject_id"]
            if not year_level and doc.get("year_level"):
                year_level = doc["year_level"]
            if not subject_component and doc.get("subject_component"):
                subject_component = doc["subject_component"]

    if subject_id:
        subject_name = get_subject_name(db, subject_id) or "Apontamentos"
        artifact_name = f"Apontamentos · {subject_name}"
        if year_level:
            artifact_name += f" · {year_level}º ano"
    else:
        artifact_name = "Apontamentos"

    now = datetime.now(timezone.utc).isoformat()
    content = {
        "generation_params": {
            "prompt": payload.prompt,
            "upload_artifact_id": payload.upload_artifact_id,
            "curriculum_codes": curriculum_codes or [],
        },
        "blocks": [],
        "phase": "pending",
    }

    insert_data: dict[str, Any] = {
        "organization_id": org_id,
        "user_id": user_id,
        "artifact_type": "note",
        "artifact_name": artifact_name,
        "icon": "📝",
        "source_type": "native",
        "content": content,
        "subject_id": subject_id,
        "subject_ids": [subject_id] if subject_id else [],
        "year_level": year_level,
        "curriculum_codes": curriculum_codes or [],
        "is_processed": False,
        "processing_failed": False,
        "is_public": False,
        "created_at": now,
        "updated_at": now,
    }
    if subject_component:
        insert_data["subject_component"] = subject_component

    artifact_resp = supabase_execute(
        db.table("artifacts").insert(insert_data),
        entity="artifact",
    )
    artifact = parse_single_or_404(artifact_resp, entity="artifact")

    job_resp = supabase_execute(
        db.table("document_jobs").insert({
            "artifact_id": artifact["id"],
            "organization_id": org_id,
            "user_id": user_id,
            "status": "pending",
            "metadata": {"type": "note"},
        }),
        entity="document_job",
    )
    job = parse_single_or_404(job_resp, entity="document_job")
    artifact["job_id"] = job["id"]
    return artifact


async def generate_note_task(
    artifact_id: str,
    org_id: str,
    user_id: str,
    job_id: str,
    on_step_change=None,
    emit_event=None,
) -> None:
    db = get_b2b_db()
    artifact = _get_artifact(db, artifact_id)
    content = deepcopy(artifact.get("content") or {})
    gen_params = content.get("generation_params") or {}
    content.setdefault("blocks", [])
    persist_lock = asyncio.Lock()

    try:
        context = assemble_generation_context(
            db,
            subject_id=artifact.get("subject_id"),
            year_level=artifact.get("year_level"),
            subject_component=artifact.get("subject_component"),
            curriculum_codes=artifact.get("curriculum_codes"),
            upload_artifact_id=gen_params.get("upload_artifact_id"),
        )

        _update_job(
            db,
            job_id,
            "generating_note",
            "A gerar apontamentos...",
            on_step_change,
        )
        await _persist_note_state(
            db,
            artifact_id,
            content,
            phase="generating_note",
            blocks=content.get("blocks") or [],
            lock=persist_lock,
        )

        generator_prompt = _load_prompt_file("generator.md")
        svg_prompt = _load_prompt_file("svg_diagram.md")
        user_prompt = _build_generator_user_prompt(
            gen_params=gen_params,
            context=context,
            year_level=artifact.get("year_level"),
            subject_component=artifact.get("subject_component"),
        )

        blocks: list[dict[str, Any]] = []
        asset_tasks: list[asyncio.Task] = []
        dirty_block_ids: set[str] = set()
        buffer = ""
        top_index = 0
        raw_block_state: dict[str, Any] | None = None
        title_extracted = False

        async for chunk in chat_completion_text_stream(
            system_prompt=generator_prompt,
            user_prompt=user_prompt,
            temperature=0.3,
            max_tokens=65536,
            model=NOTE_MODEL,
        ):
            buffer += chunk

            # Extract title from the first line before blocks start
            if not title_extracted:
                title_match = TITLE_RE.search(buffer)
                if title_match:
                    title_extracted = True
                    note_title = title_match.group(1).strip()[:200]
                    if note_title:
                        supabase_execute(
                            db.table("artifacts")
                            .update({
                                "artifact_name": note_title,
                                "updated_at": datetime.now(timezone.utc).isoformat(),
                            })
                            .eq("id", artifact_id),
                            entity="artifact",
                        )
                        if emit_event:
                            emit_event({"type": "note_name", "name": note_title})
                    buffer = buffer[title_match.end():]
            buffer, top_index, raw_block_state = await _consume_stream_buffer(
                buffer=buffer,
                top_index=top_index,
                raw_block_state=raw_block_state,
                blocks=blocks,
                content=content,
                db=db,
                artifact_id=artifact_id,
                org_id=org_id,
                generator_prompt=svg_prompt,
                lock=persist_lock,
                emit_event=emit_event,
                asset_tasks=asset_tasks,
                dirty_block_ids=dirty_block_ids,
            )

        buffer, top_index, raw_block_state = await _consume_stream_buffer(
            buffer=buffer,
            top_index=top_index,
            raw_block_state=raw_block_state,
            blocks=blocks,
            content=content,
            db=db,
            artifact_id=artifact_id,
            org_id=org_id,
            generator_prompt=svg_prompt,
            lock=persist_lock,
            emit_event=emit_event,
            asset_tasks=asset_tasks,
            dirty_block_ids=dirty_block_ids,
            final_flush=True,
        )

        if buffer.strip():
            logger.warning("Discarding incomplete note stream tail for %s: %r", artifact_id, buffer[:200])

        # Text content is complete — notify frontend so it can unlock editing
        if emit_event:
            emit_event({"type": "content_ready"})

        if asset_tasks:
            await asyncio.gather(*asset_tasks)

        tiptap_json = _blocks_to_tiptap_json(blocks)
        markdown_content = _blocks_to_markdown(blocks)

        final_content = {
            **content,
            "blocks": deepcopy(blocks),
            "phase": "completed",
        }
        _update_artifact_success(
            db,
            artifact_id,
            final_content,
            tiptap_json,
            markdown_content,
        )
        _update_job_status(db, job_id, "completed")
    except Exception as exc:
        error_message = str(exc)[:1000]
        logger.exception("Note generation failed for %s", artifact_id)
        _update_artifact_failure(db, artifact_id, content, error_message)
        _update_job_failure(db, job_id, error_message)
        raise


def _get_artifact(db: Client, artifact_id: str) -> dict:
    response = supabase_execute(
        db.table("artifacts")
        .select("id,artifact_name,subject_id,year_level,subject_component,curriculum_codes,content")
        .eq("id", artifact_id)
        .limit(1),
        entity="artifact",
    )
    return parse_single_or_404(response, entity="artifact")


def _build_generator_user_prompt(
    *,
    gen_params: dict[str, Any],
    context: dict[str, Any],
    year_level: str | None,
    subject_component: str | None,
) -> str:
    base_content_lines = []
    for code, text in (context.get("base_content_by_code") or {}).items():
        trimmed = (text or "").strip()
        if trimmed:
            base_content_lines.append(f"[{code}]\n{trimmed[:4000]}")

    bank_questions = context.get("bank_questions") or []
    bank_summary = "\n".join(
        f"- {q.get('year') or ''} {q.get('question_type') or ''}: {(q.get('question_text') or '')[:220]}"
        for q in bank_questions[:8]
    )
    base_content_summary = "\n\n".join(base_content_lines)

    return f"""\
Objetivo do professor:
{gen_params.get("prompt", "").strip()}

Contexto:
- Disciplina: {context.get("subject_name") or "Sem disciplina específica"}
- Ano: {year_level or "N/A"}
- Componente: {subject_component or "N/A"}
- Tem exame nacional: {"sim" if context.get("has_national_exam") else "não"}

Árvore curricular:
{(context.get("curriculum_tree") or "").strip()[:15000] or "Sem árvore curricular."}

Conteúdo base por código:
{base_content_summary[:16000] or "Sem conteúdo base."}

Documento do professor:
{(context.get("document_content") or "").strip()[:18000] or "Sem documento anexado."}

Questões/banco de referência:
{bank_summary or "Sem banco relevante."}

Instruções adicionais:
- Gera um apontamento pronto para edição.
- Começa com uma estrutura clara e progressiva.
- Introduz callouts quando houver síntese, alerta, dica ou exemplo.
- Usa colunas apenas quando a comparação lado a lado fizer sentido pedagógico.
- Para blocos `image`, privilegia diagramas, pequenos infográficos e ilustrações educativas.
"""


def _parse_top_level_block(line: str, index: int) -> dict[str, Any] | None:
    stripped = line.strip()
    if not stripped:
        return None
    data = json.loads(stripped)
    return _normalize_block(data, path=f"b{index + 1}", allow_columns=True)


async def _consume_stream_buffer(
    *,
    buffer: str,
    top_index: int,
    raw_block_state: dict[str, Any] | None,
    blocks: list[dict[str, Any]],
    content: dict[str, Any],
    db: Client,
    artifact_id: str,
    org_id: str,
    generator_prompt: str,
    lock: asyncio.Lock,
    emit_event,
    asset_tasks: list[asyncio.Task],
    dirty_block_ids: set[str],
    final_flush: bool = False,
) -> tuple[str, int, dict[str, Any] | None]:
    while True:
        if raw_block_state:
            buffer, top_index, raw_block_state, progressed = await _consume_raw_block_buffer(
                buffer=buffer,
                top_index=top_index,
                raw_block_state=raw_block_state,
                blocks=blocks,
                content=content,
                db=db,
                artifact_id=artifact_id,
                lock=lock,
                emit_event=emit_event,
                dirty_block_ids=dirty_block_ids,
                final_flush=final_flush,
            )
            if not progressed:
                return buffer, top_index, raw_block_state
            continue

        trimmed = buffer.lstrip()
        consumed_prefix = len(buffer) - len(trimmed)
        if consumed_prefix:
            buffer = trimmed

        if not buffer:
            return "", top_index, raw_block_state

        match = RAW_BLOCK_START_RE.match(buffer)
        if match:
            block_type, block_id, level = match.groups()
            raw_block_state = {
                "id": block_id,
                "type": block_type,
                "level": int(level or 2),
            }
            top_index += 1
            block = _init_raw_stream_block(raw_block_state)
            blocks.append(block)
            dirty_block_ids.add(block["id"])
            content["blocks"] = deepcopy(blocks)
            await _persist_note_state(
                db,
                artifact_id,
                content,
                phase="generating_note",
                blocks=blocks,
                lock=lock,
            )
            if emit_event:
                emit_event({"type": block["type"], "block": deepcopy(block)})
            buffer = buffer[match.end():]
            continue

        json_entry, rest = _extract_next_json_entry(buffer)
        if json_entry is not None:
            top_index = await _consume_stream_line(
                line=json_entry,
                top_index=top_index,
                blocks=blocks,
                content=content,
                db=db,
                artifact_id=artifact_id,
                org_id=org_id,
                generator_prompt=generator_prompt,
                lock=lock,
                emit_event=emit_event,
                asset_tasks=asset_tasks,
                dirty_block_ids=dirty_block_ids,
            )
            buffer = rest
            continue

        return buffer, top_index, raw_block_state


async def _consume_raw_block_buffer(
    *,
    buffer: str,
    top_index: int,
    raw_block_state: dict[str, Any],
    blocks: list[dict[str, Any]],
    content: dict[str, Any],
    db: Client,
    artifact_id: str,
    lock: asyncio.Lock,
    emit_event,
    dirty_block_ids: set[str],
    final_flush: bool,
) -> tuple[str, int, dict[str, Any] | None, bool]:
    block_id = raw_block_state["id"]
    end_marker = RAW_BLOCK_END_TEMPLATE.format(block_id=block_id)
    marker_index = buffer.find(end_marker)

    if marker_index >= 0:
        delta_text = buffer[:marker_index]
        if delta_text:
            updated = _append_raw_block_delta(blocks, block_id, delta_text)
            if updated and emit_event:
                emit_event({"type": "block_delta", "block_id": block_id, "block": deepcopy(updated)})
        updated = _finalize_stream_block(blocks, block_id)
        if updated is not None:
            content["blocks"] = deepcopy(blocks)
            await _persist_note_state(
                db,
                artifact_id,
                content,
                phase="generating_note",
                blocks=blocks,
                lock=lock,
            )
            dirty_block_ids.discard(block_id)
            if emit_event:
                emit_event({"type": "block_commit", "block_id": block_id, "block": deepcopy(updated)})
        rest = buffer[marker_index + len(end_marker):]
        if rest.startswith("\n"):
            rest = rest[1:]
        return rest, top_index, None, True

    safe_text, remainder = _split_raw_text_safe_prefix(buffer, final_flush=final_flush)
    if safe_text:
        updated = _append_raw_block_delta(blocks, block_id, safe_text)
        if updated and emit_event:
            emit_event({"type": "block_delta", "block_id": block_id, "block": deepcopy(updated)})
        if final_flush and not remainder:
            updated = _finalize_stream_block(blocks, block_id)
            if updated is not None:
                content["blocks"] = deepcopy(blocks)
                await _persist_note_state(
                    db,
                    artifact_id,
                    content,
                    phase="generating_note",
                    blocks=blocks,
                    lock=lock,
                )
                dirty_block_ids.discard(block_id)
                if emit_event:
                    emit_event({"type": "block_commit", "block_id": block_id, "block": deepcopy(updated)})
            return "", top_index, None, True
        return remainder, top_index, raw_block_state, True

    return buffer, top_index, raw_block_state, False


def _split_raw_text_safe_prefix(buffer: str, *, final_flush: bool) -> tuple[str, str]:
    if final_flush:
        return buffer, ""
    marker_hint = buffer.rfind("<<")
    if marker_hint == -1:
        return buffer, ""
    if buffer.find(">>", marker_hint) != -1:
        return buffer, ""
    return buffer[:marker_hint], buffer[marker_hint:]


def _extract_next_json_entry(buffer: str) -> tuple[str | None, str]:
    if not buffer or buffer[0] != "{":
        return None, buffer

    depth = 0
    in_string = False
    escaped = False
    for index, char in enumerate(buffer):
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            continue
        if char == "{":
            depth += 1
            continue
        if char == "}":
            depth -= 1
            if depth == 0:
                return buffer[:index + 1], buffer[index + 1:]
    return None, buffer


def _init_raw_stream_block(state: dict[str, Any]) -> dict[str, Any]:
    if state["type"] == "heading":
        return {"id": state["id"], "type": "heading", "level": state.get("level", 2), "text": ""}
    return {"id": state["id"], "type": "paragraph", "markdown": ""}


def _append_raw_block_delta(
    blocks: list[dict[str, Any]],
    block_id: str,
    text: str,
) -> dict[str, Any] | None:
    block = _find_block_by_id(blocks, block_id)
    if not block:
        return None
    if block["type"] == "heading":
        block["text"] = (block.get("text") or "") + text
    elif block["type"] == "paragraph":
        block["markdown"] = (block.get("markdown") or "") + text
    return block


async def _consume_stream_line(
    *,
    line: str,
    top_index: int,
    blocks: list[dict[str, Any]],
    content: dict[str, Any],
    db: Client,
    artifact_id: str,
    org_id: str,
    generator_prompt: str,
    lock: asyncio.Lock,
    emit_event,
    asset_tasks: list[asyncio.Task],
    dirty_block_ids: set[str],
) -> int:
    stripped = line.strip()
    if not stripped:
        return top_index

    try:
        data = parse_json_text(stripped)
    except json.JSONDecodeError:
        logger.warning(
            "Skipping malformed note stream event for %s: %r",
            artifact_id,
            stripped[:400],
        )
        return top_index

    if not isinstance(data, dict):
        logger.warning(
            "Skipping non-object note stream event for %s: %r",
            artifact_id,
            stripped[:400],
        )
        return top_index

    event_type = str(data.get("event") or "").strip()

    if event_type == "block_start":
        top_index += 1
        block = _init_stream_block(data, top_index)
        blocks.append(block)
        dirty_block_ids.add(block["id"])
        content["blocks"] = deepcopy(blocks)
        await _persist_note_state(
            db,
            artifact_id,
            content,
            phase="generating_note",
            blocks=blocks,
            lock=lock,
        )
        if emit_event:
            emit_event({"type": block["type"], "block": deepcopy(block)})
        return top_index

    if event_type == "block_delta":
        block_id = str(data.get("id") or "").strip()
        if not block_id:
            return top_index
        updated = _apply_stream_delta(blocks, block_id, data)
        if updated is None:
            return top_index
        dirty_block_ids.add(block_id)
        if emit_event:
            emit_event({"type": "block_delta", "block_id": block_id, "block": deepcopy(updated)})
        return top_index

    if event_type == "block_commit":
        block_id = str(data.get("id") or "").strip()
        if not block_id:
            return top_index
        updated = _finalize_stream_block(blocks, block_id)
        if updated is None:
            return top_index
        content["blocks"] = deepcopy(blocks)
        await _persist_note_state(
            db,
            artifact_id,
            content,
            phase="generating_note",
            blocks=blocks,
            lock=lock,
        )
        dirty_block_ids.discard(block_id)
        if emit_event:
            emit_event({"type": "block_commit", "block_id": block_id, "block": deepcopy(updated)})
        return top_index

    parsed = _normalize_block(data, path=f"b{top_index + 1}", allow_columns=True)
    top_index += 1
    blocks.append(parsed)
    content["blocks"] = deepcopy(blocks)
    await _persist_note_state(
        db,
        artifact_id,
        content,
        phase="generating_note",
        blocks=blocks,
        lock=lock,
    )
    if emit_event:
        emit_event({"type": parsed["type"], "block": deepcopy(parsed)})
    asset_tasks.extend(
        _schedule_asset_generation_tasks(
            blocks=blocks,
            block=parsed,
            artifact_id=artifact_id,
            org_id=org_id,
            generator_prompt=generator_prompt,
            content=content,
            db=db,
            lock=lock,
            emit_event=emit_event,
        )
    )
    return top_index


def _init_stream_block(data: dict[str, Any], index: int) -> dict[str, Any]:
    block_type = str(data.get("block_type") or data.get("type") or "").strip()
    if block_type not in STREAMABLE_BLOCK_TYPES:
        raise ValueError(f"Tipo de bloco incremental não suportado: {block_type}")

    block_id = str(data.get("id") or f"b{index}").strip() or f"b{index}"

    if block_type == "heading":
        level = int(data.get("level") or 2)
        level = min(max(level, 1), 4)
        return {"id": block_id, "type": "heading", "level": level, "text": ""}

    if block_type == "paragraph":
        return {"id": block_id, "type": "paragraph", "markdown": ""}

    if block_type == "list":
        return {"id": block_id, "type": "list", "ordered": bool(data.get("ordered")), "items": [""]}

    kind = str(data.get("kind") or "info").strip().lower()
    if kind not in ALLOWED_CALLOUT_KINDS:
        kind = "info"
    return {
        "id": block_id,
        "type": "callout",
        "kind": kind,
        "title": "",
        "body_markdown": "",
    }


def _apply_stream_delta(
    blocks: list[dict[str, Any]],
    block_id: str,
    data: dict[str, Any],
) -> dict[str, Any] | None:
    block = _find_block_by_id(blocks, block_id)
    if not block:
        return None

    text = str(data.get("text") or "")
    if not text:
        return block

    if block["type"] == "heading" and str(data.get("field") or "text") == "text":
        block["text"] = (block.get("text") or "") + text
        return block

    if block["type"] == "paragraph" and str(data.get("field") or "markdown") == "markdown":
        block["markdown"] = (block.get("markdown") or "") + text
        return block

    if block["type"] == "callout":
        field = str(data.get("field") or "body_markdown")
        if field == "title":
            block["title"] = (block.get("title") or "") + text
        else:
            block["body_markdown"] = (block.get("body_markdown") or "") + text
        return block

    if block["type"] == "list":
        field = str(data.get("field") or "item")
        if field != "item":
            return block
        try:
            item_index = int(data.get("item_index") or 0)
        except (TypeError, ValueError):
            item_index = 0
        items = list(block.get("items") or [])
        while len(items) <= item_index:
            items.append("")
        items[item_index] = (items[item_index] or "") + text
        block["items"] = items
        return block

    return block


def _finalize_stream_block(blocks: list[dict[str, Any]], block_id: str) -> dict[str, Any] | None:
    block = _find_block_by_id(blocks, block_id)
    if not block:
        return None

    if block["type"] == "heading":
        block["text"] = _clean_text(block.get("text"))
    elif block["type"] == "paragraph":
        block["markdown"] = _clean_markdown(block.get("markdown"))
    elif block["type"] == "callout":
        block["title"] = _clean_text(block.get("title"))
        block["body_markdown"] = _clean_markdown(block.get("body_markdown"))
    elif block["type"] == "list":
        items = [_clean_markdown(item) for item in (block.get("items") or [])]
        block["items"] = [item for item in items if item]
        if not block["items"]:
            block["items"] = [" "]
    return block


def _normalize_block(data: dict[str, Any], *, path: str, allow_columns: bool) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("Bloco inválido: esperado objeto JSON.")

    block_type = str(data.get("type") or "").strip()
    if block_type not in ALLOWED_BLOCK_TYPES:
        raise ValueError(f"Tipo de bloco não suportado: {block_type}")

    block_id = str(data.get("id") or path)

    if block_type == "heading":
        text = _clean_text(data.get("text"))
        level = int(data.get("level") or 2)
        level = min(max(level, 1), 4)
        if not text:
            raise ValueError("Heading sem texto.")
        return {"id": block_id, "type": "heading", "level": level, "text": text}

    if block_type == "paragraph":
        markdown = _clean_markdown(data.get("markdown"))
        if not markdown:
            raise ValueError("Paragraph sem conteúdo.")
        return {"id": block_id, "type": "paragraph", "markdown": markdown}

    if block_type == "list":
        items = [_clean_markdown(item) for item in (data.get("items") or [])]
        items = [item for item in items if item]
        if not items:
            raise ValueError("List sem items.")
        return {
            "id": block_id,
            "type": "list",
            "ordered": bool(data.get("ordered")),
            "items": items,
        }

    if block_type == "callout":
        kind = str(data.get("kind") or "info").strip().lower()
        if kind not in ALLOWED_CALLOUT_KINDS:
            kind = "info"
        return {
            "id": block_id,
            "type": "callout",
            "kind": kind,
            "title": _clean_text(data.get("title")),
            "body_markdown": _clean_markdown(data.get("body_markdown")),
        }

    if block_type == "columns":
        if not allow_columns:
            raise ValueError("Columns aninhadas não são suportadas.")
        raw_columns = data.get("columns") or []
        if not isinstance(raw_columns, list) or len(raw_columns) != 2:
            raise ValueError("Columns tem de conter exatamente 2 colunas.")
        columns = []
        for column_index, raw_column in enumerate(raw_columns):
            if not isinstance(raw_column, list):
                raise ValueError("Cada coluna tem de ser uma lista de blocos.")
            normalized_column = []
            for block_index, child in enumerate(raw_column):
                normalized_column.append(
                    _normalize_block(
                        child,
                        path=f"{block_id}_c{column_index + 1}_{block_index + 1}",
                        allow_columns=False,
                    )
                )
            if not normalized_column:
                normalized_column.append({
                    "id": f"{block_id}_c{column_index + 1}_1",
                    "type": "paragraph",
                    "markdown": " ",
                })
            columns.append(normalized_column)
        return {
            "id": block_id,
            "type": "columns",
            "columns": columns,
        }

    return {
        "id": block_id,
        "type": block_type,
        "status": "pending",
        "image_type": str(data.get("image_type") or "diagram").strip().lower(),
        "style": str(data.get("style") or "illustration").strip().lower(),
        "prompt": _clean_text(data.get("prompt")),
        "src": _clean_text(data.get("src")) or None,
        "width": _coerce_width(data.get("width")),
        "align": _coerce_align(data.get("align")),
        "caption": _clean_text(data.get("caption")),
    }


def _schedule_asset_generation_tasks(
    *,
    blocks: list[dict[str, Any]],
    block: dict[str, Any],
    artifact_id: str,
    org_id: str,
    generator_prompt: str,
    content: dict[str, Any],
    db: Client,
    lock: asyncio.Lock,
    emit_event,
) -> list[asyncio.Task]:
    tasks: list[asyncio.Task] = []

    def walk(current: dict[str, Any]) -> None:
        block_type = current.get("type")
        if block_type == "image" and current.get("status") == "pending" and current.get("prompt"):
            tasks.append(asyncio.create_task(
                _generate_asset_and_patch(
                    blocks=blocks,
                    current=current,
                    artifact_id=artifact_id,
                    org_id=org_id,
                    svg_system_prompt=generator_prompt,
                    content=content,
                    db=db,
                    lock=lock,
                    emit_event=emit_event,
                )
            ))
            return
        if block_type == "columns":
            for column in current.get("columns") or []:
                for child in column:
                    walk(child)

    walk(block)
    return tasks


async def _generate_asset_and_patch(
    *,
    blocks: list[dict[str, Any]],
    current: dict[str, Any],
    artifact_id: str,
    org_id: str,
    svg_system_prompt: str,
    content: dict[str, Any],
    db: Client,
    lock: asyncio.Lock,
    emit_event,
) -> None:
    block_id = current["id"]
    prompt = current.get("prompt") or ""
    try:
        if current["type"] == "image":
            full_prompt = build_image_prompt(
                image_type=current.get("image_type") or "diagram",
                style=current.get("style") or "illustration",
                content_prompt=prompt,
            )
            image_bytes = await generate_image(
                prompt=full_prompt,
                aspect_ratio="4:3",
                image_size="0.5K",
            )
            filename = f"{block_id}.png"
            content_type = "image/png"
            storage_path = f"{org_id}/{artifact_id}/images/{filename}"
            db.storage.from_(IMAGE_BUCKET).upload(
                storage_path,
                image_bytes,
                {"content-type": content_type, "upsert": "true", "cache-control": "3600"},
            )
        else:
            visual_html = await generate_visual(
                visual_type="illustrative_svg",
                prompt=prompt,
                layout="note",
            )
            filename = f"{block_id}.html"
            content_type = "text/html"
            storage_path = f"{org_id}/{artifact_id}/images/{filename}"
            db.storage.from_(IMAGE_BUCKET).upload(
                storage_path,
                visual_html.encode("utf-8"),
                {"content-type": content_type, "upsert": "true", "cache-control": "3600"},
            )

        patched = _patch_block_by_id(
            blocks,
            block_id,
            {
                "status": "completed",
                "src": f"/api/artifacts/{artifact_id}/images/{filename}",
            },
        )
        if not patched:
            return
        content["blocks"] = deepcopy(blocks)
        await _persist_note_state(
            db,
            artifact_id,
            content,
            phase="generating_note",
            blocks=blocks,
            lock=lock,
        )
        updated = _find_block_by_id(blocks, block_id)
        if emit_event and updated:
            emit_event({
                "type": "asset_ready",
                "block_id": block_id,
                "block": deepcopy(updated),
            })
    except Exception as exc:
        logger.warning("Asset generation failed for note block %s: %s", block_id, exc)
        patched = _patch_block_by_id(
            blocks,
            block_id,
            {"status": "failed"},
        )
        if patched:
            content["blocks"] = deepcopy(blocks)
            await _persist_note_state(
                db,
                artifact_id,
                content,
                phase="generating_note",
                blocks=blocks,
                lock=lock,
            )
            updated = _find_block_by_id(blocks, block_id)
            if emit_event and updated:
                emit_event({
                    "type": "asset_ready",
                    "block_id": block_id,
                    "block": deepcopy(updated),
                })


async def _persist_note_state(
    db: Client,
    artifact_id: str,
    content: dict[str, Any],
    *,
    phase: str,
    blocks: list[dict[str, Any]],
    lock: asyncio.Lock,
) -> None:
    async with lock:
        persisted_content = {
            **content,
            "phase": phase,
            "blocks": deepcopy(blocks),
        }
        supabase_execute(
            db.table("artifacts")
            .update({
                "content": persisted_content,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", artifact_id),
            entity="artifact",
        )


def _update_job(
    db: Client,
    job_id: str,
    status: str,
    label: str,
    notify,
) -> None:
    _update_job_status(db, job_id, status)
    if notify:
        notify(status, label)


def _update_job_status(db: Client, job_id: str, status: str) -> None:
    persisted_status = status if status in DB_ALLOWED_JOB_STATUSES else "pending"
    values: dict[str, Any] = {"status": persisted_status}
    if status not in DB_ALLOWED_JOB_STATUSES:
        values["step_label"] = status
        values["current_step"] = status
    if status == "completed":
        values["completed_at"] = datetime.now(timezone.utc).isoformat()
    supabase_execute(
        db.table("document_jobs").update(values).eq("id", job_id),
        entity="document_job",
    )


def _update_job_failure(db: Client, job_id: str, error_message: str) -> None:
    supabase_execute(
        db.table("document_jobs")
        .update({
            "status": "failed",
            "error_message": error_message,
        })
        .eq("id", job_id),
        entity="document_job",
    )


def _update_artifact_success(
    db: Client,
    artifact_id: str,
    content: dict[str, Any],
    tiptap_json: dict[str, Any],
    markdown_content: str,
) -> None:
    supabase_execute(
        db.table("artifacts")
        .update({
            "content": content,
            "tiptap_json": tiptap_json,
            "markdown_content": markdown_content,
            "is_processed": True,
            "processing_failed": False,
            "processing_error": None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", artifact_id),
        entity="artifact",
    )


def _update_artifact_failure(
    db: Client,
    artifact_id: str,
    content: dict[str, Any],
    error_message: str,
) -> None:
    failed_content = {
        **content,
        "phase": "failed",
    }
    supabase_execute(
        db.table("artifacts")
        .update({
            "content": failed_content,
            "processing_failed": True,
            "processing_error": error_message,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", artifact_id),
        entity="artifact",
    )


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return text[:4000]


def _clean_markdown(value: Any) -> str:
    text = _clean_text(value)
    if not text:
        return ""
    return WIKILINK_RE.sub(lambda m: m.group(1) or m.group(2) or "", text)


def _coerce_width(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        width = int(value)
    except (TypeError, ValueError):
        return None
    return min(max(width, 120), 1200)


def _coerce_align(value: Any) -> str:
    align = str(value or "center").strip().lower()
    if align not in {"left", "center", "right"}:
        return "center"
    return align


def _find_block_by_id(blocks: list[dict[str, Any]], block_id: str) -> dict[str, Any] | None:
    for block in blocks:
        if block.get("id") == block_id:
            return block
        if block.get("type") == "columns":
            for column in block.get("columns") or []:
                found = _find_block_by_id(column, block_id)
                if found:
                    return found
    return None


def _patch_block_by_id(
    blocks: list[dict[str, Any]],
    block_id: str,
    patch: dict[str, Any],
) -> bool:
    for block in blocks:
        if block.get("id") == block_id:
            block.update(patch)
            return True
        if block.get("type") == "columns":
            for column in block.get("columns") or []:
                if _patch_block_by_id(column, block_id, patch):
                    return True
    return False


def _blocks_to_tiptap_json(blocks: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": "doc",
        "content": _blocks_to_tiptap_nodes(blocks) or [{"type": "paragraph"}],
    }


def _blocks_to_tiptap_nodes(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    for block in blocks:
        block_type = block["type"]
        if block_type == "heading":
            nodes.append({
                "type": "heading",
                "attrs": {"level": block.get("level", 2)},
                "content": [{"type": "text", "text": block.get("text") or " "}],
            })
            continue

        if block_type == "paragraph":
            nodes.extend(_markdown_to_tiptap_nodes(block.get("markdown") or ""))
            continue

        if block_type == "list":
            list_type = "orderedList" if block.get("ordered") else "bulletList"
            items = []
            for item in block.get("items") or []:
                item_content = _markdown_to_tiptap_nodes(item)
                paragraph = item_content[0] if item_content and item_content[0]["type"] == "paragraph" else {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": item}],
                }
                items.append({"type": "listItem", "content": [paragraph]})
            nodes.append({"type": list_type, "content": items})
            continue

        if block_type == "callout":
            body = _markdown_to_tiptap_nodes(block.get("body_markdown") or "")
            nodes.append({
                "type": "callout",
                "attrs": {
                    "kind": block.get("kind") or "info",
                    "title": block.get("title") or "",
                },
                "content": body or [{"type": "paragraph"}],
            })
            continue

        if block_type == "columns":
            nodes.append({
                "type": "columns",
                "attrs": {"columnCount": 2},
                "content": [
                    {
                        "type": "column",
                        "content": _blocks_to_tiptap_nodes(column) or [{"type": "paragraph"}],
                    }
                    for column in (block.get("columns") or [[], []])
                ],
            })
            continue

        if block_type in {"image", "svg"}:
            if block.get("src"):
                image_attrs: dict[str, Any] = {
                    "src": block["src"],
                    "align": block.get("align") or "center",
                    "caption": block.get("caption") or "",
                }
                if block.get("width"):
                    image_attrs["width"] = block["width"]
                nodes.append({"type": "image", "attrs": image_attrs})
            else:
                nodes.append({
                    "type": "paragraph",
                    "content": [{
                        "type": "text",
                        "text": "A gerar imagem...",
                    }],
                })
    return nodes


def _markdown_to_tiptap_nodes(markdown: str) -> list[dict[str, Any]]:
    from app.pipeline.steps.convert_tiptap import convert_markdown_to_tiptap

    doc = convert_markdown_to_tiptap(markdown, artifact_id="note-generated")
    return doc.get("content") or [{"type": "paragraph"}]


def _blocks_to_markdown(blocks: list[dict[str, Any]]) -> str:
    parts = [_block_to_markdown(block) for block in blocks]
    return "\n\n".join(part for part in parts if part.strip()).strip()


def _block_to_markdown(block: dict[str, Any]) -> str:
    block_type = block["type"]
    if block_type == "heading":
        return f"{'#' * int(block.get('level') or 2)} {block.get('text') or ''}".strip()
    if block_type == "paragraph":
        return block.get("markdown") or ""
    if block_type == "list":
        marker = "1." if block.get("ordered") else "-"
        return "\n".join(f"{marker} {item}" for item in (block.get("items") or []))
    if block_type == "callout":
        title = block.get("title") or ""
        header = f"> [!{block.get('kind') or 'info'}]"
        if title:
            header += f" {title}"
        body = "\n".join(
            f"> {line}" if line else ">"
            for line in (block.get("body_markdown") or "").splitlines()
        )
        return "\n".join(part for part in [header, body] if part.strip())
    if block_type == "columns":
        payload = {
            "columns": [
                {"markdown": _blocks_to_markdown(column)}
                for column in (block.get("columns") or [[], []])
            ]
        }
        return "```note-columns\n" + json.dumps(payload, ensure_ascii=False, indent=2) + "\n```"
    if block_type in {"image", "svg"}:
        src = block.get("src") or ""
        width = block.get("width")
        align = block.get("align")
        segments = [src]
        if width:
            segments.append(str(width))
        if align:
            segments.append(align)
        image_line = f"![[{'|'.join(segments)}]]"
        caption = block.get("caption") or ""
        return f"{image_line}\n\n_{caption}_" if caption else image_line
    return ""
