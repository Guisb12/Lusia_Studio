"""
Shared generation context assembly for quiz and worksheet pipelines.

Gathers all source material (subject metadata, curriculum content, bank
questions, teacher documents) respecting subject-type capabilities:

    full      → curriculum tree + base content + bank questions (if exam)
    structure → curriculum tree + bank questions (if exam)
    viable    → document only
    gpa_only  → document only
"""

from __future__ import annotations

import json
import logging

from supabase import Client

from app.pipeline.steps.categorize_document import (
    get_curriculum_tree,
    serialize_tree,
)
from app.utils.db import supabase_execute

logger = logging.getLogger(__name__)

# Subject-type capability sets
CATEGORIZABLE_STATUSES = {"full", "structure"}
CONTENT_STATUSES = {"full"}

MAX_CONTEXT_TOKENS = 200_000


# ── Subject metadata (single query) ─────────────────────────


def get_subject_metadata(db: Client, subject_id: str) -> dict | None:
    """
    Fetch name, status, and has_national_exam in one round-trip.

    Returns dict ``{name, status, has_national_exam}`` or *None*.
    """
    response = supabase_execute(
        db.table("subjects")
        .select("name,status,has_national_exam,color,icon")
        .eq("id", subject_id)
        .limit(1),
        entity="subject",
    )
    rows = response.data or []
    return rows[0] if rows else None


# ── Public API ───────────────────────────────────────────────


def assemble_generation_context(
    db: Client,
    *,
    subject_id: str | None = None,
    year_level: str | None = None,
    subject_component: str | None = None,
    curriculum_codes: list[str] | None = None,
    upload_artifact_id: str | None = None,
    year_range: tuple[int, int] | list[int] | None = None,
    max_tokens: int = MAX_CONTEXT_TOKENS,
) -> dict:
    """
    Build the full context for quiz or worksheet generation.

    Handles all subject types and optional fields:
    - No subject          → document-only context
    - full                → tree + base content + bank questions (if exam)
    - structure           → tree + bank questions (if exam, no base content)
    - viable / gpa_only   → no curriculum data

    Returns
    -------
    dict with keys:
        subject_name         : str | None
        subject_status       : str | None  (full | structure | viable | gpa_only)
        has_national_exam    : bool
        curriculum_tree      : str          (serialized, empty string if N/A)
        base_content_by_code : dict[str, str]
        bank_questions       : list[dict]
        document_content     : str | None
    """
    codes = curriculum_codes or []

    # ── Inherit tags from upload artifact when not provided ──
    if upload_artifact_id and not codes:
        doc_meta = _fetch_upload_artifact_tags(db, upload_artifact_id)
        if doc_meta:
            inherited_codes = doc_meta.get("curriculum_codes") or []
            logger.info(
                "Inheriting tags from upload artifact %s: "
                "codes=%d, subject=%s, year=%s, component=%s",
                upload_artifact_id,
                len(inherited_codes),
                doc_meta.get("subject_id"),
                doc_meta.get("year_level"),
                doc_meta.get("subject_component"),
            )
            codes = inherited_codes or codes
            if not subject_id and doc_meta.get("subject_id"):
                subject_id = doc_meta["subject_id"]
            if not year_level and doc_meta.get("year_level"):
                year_level = doc_meta["year_level"]
            if not subject_component and doc_meta.get("subject_component"):
                subject_component = doc_meta["subject_component"]

    # ── Subject metadata ──
    subject_name: str | None = None
    subject_status: str | None = None
    subject_color: str | None = None
    subject_icon: str | None = None
    has_national_exam = False

    if subject_id:
        meta = get_subject_metadata(db, subject_id)
        if meta:
            subject_name = meta.get("name") or "Desconhecida"
            subject_status = meta.get("status")
            subject_color = meta.get("color")
            subject_icon = meta.get("icon")
            has_national_exam = bool(meta.get("has_national_exam"))

    logger.info(
        "Context assembly: subject=%s (%s), year=%s, codes=%d, "
        "has_exam=%s, has_doc=%s",
        subject_name, subject_status, year_level, len(codes),
        has_national_exam, bool(upload_artifact_id),
    )

    # ── Curriculum tree (full / structure only) ──
    curriculum_tree = ""
    if (
        subject_id
        and year_level
        and subject_status in CATEGORIZABLE_STATUSES
    ):
        tree_nodes = get_curriculum_tree(
            db, subject_id, year_level, subject_component
        )
        if tree_nodes:
            has_components = any(
                n.get("subject_component") for n in tree_nodes
            )
            curriculum_tree = serialize_tree(
                tree_nodes, include_component=has_components
            )

    # ── Base content (full only) ──
    base_content_by_code: dict[str, str] = {}
    if subject_status in CONTENT_STATUSES and codes:
        base_content_by_code = fetch_base_content(
            db, subject_id, year_level, subject_component, codes
        )

    # ── Bank questions (national exam subjects only) ──
    bank_questions: list[dict] = []
    if has_national_exam and codes:
        bank_questions = fetch_bank_questions(
            db, subject_id, year_level, codes, year_range=year_range
        )

    # ── Teacher document ──
    document_content: str | None = None
    if upload_artifact_id:
        document_content = fetch_document_content(db, upload_artifact_id)

    logger.info(
        "Context assembled: tree=%d chars, base_content=%d codes, "
        "bank_questions=%d, document=%d chars",
        len(curriculum_tree),
        len(base_content_by_code),
        len(bank_questions),
        len(document_content) if document_content else 0,
    )

    context = {
        "subject_name": subject_name,
        "subject_status": subject_status,
        "subject_color": subject_color,
        "subject_icon": subject_icon,
        "has_national_exam": has_national_exam,
        "curriculum_tree": curriculum_tree,
        "base_content_by_code": base_content_by_code,
        "bank_questions": bank_questions,
        "document_content": document_content,
    }

    return _trim_context_to_budget(context, max_tokens=max_tokens)


def validate_generation_possible(
    db: Client,
    subject_id: str | None,
    upload_artifact_id: str | None,
) -> tuple[bool, str]:
    """
    Check whether generation can proceed for the given subject + inputs.

    Returns ``(can_proceed, reason_if_blocked)``.
    """
    # No subject → only possible with a document
    if not subject_id:
        if upload_artifact_id:
            return True, ""
        return (
            False,
            "Sem disciplina selecionada e sem documento — não há contexto para gerar.",
        )

    meta = get_subject_metadata(db, subject_id)
    if not meta:
        return False, "Disciplina não encontrada."

    status = meta.get("status")
    has_exam = bool(meta.get("has_national_exam"))
    has_doc = upload_artifact_id is not None

    if status == "gpa_only":
        return False, "Disciplinas do tipo GPA não suportam geração."

    if status == "viable" and not has_doc:
        return (
            False,
            "Esta disciplina requer um documento anexado para gerar.",
        )

    if status == "structure" and not has_exam and not has_doc:
        return (
            False,
            "Esta disciplina não tem conteúdo base nem exames nacionais. "
            "Anexa um documento para gerar.",
        )

    return True, ""


def _fetch_upload_artifact_tags(db: Client, artifact_id: str) -> dict | None:
    """Fetch categorization tags from an uploaded document artifact."""
    response = supabase_execute(
        db.table("artifacts")
        .select("subject_id,year_level,subject_component,curriculum_codes")
        .eq("id", artifact_id)
        .limit(1),
        entity="artifact",
    )
    rows = response.data or []
    return rows[0] if rows else None


# ── Content fetching ─────────────────────────────────────────


def fetch_base_content(
    db: Client,
    subject_id: str,
    year_level: str,
    subject_component: str | None,
    curriculum_codes: list[str],
) -> dict[str, str]:
    """
    Fetch ``base_content.content_json`` per curriculum code.

    Falls back to ``curriculum.description`` when no base_content exists.
    """
    query = (
        db.table("curriculum")
        .select("id,code,title,description")
        .eq("subject_id", subject_id)
        .eq("year_level", year_level)
        .in_("code", curriculum_codes)
    )
    if subject_component:
        query = query.eq("subject_component", subject_component)

    response = supabase_execute(query, entity="curriculum")
    nodes = response.data or []

    result: dict[str, str] = {}

    for node in nodes:
        code = node["code"]
        curriculum_id = node["id"]

        bc_response = supabase_execute(
            db.table("base_content")
            .select("content_json")
            .eq("curriculum_id", curriculum_id)
            .limit(1),
            entity="base_content",
        )
        bc_rows = bc_response.data or []

        if bc_rows and bc_rows[0].get("content_json"):
            text = extract_text_from_content_json(bc_rows[0]["content_json"])
            if text:
                result[code] = text
                continue

        # Fallback: curriculum.description
        description = node.get("description")
        if description:
            result[code] = description

    return result


def fetch_bank_questions(
    db: Client,
    subject_id: str,
    year_level: str,
    curriculum_codes: list[str],
    *,
    limit: int = 80,
    year_range: tuple[int, int] | list[int] | None = None,
) -> list[dict]:
    """
    Fetch national-exam questions that overlap the given curriculum codes.

    Returns full content, capped at *limit*, prioritised by ``exam_year`` DESC.
    If *year_range* is provided as (start, end), only questions within that
    range (inclusive) are returned.
    """
    query = (
        db.table("questions")
        .select(
            "id,type,content,curriculum_codes,"
            "exam_year,exam_phase"
        )
        .eq("source_type", "national_exam")
        .eq("subject_id", subject_id)
        .eq("year_level", year_level)
        .overlaps("curriculum_codes", curriculum_codes)
    )

    if year_range and len(year_range) == 2:
        query = query.gte("exam_year", year_range[0]).lte("exam_year", year_range[1])

    query = query.order("exam_year", desc=True).limit(limit)

    response = supabase_execute(query, entity="questions")
    return response.data or []


def fetch_document_content(db: Client, upload_artifact_id: str) -> str | None:
    """Fetch ``markdown_content`` from an uploaded artifact."""
    response = supabase_execute(
        db.table("artifacts")
        .select("markdown_content")
        .eq("id", upload_artifact_id)
        .limit(1),
        entity="artifact",
    )
    rows = response.data or []
    if rows and rows[0].get("markdown_content"):
        return rows[0]["markdown_content"]
    return None


# ── Text extraction ──────────────────────────────────────────


def extract_text_from_content_json(content_json: dict | list) -> str:
    """
    Recursively extract plain text from a TipTap/ProseMirror JSON structure.

    Handles nested content arrays, text nodes, and the sections format
    used by ``base_content``.
    """
    if isinstance(content_json, str):
        return content_json

    if isinstance(content_json, list):
        return "\n".join(
            extract_text_from_content_json(item) for item in content_json
        )

    if isinstance(content_json, dict):
        if content_json.get("type") == "text":
            return content_json.get("text", "")

        children = content_json.get("content", [])
        if isinstance(children, list):
            texts = [extract_text_from_content_json(c) for c in children]
            return "\n".join(t for t in texts if t)

        # Handle sections format from base_content
        sections = content_json.get("sections", [])
        if isinstance(sections, list):
            parts = []
            for section in sections:
                title = section.get("section_title", "")
                body = section.get("content", "")
                if title:
                    parts.append(f"## {title}")
                if body:
                    parts.append(body)
            return "\n\n".join(parts)

    return ""


# ── Token budget management ──────────────────────────────────


def _estimate_tokens(text: str) -> int:
    """Rough estimate: ~4 chars per token."""
    return len(text) // 4


def _context_token_estimate(context: dict) -> int:
    """Estimate total tokens across all context sections."""
    total = _estimate_tokens(context.get("curriculum_tree", ""))

    for text in context.get("base_content_by_code", {}).values():
        total += _estimate_tokens(text)

    for q in context.get("bank_questions", []):
        total += _estimate_tokens(
            json.dumps(q.get("content", {}), ensure_ascii=False)
        )
        total += 50  # metadata overhead

    doc = context.get("document_content")
    if doc:
        total += _estimate_tokens(doc)

    return total


def _trim_context_to_budget(
    context: dict,
    max_tokens: int = MAX_CONTEXT_TOKENS,
) -> dict:
    """
    Progressively trim context to fit within token budget.

    Priority (last trimmed = highest priority):
      1. curriculum_tree  (always kept, small)
      2. document_content (teacher-provided)
      3. base_content_by_code
      4. bank_questions   (trimmed first — reduce count)
    """
    if _context_token_estimate(context) <= max_tokens:
        return context

    # Trim bank questions progressively
    for cap in [60, 40, 20, 10]:
        if len(context["bank_questions"]) > cap:
            context["bank_questions"] = context["bank_questions"][:cap]
            if _context_token_estimate(context) <= max_tokens:
                return context

    # Truncate base_content to first 2000 chars per code
    for code in context.get("base_content_by_code", {}):
        context["base_content_by_code"][code] = (
            context["base_content_by_code"][code][:2000]
        )
    if _context_token_estimate(context) <= max_tokens:
        return context

    # Truncate document_content last
    if context.get("document_content"):
        remaining = max(
            10000, (max_tokens - _context_token_estimate(context)) * 4
        )
        context["document_content"] = context["document_content"][:remaining]

    return context
