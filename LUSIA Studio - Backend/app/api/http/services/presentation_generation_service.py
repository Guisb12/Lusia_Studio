"""
Presentation generation service — artifact creation + async LLM pipeline.

Three-phase generation:
  1. Planner  → chat_completion()  → JSON pedagogical plan (with images array)
  2. Executor → chat_completion_text() → HTML slides delimited by <!-- SLIDE:sN -->
     Image generation → generate_presentation_images() → parallel with executor
  3. Post-processing → inject image URLs into HTML
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from time import monotonic

from supabase import Client

from app.api.http.schemas.presentation_generation import PresentationStartIn
from app.api.http.services.generation_context import assemble_generation_context
from app.api.http.services.image_generation_service import (
    generate_presentation_images,
    inject_image_urls,
)
from app.core.database import get_b2b_db
from app.pipeline.clients.openrouter import (
    chat_completion,
    chat_completion_text_stream,
    parse_json_text,
)
from app.pipeline.steps.categorize_document import get_subject_name
from app.utils.db import parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parents[3] / "prompts" / "presentations"
SLIDE_MARKER_RE = re.compile(r"<!--\s*SLIDE:(s\d+[a-z]?)\s*-->")
PLAN_STREAM_EMIT_INTERVAL_S = 0.1
SLIDE_STREAM_EMIT_INTERVAL_S = 0.12
SLIDE_STREAM_EMIT_MIN_DELTA_CHARS = 140

PRESENTATION_TEMPLATE_VALUES = {
    "explicative",
    "interactive_explanation",
    "step_by_step_exercise",
}


# ── Prompt loading ────────────────────────────────────────────


def _load_prompt_file(filename: str) -> str:
    """Read a prompt file from app/prompts/presentations/."""
    path = PROMPTS_DIR / filename
    return path.read_text(encoding="utf-8")


def _load_planner_prompt(template: str) -> str:
    if template == "interactive_explanation":
        return _load_prompt_file("planner_interactive.md")
    return _load_prompt_file("planner.md")


def _load_executor_prompt(template: str) -> str:
    if template == "interactive_explanation":
        return _load_prompt_file("executor_interactive.md")
    return _load_prompt_file("executor.md")


# ── Artifact creation ─────────────────────────────────────────


def create_presentation_artifact(
    db: Client,
    org_id: str,
    user_id: str,
    payload: PresentationStartIn,
) -> dict:
    """
    Create a presentation artifact + document_job row.

    Returns the artifact dict merged with ``job_id``.
    """
    # Inherit tags from upload artifact when not provided
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

    # Build artifact name
    if subject_id:
        subject_name = get_subject_name(db, subject_id) or "Apresentação"
        artifact_name = f"Apresentação · {subject_name}"
        if year_level:
            artifact_name += f" · {year_level}º ano"
    else:
        artifact_name = "Apresentação"

    now = datetime.now(timezone.utc).isoformat()

    insert_data = {
        "organization_id": org_id,
        "user_id": user_id,
        "artifact_type": "presentation",
        "source_type": "native",
        "artifact_name": artifact_name,
        "icon": "🎓",
        "content": {
            "generation_params": {
                "prompt": payload.prompt,
                "size": payload.size,
                "template": payload.template,
                "upload_artifact_id": payload.upload_artifact_id,
                "curriculum_codes": curriculum_codes or [],
            },
            "plan": None,
            "slides": None,
            "phase": "pending",
        },
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

    response = supabase_execute(
        db.table("artifacts").insert(insert_data),
        entity="artifact",
    )
    artifact = parse_single_or_404(response, entity="artifact")

    # Create document_job for background processing tracking
    job_resp = supabase_execute(
        db.table("document_jobs").insert({
            "artifact_id": artifact["id"],
            "organization_id": org_id,
            "user_id": user_id,
            "status": "pending",
            "metadata": {
                "type": "presentation",
                "size": payload.size,
                "template": payload.template,
            },
        }),
        entity="document_job",
    )
    job = parse_single_or_404(job_resp, entity="document_job")
    artifact["job_id"] = job["id"]

    return artifact


# ── Async generation pipeline ─────────────────────────────────


async def generate_presentation_task(
    artifact_id: str,
    org_id: str,
    user_id: str,
    job_id: str,
    on_step_change: Callable[[str, str], None] | None = None,
    emit_event: Callable[[dict], None] | None = None,
) -> None:
    """
    Background task: Planner LLM → Executor LLM → store slides.

    Called by PipelineTaskManager via the ``task_fn`` parameter.
    """
    db = get_b2b_db()
    notify = on_step_change

    try:
        # ── Load artifact ──
        artifact = _get_artifact(db, artifact_id)
        content = artifact.get("content") or {}
        gen_params = content.get("generation_params", {})

        # ── Assemble generation context ──
        context = assemble_generation_context(
            db,
            subject_id=artifact.get("subject_id"),
            year_level=artifact.get("year_level"),
            subject_component=artifact.get("subject_component"),
            curriculum_codes=artifact.get("curriculum_codes"),
            upload_artifact_id=gen_params.get("upload_artifact_id"),
        )

        # ── Phase 1: Planner ──
        _update_job(db, job_id, "planning", "A planear estrutura pedagógica...", notify)
        _update_content_phase(db, artifact_id, content, "planning")

        template = _normalize_presentation_template(gen_params.get("template"))
        planner_prompt = _load_planner_prompt(template)
        executor_prompt = _load_executor_prompt(template)

        planner_system = planner_prompt + _planner_template_system_append(template)
        planner_user = _build_planner_user_prompt(
            gen_params,
            context,
            year_level=artifact.get("year_level"),
            subject_component=artifact.get("subject_component"),
        )

        planner_raw_parts: list[str] = []
        last_plan_partial_at = 0.0
        last_plan_partial_signature: tuple | None = None

        try:
            async for chunk in chat_completion_text_stream(
                system_prompt=planner_system,
                user_prompt=planner_user,
                response_format={"type": "json_object"},
                temperature=0.3,
                max_tokens=65536,
            ):
                planner_raw_parts.append(chunk)

                if emit_event is None:
                    continue

                partial_plan = _parse_planner_stream_output("".join(planner_raw_parts))
                if not partial_plan:
                    continue

                signature = _planner_stream_signature(partial_plan)
                now = monotonic()
                if signature == last_plan_partial_signature:
                    continue
                if last_plan_partial_signature is not None and now - last_plan_partial_at < PLAN_STREAM_EMIT_INTERVAL_S:
                    continue

                last_plan_partial_signature = signature
                last_plan_partial_at = now
                emit_event({
                    "type": "plan_partial",
                    "plan": partial_plan,
                })

            plan_raw = parse_json_text("".join(planner_raw_parts))
        except Exception:
            logger.warning(
                "Planner streaming failed for artifact %s, falling back to blocking planner call",
                artifact_id,
                exc_info=True,
            )
            plan_raw = await chat_completion(
                system_prompt=planner_system,
                user_prompt=planner_user,
                response_format={"type": "json_object"},
                temperature=0.3,
                max_tokens=65536,
            )

        # Build subject metadata for both storage and executor
        subject_meta = {}
        if context.get("subject_name"):
            subject_meta["name"] = context["subject_name"]
        if context.get("subject_color"):
            subject_meta["color"] = context["subject_color"]
        if context.get("subject_icon"):
            subject_meta["icon"] = context["subject_icon"]
        if artifact.get("year_level"):
            subject_meta["year_level"] = artifact["year_level"]

        # Store plan + subject metadata in content
        content["plan"] = plan_raw
        if subject_meta:
            content["subject"] = subject_meta
        logger.info(
            "Subject metadata for artifact %s: %s (from context: name=%s, color=%s, icon=%s)",
            artifact_id, subject_meta,
            context.get("subject_name"), context.get("subject_color"), context.get("subject_icon"),
        )
        _update_artifact_content(db, artifact_id, content)

        total_slides = plan_raw.get("total_slides", len(plan_raw.get("slides", [])))

        # ── Phase 2: Executor + Images (PARALLEL) ──
        _update_job(db, job_id, "generating_slides", "A gerar slides e imagens...", notify)
        _update_content_phase(db, artifact_id, content, "generating_slides")

        # Enrich plan with subject visual data for the executor
        executor_plan = dict(plan_raw)
        if subject_meta:
            executor_plan["subject"] = subject_meta

        executor_system = executor_prompt + _executor_template_system_append(template)
        executor_user = json.dumps(executor_plan, ensure_ascii=False)

        # Extract images from plan (if any)
        plan_images = plan_raw.get("images", [])
        slide_positions = {
            slide["id"]: index + 1
            for index, slide in enumerate(plan_raw.get("slides", []))
            if slide.get("id")
        }

        # Run executor HTML generation and image generation IN PARALLEL.
        # The executor call itself is unchanged — we only expose its text stream.
        image_task = (
            asyncio.create_task(
                generate_presentation_images(
                    org_id=org_id,
                    artifact_id=artifact_id,
                    images=plan_images,
                ),
            )
            if plan_images
            else None
        )

        raw_html_parts: list[str] = []
        streamed_completed_ids: set[str] = set()
        last_snapshot_by_slide: dict[str, str] = {}
        last_snapshot_at = 0.0
        announced_active_slide_id: str | None = None

        try:
            async for chunk in chat_completion_text_stream(
                system_prompt=executor_system,
                user_prompt=executor_user,
                temperature=0.2,
                max_tokens=65536,
                model="@preset/kimi-2-5-intstant",
            ):
                raw_html_parts.append(chunk)

                if emit_event is None:
                    continue

                stream_slides = _parse_executor_stream_output("".join(raw_html_parts))
                if not stream_slides:
                    continue

                for completed_slide in stream_slides[:-1]:
                    slide_id = completed_slide["id"]
                    if slide_id in streamed_completed_ids:
                        continue

                    current = slide_positions.get(slide_id, len(streamed_completed_ids) + 1)
                    streamed_completed_ids.add(slide_id)
                    emit_event({
                        "type": "slide_html_done",
                        "slide_id": slide_id,
                        "current": current,
                        "total": total_slides,
                        "html": completed_slide["html"],
                    })

                active_slide = stream_slides[-1]
                active_slide_id = active_slide["id"]
                active_html = active_slide["html"]
                active_current = slide_positions.get(
                    active_slide_id,
                    len(streamed_completed_ids) + 1,
                )

                if announced_active_slide_id != active_slide_id:
                    announced_active_slide_id = active_slide_id
                    emit_event({
                        "type": "slide_progress",
                        "current": active_current,
                        "total": total_slides,
                        "message": f"A gerar slide {active_current} de {total_slides}...",
                    })

                previous_html = last_snapshot_by_slide.get(active_slide_id, "")
                now = monotonic()
                html_delta = len(active_html) - len(previous_html)
                should_emit_snapshot = (
                    active_html != previous_html
                    and (
                        active_slide_id not in last_snapshot_by_slide
                        or html_delta >= SLIDE_STREAM_EMIT_MIN_DELTA_CHARS
                        or now - last_snapshot_at >= SLIDE_STREAM_EMIT_INTERVAL_S
                    )
                )

                if should_emit_snapshot:
                    last_snapshot_by_slide[active_slide_id] = active_html
                    last_snapshot_at = now
                    emit_event({
                        "type": "slide_html_snapshot",
                        "slide_id": active_slide_id,
                        "current": active_current,
                        "total": total_slides,
                        "html": active_html,
                    })

            raw_html = "".join(raw_html_parts)

            final_stream_slides = _parse_executor_stream_output(raw_html)
            if emit_event and final_stream_slides:
                final_slide = final_stream_slides[-1]
                final_slide_id = final_slide["id"]
                if final_slide_id not in streamed_completed_ids:
                    emit_event({
                        "type": "slide_html_done",
                        "slide_id": final_slide_id,
                        "current": slide_positions.get(
                            final_slide_id,
                            len(streamed_completed_ids) + 1,
                        ),
                        "total": total_slides,
                        "html": final_slide["html"],
                    })

            image_results = await image_task if image_task is not None else []
        except Exception:
            if image_task is not None:
                image_task.cancel()
                await asyncio.gather(image_task, return_exceptions=True)
            raise

        logger.info(
            "Executor output for artifact %s: %d chars, %d images generated",
            artifact_id,
            len(raw_html),
            len([r for r in image_results if r.get("status") == "completed"]),
        )

        # ── Parse slides ──
        slides = _parse_executor_output(raw_html, plan_raw.get("slides", []))
        logger.info(
            "Parsed %d slides for artifact %s",
            len(slides),
            artifact_id,
        )

        # ── Inject image URLs into HTML ──
        if image_results:
            slides = inject_image_urls(slides, image_results)
            content["image_results"] = image_results

        # ── Finalize ──
        content["slides"] = slides
        content["phase"] = "completed"
        supabase_execute(
            db.table("artifacts")
            .update({
                "content": content,
                "is_processed": True,
                "processing_failed": False,
                "processing_error": None,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", artifact_id),
            entity="artifact",
        )

        _complete_job(db, job_id)
        logger.info(
            "Presentation generation completed for artifact %s (%d slides)",
            artifact_id,
            len(slides),
        )

    except Exception as exc:
        error_msg = str(exc)[:1000]
        logger.exception("Presentation generation failed for artifact %s", artifact_id)

        # Mark artifact as failed
        try:
            content["phase"] = "failed"
            supabase_execute(
                db.table("artifacts")
                .update({
                    "content": content,
                    "processing_failed": True,
                    "processing_error": error_msg[:500],
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })
                .eq("id", artifact_id),
                entity="artifact",
            )
        except Exception:
            logger.warning("Failed to mark artifact %s as failed", artifact_id)

        _fail_job(db, job_id, error_msg)
        raise


# ── Read ──────────────────────────────────────────────────────


def get_presentation(db: Client, artifact_id: str, org_id: str) -> dict:
    """Fetch a presentation artifact by id + org_id."""
    response = supabase_execute(
        db.table("artifacts")
        .select("*")
        .eq("id", artifact_id)
        .eq("organization_id", org_id)
        .eq("artifact_type", "presentation")
        .limit(1),
        entity="artifact",
    )
    return parse_single_or_404(response, entity="artifact")


# ── Internal helpers ──────────────────────────────────────────


def _get_artifact(db: Client, artifact_id: str) -> dict:
    response = supabase_execute(
        db.table("artifacts")
        .select("*")
        .eq("id", artifact_id)
        .limit(1),
        entity="artifact",
    )
    return parse_single_or_404(response, entity="artifact")


def _build_planner_user_prompt(
    gen_params: dict,
    context: dict,
    year_level: str | None = None,
    subject_component: str | None = None,
) -> str:
    """Build the user prompt for the planner LLM call.

    Follows the same content hierarchy as the worksheet planner:
      1. Teacher instructions (highest priority)
      2. Document content (base material)
      3. Curriculum + base content (supplementary context)
    """
    parts: list[str] = []

    parts.append("Cria o plano pedagógico da apresentação seguindo a framework.\n")

    # ── Subject context (informational) ──
    if context.get("subject_name"):
        parts.append(f"Disciplina: {context['subject_name']}")
    if year_level:
        parts.append(f"Ano: {year_level}º ano")
    if subject_component:
        parts.append(f"Componente: {subject_component}")
    parts.append(f"Tamanho: {gen_params.get('size', 'short')}")
    parts.append(f"Template: {_template_label(gen_params.get('template'))}")
    parts.append("")

    # ── 1. TEACHER INSTRUCTIONS (highest priority) ──
    parts.append("=== INSTRUÇÕES DO PROFESSOR (PRIORIDADE MÁXIMA) ===")
    parts.append("Segue estas indicações com a máxima prioridade ao definir o conteúdo.")
    parts.append(gen_params.get("prompt", ""))
    parts.append("")

    # ── 2. DOCUMENT CONTENT (base material) ──
    if context.get("document_content"):
        parts.append("=== CONTEÚDO DO DOCUMENTO (MATERIAL BASE) ===")
        parts.append(
            "Usa este material como base principal para planear a apresentação. "
            "O conteúdo do documento tem prioridade sobre os conteúdos curriculares."
        )
        parts.append(context["document_content"])
        parts.append("")

    # ── 3. CURRICULUM + BASE CONTENT (supplementary context) ──
    has_curriculum = context.get("curriculum_tree") or context.get("base_content_by_code")

    if has_curriculum:
        parts.append("=== CONTEÚDOS CURRICULARES (CONTEXTO SUPLEMENTAR) ===")
        parts.append(
            "Usa estes conteúdos como contexto adicional para enriquecer a apresentação."
        )
        if context.get("curriculum_tree"):
            parts.append("Árvore curricular:")
            parts.append(context["curriculum_tree"])
            parts.append("")
        if context.get("base_content_by_code"):
            for code, text in context["base_content_by_code"].items():
                parts.append(f"Conteúdo base ({code}):")
                parts.append(text)
                parts.append("")

    return "\n\n".join(parts)


def _normalize_presentation_template(raw_template: str | None) -> str:
    template = str(raw_template or "").strip().lower()
    if template in PRESENTATION_TEMPLATE_VALUES:
        return template
    return "explicative"


def _template_label(raw_template: str | None) -> str:
    return {
        "explicative": "Explicativo",
        "interactive_explanation": "Explicação Interativa",
        "step_by_step_exercise": "Exercício Passo a Passo",
    }.get(_normalize_presentation_template(raw_template), "Explicativo")


def _planner_template_system_append(template: str) -> str:
    if template == "interactive_explanation":
        return ""

    if template == "step_by_step_exercise":
        return """

## TEMPLATE OVERRIDE — EXERCÍCIO PASSO A PASSO

Ignora a estrutura longa habitual. Esta apresentação é um walkthrough curto.
- Total de slides: 2 a 6.
- NÃO uses cover, index ou chapter.
- Estrutura a sequência como passos progressivos.
- Cada slide deve resolver uma parte do exercício, processo ou conceito.
- Mostra explicitamente o raciocínio, o erro comum e a verificação antes de avançar.
- Fragments são recomendados para revelar cada passo.
"""

    return ""


def _executor_template_system_append(template: str) -> str:
    if template == "interactive_explanation":
        return ""

    if template == "step_by_step_exercise":
        return """

## TEMPLATE OVERRIDE — EXERCÍCIO PASSO A PASSO

- Gera 2 a 6 slides.
- NÃO geres cover, index ou chapter.
- O foco é mostrar o raciocínio passo a passo.
- Usa fragments para revelar etapas, correções e checkpoints.
- O aluno deve conseguir seguir a resolução sem excesso de texto.
"""

    return ""


def _decode_partial_json_string(value: str) -> str:
    """Best-effort decoding for partially streamed JSON string content."""
    candidate = value
    if candidate.endswith("\\"):
        candidate = candidate[:-1]

    return (
        candidate
        .replace("\\n", "\n")
        .replace("\\r", "\r")
        .replace("\\t", "\t")
        .replace('\\"', '"')
        .replace("\\\\", "\\")
    )


def _extract_json_string_field(
    text: str,
    field: str,
    *,
    allow_partial: bool,
) -> str | None:
    marker_match = re.search(rf'"{re.escape(field)}"\s*:\s*"', text)
    if not marker_match:
        return None

    index = marker_match.end()
    raw_chars: list[str] = []
    escape = False

    while index < len(text):
        char = text[index]
        if escape:
            raw_chars.append("\\" + char)
            escape = False
        elif char == "\\":
            escape = True
        elif char == '"':
            return parse_json_text(f'{{"{field}":"{"".join(raw_chars)}"}}')[field]
        else:
            raw_chars.append(char)
        index += 1

    if not allow_partial:
        return None

    return _decode_partial_json_string("".join(raw_chars))


def _extract_json_int_field(text: str, field: str) -> int | None:
    match = re.search(rf'"{re.escape(field)}"\s*:\s*(\d+)', text)
    if not match:
        return None
    return int(match.group(1))


def _extract_plan_slide_segments(text: str) -> tuple[list[str], str | None]:
    slides_match = re.search(r'"slides"\s*:\s*\[', text)
    if not slides_match:
        return [], None

    index = slides_match.end()
    depth = 0
    in_string = False
    escape = False
    object_start: int | None = None
    completed_segments: list[str] = []

    while index < len(text):
        char = text[index]

        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
        else:
            if char == '"':
                in_string = True
            elif char == "{":
                if depth == 0:
                    object_start = index
                depth += 1
            elif char == "}":
                if depth > 0:
                    depth -= 1
                    if depth == 0 and object_start is not None:
                        completed_segments.append(text[object_start:index + 1])
                        object_start = None
            elif char == "]" and depth == 0:
                return completed_segments, None

        index += 1

    partial_segment = text[object_start:] if object_start is not None else None
    return completed_segments, partial_segment


def _parse_partial_plan_slide(text: str) -> dict | None:
    slide_id = _extract_json_string_field(text, "id", allow_partial=True)
    title = _extract_json_string_field(text, "title", allow_partial=True)
    intent = _extract_json_string_field(text, "intent", allow_partial=True)
    description = _extract_json_string_field(text, "description", allow_partial=True)
    phase = _extract_json_string_field(text, "phase", allow_partial=True)
    slide_type = _extract_json_string_field(text, "type", allow_partial=True)
    subtype = _extract_json_string_field(text, "subtype", allow_partial=True)

    if not any([slide_id, title, intent, description, phase, slide_type, subtype]):
        return None

    slide: dict[str, object] = {}
    if slide_id:
        slide["id"] = slide_id
    if title is not None:
        slide["title"] = title
    if intent is not None:
        slide["intent"] = intent
    if description is not None:
        slide["description"] = description
    if phase is not None:
        slide["phase"] = phase
    if slide_type is not None:
        slide["type"] = slide_type
    if subtype is not None:
        slide["subtype"] = subtype

    return slide


def _normalize_stream_json_text(raw_text: str) -> str:
    text = raw_text.lstrip()
    if text.startswith("```"):
        first_newline = text.find("\n")
        if first_newline == -1:
            return ""
        text = text[first_newline + 1:]
    return text


def _parse_planner_stream_output(raw_text: str) -> dict | None:
    text = _normalize_stream_json_text(raw_text)
    if not text:
        return None

    plan: dict[str, object] = {}

    for field in ("size", "title", "description", "target_audience"):
        value = _extract_json_string_field(text, field, allow_partial=True)
        if value is not None:
            plan[field] = value

    total_slides = _extract_json_int_field(text, "total_slides")
    if total_slides is not None:
        plan["total_slides"] = total_slides

    completed_segments, partial_segment = _extract_plan_slide_segments(text)
    slides: list[dict] = []

    for segment in completed_segments:
        try:
            parsed = json.loads(segment)
        except json.JSONDecodeError:
            continue

        if isinstance(parsed, dict):
            slides.append(parsed)

    if partial_segment:
        partial_slide = _parse_partial_plan_slide(partial_segment)
        if partial_slide is not None:
            slides.append(partial_slide)

    if slides:
        plan["slides"] = slides

    return plan or None


def _planner_stream_signature(plan: dict) -> tuple:
    slides = plan.get("slides") or []
    last_slide = slides[-1] if slides else {}
    return (
        plan.get("title"),
        plan.get("total_slides"),
        len(slides),
        isinstance(last_slide, dict) and last_slide.get("id"),
        isinstance(last_slide, dict) and last_slide.get("title"),
        isinstance(last_slide, dict) and last_slide.get("intent"),
        isinstance(last_slide, dict) and last_slide.get("description"),
    )


def _normalize_executor_output_text(raw_html: str, *, strip_trailing_fence: bool) -> str:
    """Remove common markdown wrappers around executor HTML."""
    text = raw_html.lstrip()

    if text.startswith("```"):
        first_newline = text.find("\n")
        if first_newline == -1:
            return ""
        text = text[first_newline + 1:]

    if strip_trailing_fence and text.rstrip().endswith("```"):
        text = text.rstrip()[:-3].rstrip()

    return text


def _parse_executor_stream_output(raw_html: str) -> list[dict]:
    """Parse incremental executor output into ordered slide HTML snapshots."""
    text = _normalize_executor_output_text(raw_html, strip_trailing_fence=False)
    if not text:
        return []

    matches = list(SLIDE_MARKER_RE.finditer(text))
    if not matches:
        return []

    slides: list[dict] = []
    for index, match in enumerate(matches):
        slide_id = match.group(1).strip()
        next_match = matches[index + 1] if index + 1 < len(matches) else None
        slide_html = text[match.end():(next_match.start() if next_match else len(text))].strip()
        slides.append({"id": slide_id, "html": slide_html})

    return slides


def _parse_executor_output(raw_html: str, plan_slides: list[dict]) -> list[dict]:
    """Parse executor output into individual slide blocks.

    Primary format: HTML delimited by ``<!-- SLIDE:sN -->`` markers.
    Fallback: JSON array ``[{"id": "s1", "html": "..."}, ...]``.
    """
    text = _normalize_executor_output_text(raw_html, strip_trailing_fence=True).strip()

    # ── Try <!-- SLIDE:sN --> delimiters first (primary format) ──
    parts = SLIDE_MARKER_RE.split(text)

    slides: list[dict] = []

    # parts alternates: [preamble, id1, html1, id2, html2, ...]
    i = 1
    while i < len(parts) - 1:
        slide_id = parts[i].strip()
        slide_html = parts[i + 1].strip()
        if slide_html:
            slides.append({"id": slide_id, "html": slide_html})
        i += 2

    if slides:
        logger.info("Parsed %d slides from SLIDE delimiter output", len(slides))
        return slides

    # ── Fallback: try JSON array ──
    json_start = text.find("[")
    if json_start != -1:
        json_candidate = text[json_start:]
        try:
            parsed = json.loads(json_candidate)
            if isinstance(parsed, list) and parsed:
                for item in parsed:
                    if isinstance(item, dict) and "id" in item and "html" in item:
                        slides.append({"id": item["id"], "html": item["html"]})
                if slides:
                    logger.info("Parsed %d slides from JSON array fallback", len(slides))
                    return slides
        except (json.JSONDecodeError, ValueError):
            pass

    # ── Last resort: treat entire output as a single slide ──
    logger.warning(
        "Could not parse slides from executor output (%d chars). "
        "First 200 chars: %s",
        len(text),
        repr(text[:200]),
    )
    if text:
        slides.append({"id": "s1", "html": text})

    return slides


def _update_content_phase(db: Client, artifact_id: str, content: dict, phase: str) -> None:
    content["phase"] = phase
    _update_artifact_content(db, artifact_id, content)


def _update_artifact_content(db: Client, artifact_id: str, content: dict) -> None:
    supabase_execute(
        db.table("artifacts")
        .update({
            "content": content,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", artifact_id),
        entity="artifact",
    )


def _update_job(
    db: Client,
    job_id: str,
    status: str,
    step_label: str,
    on_step_change: Callable[[str, str], None] | None = None,
) -> None:
    supabase_execute(
        db.table("document_jobs")
        .update({
            "status": status,
            "current_step": step_label,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", job_id),
        entity="document_job",
    )
    if on_step_change:
        on_step_change(status, step_label)


def _complete_job(db: Client, job_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    supabase_execute(
        db.table("document_jobs")
        .update({
            "status": "completed",
            "current_step": "Concluído",
            "completed_at": now,
            "updated_at": now,
        })
        .eq("id", job_id),
        entity="document_job",
    )


def _fail_job(db: Client, job_id: str, error: str) -> None:
    supabase_execute(
        db.table("document_jobs")
        .update({
            "status": "failed",
            "error_message": error[:1000],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", job_id),
        entity="document_job",
    )
