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
from typing import Optional

from langchain_core.tools import tool

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


def _resolve_subject_id(subject_name: str, year_level: str) -> str | None:
    """Match a subject name + year level to a subject UUID.

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
            .select("id, name, education_level, grade_levels")
            .ilike("name", name_filter)
            .eq("active", True)
        )
        if education_level:
            query = query.eq("education_level", education_level)
        return query

    # Try exact match first (case-insensitive)
    resp = supabase_execute(_build_query(subject_name).limit(1), entity="subjects")
    if resp.data:
        return str(resp.data[0]["id"])

    # Try partial match
    resp = supabase_execute(_build_query(f"%{subject_name}%").limit(5), entity="subjects")
    if resp.data:
        return str(resp.data[0]["id"])

    return None


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
        icon = "📂" if node.get("has_children", False) else "📄"
        level = node.get("level", 0)
        title = node.get("title", "")
        node_id = node.get("id", "")
        prefix = "  " * indent
        lines.append(f"{prefix}{icon} [L{level}] {title} (ID: {node_id})")
        for child in children_by_parent.get(node_id, []):
            _format_node(child, indent + 1)

    for root in roots:
        _format_node(root, 0)

    return "\n".join(lines)


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

    subject_id = _resolve_subject_id(subject_name, year_level)
    if not subject_id:
        return f"Nao encontrei a disciplina '{subject_name}' para o {year_level}o ano. Verifica o nome e tenta novamente."

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
        return f"Erro ao consultar o curriculo: {e}"

    if not nodes:
        msg = f"Nao encontrei topicos para '{subject_name}' no {year_level}o ano"
        if subject_component:
            msg += f" (componente: {subject_component})"
        msg += "."
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
            components = list({
                r["subject_component"]
                for r in (comp_resp.data or [])
                if r.get("subject_component")
            })
            if components:
                msg += f"\nComponentes disponiveis: {', '.join(sorted(components))}"
        except Exception:
            pass
        return msg

    tree = _build_tree(nodes)

    header = f"## {subject_name} — {year_level}o ano\n\n"
    footer = (
        "\n\n**Usa get_curriculum_content com qualquer ID acima para obter o conteudo.**\n"
        "- ID de nivel 2 → conteudo especifico (recomendado)\n"
        "- ID de nivel 1 → conteudo de todo o capitulo\n"
        "- ID de nivel 0 → conteudo de todo o dominio (pode ser muito extenso)"
    )

    return header + tree + footer


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

    try:
        # 1. Fetch the target node
        target_resp = supabase_execute(
            db.table("curriculum")
            .select("id, code, title, level, has_children")
            .eq("id", node_id)
            .limit(1),
            entity="curriculum",
        )
        if not target_resp.data:
            return f"Nao encontrei o no curricular com ID '{node_id}'."

        target = target_resp.data[0]
        target_code = target.get("code", "")
        target_title = target.get("title", "")
        target_level = target.get("level", 0)
        has_children = target.get("has_children", False)

        # 2. Find all leaf nodes under this node
        if not has_children:
            # This IS a leaf node — just fetch its content directly
            leaf_ids = [node_id]
            leaves_by_id = {node_id: target}
        else:
            # Find all descendants using code prefix pattern, then filter to leaves
            leaf_resp = supabase_execute(
                db.table("curriculum")
                .select("id, code, title, level, parent_id, has_children")
                .like("code", f"{target_code}%")
                .eq("has_children", False)
                .order("sequence_order")
                .order("code"),
                entity="curriculum",
            )
            leaves = leaf_resp.data or []
            if not leaves:
                return (
                    f"## {target_code} — {target_title}\n\n"
                    "Nao existem topicos com conteudo sob este no."
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
            hierarchy_resp = supabase_execute(
                db.table("curriculum")
                .select("id, code, title, level, parent_id")
                .like("code", f"{target_code}%")
                .eq("has_children", True)
                .order("sequence_order")
                .order("code"),
                entity="curriculum",
            )
            branch_nodes = {n["id"]: n for n in (hierarchy_resp.data or [])}
        else:
            branch_nodes = {}

        # 5. Format output with hierarchy
        parts = [f"## {target_code} — {target_title}\n"]

        # Build parent lookup for hierarchy headers
        all_nodes = {**branch_nodes, **leaves_by_id}
        # Track which headers we've already printed
        printed_headers = set()

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
            if text.strip():
                parts.append(f"\n{text}\n")
            else:
                parts.append(f"\n### {leaf.get('title', '')}\n")
                parts.append("_Conteudo vazio ou em formato nao suportado._\n")

        return "\n".join(parts)

    except Exception as e:
        logger.error("Failed to get curriculum content for node %s: %s", node_id, e)
        return f"Erro ao obter conteudo: {e}"


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


# Exported tools list for agent binding
CHAT_TOOLS = [get_curriculum_index, get_curriculum_content]
