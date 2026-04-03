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
from app.api.http.services.image_generation_service import normalize_image_style
from app.api.http.services.visual_generation_service import generate_visual
from app.pipeline.clients.openrouter import (
    chat_completion_text_stream,
    generate_image,
)
from app.pipeline.steps.categorize_document import get_subject_name
from app.utils.db import parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parents[3] / "prompts" / "notes"
FRONTEND_PUBLIC_DIR = Path(__file__).resolve().parents[5] / "LUSIA Studio - Frontend" / "public"
ROUGHJS_ASSET_PATH = FRONTEND_PUBLIC_DIR / "roughjs" / "rough.js"
IMAGE_BUCKET = "documents"
NOTE_MODEL = settings.OPENROUTER_MODEL or "google/gemini-3-flash-preview"
NOTE_THINKING_MODEL = "@preset/gemini-3-flash-thinking"
IMAGE_GENERATING_SRC = "__generating__"
VISUAL_GENERATING_SRC = "__visual_generating__"
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
    "visual",
    "svg",
}
WIKILINK_RE = re.compile(r"!\[\[(.*?)\]\]|\[\[(.*?)(?:\|.*?)?\]\]")
SVG_RE = re.compile(r"<svg[\s\S]*?</svg>", re.IGNORECASE)
NUMBERED_HEADING_RE = re.compile(r"\d+\.\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]")
ROUGH_SCRIPT_TAG_RE = re.compile(
    r'<script\s+src=["\'](?:https://cdn\.jsdelivr\.net/npm/roughjs@[^"\']+/bundled/rough(?:\.min)?\.js|/roughjs/rough\.js|/local-roughjs-path\.js)["\']\s*>\s*</script>',
    re.IGNORECASE,
)

NOTE_VISUAL_IFRAME_HTML = """<!doctype html>
<html lang="pt-PT">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        background: #ffffff;
        overflow: hidden;
      }
      .sl-canvas {
        --sl-color-primary: #15316b;
        --sl-color-muted: #6b7a8d;
        --sl-color-background: #ffffff;
        --sl-color-surface: #f8f7f4;
        --sl-color-border: rgba(21, 49, 107, 0.12);
        --sl-color-success: #10b981;
        --sl-color-error: #ef4444;
        --sl-color-success-soft: rgba(16, 185, 129, 0.08);
        --sl-color-error-soft: rgba(239, 68, 68, 0.08);
        --sl-font-family: 'Satoshi', system-ui, sans-serif;
        --sl-font-family-serif: 'InstrumentSerif', Georgia, serif;
        --sl-radius: 12px;
        --sl-radius-sm: 8px;
        --sl-radius-lg: 16px;
        --sl-color-accent: #0a1bb6;
        --sl-color-accent-soft: rgba(10, 27, 182, 0.08);
        width: 100%;
        height: 100%;
        background: var(--sl-color-background);
        font-family: var(--sl-font-family);
        color: var(--sl-color-primary);
        overflow: hidden;
        position: relative;
        box-sizing: border-box;
      }
      .sl-canvas,
      .sl-canvas *,
      .sl-canvas *::before,
      .sl-canvas *::after {
        box-sizing: border-box;
      }
      .sl-canvas .sl-body {
        font-size: 21px;
        font-weight: 400;
        color: var(--sl-color-primary);
        line-height: 1.6;
        margin: 0;
        font-family: var(--sl-font-family);
      }
      .sl-canvas .sl-caption {
        font-size: 18px;
        font-weight: 400;
        color: var(--sl-color-muted);
        line-height: 1.5;
        margin: 0;
        font-family: var(--sl-font-family);
      }
      .sl-canvas .sl-label {
        font-size: 14px;
        font-weight: 500;
        color: var(--sl-color-muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        line-height: 1.4;
        margin: 0;
        font-family: var(--sl-font-family);
      }
      .sl-canvas .sl-container {
        background: #ffffff;
        border: 2px solid var(--sl-color-border);
        border-radius: var(--sl-radius-lg);
        padding: 24px 28px;
      }
      .sl-canvas .sl-container > * {
        position: relative;
        z-index: 1;
      }
      .sl-canvas .sl-container-accent {
        background: var(--sl-color-accent-soft);
        border: 1.5px solid var(--sl-color-accent);
        border-bottom-width: 3px;
        border-radius: var(--sl-radius-lg);
        padding: 24px 28px;
      }
      .sl-canvas .sl-container-accent > * {
        position: relative;
        z-index: 1;
      }
      .sl-canvas .sl-controls {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding-top: 16px;
      }
      .sl-canvas .sl-slider-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .sl-canvas .sl-slider-row .sl-label {
        min-width: 80px;
      }
      .sl-canvas .sl-slider-row input[type="range"] {
        flex: 1;
        accent-color: var(--sl-color-accent);
      }
      .sl-canvas .sl-info-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 12px;
        width: 100%;
      }
      .sl-canvas .sl-info-card {
        background: var(--sl-color-accent-soft);
        border-radius: 16px;
        padding: 16px 20px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        border: 1.5px solid var(--sl-color-accent);
        border-bottom-width: 3px;
        position: relative;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
      }
      .sl-canvas .sl-info-card .sl-caption {
        font-size: 11px;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        color: var(--sl-color-accent);
        font-weight: 600;
        opacity: 0.7;
        position: relative;
        z-index: 1;
      }
      .sl-canvas .sl-info-card .sl-body {
        font-weight: 600;
        color: var(--sl-color-primary);
        position: relative;
        z-index: 1;
      }
      .sl-canvas .sl-visual {
        width: 100%;
        min-height: 100%;
      }
      .sl-canvas svg {
        max-width: 100%;
        height: auto;
      }
      iframe, svg {
        display: block;
      }
    </style>
  </head>
  <body>
    <div class="sl-canvas">__NOTE_VISUAL_CONTENT__</div>
  </body>
</html>
"""

_roughjs_inline_cache: str | None = None


def _load_roughjs_inline_source() -> str:
    global _roughjs_inline_cache
    if _roughjs_inline_cache is None:
        _roughjs_inline_cache = ROUGHJS_ASSET_PATH.read_text(encoding="utf-8")
    return _roughjs_inline_cache


def _inline_note_visual_runtime(html: str) -> str:
    """Inline Rough.js so srcDoc visuals do not depend on loading external scripts."""
    if "rough" not in html.lower():
        return html
    inline_tag = f"<script>{_load_roughjs_inline_source()}</script>"
    return ROUGH_SCRIPT_TAG_RE.sub(lambda _match: inline_tag, html)


def _wrap_note_visual_html(html: str) -> str:
    """Wrap visual snippets in a standalone HTML document for iframe rendering."""
    return NOTE_VISUAL_IFRAME_HTML.replace(
        "__NOTE_VISUAL_CONTENT__",
        _inline_note_visual_runtime(html),
    )


def _note_visual_src(artifact_id: str, block_id: str) -> str:
    return f"/api/artifacts/{artifact_id}/visuals/{block_id}.html"


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
        "icon": None,
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

        parser = _MarkdownStreamParser()
        blocks: list[dict[str, Any]] = []
        asset_tasks: list[asyncio.Task] = []
        top_index = 0

        async for chunk in chat_completion_text_stream(
            system_prompt=generator_prompt,
            user_prompt=user_prompt,
            temperature=0.3,
            max_tokens=65536,
            model=NOTE_THINKING_MODEL,
        ):
            events = parser.feed(chunk)
            top_index = await _handle_parser_events(
                events=events,
                top_index=top_index,
                blocks=blocks,
                content=content,
                db=db,
                artifact_id=artifact_id,
                org_id=org_id,
                svg_prompt=svg_prompt,
                lock=persist_lock,
                emit_event=emit_event,
                asset_tasks=asset_tasks,
            )

        events = parser.flush()
        top_index = await _handle_parser_events(
            events=events,
            top_index=top_index,
            blocks=blocks,
            content=content,
            db=db,
            artifact_id=artifact_id,
            org_id=org_id,
            svg_prompt=svg_prompt,
            lock=persist_lock,
            emit_event=emit_event,
            asset_tasks=asset_tasks,
        )

        # Text content is complete — notify frontend so it can unlock editing
        if emit_event:
            emit_event({"type": "content_ready"})

        if asset_tasks:
            await asyncio.gather(*asset_tasks)

        blocks = _sanitize_final_note_blocks(blocks)
        content["blocks"] = deepcopy(blocks)
        tiptap_json = _blocks_to_tiptap_json(blocks, artifact_id)
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


class _MarkdownStreamParser:
    """
    Incremental markdown → internal blocks parser for streaming note generation.

    Feed text chunks via .feed(chunk) → returns list of events.
    Call .flush() at the end to finalize any open block.

    Event types emitted:
      note_name:    {"type": "note_name", "name": str}
      block_start:  {"type": "block_start", "block": dict}
      block_delta:  {"type": "block_delta", "block_id": str, "block": dict}
      block_commit: {"type": "block_commit", "block_id": str, "block": dict}
      block_emit:   {"type": "block_emit", "block": dict}  — complete block, no streaming
    """

    _HEADING_RE = re.compile(r"^(#{1,4})\s+(.+)")
    _CALLOUT_OPEN_RE = re.compile(r"^>\s*\[!([\w-]+)\]\s*(.*)")
    _CALLOUT_CONT_RE = re.compile(r"^>")
    _FENCE_OPEN_RE = re.compile(r"^```(note-columns|note-visual|note-image)\s*$")
    _FENCE_CLOSE_RE = re.compile(r"^```\s*$")
    _ORDERED_ITEM_RE = re.compile(r"^\d+\.\s+(.*)")
    _BULLET_ITEM_RE = re.compile(r"^[-*]\s+(.*)")

    def __init__(self) -> None:
        self._partial = ""
        self._counter = 0
        self._state = "idle"   # idle | paragraph | list | callout | fence
        self._cur: dict | None = None
        self._fence_type = ""
        self._fence_lines: list[str] = []
        self._list_items: list[str] = []
        self._list_ordered = False
        self._callout_kind = ""
        self._callout_title = ""
        self._callout_body: list[str] = []
        self._title_done = False

    def _next_id(self) -> str:
        self._counter += 1
        return f"b{self._counter}"

    def feed(self, chunk: str) -> list[dict]:
        events: list[dict] = []
        data = self._partial + chunk
        lines = data.split("\n")
        self._partial = lines[-1]
        for line in lines[:-1]:
            self._process_line(line, events)
        return events

    def flush(self) -> list[dict]:
        events: list[dict] = []
        if self._partial:
            self._process_line(self._partial, events)
            self._partial = ""
        self._close_any(events)
        return events

    # ── Line dispatcher ──────────────────────────────────────────────────────

    def _process_line(self, line: str, events: list[dict]) -> None:
        stripped = line.strip()

        # ── Fence mode ───────────────────────────────────────────────────────
        if self._state == "fence":
            if self._FENCE_CLOSE_RE.match(stripped) and stripped == "```":
                self._close_fence(events)
            else:
                self._fence_lines.append(line)
            return

        # ── Callout mode ─────────────────────────────────────────────────────
        if self._state == "callout":
            if self._CALLOUT_CONT_RE.match(line):
                self._callout_body.append(re.sub(r"^>\s?", "", line))
                return
            if not stripped:
                # Blank line only closes the callout if body content has
                # already started. If body is still empty, the model put a
                # blank line between the title and the body — keep waiting.
                if self._callout_body:
                    self._close_callout(events)
                return
            # Non-prefixed line that is NOT a new block type: treat as body
            # continuation (model output body without leading `>`).
            if not (self._HEADING_RE.match(stripped)
                    or self._CALLOUT_OPEN_RE.match(line)
                    or self._FENCE_OPEN_RE.match(stripped)):
                self._callout_body.append(line)
                return
            self._close_callout(events)
            self._process_line(line, events)
            return

        # ── List mode ────────────────────────────────────────────────────────
        if self._state == "list":
            b = self._BULLET_ITEM_RE.match(stripped)
            o = self._ORDERED_ITEM_RE.match(stripped)
            if b or o:
                self._list_items.append((b or o).group(1))
                return
            self._close_list(events)
            if stripped:
                self._process_line(line, events)
            return

        # ── Paragraph mode ───────────────────────────────────────────────────
        if self._state == "paragraph":
            if not stripped:
                self._close_paragraph(events)
                return
            # New block type mid-paragraph → close first
            if (self._HEADING_RE.match(stripped)
                    or self._CALLOUT_OPEN_RE.match(line)
                    or self._FENCE_OPEN_RE.match(stripped)):
                self._close_paragraph(events)
                self._process_line(line, events)
                return
            cur = self._cur
            prev = cur.get("markdown") or ""
            cur["markdown"] = prev + ("\n" if prev else "") + line
            events.append({"type": "block_delta", "block_id": cur["id"], "block": deepcopy(cur)})
            return

        # ── Idle: detect new block ────────────────────────────────────────────
        if not stripped:
            return

        # Title: first H1 becomes the note name
        if stripped.startswith("# ") and not self._title_done:
            self._title_done = True
            events.append({"type": "note_name", "name": stripped[2:].strip()[:200]})
            return

        # Heading H2–H4
        h = self._HEADING_RE.match(stripped)
        if h:
            level = len(h.group(1))
            text = h.group(2).strip()
            block = {"id": self._next_id(), "type": "heading", "level": level, "text": ""}
            events.append({"type": "block_start", "block": deepcopy(block)})
            block["text"] = text
            events.append({"type": "block_delta", "block_id": block["id"], "block": deepcopy(block)})
            events.append({"type": "block_commit", "block_id": block["id"], "block": deepcopy(block)})
            return

        # Callout
        c = self._CALLOUT_OPEN_RE.match(line)
        if c:
            self._callout_kind = c.group(1).lower()
            self._callout_title = c.group(2).strip()
            self._callout_body = []
            self._state = "callout"
            return

        # Fence
        f = self._FENCE_OPEN_RE.match(stripped)
        if f:
            self._fence_type = f.group(1)
            self._fence_lines = []
            self._state = "fence"
            return

        # List
        b = self._BULLET_ITEM_RE.match(stripped)
        o = self._ORDERED_ITEM_RE.match(stripped)
        if b or o:
            self._list_ordered = bool(o)
            self._list_items = [(b or o).group(1)]
            self._state = "list"
            return

        # Paragraph (everything else)
        block = {"id": self._next_id(), "type": "paragraph", "markdown": ""}
        self._cur = block
        self._state = "paragraph"
        events.append({"type": "block_start", "block": deepcopy(block)})
        block["markdown"] = line
        events.append({"type": "block_delta", "block_id": block["id"], "block": deepcopy(block)})

    # ── Block closers ────────────────────────────────────────────────────────

    def _close_paragraph(self, events: list[dict]) -> None:
        block = self._cur
        if block:
            block["markdown"] = _clean_markdown(block.get("markdown") or "")
            events.append({"type": "block_commit", "block_id": block["id"], "block": deepcopy(block)})
        self._cur = None
        self._state = "idle"

    def _close_list(self, events: list[dict]) -> None:
        items = [_clean_markdown(i) for i in self._list_items if _clean_markdown(i)]
        if items:
            events.append({"type": "block_emit", "block": {
                "id": self._next_id(),
                "type": "list",
                "ordered": self._list_ordered,
                "items": items,
            }})
        self._list_items = []
        self._state = "idle"

    def _close_callout(self, events: list[dict]) -> None:
        kind = self._callout_kind or "info"
        if kind not in ALLOWED_CALLOUT_KINDS:
            kind = "info"
        events.append({"type": "block_emit", "block": {
            "id": self._next_id(),
            "type": "callout",
            "kind": kind,
            "title": _clean_text(self._callout_title),
            "body_markdown": _clean_markdown("\n".join(self._callout_body)),
        }})
        self._callout_kind = ""
        self._callout_title = ""
        self._callout_body = []
        self._state = "idle"

    def _close_fence(self, events: list[dict]) -> None:
        fence_type = self._fence_type
        payload_text = "\n".join(self._fence_lines)
        self._fence_lines = []
        self._state = "idle"

        try:
            payload = json.loads(payload_text)
        except (json.JSONDecodeError, ValueError):
            logger.warning("Malformed %s fence: %r", fence_type, payload_text[:200])
            return

        block_id = self._next_id()

        if fence_type == "note-columns":
            cols_raw = payload.get("columns") or []
            if len(cols_raw) != 2:
                logger.warning("note-columns must have exactly 2 columns, got %d", len(cols_raw))
                return
            columns = []
            for ci, col_data in enumerate(cols_raw):
                col_md = col_data if isinstance(col_data, str) else (
                    col_data.get("markdown") or "" if isinstance(col_data, dict) else ""
                )
                col_parser = _MarkdownStreamParser()
                col_events = col_parser.feed(col_md) + col_parser.flush()
                col_blocks = _events_to_blocks(col_events)
                if not col_blocks:
                    col_blocks = [{"id": f"{block_id}_c{ci + 1}_1", "type": "paragraph", "markdown": " "}]
                for bi, cb in enumerate(col_blocks):
                    cb["id"] = f"{block_id}_c{ci + 1}_{bi + 1}"
                columns.append(col_blocks)
            events.append({"type": "block_emit", "block": {
                "id": block_id,
                "type": "columns",
                "columns": columns,
            }})

        elif fence_type == "note-visual":
            events.append({"type": "block_emit", "block": {
                "id": block_id,
                "type": "visual",
                "status": "pending",
                "visual_type": str(payload.get("visual_type") or "static_visual"),
                "prompt": _clean_text(payload.get("prompt")),
                "src": None,
                "html": None,
                "width": _coerce_width(payload.get("width")),
                "align": _coerce_align(payload.get("align")),
                "caption": _clean_text(payload.get("caption")),
            }})

        elif fence_type == "note-image":
            events.append({"type": "block_emit", "block": {
                "id": block_id,
                "type": "image",
                "status": "pending",
                "image_type": str(payload.get("image_type") or "diagram").lower(),
                "style": normalize_image_style(payload.get("style")),
                "prompt": _clean_text(payload.get("prompt")),
                "src": None,
                "width": _coerce_width(payload.get("width")),
                "align": _coerce_align(payload.get("align")),
                "caption": _clean_text(payload.get("caption")),
            }})

    def _close_any(self, events: list[dict]) -> None:
        if self._state == "paragraph":
            self._close_paragraph(events)
        elif self._state == "list":
            self._close_list(events)
        elif self._state == "callout":
            self._close_callout(events)
        elif self._state == "fence":
            logger.warning("Unclosed %s fence at end of stream — attempting parse", self._fence_type)
            self._close_fence(events)


def _events_to_blocks(events: list[dict]) -> list[dict[str, Any]]:
    """Reduce parser events to a flat list of completed blocks (for column parsing)."""
    blocks: list[dict[str, Any]] = []
    open_blocks: dict[str, dict[str, Any]] = {}
    for event in events:
        et = event["type"]
        if et == "block_start":
            b = event["block"]
            open_blocks[b["id"]] = b
        elif et == "block_delta":
            existing = open_blocks.get(event["block_id"])
            if existing:
                existing.update(event["block"])
        elif et == "block_commit":
            existing = open_blocks.pop(event["block_id"], None)
            if existing:
                existing.update(event["block"])
                blocks.append(existing)
        elif et == "block_emit":
            blocks.append(event["block"])
    return blocks


async def _handle_parser_events(
    *,
    events: list[dict],
    top_index: int,
    blocks: list[dict[str, Any]],
    content: dict[str, Any],
    db: Client,
    artifact_id: str,
    org_id: str,
    svg_prompt: str,
    lock: asyncio.Lock,
    emit_event,
    asset_tasks: list[asyncio.Task],
) -> int:
    for event in events:
        et = event["type"]

        if et == "note_name":
            name = event["name"]
            if name:
                supabase_execute(
                    db.table("artifacts")
                    .update({
                        "artifact_name": name,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    })
                    .eq("id", artifact_id),
                    entity="artifact",
                )
            if emit_event:
                emit_event({"type": "note_name", "name": name})
            continue

        if et == "block_start":
            block = event["block"]
            top_index += 1
            blocks.append(block)
            content["blocks"] = deepcopy(blocks)
            await _persist_note_state(
                db, artifact_id, content, phase="generating_note", blocks=blocks, lock=lock,
            )
            if emit_event:
                emit_event({"type": block["type"], "block": deepcopy(block)})
            continue

        if et == "block_delta":
            block_id = event["block_id"]
            existing = _find_block_by_id(blocks, block_id)
            if existing:
                existing.update(event["block"])
            if emit_event:
                emit_event({"type": "block_delta", "block_id": block_id,
                             "block": deepcopy(existing or event["block"])})
            continue

        if et == "block_commit":
            block_id = event["block_id"]
            existing = _find_block_by_id(blocks, block_id)
            if existing:
                existing.update(event["block"])
            content["blocks"] = deepcopy(blocks)
            await _persist_note_state(
                db, artifact_id, content, phase="generating_note", blocks=blocks, lock=lock,
            )
            if emit_event:
                emit_event({"type": "block_commit", "block_id": block_id,
                             "block": deepcopy(existing or event["block"])})
            continue

        if et == "block_emit":
            block = event["block"]
            top_index += 1
            blocks.append(block)
            content["blocks"] = deepcopy(blocks)
            await _persist_note_state(
                db, artifact_id, content, phase="generating_note", blocks=blocks, lock=lock,
            )
            if emit_event:
                emit_event({"type": block["type"], "block": deepcopy(block)})
            asset_tasks.extend(_schedule_asset_generation_tasks(
                blocks=blocks,
                block=block,
                artifact_id=artifact_id,
                org_id=org_id,
                generator_prompt=svg_prompt,
                content=content,
                db=db,
                lock=lock,
                emit_event=emit_event,
            ))
            continue

    return top_index


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

    if block_type == "image":
        return {
            "id": block_id,
            "type": "image",
            "status": "pending",
            "image_type": str(data.get("image_type") or "diagram").strip().lower(),
            "style": normalize_image_style(data.get("style")),
            "prompt": _clean_text(data.get("prompt")),
            "src": _clean_text(data.get("src")) or None,
            "width": _coerce_width(data.get("width")),
            "align": _coerce_align(data.get("align")),
            "caption": _clean_text(data.get("caption")),
        }

    return {
        "id": block_id,
        "type": "visual",
        "status": "pending",
        "visual_type": str(data.get("visual_type") or "static_visual").strip().lower(),
        "prompt": _clean_text(data.get("prompt")),
        "src": _clean_text(data.get("src")) or None,
        "html": _clean_text(data.get("html")) or None,
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
        if block_type in {"image", "visual", "svg"} and current.get("status") == "pending" and current.get("prompt"):
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
                style=normalize_image_style(current.get("style")),
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
                visual_type=current.get("visual_type") or "static_visual",
                prompt=prompt,
                layout="note",
            )
            visual_html = _wrap_note_visual_html(visual_html)
            filename = None

        patch: dict[str, Any] = {"status": "completed"}
        if current["type"] == "image":
            patch["src"] = f"/api/artifacts/{artifact_id}/images/{filename}"
        else:
            patch["html"] = visual_html
            patch["src"] = _note_visual_src(artifact_id, block_id)
        patched = _patch_block_by_id(blocks, block_id, patch)
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


_INLINE_MATH_RE = re.compile(r"\$\$([^$]+)\$\$|\$([^$\n]+)\$")


def _text_with_inline_math(text: str) -> list[dict[str, Any]]:
    """Convert a plain string that may contain $...$ or $$...$$ into a list of
    TipTap inline nodes (text + mathInline)."""
    parts: list[dict[str, Any]] = []
    last = 0
    for m in _INLINE_MATH_RE.finditer(text):
        if m.start() > last:
            parts.append({"type": "text", "text": text[last:m.start()]})
        latex = (m.group(1) or m.group(2) or "").strip()
        parts.append({"type": "mathInline", "attrs": {"latex": latex}})
        last = m.end()
    if last < len(text):
        parts.append({"type": "text", "text": text[last:]})
    return parts if parts else [{"type": "text", "text": text}]


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


def _blocks_to_tiptap_json(blocks: list[dict[str, Any]], artifact_id: str) -> dict[str, Any]:
    return {
        "type": "doc",
        "content": _blocks_to_tiptap_nodes(blocks, artifact_id) or [{"type": "paragraph"}],
    }


def _is_caption_paragraph(markdown: str) -> bool:
    """Return True when the paragraph looks like an asset caption (italic-only text)."""
    stripped = markdown.strip()
    return bool(stripped) and stripped.startswith("_") and stripped.endswith("_") and stripped.count("_") >= 2


def _blocks_to_tiptap_nodes(blocks: list[dict[str, Any]], artifact_id: str = "") -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    prev_type: str = ""
    for block in blocks:
        block_type = block["type"]
        if block_type == "heading":
            heading_text = block.get("text") or " "
            heading_content = _text_with_inline_math(heading_text)
            nodes.append({
                "type": "heading",
                "attrs": {"level": block.get("level", 2)},
                "content": heading_content,
            })
            prev_type = block_type
            continue

        if block_type == "paragraph":
            md = block.get("markdown") or ""
            paragraph_nodes = _markdown_to_tiptap_nodes(md)
            # Center caption paragraphs (italic text following an image or visual)
            if prev_type in {"image", "visual", "svg"} and _is_caption_paragraph(md):
                for pn in paragraph_nodes:
                    if pn.get("type") == "paragraph":
                        pn.setdefault("attrs", {})["textAlign"] = "center"
            nodes.extend(paragraph_nodes)
            prev_type = block_type
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
            prev_type = block_type
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
            prev_type = block_type
            continue

        if block_type == "columns":
            nodes.append({
                "type": "columns",
                "attrs": {"columnCount": 2},
                "content": [
                    {
                        "type": "column",
                        "content": _blocks_to_tiptap_nodes(column, artifact_id) or [{"type": "paragraph"}],
                    }
                    for column in (block.get("columns") or [[], []])
                ],
            })
            continue

        if block_type == "image":
            image_attrs: dict[str, Any] = {
                "src": block.get("src") or IMAGE_GENERATING_SRC,
                "align": block.get("align") or "center",
                "caption": block.get("caption") or "",
            }
            if block.get("width"):
                image_attrs["width"] = block["width"]
            nodes.append({"type": "image", "attrs": image_attrs})
            prev_type = block_type
            continue

        if block_type in {"visual", "svg"}:
            visual_attrs: dict[str, Any] = {
                "src": block.get("src") or (
                    _note_visual_src(artifact_id, str(block.get("id")))
                    if block.get("id") and block.get("status") == "completed"
                    else VISUAL_GENERATING_SRC
                ),
                "html": "",
                "align": block.get("align") or "center",
                "caption": block.get("caption") or "",
                "visualType": block.get("visual_type") or "static_visual",
            }
            if block.get("width"):
                visual_attrs["width"] = block["width"]
            nodes.append({"type": "visualEmbed", "attrs": visual_attrs})
        prev_type = block_type
    return nodes


def _split_concatenated_heading_text(text: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", str(text or "")).strip()
    if not normalized:
        return []
    normalized = re.sub(r"(?<=[a-záàâãéêíóôõúç])(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])", " ", normalized)
    matches = list(NUMBERED_HEADING_RE.finditer(normalized))
    if len(matches) < 2:
        return [normalized]

    parts: list[str] = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(normalized)
        part = normalized[start:end].strip()
        if part:
            parts.append(part)
    return parts or [normalized]


def _sanitize_final_note_blocks(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sanitized: list[dict[str, Any]] = []
    for block in blocks:
        if block.get("type") == "columns":
            copied = deepcopy(block)
            copied["columns"] = [
                _sanitize_final_note_blocks(column)
                for column in (block.get("columns") or [])
            ]
            sanitized.append(copied)
            continue

        if block.get("type") != "heading":
            sanitized.append(deepcopy(block))
            continue

        level = int(block.get("level") or 2)
        heading_id = str(block.get("id") or f"h{len(sanitized) + 1}")
        parts = _split_concatenated_heading_text(block.get("text") or "")
        if not parts:
            continue

        for index, part in enumerate(parts):
            sanitized.append({
                **deepcopy(block),
                "id": heading_id if index == 0 else f"{heading_id}_{index + 1}",
                "level": level,
                "text": part,
            })

    return sanitized


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
    if block_type == "image":
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
    if block_type in {"visual", "svg"}:
        payload: dict[str, Any] = {
            "src": block.get("src") or "",
            "html": block.get("html") or "",
            "visual_type": block.get("visual_type") or "static_visual",
        }
        if block.get("width"):
            payload["width"] = block["width"]
        if block.get("align"):
            payload["align"] = block["align"]
        if block.get("caption"):
            payload["caption"] = block["caption"]
        return "```note-visual\n" + json.dumps(payload, ensure_ascii=False, indent=2) + "\n```"
    return ""
