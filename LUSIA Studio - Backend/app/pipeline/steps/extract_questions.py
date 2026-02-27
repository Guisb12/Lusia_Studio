"""
Step 4: Question Extraction — extract questions from document markdown
and insert them into the questions table.

Runs only when document_category is 'exercises' or 'study_exercises'.

For each chunk of markdown:
1. Calls the LLM to extract questions as structured JSON
2. Inserts questions into the DB with source_type='ai_created'
3. Handles nested questions (context_group → children with parent_id)
4. Replaces question blocks in the markdown with {{question:uuid:type}} markers

Fatal: if extraction fails the pipeline job fails (ARQ retries).
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from supabase import Client

from app.pipeline.clients.openrouter import chat_completion
from app.pipeline.steps.image_utils import resolve_images_for_llm
from app.utils.db import supabase_execute

logger = logging.getLogger(__name__)


VALID_QUESTION_TYPES = {
    "multiple_choice",
    "true_false",
    "fill_blank",
    "matching",
    "short_answer",
    "multiple_response",
    "ordering",
    "open_extended",
    "context_group",
}

SYSTEM_PROMPT = """\
Es um assistente especializado em educação portuguesa. A tua tarefa é analisar o \
conteúdo de um documento e extrair TODAS as questões/exercícios presentes.

Responde APENAS com JSON válido neste formato:
{{
  "questions": [
    {{
      "type": "<tipo>",
      "label": "<rótulo>",
      "content": {{
        "question": "<enunciado em markdown>",
        "image_url": null,
        "options": [],
        "solution": null,
        "criteria": null,
        "original_grade": null,
        "ai_generated_fields": []
      }},
      "children": []
    }}
  ]
}}

Campos:
- **type**: multiple_choice | true_false | fill_blank | matching | short_answer | \
multiple_response | ordering | open_extended | context_group
- **label**: rótulo da questão (ex: "1.", "1.1", "a)", "Questão 3")
- **content**:
  - "question": enunciado em markdown. Mantém URLs artifact-image:// como estão.
  - "image_url": URL artifact-image:// associada à questão, ou null.
  - "options": depende do tipo:
    - MC, TF, MR, matching, ordering: [{{"label": "A", "text": "...", "image_url": null}}]
    - fill_blank: array de arrays de opções por lacuna. Ex: [["Júpiter", "Marte"], ["Terra"]]
    - outros: []
  - "solution": resposta correta:
    - multiple_choice: label da opção correta (ex: "B")
    - true_false: true ou false
    - fill_blank: [{{"answer": "texto", "image_url": null}}] por lacuna
    - matching: [{{"left": "A", "right": "1"}}]
    - ordering: ["C", "A", "B"]
    - short_answer / open_extended: texto
    - multiple_response: ["A", "C"]
    - context_group: null
  - "criteria": critérios de correção do documento, ou null
  - "original_grade": cotação mencionada no documento (ex: "20 pontos"), ou null. \
Nunca gerado pela IA — apenas extraído.
  - "ai_generated_fields": campos que a IA gerou por não estarem no documento. \
Ex: ["solution", "criteria"]. Nunca inclui "original_grade".
- **children**: para context_group, lista de sub-questões com a mesma estrutura de \
content (sem children aninhados). Para outros tipos, [].

Regras:
- Extrai TODAS as questões, mesmo simples.
- Alíneas (a), b), c)) dentro de uma questão são children de um context_group.
- Se não conseguires determinar o tipo, usa "open_extended".
- Imagens aparecem como artifact-image:// URLs — mantém-nas exatamente como estão.
- Observa as imagens fornecidas para entender diagramas e figuras referenciadas.

Regras fill_blank:
- Representa lacunas SEMPRE como {{{{blank}}}} no campo "question".
- Se o documento usa ___, [ ], ........, normaliza para {{{{blank}}}}.
- A ordem em solution e options corresponde à ordem esquerda→direita, cima→baixo.
- Se não há opções, options é [] — lacuna de texto livre.\
"""


async def extract_questions(
    db: Client,
    artifact_id: str,
    org_id: str,
    user_id: str,
    markdown: str,
    *,
    categorization: dict | None = None,
) -> tuple[str, list[str]]:
    """
    Extract questions from document markdown.

    Returns:
        (modified_markdown_with_markers, list_of_question_ids)
    """
    categorization = categorization or {}

    # Fetch artifact for curriculum metadata
    artifact_meta = _get_artifact_curriculum(db, artifact_id)

    # Merge categorization results with artifact metadata
    subject_id = artifact_meta.get("subject_id")
    year_level = artifact_meta.get("year_level")
    subject_component = (
        categorization.get("subject_component")
        or artifact_meta.get("subject_component")
    )
    curriculum_codes = categorization.get("curriculum_codes") or []

    all_question_ids: list[str] = []

    logger.info("Extracting questions from artifact %s (%d chars)", artifact_id, len(markdown))

    # Resolve artifact-image:// URLs to multimodal content blocks
    multimodal_content = await resolve_images_for_llm(db, markdown)

    # Single LLM call for the full document
    result = await chat_completion(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=multimodal_content,
        response_format={"type": "json_object"},
        temperature=0.1,
        max_tokens=32768,
    )

    raw_questions = result.get("questions", [])
    if not isinstance(raw_questions, list):
        logger.warning("LLM returned non-list questions for artifact %s", artifact_id)
        raw_questions = []

    logger.info("LLM returned %d questions for artifact %s", len(raw_questions), artifact_id)

    for raw_q in raw_questions:
        try:
            parent_id, child_ids = insert_question_tree(
                db,
                raw_q,
                org_id=org_id,
                user_id=user_id,
                artifact_id=artifact_id,
                subject_id=subject_id,
                year_level=year_level,
                subject_component=subject_component,
                curriculum_codes=curriculum_codes,
            )

            all_question_ids.append(parent_id)
            all_question_ids.extend(child_ids)

        except Exception as exc:
            logger.warning(
                "Failed to insert question (label=%s): %s",
                raw_q.get("label", "?"),
                exc,
            )
            continue

    # Marker replacement intentionally disabled.
    # Questions are stored in the questions table — inline placement
    # in the document markdown will be re-enabled once the editor
    # QuestionBlock integration is production-ready.

    logger.info(
        "Extracted %d questions from artifact %s",
        len(all_question_ids),
        artifact_id,
    )

    return markdown, all_question_ids


# ── Question insertion ──────────────────────────────────────


def insert_question_tree(
    db: Client,
    raw_q: dict,
    *,
    org_id: str,
    user_id: str,
    artifact_id: str,
    subject_id: str | None,
    year_level: str | None,
    subject_component: str | None,
    curriculum_codes: list[str],
) -> tuple[str, list[str]]:
    """
    Insert a question and its children into the DB.

    Returns:
        (parent_id, list_of_child_ids)
    """
    q_type = validate_type(raw_q.get("type"))
    content = raw_q.get("content", {})
    if not isinstance(content, dict):
        content = {"question": str(content)}

    # Ensure content has at minimum a "question" key
    if "question" not in content and q_type != "context_group":
        content["question"] = raw_q.get("label", "")

    # Normalize content to new schema — remove deprecated fields
    content = normalize_content(content)

    # Build parent insert data
    parent_data = {
        "organization_id": org_id,
        "created_by": user_id,
        "source_type": "ai_created",
        "artifact_id": artifact_id,
        "type": q_type,
        "content": content,
        "is_public": False,
    }

    if raw_q.get("label"):
        parent_data["label"] = str(raw_q["label"])
    if subject_id:
        parent_data["subject_id"] = subject_id
    if year_level:
        parent_data["year_level"] = year_level
    if subject_component:
        parent_data["subject_component"] = subject_component
    if curriculum_codes:
        parent_data["curriculum_codes"] = curriculum_codes

    # Insert parent
    now = datetime.now(timezone.utc).isoformat()
    parent_data["created_at"] = now
    parent_data["updated_at"] = now

    response = supabase_execute(
        db.table("questions").insert(parent_data),
        entity="question",
    )
    parent_row = response.data[0] if response.data else {}
    parent_id = parent_row["id"]

    # Insert children (for context_group)
    child_ids: list[str] = []
    children = raw_q.get("children") or []

    for order, child_q in enumerate(children):
        try:
            child_type = validate_type(child_q.get("type"))
            child_content = child_q.get("content", {})
            if not isinstance(child_content, dict):
                child_content = {"question": str(child_content)}

            if "question" not in child_content:
                child_content["question"] = child_q.get("label", "")

            child_content = normalize_content(child_content)

            child_data = {
                "organization_id": org_id,
                "created_by": user_id,
                "source_type": "ai_created",
                "artifact_id": artifact_id,
                "type": child_type,
                "parent_id": parent_id,
                "order_in_parent": order,
                "content": child_content,
                "is_public": False,
                "created_at": now,
                "updated_at": now,
            }

            if child_q.get("label"):
                child_data["label"] = str(child_q["label"])
            if subject_id:
                child_data["subject_id"] = subject_id
            if year_level:
                child_data["year_level"] = year_level
            if subject_component:
                child_data["subject_component"] = subject_component
            if curriculum_codes:
                child_data["curriculum_codes"] = curriculum_codes

            child_resp = supabase_execute(
                db.table("questions").insert(child_data),
                entity="question",
            )
            child_row = child_resp.data[0] if child_resp.data else {}
            child_ids.append(child_row["id"])

        except Exception as exc:
            logger.warning(
                "Failed to insert child question (label=%s) under parent %s: %s",
                child_q.get("label", "?"),
                parent_id,
                exc,
            )
            continue

    return parent_id, child_ids


# ── Marker replacement ──────────────────────────────────────


def _apply_markers(
    markdown: str,
    replacements: list[tuple[str, str]],
) -> str:
    """
    Replace original_text spans in markdown with question markers.

    Processes from longest to shortest original_text to avoid
    substring overlap issues.

    Fallback strategy:
    1. Exact match
    2. Normalized whitespace match
    3. Anchor match (first ~100 chars)
    4. Append at end (question is still in DB, just not inline)
    """
    # Sort by length descending to avoid substring issues
    sorted_replacements = sorted(replacements, key=lambda r: len(r[0]), reverse=True)

    for original_text, marker in sorted_replacements:
        if not original_text.strip():
            continue

        # Strategy 1: Exact match
        if original_text in markdown:
            markdown = markdown.replace(original_text, marker, 1)
            continue

        # Strategy 2: Normalized whitespace match
        normalized_original = _normalize_whitespace(original_text)
        normalized_md = _normalize_whitespace(markdown)

        idx = normalized_md.find(normalized_original)
        if idx != -1:
            # Find the approximate position in the original markdown
            # by mapping normalized index back
            start = _find_normalized_position(markdown, idx)
            end = _find_normalized_position(
                markdown, idx + len(normalized_original)
            )
            if start is not None and end is not None:
                markdown = markdown[:start] + marker + markdown[end:]
                continue

        # Strategy 3: Anchor match using first ~100 chars
        anchor = original_text.strip()[:100].strip()
        if len(anchor) > 20 and anchor in markdown:
            # Find the anchor and replace from there to approximate end
            anchor_idx = markdown.index(anchor)
            # Estimate end based on original length + some tolerance
            approx_end = min(
                anchor_idx + len(original_text) + 50, len(markdown)
            )
            # Find the next paragraph break after the estimated end
            next_break = markdown.find("\n\n", anchor_idx + len(original_text) - 50)
            if next_break != -1 and next_break < approx_end:
                end_idx = next_break
            else:
                end_idx = anchor_idx + len(original_text)
                # Clamp to markdown length
                end_idx = min(end_idx, len(markdown))

            markdown = markdown[:anchor_idx] + marker + markdown[end_idx:]
            continue

        # Strategy 4: Append fallback
        logger.warning(
            "Could not find original_text in markdown for marker %s, appending",
            marker,
        )
        markdown = markdown + f"\n\n{marker}"

    return markdown


def _normalize_whitespace(text: str) -> str:
    """Collapse all whitespace to single spaces and strip."""
    return re.sub(r"\s+", " ", text).strip()


def _find_normalized_position(text: str, normalized_idx: int) -> int | None:
    """
    Map a position in normalized text back to original text position.

    Walks through the original text counting non-whitespace-collapsed chars.
    """
    norm_pos = 0
    i = 0
    in_whitespace = False

    while i < len(text) and norm_pos < normalized_idx:
        if text[i] in (" ", "\t", "\n", "\r"):
            if not in_whitespace:
                norm_pos += 1  # Count collapsed whitespace as one char
                in_whitespace = True
        else:
            norm_pos += 1
            in_whitespace = False
        i += 1

    return i if norm_pos == normalized_idx else None


# ── Markdown chunking ───────────────────────────────────────


# ── Utilities ────────────────────────────────────────────────


def normalize_content(content: dict) -> dict:
    """
    Normalize question content to the new schema.

    Removes deprecated fields (correct_answer, correct_answers, correct_pairs,
    correct_order, blanks, tip, is_correct on options) and ensures new fields
    exist (solution, criteria, original_grade, ai_generated_fields).
    """
    # Remove deprecated fields
    for deprecated in ("correct_answer", "correct_answers", "correct_pairs",
                       "correct_order", "blanks", "tip"):
        content.pop(deprecated, None)

    # Normalize options: remove is_correct, ensure label-based format
    if "options" in content and isinstance(content["options"], list):
        for opt in content["options"]:
            if isinstance(opt, dict):
                opt.pop("is_correct", None)
                # Ensure image_url field exists on options
                opt.setdefault("image_url", None)

    # Ensure new schema fields exist with defaults
    content.setdefault("solution", None)
    content.setdefault("criteria", None)
    content.setdefault("original_grade", None)
    content.setdefault("ai_generated_fields", [])

    return content


def validate_type(raw_type: str | None) -> str:
    """Validate and normalize question type, defaulting to open_extended."""
    if raw_type and raw_type in VALID_QUESTION_TYPES:
        return raw_type
    return "open_extended"


def _get_artifact_curriculum(db: Client, artifact_id: str) -> dict:
    """Fetch curriculum metadata from the artifact."""
    response = supabase_execute(
        db.table("artifacts")
        .select("subject_id,year_level,subject_component,curriculum_codes")
        .eq("id", artifact_id)
        .limit(1),
        entity="artifact",
    )
    rows = response.data or []
    return rows[0] if rows else {}
