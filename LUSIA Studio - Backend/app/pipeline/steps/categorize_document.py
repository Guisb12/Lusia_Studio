"""
Step 3: AI Categorization — map document content to curriculum codes.

The teacher has already set subject_id, year_level, and optionally
subject_component on the artifact. This step queries the curriculum tree
scoped by those values (levels 0–2 only), sends the document content to
an LLM, and tags the artifact with the matching curriculum_codes.

Non-fatal: if categorization fails the pipeline continues without tags.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from supabase import Client

from app.pipeline.clients.openrouter import chat_completion
from app.pipeline.steps.image_utils import resolve_images_for_llm
from app.utils.db import supabase_execute

logger = logging.getLogger(__name__)

# Only subjects with a built curriculum tree can be categorized.
CATEGORIZABLE_STATUSES = {"full", "structure"}

SYSTEM_PROMPT = (
    "You are a curriculum tagging assistant for Portuguese secondary education.\n"
    "Your job is to map document content to the official curriculum taxonomy.\n"
    "You must respond ONLY with valid JSON. No explanation, no markdown, no preamble."
)

USER_PROMPT_TEMPLATE_WITH_COMPONENT = """\
The teacher has indicated this document belongs to:
- Subject: {subject_name}
- Year: {year_level}º ano

The curriculum tree below contains nodes from multiple components of this subject.
You must also identify which component this document belongs to.
Format: [CODE] (level N) [component] Title — keywords

{serialized_tree}

---
Document content:
{markdown_content}

---
Task: Identify which curriculum node this document belongs to, and which component it covers.

Rules:
- Return a SINGLE code whenever possible — only return more than one if the document
  genuinely and substantially covers multiple distinct curriculum areas.
- Tag at the MOST SPECIFIC level possible (prefer level 2 over level 1, level 1 over level 0).
- Only use a higher level if the content spans multiple nodes at that lower level.
- Only return codes that exist exactly as shown in the curriculum tree above.
- subject_component must be one of the component names shown in the tree.

Respond with ONLY this JSON structure:
{{
  "curriculum_codes": ["CODE_1"],
  "subject_component": "Física"
}}"""

USER_PROMPT_TEMPLATE_NO_COMPONENT = """\
The teacher has indicated this document belongs to:
- Subject: {subject_name}
- Year: {year_level}º ano

Below is the curriculum tree for this subject and year.
Format: [CODE] (level N) Title — keywords

{serialized_tree}

---
Document content:
{markdown_content}

---
Task: Identify which curriculum node this document belongs to.

Rules:
- Return a SINGLE code whenever possible — only return more than one if the document
  genuinely and substantially covers multiple distinct curriculum areas.
- Tag at the MOST SPECIFIC level possible (prefer level 2 over level 1, level 1 over level 0).
- Only use a higher level if the content spans multiple nodes at that lower level.
- Only return codes that exist exactly as shown in the curriculum tree above.

Respond with ONLY this JSON structure:
{{
  "curriculum_codes": ["CODE_1"]
}}"""



async def categorize_document(
    db: Client,
    artifact_id: str,
    markdown: str,
) -> dict:
    """
    Categorize a document against the curriculum tree.

    Fetches the artifact's subject/year/component, queries the curriculum
    tree (levels 0–2), calls the LLM, validates codes, and updates the
    artifact row.

    Returns:
        {"curriculum_codes": [...], "subject_component": str|None}
    """
    # 1. Fetch artifact metadata
    artifact = _get_artifact_metadata(db, artifact_id)

    subject_id = artifact.get("subject_id")
    year_level = artifact.get("year_level")
    subject_component = artifact.get("subject_component")

    # Can't categorize without subject and year
    if not subject_id or not year_level:
        logger.info(
            "Skipping categorization for artifact %s — no subject_id or year_level",
            artifact_id,
        )
        return {}

    # 2. Guard: only subjects with a built curriculum tree can be categorized
    subject_status = get_subject_status(db, subject_id)
    if subject_status not in CATEGORIZABLE_STATUSES:
        logger.info(
            "Skipping categorization for artifact %s — subject %s has status '%s' "
            "(curriculum tree only available for 'full' and 'structure' subjects)",
            artifact_id,
            subject_id,
            subject_status,
        )
        return {}

    # 3. Get subject name for the prompt
    subject_name = get_subject_name(db, subject_id)
    if not subject_name:
        logger.warning("Subject %s not found, skipping categorization", subject_id)
        return {}

    # 4. Query curriculum tree (levels 0–2 only)
    tree_nodes = get_curriculum_tree(db, subject_id, year_level, subject_component)
    if not tree_nodes:
        logger.info(
            "No curriculum nodes found for subject=%s year=%s component=%s",
            subject_id,
            year_level,
            subject_component,
        )
        return {}

    # 5. Detect whether this subject has components
    has_components = any(node.get("subject_component") for node in tree_nodes)

    # 6. Serialize tree for the prompt
    serialized_tree = serialize_tree(tree_nodes, include_component=has_components)
    valid_codes = {node["code"] for node in tree_nodes if node.get("code")}

    # 7. Build prompt (component-aware) and call LLM
    if has_components:
        user_text = USER_PROMPT_TEMPLATE_WITH_COMPONENT.format(
            subject_name=subject_name,
            year_level=year_level,
            serialized_tree=serialized_tree,
            markdown_content=markdown,
        )
    else:
        user_text = USER_PROMPT_TEMPLATE_NO_COMPONENT.format(
            subject_name=subject_name,
            year_level=year_level,
            serialized_tree=serialized_tree,
            markdown_content=markdown,
        )

    multimodal_content = await resolve_images_for_llm(db, user_text)

    result = await chat_completion(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=multimodal_content,
        response_format={"type": "json_object"},
        temperature=0.1,
        max_tokens=1024,
    )

    # 8. Validate returned codes against the DB
    raw_codes = result.get("curriculum_codes", [])
    if not isinstance(raw_codes, list):
        raw_codes = [raw_codes] if raw_codes else []

    validated_codes = [c for c in raw_codes if c in valid_codes]
    if raw_codes and not validated_codes:
        logger.warning(
            "All returned codes invalid for artifact %s: %s",
            artifact_id,
            raw_codes,
        )

    ai_component = result.get("subject_component")

    # 9. Update artifact with categorization results
    update_data: dict = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if validated_codes:
        update_data["curriculum_codes"] = validated_codes
    if ai_component and not subject_component:
        # Only set component if teacher didn't already provide one
        update_data["subject_component"] = ai_component

    if len(update_data) > 1:  # More than just updated_at
        supabase_execute(
            db.table("artifacts").update(update_data).eq("id", artifact_id),
            entity="artifact",
        )

    categorization = {
        "curriculum_codes": validated_codes,
        "subject_component": ai_component or subject_component,
    }

    logger.info(
        "Categorized artifact %s: codes=%s component=%s",
        artifact_id,
        validated_codes,
        categorization["subject_component"],
    )

    return categorization


# ── Helpers ──────────────────────────────────────────────────


def _get_artifact_metadata(db: Client, artifact_id: str) -> dict:
    """Fetch only the fields needed for categorization."""
    response = supabase_execute(
        db.table("artifacts")
        .select("subject_id,year_level,subject_component")
        .eq("id", artifact_id)
        .limit(1),
        entity="artifact",
    )
    rows = response.data or []
    if not rows:
        return {}
    return rows[0]


def get_subject_status(db: Client, subject_id: str) -> str | None:
    """Get the status of a subject (full, structure, viable, gpa_only)."""
    response = supabase_execute(
        db.table("subjects")
        .select("status")
        .eq("id", subject_id)
        .limit(1),
        entity="subject",
    )
    rows = response.data or []
    return rows[0]["status"] if rows else None


def get_subject_name(db: Client, subject_id: str) -> str | None:
    """Get the display name for a subject."""
    response = supabase_execute(
        db.table("subjects")
        .select("name")
        .eq("id", subject_id)
        .limit(1),
        entity="subject",
    )
    rows = response.data or []
    return rows[0]["name"] if rows else None


def get_curriculum_tree(
    db: Client,
    subject_id: str,
    year_level: str,
    subject_component: str | None,
) -> list[dict]:
    """
    Query all curriculum nodes for the given scope, levels 0–2 only.

    Unlike the API endpoint which fetches one parent level at a time,
    we fetch the entire tree at once for the LLM prompt.
    """
    query = (
        db.table("curriculum")
        .select("code,title,keywords,level,subject_component")
        .eq("subject_id", subject_id)
        .eq("year_level", year_level)
        .in_("level", [0, 1, 2])
        .order("code", desc=False)
    )

    if subject_component:
        query = query.eq("subject_component", subject_component)

    response = supabase_execute(query, entity="curriculum")
    return response.data or []


def serialize_tree(nodes: list[dict], *, include_component: bool = False) -> str:
    """
    Serialize curriculum nodes into a compact text format for the LLM.

    Format (no component): [CODE] (level N) Title — keyword1, keyword2
    Format (with component): [CODE] (level N) [ComponentName] Title — keyword1, keyword2
    """
    lines = []
    for node in nodes:
        code = node.get("code", "?")
        level = node.get("level", 0)
        title = node.get("title", "")
        keywords = node.get("keywords") or []
        component = node.get("subject_component") or ""

        if include_component and component:
            line = f"[{code}] (level {level}) [{component}] {title}"
        else:
            line = f"[{code}] (level {level}) {title}"

        if keywords:
            line += f" — {', '.join(keywords)}"
        lines.append(line)

    return "\n".join(lines)


# ── Question-level categorization (Flow C) ──────────────────


QUESTION_CATEGORIZATION_SYSTEM_PROMPT = (
    "You are a curriculum tagging assistant for Portuguese secondary education.\n"
    "Your job is to map each question to the correct curriculum code and year level.\n"
    "You must respond ONLY with valid JSON. No explanation, no markdown, no preamble."
)

QUESTION_CATEGORIZATION_USER_TEMPLATE = """\
The teacher has indicated these questions belong to:
- Subject: {subject_name}
- Component: {subject_component}
- Possible years: {year_levels}

Below is the combined curriculum tree for all the indicated years.
Format: [CODE] (level N, year Yº) Title — keywords

{serialized_tree}

---
Questions to categorize:

{serialized_questions}

---
Task: For each question, determine which curriculum code it belongs to and which year level.

Rules:
- Return one entry per question with question_id, curriculum_codes (list), and year_level.
- Tag at the MOST SPECIFIC level possible (prefer level 2 over 1, level 1 over 0).
- Only return codes that exist exactly in the curriculum tree above.
- year_level must be one of the years listed above.
- Return ONLY this JSON structure:
{{
  "question_mappings": [
    {{"question_id": "uuid", "curriculum_codes": ["CODE_1"], "year_level": "10"}}
  ]
}}"""



async def categorize_questions(
    db: Client,
    artifact_id: str,
    question_ids: list[str],
    year_levels: list[str] | None,
) -> None:
    """
    Categorize questions individually against the curriculum tree (Flow C).

    Fetches the artifact's subject, queries the curriculum tree for ALL
    specified years, sends questions to the LLM in batches, and updates
    each question with its own curriculum_codes and year_level.
    """
    if not question_ids:
        return

    # 1. Fetch artifact metadata
    artifact = _get_artifact_metadata(db, artifact_id)
    subject_id = artifact.get("subject_id")
    subject_component = artifact.get("subject_component")

    if not subject_id:
        logger.warning(
            "Cannot categorize questions for artifact %s — no subject_id",
            artifact_id,
        )
        return

    # Guard: only subjects with a built curriculum tree can be categorized
    subject_status = get_subject_status(db, subject_id)
    if subject_status not in CATEGORIZABLE_STATUSES:
        logger.info(
            "Skipping question categorization for artifact %s — subject %s has status '%s' "
            "(curriculum tree only available for 'full' and 'structure' subjects)",
            artifact_id,
            subject_id,
            subject_status,
        )
        return

    if not year_levels:
        logger.warning(
            "Cannot categorize questions for artifact %s — no year_levels",
            artifact_id,
        )
        return

    # 2. Get subject name
    subject_name = get_subject_name(db, subject_id)
    if not subject_name:
        logger.warning("Subject %s not found, skipping question categorization", subject_id)
        return

    # 3. Build merged curriculum tree for all years
    all_nodes: list[dict] = []
    for year in year_levels:
        nodes = get_curriculum_tree(db, subject_id, year, subject_component)
        # Tag each node with its year for the prompt
        for node in nodes:
            node["_year"] = year
        all_nodes.extend(nodes)

    if not all_nodes:
        logger.info(
            "No curriculum nodes found for subject=%s years=%s",
            subject_id,
            year_levels,
        )
        return

    valid_codes = {node["code"] for node in all_nodes if node.get("code")}

    # 4. Serialize tree with year annotations
    tree_lines = []
    for node in all_nodes:
        code = node.get("code", "?")
        level = node.get("level", 0)
        title = node.get("title", "")
        year = node.get("_year", "?")
        keywords = node.get("keywords") or []
        line = f"[{code}] (level {level}, year {year}º) {title}"
        if keywords:
            line += f" — {', '.join(keywords)}"
        tree_lines.append(line)
    serialized_tree = "\n".join(tree_lines)

    # 5. Fetch all questions
    all_questions = _fetch_questions(db, question_ids)
    if not all_questions:
        logger.warning("No questions found for IDs: %s", question_ids[:5])
        return

    # 6. Send all questions in a single LLM call
    logger.info("Categorizing %d questions for artifact %s", len(all_questions), artifact_id)
    serialized_questions = _serialize_questions(all_questions)

    user_text = QUESTION_CATEGORIZATION_USER_TEMPLATE.format(
        subject_name=subject_name,
        subject_component=subject_component or "N/A",
        year_levels=", ".join(f"{y}º ano" for y in year_levels),
        serialized_tree=serialized_tree,
        serialized_questions=serialized_questions,
    )

    multimodal_content = await resolve_images_for_llm(db, user_text)

    result = await chat_completion(
        system_prompt=QUESTION_CATEGORIZATION_SYSTEM_PROMPT,
        user_prompt=multimodal_content,
        response_format={"type": "json_object"},
        temperature=0.1,
        max_tokens=8192,
    )

    # 7. Process mappings
    mappings = result.get("question_mappings", [])
    if not isinstance(mappings, list):
        logger.warning("LLM returned non-list question_mappings for artifact %s", artifact_id)
        return

    now = datetime.now(timezone.utc).isoformat()
    valid_years = set(year_levels)
    all_question_ids = {q["id"] for q in all_questions}

    for mapping in mappings:
        q_id = mapping.get("question_id")
        if not q_id or q_id not in all_question_ids:
            continue

        raw_codes = mapping.get("curriculum_codes", [])
        if not isinstance(raw_codes, list):
            raw_codes = [raw_codes] if raw_codes else []
        validated_codes = [c for c in raw_codes if c in valid_codes]

        q_year = mapping.get("year_level")
        if q_year and str(q_year) not in valid_years:
            q_year = None

        update_data: dict = {"updated_at": now}
        if validated_codes:
            update_data["curriculum_codes"] = validated_codes
        if q_year:
            update_data["year_level"] = str(q_year)

        if len(update_data) > 1:
            try:
                supabase_execute(
                    db.table("questions").update(update_data).eq("id", q_id),
                    entity="question",
                )
            except Exception as exc:
                logger.warning(
                    "Failed to update question %s with categorization: %s",
                    q_id,
                    exc,
                )

    logger.info(
        "Categorized %d questions for artifact %s",
        len(all_questions),
        artifact_id,
    )


def _fetch_questions(db: Client, question_ids: list[str]) -> list[dict]:
    """Fetch questions by IDs (parent-level only, no children)."""
    # Supabase IN filter needs comma-separated values
    response = supabase_execute(
        db.table("questions")
        .select("id,type,label,content")
        .in_("id", question_ids)
        .is_("parent_id", "null"),
        entity="questions",
    )
    return response.data or []


def _serialize_questions(questions: list[dict]) -> str:
    """Serialize questions into a compact text for the LLM prompt."""
    lines = []
    for q in questions:
        q_id = q.get("id", "?")
        q_type = q.get("type", "?")
        label = q.get("label", "")
        content = q.get("content", {})
        question_text = content.get("question", "") if isinstance(content, dict) else str(content)
        lines.append(f"[{q_id}] (type: {q_type}, label: {label}) {question_text}")
    return "\n\n".join(lines)
