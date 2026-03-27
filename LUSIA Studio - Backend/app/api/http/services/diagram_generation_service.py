"""
Diagram generation service — artifact creation + async structured generation pipeline.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from time import monotonic
from typing import Any

from supabase import Client

from app.api.http.schemas.diagram_generation import DiagramStartIn
from app.api.http.services.diagram_parser import DiagramStreamParser
from app.api.http.services.generation_context import assemble_generation_context
from app.core.database import get_b2b_db
from app.pipeline.clients.openrouter import chat_completion_text_stream
from app.pipeline.steps.categorize_document import get_subject_name
from app.utils.db import parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parents[3] / "prompts" / "diagrams"
PERSIST_EMIT_INTERVAL_S = 1.0
PERSIST_EMIT_MIN_EVENTS = 3


def _load_prompt_file(filename: str) -> str:
    return (PROMPTS_DIR / filename).read_text(encoding="utf-8")


def create_diagram_artifact(
    db: Client,
    org_id: str,
    user_id: str,
    payload: DiagramStartIn,
) -> dict:
    subject_id = payload.subject_id
    year_level = payload.year_level
    subject_component = payload.subject_component
    curriculum_codes = payload.curriculum_codes

    if payload.upload_artifact_id and (not subject_id or not year_level or not curriculum_codes):
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
        subject_name = get_subject_name(db, subject_id) or "Diagrama"
        artifact_name = f"Diagrama · {subject_name}"
        if year_level:
            artifact_name += f" · {year_level}º ano"
    else:
        artifact_name = "Diagrama"

    now = datetime.now(timezone.utc).isoformat()
    content = {
        "title": artifact_name,
        "diagram_type": "mindmap",
        "phase": "pending",
        "generation_params": {
            "prompt": payload.prompt,
            "upload_artifact_id": payload.upload_artifact_id,
            "curriculum_codes": curriculum_codes or [],
        },
        "nodes": [],
    }

    insert_data: dict[str, Any] = {
        "organization_id": org_id,
        "user_id": user_id,
        "artifact_type": "diagram",
        "artifact_name": artifact_name,
        "icon": "🧭",
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
            "metadata": {"type": "diagram"},
        }),
        entity="document_job",
    )
    job = parse_single_or_404(job_resp, entity="document_job")
    artifact["job_id"] = job["id"]
    return artifact


async def generate_diagram_task(
    artifact_id: str,
    org_id: str,
    user_id: str,
    job_id: str,
    on_step_change=None,
    emit_event=None,
) -> None:
    db = get_b2b_db()
    artifact = _get_artifact(db, artifact_id)
    content = dict(artifact.get("content") or {})
    gen_params = content.get("generation_params") or {}
    persist_counter = 0
    last_persist_at = monotonic()

    try:
        context = assemble_generation_context(
            db,
            subject_id=artifact.get("subject_id"),
            year_level=artifact.get("year_level"),
            subject_component=artifact.get("subject_component"),
            curriculum_codes=artifact.get("curriculum_codes"),
            upload_artifact_id=gen_params.get("upload_artifact_id"),
        )

        parser = DiagramStreamParser(
            diagram_type=_normalize_diagram_type(content.get("diagram_type")),
            title=str(content.get("title") or artifact.get("artifact_name") or "Diagrama").strip(),
            generation_params=dict(gen_params),
        )

        _update_job(db, job_id, "generating_diagram", "A gerar diagrama...", on_step_change)
        content["phase"] = "generating_diagram"
        _update_artifact_partial(db, artifact_id, content)

        generator_prompt = _load_prompt_file("generator.md")
        async for chunk in chat_completion_text_stream(
            system_prompt=generator_prompt,
            user_prompt=_build_generator_user_prompt(
                gen_params=gen_params,
                context=context,
                year_level=artifact.get("year_level"),
                subject_component=artifact.get("subject_component"),
            ),
            temperature=0.15,
            max_tokens=32768,
        ):
            parser_events = parser.feed(chunk)
            for event in parser_events:
                if emit_event:
                    emit_event(event)
            if parser_events:
                persist_counter += len(parser_events)
                now = monotonic()
                if persist_counter >= PERSIST_EMIT_MIN_EVENTS or (now - last_persist_at) >= PERSIST_EMIT_INTERVAL_S:
                    partial_content = parser.build_content(phase="generating_diagram")
                    _update_artifact_partial(db, artifact_id, partial_content)
                    last_persist_at = now
                    persist_counter = 0

        final = parser.finalize()
        final_content = {
            "title": final["title"],
            "diagram_type": final["diagram_type"],
            "phase": "completed",
            "generation_params": dict(gen_params),
            "nodes": final["nodes"],
            "warnings": final["warnings"],
            "stats": final["stats"],
        }
        _update_artifact_success(db, artifact_id, final_content)
        _update_job_success(db, job_id, final["warnings"], final["stats"])

    except Exception as exc:
        error_message = str(exc)[:1000]
        logger.exception("Diagram generation failed for %s", artifact_id)
        _update_artifact_failure(db, artifact_id, content, error_message)
        _update_job_failure(db, job_id, error_message)
        raise


def get_diagram(db: Client, artifact_id: str, org_id: str) -> dict:
    response = supabase_execute(
        db.table("artifacts")
        .select("*")
        .eq("id", artifact_id)
        .eq("organization_id", org_id)
        .eq("artifact_type", "diagram")
        .limit(1),
        entity="artifact",
    )
    return parse_single_or_404(response, entity="artifact")


def _get_artifact(db: Client, artifact_id: str) -> dict:
    response = supabase_execute(
        db.table("artifacts")
        .select("id,artifact_name,subject_id,year_level,subject_component,curriculum_codes,content")
        .eq("id", artifact_id)
        .limit(1),
        entity="artifact",
    )
    return parse_single_or_404(response, entity="artifact")


def _normalize_diagram_type(raw: Any) -> str:
    value = str(raw or "").strip().lower()
    if value in {"mindmap", "flowchart", "sequence"}:
        return value
    return "mindmap"


def _build_generator_user_prompt(
    *,
    gen_params: dict[str, Any],
    context: dict[str, Any],
    year_level: str | None,
    subject_component: str | None,
) -> str:
    return json.dumps(
        {
            "teacher_prompt": gen_params.get("prompt") or "",
            "year_level": year_level,
            "subject_component": subject_component,
            "subject_name": context.get("subject_name"),
            "curriculum_tree": context.get("curriculum_tree"),
            "base_content_by_code": context.get("base_content_by_code") or {},
            "document_content": (context.get("document_content") or "")[:12000],
        },
        ensure_ascii=False,
    )


def _update_job(
    db: Client,
    job_id: str,
    status: str,
    label: str,
    notify=None,
) -> None:
    supabase_execute(
        db.table("document_jobs")
        .update({
            "status": status,
            "step_label": label,
            "current_step": label,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", job_id),
        entity="document_job",
    )
    if notify:
        notify(status, label)


def _update_artifact_partial(db: Client, artifact_id: str, content: dict[str, Any]) -> None:
    supabase_execute(
        db.table("artifacts")
        .update({
            "content": content,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", artifact_id),
        entity="artifact",
    )


def _update_artifact_success(db: Client, artifact_id: str, content: dict[str, Any]) -> None:
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
            "processing_error": error_message[:500],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", artifact_id),
        entity="artifact",
    )


def _update_job_success(
    db: Client,
    job_id: str,
    warnings: list[str],
    stats: dict[str, Any],
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    supabase_execute(
        db.table("document_jobs")
        .update({
            "status": "completed",
            "step_label": "Concluído",
            "current_step": "Concluído",
            "completed_at": now,
            "updated_at": now,
            "metadata": {
                "type": "diagram",
                "warnings": warnings,
                "stats": stats,
            },
        })
        .eq("id", job_id),
        entity="document_job",
    )


def _update_job_failure(db: Client, job_id: str, error_message: str) -> None:
    supabase_execute(
        db.table("document_jobs")
        .update({
            "status": "failed",
            "error_message": error_message,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", job_id),
        entity="document_job",
    )
