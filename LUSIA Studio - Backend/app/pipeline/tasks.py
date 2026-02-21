"""
Pipeline task orchestrator — runs category-based flows for uploaded files.

Three flows based on document_category:
  Flow A (study):            Parse → Images → Categorize → Finalize
  Flow B (study_exercises):  Parse → Images → Categorize → Extract Questions → Finalize
  Flow C (exercises):        Parse → Images → Extract Questions → Categorize Questions → Finalize

document_category and year_levels are passed as runtime parameters.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.core.database import get_b2b_db
from app.pipeline.steps.parse_document import parse_document
from app.pipeline.steps.extract_images import extract_and_replace_images
from app.pipeline.steps.categorize_document import categorize_document, categorize_questions
from app.pipeline.steps.extract_questions import extract_questions
from app.utils.db import parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)


async def run_pipeline(
    artifact_id: str,
    job_id: str,
    document_category: str | None = None,
    year_levels: list[str] | None = None,
) -> None:
    """Main pipeline orchestrator.

    Runs parse + extract_images (common to all), then branches into the
    appropriate flow based on document_category.
    """
    db = get_b2b_db()

    try:
        # Load artifact
        artifact = _get_artifact(db, artifact_id)
        source_type = artifact.get("source_type", "txt")
        storage_path = artifact["storage_path"]
        org_id = artifact["organization_id"]
        user_id = artifact["user_id"]

        # ── Common steps: Parse + Extract Images ─────────────
        _update_job(db, job_id, "parsing", "A analisar documento...")
        markdown = await parse_document(db, storage_path, source_type)

        _update_job(db, job_id, "extracting_images", "A extrair imagens...")
        markdown = await extract_and_replace_images(
            db, org_id, user_id, artifact_id, markdown,
        )

        # ── Branch into category-specific flow ───────────────
        if document_category == "study":
            await _flow_study(db, job_id, artifact_id, markdown)
        elif document_category == "study_exercises":
            await _flow_study_exercises(
                db, job_id, artifact_id, org_id, user_id, markdown
            )
        elif document_category == "exercises":
            await _flow_exercises(
                db, job_id, artifact_id, org_id, user_id, markdown, year_levels
            )
        else:
            # Fallback: treat unknown category as study
            logger.warning(
                "Unknown document_category '%s' for artifact %s, treating as study",
                document_category,
                artifact_id,
            )
            await _flow_study(db, job_id, artifact_id, markdown)

        _complete_job(db, job_id)
        logger.info("Pipeline completed for artifact %s (flow: %s)", artifact_id, document_category)

    except Exception as exc:
        logger.exception("Pipeline failed for artifact %s", artifact_id)
        _fail_job(db, job_id, str(exc))
        _fail_artifact(db, artifact_id, str(exc))
        raise


# ── Flow A: study (study content only) ──────────────────────


async def _flow_study(db, job_id: str, artifact_id: str, markdown: str) -> None:
    """Parse → Images → Categorize → Finalize. No question extraction."""
    _update_job(db, job_id, "categorizing", "A categorizar conteúdo...")

    categorization: dict = {}
    try:
        categorization = await categorize_document(db, artifact_id, markdown)
    except Exception as exc:
        logger.warning("Categorization failed for artifact %s: %s", artifact_id, exc)

    _finalize_artifact(
        db,
        artifact_id,
        markdown_content=markdown,
        curriculum_codes=categorization.get("curriculum_codes"),
    )


# ── Flow B: study_exercises (mixed study + questions) ────────


async def _flow_study_exercises(
    db, job_id: str, artifact_id: str, org_id: str, user_id: str, markdown: str
) -> None:
    """Parse → Images → Categorize → Extract Questions (inherit doc codes) → Finalize."""
    # Categorize at document level
    _update_job(db, job_id, "categorizing", "A categorizar conteúdo...")

    categorization: dict = {}
    try:
        categorization = await categorize_document(db, artifact_id, markdown)
    except Exception as exc:
        logger.warning("Categorization failed for artifact %s: %s", artifact_id, exc)

    # Extract questions — they inherit the document-level curriculum_codes
    _update_job(db, job_id, "extracting_questions", "A extrair questões...")
    markdown, question_ids = await extract_questions(
        db, artifact_id, org_id, user_id, markdown,
        categorization=categorization,
    )
    logger.info(
        "Extracted %d questions from artifact %s",
        len(question_ids),
        artifact_id,
    )

    _finalize_artifact(
        db,
        artifact_id,
        markdown_content=markdown,
        curriculum_codes=categorization.get("curriculum_codes"),
    )


# ── Flow C: exercises (questions only) ──────────────────────


async def _flow_exercises(
    db,
    job_id: str,
    artifact_id: str,
    org_id: str,
    user_id: str,
    markdown: str,
    year_levels: list[str] | None,
) -> None:
    """Parse → Images → Extract Questions → Categorize Questions (batch) → Finalize."""
    # Extract questions FIRST (no document-level categorization)
    _update_job(db, job_id, "extracting_questions", "A extrair questões...")
    markdown, question_ids = await extract_questions(
        db, artifact_id, org_id, user_id, markdown,
    )
    logger.info(
        "Extracted %d questions from artifact %s",
        len(question_ids),
        artifact_id,
    )

    # Categorize questions individually via batch LLM call
    if question_ids:
        _update_job(db, job_id, "categorizing_questions", "A categorizar questões...")
        try:
            await categorize_questions(db, artifact_id, question_ids, year_levels)
        except Exception as exc:
            # Non-fatal — questions exist but may lack curriculum tags
            logger.warning(
                "Question categorization failed for artifact %s: %s",
                artifact_id,
                exc,
            )

    # Artifact gets markdown with markers but no curriculum_codes
    _finalize_artifact(
        db,
        artifact_id,
        markdown_content=markdown,
    )


# ── Helpers ──────────────────────────────────────────────────


def _get_artifact(db, artifact_id: str) -> dict:
    response = supabase_execute(
        db.table("artifacts")
        .select("*")
        .eq("id", artifact_id)
        .limit(1),
        entity="artifact",
    )
    return parse_single_or_404(response, entity="artifact")


def _update_job(db, job_id: str, status: str, step_label: str) -> None:
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


def _finalize_artifact(
    db,
    artifact_id: str,
    *,
    markdown_content: str,
    tiptap_json: dict | None = None,
    curriculum_codes: list[str] | None = None,
) -> None:
    update = {
        "markdown_content": markdown_content,
        "is_processed": True,
        "processing_failed": False,
        "processing_error": None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if tiptap_json:
        update["tiptap_json"] = tiptap_json
    if curriculum_codes:
        update["curriculum_codes"] = curriculum_codes

    supabase_execute(
        db.table("artifacts").update(update).eq("id", artifact_id),
        entity="artifact",
    )


def _complete_job(db, job_id: str) -> None:
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


def _fail_job(db, job_id: str, error: str) -> None:
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


def _fail_artifact(db, artifact_id: str, error: str) -> None:
    supabase_execute(
        db.table("artifacts")
        .update({
            "processing_failed": True,
            "processing_error": error[:1000],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", artifact_id),
        entity="artifact",
    )
