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

from supabase import Client

from app.api.http.schemas.presentation_generation import PresentationStartIn
from app.api.http.services.generation_context import assemble_generation_context
from app.api.http.services.image_generation_service import (
    generate_presentation_images,
    inject_image_urls,
)
from app.core.database import get_b2b_db
from app.pipeline.clients.openrouter import chat_completion, chat_completion_text
from app.pipeline.steps.categorize_document import get_subject_name
from app.utils.db import parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parents[3] / "prompts" / "presentations"


# ── Prompt loading ────────────────────────────────────────────


def _load_prompt_file(filename: str) -> str:
    """Read a prompt file from app/prompts/presentations/."""
    path = PROMPTS_DIR / filename
    return path.read_text(encoding="utf-8")


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
            "metadata": {"type": "presentation", "size": payload.size},
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

        # ── Load prompt files ──
        planner_prompt = _load_prompt_file("planner.md")
        executor_prompt = _load_prompt_file("executor.md")

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

        planner_system = planner_prompt
        planner_user = _build_planner_user_prompt(
            gen_params,
            context,
            year_level=artifact.get("year_level"),
            subject_component=artifact.get("subject_component"),
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

        executor_system = executor_prompt
        executor_user = json.dumps(executor_plan, ensure_ascii=False)

        # Extract images from plan (if any)
        plan_images = plan_raw.get("images", [])

        # Run executor HTML generation and image generation IN PARALLEL
        # Use Kimi K2.5 for HTML generation — better at structured output
        executor_task = chat_completion_text(
            system_prompt=executor_system,
            user_prompt=executor_user,
            temperature=0.2,
            max_tokens=65536,
            model="@preset/kimi-2-5-intstant",
        )

        if plan_images:
            image_task = generate_presentation_images(
                org_id=org_id,
                artifact_id=artifact_id,
                images=plan_images,
            )
            raw_html, image_results = await asyncio.gather(executor_task, image_task)
        else:
            raw_html = await executor_task
            image_results = []

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


def _parse_executor_output(raw_html: str, plan_slides: list[dict]) -> list[dict]:
    """Parse executor output into individual slide blocks.

    Primary format: HTML delimited by ``<!-- SLIDE:sN -->`` markers.
    Fallback: JSON array ``[{"id": "s1", "html": "..."}, ...]``.
    """
    text = raw_html.strip()

    # Strip markdown code fences if the LLM wrapped the output
    if text.startswith("```"):
        first_newline = text.find("\n")
        if first_newline != -1:
            text = text[first_newline + 1:]
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3].strip()

    # ── Try <!-- SLIDE:sN --> delimiters first (primary format) ──
    pattern = r"<!--\s*SLIDE:(s\d+[a-z]?)\s*-->"
    parts = re.split(pattern, text)

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
