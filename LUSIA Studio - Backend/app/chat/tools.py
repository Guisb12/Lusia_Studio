"""
LangChain tools for the Chat AI agent.

Two curriculum-querying tools that give the LLM efficient access:
  1. get_curriculum_index — full hierarchical overview (levels 0-2) in one call
  2. get_curriculum_content — fetch leaf content under any node in one call
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from typing import Annotated, Literal, Optional

from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool
from pydantic import BaseModel, ConfigDict, Field

from app.api.http.services.visual_generation_service import DEFAULT_THEME, generate_visual_stream
from app.core.database import get_b2b_db
from app.utils.db import supabase_execute

logger = logging.getLogger(__name__)


# ── Year-level to education-level mapping ───────────────────────────────

YEAR_TO_EDUCATION_LEVEL = {
    "1": "basico_1_ciclo",
    "2": "basico_1_ciclo",
    "3": "basico_1_ciclo",
    "4": "basico_1_ciclo",
    "5": "basico_2_ciclo",
    "6": "basico_2_ciclo",
    "7": "basico_3_ciclo",
    "8": "basico_3_ciclo",
    "9": "basico_3_ciclo",
    "10": "secundario",
    "11": "secundario",
    "12": "secundario",
}


def _year_to_education_level(year_level: str) -> str | None:
    """Map a year level (e.g. '10') to an education_level enum value."""
    return YEAR_TO_EDUCATION_LEVEL.get(str(year_level).strip())


class _SubjectMatch:
    """Resolved subject with metadata."""
    __slots__ = ("id", "name", "color", "icon")

    def __init__(self, row: dict):
        self.id: str = str(row["id"])
        self.name: str = row.get("name", "")
        self.color: str | None = row.get("color")
        self.icon: str | None = row.get("icon")


def _resolve_subject(subject_name: str, year_level: str) -> _SubjectMatch | None:
    """Match a subject name + year level to a subject row (id, name, color, icon).

    Uses education_level derived from year_level to disambiguate subjects
    with the same name across different cycles (e.g. 'Português' exists
    in every education level).
    """
    db = get_b2b_db()
    education_level = _year_to_education_level(year_level)

    # Build base query — include global subjects (organization_id IS NULL)
    def _build_query(name_filter: str):
        query = (
            db.table("subjects")
            .select("id, name, education_level, grade_levels, color, icon")
            .ilike("name", name_filter)
            .eq("active", True)
        )
        if education_level:
            query = query.eq("education_level", education_level)
        return query

    # Try exact match first (case-insensitive)
    resp = supabase_execute(_build_query(subject_name).limit(1), entity="subjects")
    if resp.data:
        return _SubjectMatch(resp.data[0])

    # Try partial match
    resp = supabase_execute(_build_query(f"%{subject_name}%").limit(5), entity="subjects")
    if resp.data:
        return _SubjectMatch(resp.data[0])

    return None


def _resolve_subject_by_name(subject_name: str) -> _SubjectMatch | None:
    normalized = str(subject_name or "").strip()
    if not normalized:
        return None

    db = get_b2b_db()

    def _build_query(name_filter: str):
        return (
            db.table("subjects")
            .select("id, name, color, icon")
            .ilike("name", name_filter)
            .eq("active", True)
        )

    resp = supabase_execute(_build_query(normalized).limit(1), entity="subjects")
    if resp.data:
        return _SubjectMatch(resp.data[0])

    resp = supabase_execute(_build_query(f"%{normalized}%").limit(5), entity="subjects")
    if resp.data:
        return _SubjectMatch(resp.data[0])

    return None


def _build_visual_theme_colors(subject_color: str | None) -> dict[str, str] | None:
    if not isinstance(subject_color, str) or not subject_color.startswith("#") or len(subject_color) != 7:
        return None

    r, g, b = int(subject_color[1:3], 16), int(subject_color[3:5], 16), int(subject_color[5:7], 16)
    return {
        "accent": subject_color,
        "accent-soft": f"rgba({r},{g},{b},0.10)",
    }


def _build_visual_prompt(*, purpose: str, visual_content: str, learning_goal: str) -> str:
    return (
        f"Propósito: {purpose.strip()}\n\n"
        f"Conteúdo visual: {visual_content.strip()}\n\n"
        f"Objectivo de aprendizagem: {learning_goal.strip()}"
    )


def _build_tree(nodes: list[dict]) -> str:
    """Build a hierarchical tree string from flat curriculum nodes (levels 0-2)."""
    # Index nodes by parent_id
    children_by_parent = defaultdict(list)
    nodes_by_id = {}
    roots = []

    for node in nodes:
        nodes_by_id[node["id"]] = node
        pid = node.get("parent_id")
        if pid and pid in nodes_by_id:
            children_by_parent[pid].append(node)
        elif node.get("level", 0) == 0:
            roots.append(node)
        else:
            children_by_parent[pid].append(node)

    lines = []

    def _format_node(node: dict, indent: int):
        level = node.get("level", 0)
        title = node.get("title", "")
        node_id = node.get("id", "")
        prefix = "  " * indent
        lines.append(f"{prefix}[L{level}] {title} (ID: {node_id})")
        for child in children_by_parent.get(node_id, []):
            _format_node(child, indent + 1)

    for root in roots:
        _format_node(root, 0)

    return "\n".join(lines)


def _tool_envelope(
    *,
    tool_name: str,
    status: str,
    input_payload: dict,
    output_payload: dict,
    display_payload: dict,
    llm_text: str,
) -> str:
    return json.dumps(
        {
            "tool_data": {
                "tool_name": tool_name,
                "status": status,
                "input": input_payload,
                "output": output_payload,
                "display": display_payload,
            },
            "llm_text": llm_text,
        },
        ensure_ascii=False,
    )


def _preview_text(text: str, max_chars: int = 500) -> str:
    compact = "\n".join(
        line for line in text.splitlines()
        if line.strip() and not line.startswith("## ")
    ).strip()
    if len(compact) <= max_chars:
        return compact
    return compact[:max_chars].rsplit(" ", 1)[0].rstrip() + "..."


@tool
def get_curriculum_index(
    subject_name: str,
    year_level: str,
    subject_component: Optional[str] = None,
) -> str:
    """Get the full curriculum tree overview for a subject and year level.

    Returns a hierarchical tree showing levels 0 (domains), 1 (chapters),
    and 2 (subchapters) with their IDs. Use the IDs with get_curriculum_content
    to fetch the actual educational content.

    Args:
        subject_name: The name of the subject (e.g. "Matemática A", "Português", "Biologia e Geologia", "Filosofia", "Economia A").
        year_level: The year/grade level (e.g. "10", "11", "12", "7").
        subject_component: Optional component for multi-discipline subjects (e.g. "Física"/"Química" for Física e Química A, "Biologia"/"Geologia" for Biologia e Geologia).
    """
    db = get_b2b_db()

    input_payload = {
        "subject_name": subject_name,
        "year_level": year_level,
        "subject_component": subject_component,
    }
    subject = _resolve_subject(subject_name, year_level)
    if not subject:
        llm_text = f"Nao encontrei a disciplina '{subject_name}' para o {year_level}o ano. Verifica o nome e tenta novamente."
        return _tool_envelope(
            tool_name="get_curriculum_index",
            status="not_found",
            input_payload=input_payload,
            output_payload={},
            display_payload={
                "type": "curriculum_index",
                "title": f"{subject_name} - {year_level}o ano",
                "node_count": 0,
                "summary": llm_text,
                "subject_color": None,
                "subject_icon": None,
            },
            llm_text=llm_text,
        )
    subject_id = subject.id

    try:
        # Query all nodes at levels 0, 1, and 2
        query = (
            db.table("curriculum")
            .select("id, code, title, level, parent_id, has_children, description")
            .eq("subject_id", subject_id)
            .eq("year_level", year_level)
            .in_("level", [0, 1, 2])
            .order("sequence_order")
            .order("code")
        )
        if subject_component:
            query = query.eq("subject_component", subject_component)

        resp = supabase_execute(query, entity="curriculum")
        nodes = resp.data or []
    except Exception as e:
        logger.error("Failed to list curriculum nodes: %s", e)
        llm_text = f"Erro ao consultar o curriculo: {e}"
        return _tool_envelope(
            tool_name="get_curriculum_index",
            status="error",
            input_payload=input_payload,
            output_payload={},
            display_payload={
                "type": "curriculum_index",
                "title": f"{subject_name} - {year_level}o ano",
                "node_count": 0,
                "summary": llm_text,
                "subject_color": subject.color,
                "subject_icon": subject.icon,
            },
            llm_text=llm_text,
        )

    if not nodes:
        msg = f"Nao encontrei topicos para '{subject_name}' no {year_level}o ano"
        if subject_component:
            msg += f" (componente: {subject_component})"
        msg += "."
        available_components: list[str] = []
        # Check available components
        try:
            comp_resp = supabase_execute(
                db.table("curriculum")
                .select("subject_component")
                .eq("subject_id", subject_id)
                .eq("year_level", year_level)
                .eq("level", 0)
                .limit(20),
                entity="curriculum",
            )
            available_components = list({
                r["subject_component"]
                for r in (comp_resp.data or [])
                if r.get("subject_component")
            })
            if available_components:
                msg += f"\nComponentes disponiveis: {', '.join(sorted(available_components))}"
        except Exception:
            pass
        return _tool_envelope(
            tool_name="get_curriculum_index",
            status="not_found",
            input_payload=input_payload,
            output_payload={
                "available_components": available_components,
            },
            display_payload={
                "type": "curriculum_index",
                "title": f"{subject_name} - {year_level}o ano",
                "node_count": 0,
                "summary": msg,
                "subject_color": subject.color,
                "subject_icon": subject.icon,
            },
            llm_text=msg,
        )

    tree = _build_tree(nodes)

    header = f"## {subject_name} — {year_level}o ano\n\n"
    footer = (
        "\n\n**Usa get_curriculum_content com qualquer ID acima para obter o conteudo.**\n"
        "- ID de nivel 2 → conteudo especifico (recomendado)\n"
        "- ID de nivel 1 → conteudo de todo o capitulo\n"
        "- ID de nivel 0 → conteudo de todo o dominio (pode ser muito extenso)"
    )

    llm_text = header + tree + footer
    return _tool_envelope(
        tool_name="get_curriculum_index",
        status="completed",
        input_payload=input_payload,
        output_payload={
            "subject_name": subject_name,
            "year_level": year_level,
            "subject_component": subject_component,
            "node_count": len(nodes),
            "nodes": [
                {
                    "id": node.get("id"),
                    "code": node.get("code"),
                    "title": node.get("title"),
                    "level": node.get("level"),
                    "parent_id": node.get("parent_id"),
                    "has_children": node.get("has_children", False),
                }
                for node in nodes
            ],
        },
        display_payload={
            "type": "curriculum_index",
            "title": f"{subject_name} - {year_level}o ano",
            "node_count": len(nodes),
            "summary": f"{len(nodes)} tópicos encontrados",
            "subject_color": subject.color,
            "subject_icon": subject.icon,
        },
        llm_text=llm_text,
    )


@tool
def get_curriculum_content(node_id: str) -> str:
    """Read the educational content under any curriculum node.

    Accepts a node ID at any level:
    - Level 0: returns all content under that domain (broad — may be large)
    - Level 1: returns all content under that chapter (recommended)
    - Level 2: returns content under that subchapter (specific — recommended)
    - Level 3 (leaf): returns just that leaf's content

    Args:
        node_id: The UUID of any curriculum node from get_curriculum_index.
    """
    db = get_b2b_db()
    input_payload = {"node_id": node_id}

    try:
        # 1. Fetch the target node
        target_resp = supabase_execute(
            db.table("curriculum")
            .select("id, code, title, level, has_children, subject_id, year_level, subject_component, parent_id")
            .eq("id", node_id)
            .limit(1),
            entity="curriculum",
        )
        if not target_resp.data:
            llm_text = f"Nao encontrei o no curricular com ID '{node_id}'."
            return _tool_envelope(
                tool_name="get_curriculum_content",
                status="not_found",
                input_payload=input_payload,
                output_payload={},
                display_payload={
                    "type": "curriculum_content",
                    "title": node_id,
                    "preview_text": llm_text,
                    "leaf_count": 0,
                    "section_count": 0,
                },
                llm_text=llm_text,
            )

        target = target_resp.data[0]
        target_code = target.get("code", "")
        target_title = target.get("title", "")
        target_level = target.get("level", 0)
        has_children = target.get("has_children", False)
        target_subject_id = target.get("subject_id")
        target_year_level = target.get("year_level")
        target_subject_component = target.get("subject_component")

        # Fetch subject color/icon for UI
        _subj_color = None
        _subj_icon = None
        if target_subject_id:
            try:
                _subj_resp = supabase_execute(
                    db.table("subjects").select("color, icon").eq("id", target_subject_id).limit(1),
                    entity="subjects",
                )
                if _subj_resp.data:
                    _subj_color = _subj_resp.data[0].get("color")
                    _subj_icon = _subj_resp.data[0].get("icon")
            except Exception:
                pass

        # 2. Find all leaf nodes under this node
        if not has_children:
            # This IS a leaf node — just fetch its content directly
            leaf_ids = [node_id]
            leaves_by_id = {node_id: target}
        else:
            # Find all descendants using code prefix pattern, then filter to leaves
            leaf_query = (
                db.table("curriculum")
                .select("id, code, title, level, parent_id, has_children")
                .like("code", f"{target_code}%")
                .eq("subject_id", target_subject_id)
                .eq("year_level", target_year_level)
                .eq("has_children", False)
                .order("sequence_order")
                .order("code")
            )
            if target_subject_component:
                leaf_query = leaf_query.eq("subject_component", target_subject_component)
            leaf_resp = supabase_execute(leaf_query, entity="curriculum")
            leaves = leaf_resp.data or []
            if not leaves:
                llm_text = (
                    f"## {target_code} — {target_title}\n\n"
                    "Nao existem topicos com conteudo sob este no."
                )
                return _tool_envelope(
                    tool_name="get_curriculum_content",
                    status="not_found",
                    input_payload=input_payload,
                    output_payload={
                        "node": {
                            "id": target.get("id"),
                            "code": target_code,
                            "title": target_title,
                            "level": target_level,
                            "has_children": has_children,
                        },
                        "leaf_count": 0,
                        "leaves": [],
                    },
                    display_payload={
                        "type": "curriculum_content",
                        "title": f"{target_code} — {target_title}",
                        "preview_text": "Nao existem topicos com conteudo sob este no.",
                        "leaf_count": 0,
                        "section_count": 0,
                        "subject_color": _subj_color,
                        "subject_icon": _subj_icon,
                    },
                    llm_text=llm_text,
                )
            leaf_ids = [l["id"] for l in leaves]
            leaves_by_id = {l["id"]: l for l in leaves}

        # 3. Batch-fetch base_content for all leaf curriculum_ids
        content_resp = supabase_execute(
            db.table("base_content")
            .select("curriculum_id, content_json, word_count")
            .in_("curriculum_id", leaf_ids),
            entity="base_content",
        )
        content_by_curriculum = {
            row["curriculum_id"]: row for row in (content_resp.data or [])
        }

        # 4. Also fetch intermediate nodes for hierarchy headers (levels between target and leaves)
        if has_children and target_level < 3:
            hierarchy_query = (
                db.table("curriculum")
                .select("id, code, title, level, parent_id")
                .like("code", f"{target_code}%")
                .eq("subject_id", target_subject_id)
                .eq("year_level", target_year_level)
                .eq("has_children", True)
                .order("sequence_order")
                .order("code")
            )
            if target_subject_component:
                hierarchy_query = hierarchy_query.eq("subject_component", target_subject_component)
            hierarchy_resp = supabase_execute(hierarchy_query, entity="curriculum")
            branch_nodes = {n["id"]: n for n in (hierarchy_resp.data or [])}
        else:
            branch_nodes = {}

        # 5. Format output with hierarchy
        parts = [f"## {target_code} — {target_title}\n"]

        # Build parent lookup for hierarchy headers
        all_nodes = {**branch_nodes, **leaves_by_id}
        # Track which headers we've already printed
        printed_headers = set()

        leaf_payloads: list[dict] = []
        total_section_count = 0

        for leaf_id in leaf_ids:
            leaf = leaves_by_id[leaf_id]
            leaf_level = leaf.get("level", 3)

            # Print intermediate hierarchy headers
            # Walk up from leaf to target level and collect ancestors
            ancestors = []
            current = leaf
            while current:
                pid = current.get("parent_id")
                if pid and pid in branch_nodes and pid != node_id:
                    parent = branch_nodes[pid]
                    if parent.get("level", 0) > target_level:
                        ancestors.append(parent)
                    current = parent
                else:
                    break

            # Print ancestors from highest to lowest level
            for ancestor in reversed(ancestors):
                aid = ancestor["id"]
                if aid not in printed_headers:
                    printed_headers.add(aid)
                    a_level = ancestor.get("level", 0)
                    heading = "#" * (a_level - target_level + 2)
                    parts.append(f"\n{heading} {ancestor.get('title', '')}\n")

            # Print leaf content
            content_row = content_by_curriculum.get(leaf_id)
            if not content_row:
                parts.append(f"\n### {leaf.get('title', '')}\n")
                parts.append("_Sem conteudo disponivel._\n")
                continue

            content_json = content_row.get("content_json", {})
            if isinstance(content_json, str):
                try:
                    content_json = json.loads(content_json)
                except (json.JSONDecodeError, TypeError):
                    pass

            text = _extract_text_from_content(content_json)
            sections = _extract_sections_from_content(content_json)
            total_section_count += len(sections)
            leaf_payloads.append(
                {
                    "id": leaf.get("id"),
                    "code": leaf.get("code"),
                    "title": leaf.get("title"),
                    "level": leaf.get("level"),
                    "parent_id": leaf.get("parent_id"),
                    "word_count": content_row.get("word_count"),
                    "content_title": content_json.get("title") if isinstance(content_json, dict) else None,
                    "sections": sections,
                }
            )
            if text.strip():
                parts.append(f"\n{text}\n")
            else:
                parts.append(f"\n### {leaf.get('title', '')}\n")
                parts.append("_Conteudo vazio ou em formato nao suportado._\n")

        llm_text = "\n".join(parts)
        return _tool_envelope(
            tool_name="get_curriculum_content",
            status="completed",
            input_payload=input_payload,
            output_payload={
                "node": {
                    "id": target.get("id"),
                    "code": target_code,
                    "title": target_title,
                    "level": target_level,
                    "has_children": has_children,
                    "subject_id": target_subject_id,
                    "year_level": target_year_level,
                    "subject_component": target_subject_component,
                    "parent_id": target.get("parent_id"),
                },
                "leaf_count": len(leaf_payloads),
                "leaves": leaf_payloads,
            },
            display_payload={
                "type": "curriculum_content",
                "title": f"{target_code} — {target_title}",
                "preview_text": _preview_text(llm_text),
                "leaf_count": len(leaf_payloads),
                "section_count": total_section_count,
                "subject_color": _subj_color,
                "subject_icon": _subj_icon,
            },
            llm_text=llm_text,
        )

    except Exception as e:
        logger.error("Failed to get curriculum content for node %s: %s", node_id, e)
        llm_text = f"Erro ao obter conteudo: {e}"
        return _tool_envelope(
            tool_name="get_curriculum_content",
            status="error",
            input_payload=input_payload,
            output_payload={},
            display_payload={
                "type": "curriculum_content",
                "title": node_id,
                "preview_text": llm_text,
                "leaf_count": 0,
                "section_count": 0,
                "subject_color": None,
                "subject_icon": None,
            },
            llm_text=llm_text,
        )


def _extract_text_from_content(content: dict) -> str:
    """Extract readable markdown from the structured content_json format.

    Expected shape:
    {
        "title": "...",
        "sections": [
            {"section_title": "...", "content": "...", ...}
        ],
        "curriculum_code": "...",
    }
    """
    if not isinstance(content, dict):
        return ""

    parts: list[str] = []

    # Title
    content_title = content.get("title")
    if content_title:
        parts.append(f"### {content_title}")

    # Sections
    sections = content.get("sections", [])
    for section in sections:
        section_title = section.get("section_title", "")
        if section_title:
            parts.append(f"#### {section_title}")

        section_content = section.get("content", "")
        if section_content:
            # The content field uses \\n for newlines — unescape them
            text = section_content.replace("\\n", "\n")
            parts.append(text)

    return "\n\n".join(parts)


def _extract_sections_from_content(content: dict) -> list[dict[str, str]]:
    if not isinstance(content, dict):
        return []

    sections: list[dict[str, str]] = []
    raw_sections = content.get("sections", [])
    if not isinstance(raw_sections, list):
        return sections

    for section in raw_sections:
        if not isinstance(section, dict):
            continue
        section_title = str(section.get("section_title") or "").strip()
        section_content = str(section.get("content") or "").replace("\\n", "\n").strip()
        sections.append(
            {
                "section_title": section_title,
                "content": section_content,
            }
        )
    return sections


class ChatAskQuestionItem(BaseModel):
    """One interactive question for ask_questions (strict JSON schema for the LLM API)."""

    model_config = ConfigDict(extra="forbid")

    question: str = Field(..., min_length=1, description="Short question text (one sentence).")
    options: list[str] = Field(
        ...,
        min_length=2,
        max_length=4,
        description="2-4 short option labels.",
    )
    type: Literal["single_select", "multi_select"] = Field(
        default="single_select",
        description='Use "single_select" or "multi_select".',
    )


class AskQuestionsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    questions: Annotated[
        list[ChatAskQuestionItem],
        Field(min_length=1, max_length=3, description="1-3 questions to show in the widget."),
    ]


class GenerateVisualArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["static_visual", "interactive_visual"] = Field(
        ...,
        description='Choose "static_visual" for diagrams and "interactive_visual" for manipulable visuals.',
    )
    title: str = Field(..., min_length=1, description="Short title for the visual card.")
    purpose: str = Field(..., min_length=1, description="The 'Propósito' section of the visual brief.")
    visual_content: str = Field(
        ...,
        min_length=1,
        description="The 'Conteúdo visual' section describing what must appear.",
    )
    learning_goal: str = Field(
        ...,
        min_length=1,
        description="The 'Objectivo de aprendizagem' section describing what the learner should understand.",
    )
    subject_name: str | None = Field(
        default=None,
        description="Optional subject name to resolve custom colors and icon.",
    )


@tool(args_schema=AskQuestionsArgs)
def ask_questions(questions: list[ChatAskQuestionItem]) -> str:
    """Ask the student 1-3 clarifying questions as a clickable widget.

    Prefer collecting multiple questions at once (up to 3) rather than
    asking one at a time across turns. Keep option labels short.
    When clarification is essential, call this tool directly instead of
    first asking the same question in plain text.

    The student can also type a free response instead of picking an option.
    Their answers arrive in the next message as:
      P: <question>
      R: <selected option or free text>
    """
    return "Questions sent to student. Awaiting response."


@tool
def request_clarification(question: str, reason: Optional[str] = None) -> str:
    """Legacy single-question clarification tool.

    Prefer ask_questions for new interactive clarification flows. Use this only
    as a fallback when a single plain question is enough.
    """
    payload = {
        "question": question.strip(),
        "reason": (reason or "").strip() or None,
    }
    return json.dumps(payload, ensure_ascii=False)


@tool(args_schema=GenerateVisualArgs)
async def generate_visual(
    type: Literal["static_visual", "interactive_visual"],
    title: str,
    purpose: str,
    visual_content: str,
    learning_goal: str,
    subject_name: str | None = None,
    config: Optional[RunnableConfig] = None,
) -> str:
    """Generate an inline educational visual for the chat."""
    visual_type = str(type or "").strip().lower()
    normalized_title = " ".join(str(title or "").split()).strip() or "Visual"
    normalized_subject_name = " ".join(str(subject_name or "").split()).strip() or None

    input_payload = {
        "type": visual_type,
        "title": normalized_title,
        "purpose": purpose,
        "visual_content": visual_content,
        "learning_goal": learning_goal,
        "subject_name": normalized_subject_name,
    }

    if visual_type not in {"static_visual", "interactive_visual"}:
        llm_text = "Nao consegui gerar o visual porque o tipo pedido nao e valido."
        return _tool_envelope(
            tool_name="generate_visual",
            status="error",
            input_payload=input_payload,
            output_payload={},
            display_payload={
                "type": "generated_visual",
                "title": normalized_title,
                "visual_type": visual_type,
                "html": None,
                "status": "failed",
                "subject_name": normalized_subject_name,
                "subject_color": None,
                "subject_icon": None,
                "theme_colors": DEFAULT_THEME,
            },
            llm_text=llm_text,
        )

    resolved_subject = _resolve_subject_by_name(normalized_subject_name or "") if normalized_subject_name else None
    subject_color = resolved_subject.color if resolved_subject else None
    theme_colors = _build_visual_theme_colors(subject_color)
    prompt = _build_visual_prompt(
        purpose=purpose,
        visual_content=visual_content,
        learning_goal=learning_goal,
    )

    last_snapshot = ""
    try:
        async for snapshot in generate_visual_stream(
            visual_type=visual_type,
            prompt=prompt,
            layout="note",
            theme_colors=theme_colors,
        ):
            if not snapshot:
                continue
            last_snapshot = snapshot
            await adispatch_custom_event(
                "chat_visual_snapshot",
                {
                    "tool_name": "generate_visual",
                    "title": normalized_title,
                    "visual_type": visual_type,
                    "subject_name": resolved_subject.name if resolved_subject else normalized_subject_name,
                    "subject_color": subject_color,
                    "subject_icon": resolved_subject.icon if resolved_subject else None,
                    "html": snapshot,
                    "status": "streaming",
                    "theme_colors": theme_colors or DEFAULT_THEME,
                },
                config=config,
            )

        if not last_snapshot.strip():
            raise ValueError("Visual generation returned empty HTML.")

        await adispatch_custom_event(
            "chat_visual_done",
            {
                "tool_name": "generate_visual",
                "title": normalized_title,
                "visual_type": visual_type,
                "subject_name": resolved_subject.name if resolved_subject else normalized_subject_name,
                "subject_color": subject_color,
                "subject_icon": resolved_subject.icon if resolved_subject else None,
                "html": last_snapshot,
                "status": "completed",
                "theme_colors": theme_colors or DEFAULT_THEME,
            },
            config=config,
        )

        llm_text = (
            f"Gerei um visual {'interativo' if visual_type == 'interactive_visual' else 'estático'} para apoiar esta explicação."
        )
        return _tool_envelope(
            tool_name="generate_visual",
            status="completed",
            input_payload=input_payload,
            output_payload={
                "html": last_snapshot,
                "visual_type": visual_type,
                "layout": "note",
                "theme_colors": theme_colors or DEFAULT_THEME,
            },
            display_payload={
                "type": "generated_visual",
                "title": normalized_title,
                "visual_type": visual_type,
                "html": last_snapshot,
                "status": "completed",
                "subject_name": resolved_subject.name if resolved_subject else normalized_subject_name,
                "subject_color": subject_color,
                "subject_icon": resolved_subject.icon if resolved_subject else None,
                "theme_colors": theme_colors or DEFAULT_THEME,
            },
            llm_text=llm_text,
        )
    except Exception as exc:
        logger.exception("Failed to generate chat visual '%s': %s", normalized_title, exc)
        await adispatch_custom_event(
            "chat_visual_failed",
            {
                "tool_name": "generate_visual",
                "title": normalized_title,
                "visual_type": visual_type,
                "subject_name": resolved_subject.name if resolved_subject else normalized_subject_name,
                "subject_color": subject_color,
                "subject_icon": resolved_subject.icon if resolved_subject else None,
                "html": last_snapshot or None,
                "status": "failed",
                "error": str(exc)[:500],
                "theme_colors": theme_colors or DEFAULT_THEME,
            },
            config=config,
        )
        llm_text = "Nao consegui gerar o visual desta vez."
        return _tool_envelope(
            tool_name="generate_visual",
            status="failed",
            input_payload=input_payload,
            output_payload={
                "html": last_snapshot or None,
                "visual_type": visual_type,
                "layout": "note",
                "error": str(exc)[:500],
                "theme_colors": theme_colors or DEFAULT_THEME,
            },
            display_payload={
                "type": "generated_visual",
                "title": normalized_title,
                "visual_type": visual_type,
                "html": last_snapshot or None,
                "status": "failed",
                "error": str(exc)[:500],
                "subject_name": resolved_subject.name if resolved_subject else normalized_subject_name,
                "subject_color": subject_color,
                "subject_icon": resolved_subject.icon if resolved_subject else None,
                "theme_colors": theme_colors or DEFAULT_THEME,
            },
            llm_text=llm_text,
        )


# Exported tools list for agent binding
CHAT_TOOLS = [get_curriculum_index, get_curriculum_content, generate_visual, ask_questions, request_clarification]
