"""
Worksheet template definitions — three generic tiers.

Templates define the *structure* (groups, slot types, difficulty curve).
The planner LLM fills the *content* (curriculum codes, goals, bank vs AI).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field


@dataclass(frozen=True)
class SlotSpec:
    """One question-type slot inside a group."""

    type: str  # "multiple_choice", "fill_blank", etc.
    count: int
    difficulty: str = "mixed"  # "Fácil" | "Médio" | "Difícil" | "mixed"


@dataclass(frozen=True)
class GroupSpec:
    """A grupo (or flat section) in the worksheet."""

    label: str | None  # "Grupo I", None for flat
    is_context_group: bool  # whether to wrap blocks in a context_group parent
    slots: list[SlotSpec] = field(default_factory=list)


@dataclass(frozen=True)
class WorksheetTemplate:
    """A worksheet template definition."""

    id: str  # "quick", "practice", "exam"
    name: str  # "Mini Ficha"
    tier: str  # "quick" | "practice" | "exam"
    description: str  # Short Portuguese description for the UI
    estimated_minutes: str  # "~15 min" — display only
    groups: list[GroupSpec] = field(default_factory=list)


# ── Template Registry ────────────────────────────────────────

TEMPLATES: dict[str, WorksheetTemplate] = {
    # ── Tier 1: Mini Ficha ───────────────────────────────────
    "quick": WorksheetTemplate(
        id="quick",
        name="Mini Ficha",
        tier="quick",
        description="Verificação rápida de conhecimentos. Questões fechadas.",
        estimated_minutes="~15-20 min",
        groups=[
            GroupSpec(
                label=None,
                is_context_group=False,
                slots=[
                    SlotSpec(type="multiple_choice", count=5, difficulty="Fácil"),
                    SlotSpec(type="fill_blank", count=1, difficulty="Médio"),
                    SlotSpec(type="matching", count=1, difficulty="Médio"),
                ],
            ),
        ],
    ),
    # ── Tier 2: Ficha de Trabalho ────────────────────────────
    "practice": WorksheetTemplate(
        id="practice",
        name="Ficha de Trabalho",
        tier="practice",
        description="Prática estruturada com dificuldade progressiva.",
        estimated_minutes="~45-60 min",
        groups=[
            GroupSpec(
                label="Grupo I",
                is_context_group=True,
                slots=[
                    SlotSpec(type="multiple_choice", count=4, difficulty="Fácil"),
                    SlotSpec(type="fill_blank", count=1, difficulty="Médio"),
                    SlotSpec(type="short_answer", count=2, difficulty="Médio"),
                ],
            ),
            GroupSpec(
                label="Grupo II",
                is_context_group=True,
                slots=[
                    SlotSpec(type="short_answer", count=1, difficulty="Médio"),
                    SlotSpec(type="open_extended", count=2, difficulty="Difícil"),
                ],
            ),
        ],
    ),
    # ── Tier 3: Ficha de Exame ───────────────────────────────
    "exam": WorksheetTemplate(
        id="exam",
        name="Ficha de Exame",
        tier="exam",
        description="Simulação de exame com estrutura completa.",
        estimated_minutes="~90-120 min",
        groups=[
            GroupSpec(
                label="Grupo I",
                is_context_group=True,
                slots=[
                    SlotSpec(type="multiple_choice", count=8, difficulty="Fácil"),
                    SlotSpec(type="fill_blank", count=1, difficulty="Médio"),
                    SlotSpec(type="matching", count=1, difficulty="Médio"),
                    SlotSpec(type="ordering", count=1, difficulty="Médio"),
                ],
            ),
            GroupSpec(
                label="Grupo II",
                is_context_group=True,
                slots=[
                    SlotSpec(type="short_answer", count=3, difficulty="Médio"),
                    SlotSpec(type="multiple_response", count=1, difficulty="Médio"),
                    SlotSpec(type="multiple_choice", count=2, difficulty="Médio"),
                ],
            ),
            GroupSpec(
                label="Grupo III",
                is_context_group=True,
                slots=[
                    SlotSpec(type="open_extended", count=4, difficulty="Difícil"),
                ],
            ),
        ],
    ),
}


# ── Public API ───────────────────────────────────────────────


def get_template(template_id: str) -> WorksheetTemplate:
    """Return a template by ID. Raises KeyError if not found."""
    try:
        return TEMPLATES[template_id]
    except KeyError:
        raise ValueError(f"Unknown template: {template_id!r}")


def list_templates() -> list[WorksheetTemplate]:
    """Return all available templates."""
    return list(TEMPLATES.values())


def template_to_blueprint_skeleton(
    template: WorksheetTemplate,
) -> list[dict]:
    """
    Expand a template into a flat list of blueprint-block dicts
    with placeholder values.  The planner LLM fills in curriculum_code,
    goal, source, etc.

    Returns a list of dicts matching BlueprintBlock shape, with
    context_group wrappers for grouped templates.
    """
    blocks: list[dict] = []
    order = 1

    for group in template.groups:
        # If the group needs a context_group wrapper, emit it as a parent.
        if group.is_context_group and group.label:
            parent_id = str(uuid.uuid4())
            children: list[dict] = []
            child_order = 1

            for slot in group.slots:
                for _ in range(slot.count):
                    children.append({
                        "id": str(uuid.uuid4()),
                        "order": child_order,
                        "source": "ai_generated",
                        "question_id": None,
                        "curriculum_code": "",
                        "curriculum_path": None,
                        "type": slot.type,
                        "goal": "",
                        "difficulty": slot.difficulty,
                        "group_label": group.label,
                        "reference_question_ids": [],
                        "comments": [],
                        "children": None,
                    })
                    child_order += 1

            blocks.append({
                "id": parent_id,
                "order": order,
                "source": "ai_generated",
                "question_id": None,
                "curriculum_code": "",
                "curriculum_path": None,
                "type": "context_group",
                "goal": group.label,
                "difficulty": None,
                "group_label": group.label,
                "reference_question_ids": [],
                "comments": [],
                "children": children,
            })
            order += 1

        else:
            # Flat group — no wrapper
            for slot in group.slots:
                for _ in range(slot.count):
                    blocks.append({
                        "id": str(uuid.uuid4()),
                        "order": order,
                        "source": "ai_generated",
                        "question_id": None,
                        "curriculum_code": "",
                        "curriculum_path": None,
                        "type": slot.type,
                        "goal": "",
                        "difficulty": slot.difficulty,
                        "group_label": group.label,
                        "reference_question_ids": [],
                        "comments": [],
                        "children": None,
                    })
                    order += 1

    return blocks


def get_template_info(template: WorksheetTemplate) -> dict:
    """Return a lightweight summary suitable for the API response."""
    total_slots = 0
    for group in template.groups:
        for slot in group.slots:
            total_slots += slot.count
    return {
        "id": template.id,
        "name": template.name,
        "tier": template.tier,
        "description": template.description,
        "estimated_minutes": template.estimated_minutes,
        "group_count": len(template.groups),
        "total_slots": total_slots,
    }
