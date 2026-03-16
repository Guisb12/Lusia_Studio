"""
Worksheet blueprint chat agent — processes teacher messages during the
iterative blueprint review phase.

Uses LangChain ChatOpenAI with tool-calling. The agent mutates the nested
blueprint tree with child-safe operations so context-group children can be
edited directly without rewriting whole groups.
"""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import AsyncGenerator
from copy import deepcopy
from typing import Any

from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_openai import ChatOpenAI

from app.api.http.schemas.worksheet_generation import Blueprint, BlueprintBlock
from app.core.config import settings

logger = logging.getLogger(__name__)

MAX_TOOL_ITERATIONS = 3


def _get_blueprint_llm() -> ChatOpenAI:
    """Build a ChatOpenAI for the blueprint agent — non-streaming, tool-calling."""
    model = settings.CHAT_MODEL or settings.OPENROUTER_MODEL
    return ChatOpenAI(
        model=model,
        temperature=0.3,
        max_tokens=8192,
        openai_api_key=settings.OPENROUTER_API_KEY,
        openai_api_base="https://openrouter.ai/api/v1",
        streaming=False,
    )


BLOCK_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "id": {
            "type": "string",
            "description": "Block ID. Existing ID for updates or a new UUID for creation.",
        },
        "order": {
            "type": "integer",
            "description": "1-based order among siblings. Optional; backend normalizes contiguous order.",
        },
        "source": {
            "type": "string",
            "enum": ["bank", "ai_generated"],
            "description": "'bank' for existing question, 'ai_generated' for new content.",
        },
        "question_id": {
            "type": ["string", "null"],
            "description": "Question ID from bank. Required when source='bank'.",
        },
        "curriculum_code": {
            "type": "string",
            "description": "Curriculum code this block covers.",
        },
        "curriculum_path": {
            "type": ["string", "null"],
            "description": "Human-readable curriculum path.",
        },
        "type": {
            "type": "string",
            "description": "Question type.",
        },
        "goal": {
            "type": "string",
            "description": "What this question tests.",
        },
        "difficulty": {
            "type": ["string", "null"],
            "description": "Difficulty level: Fácil, Médio, Difícil, or mixed.",
        },
        "group_label": {
            "type": ["string", "null"],
            "description": "Group label (e.g. 'Grupo I'). Null for flat blocks.",
        },
        "reference_question_ids": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Bank question IDs as style examples (ai_generated only).",
        },
    },
}


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "update_block",
            "description": (
                "Update exactly one existing block anywhere in the blueprint, "
                "including child questions inside context_group blocks."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "block_id": {"type": "string"},
                    "patch": {
                        "type": "object",
                        "properties": BLOCK_SCHEMA["properties"],
                    },
                },
                "required": ["block_id", "patch"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_block",
            "description": (
                "Create one new block. Use parent_id=null for a top-level block, "
                "or parent_id=<context_group_id> to create a child inside that group. "
                "Use after_block_id to place it after a sibling; null inserts at the beginning."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "parent_id": {"type": ["string", "null"]},
                    "after_block_id": {"type": ["string", "null"]},
                    "block": {
                        "type": "object",
                        "properties": BLOCK_SCHEMA["properties"],
                        "required": ["id", "source", "curriculum_code", "type", "goal"],
                    },
                },
                "required": ["parent_id", "after_block_id", "block"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_block",
            "description": (
                "Delete exactly one block anywhere in the blueprint. "
                "If it is a context_group, all descendants are also removed."
            ),
            "parameters": {
                "type": "object",
                "properties": {"block_id": {"type": "string"}},
                "required": ["block_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "move_block",
            "description": (
                "Move one existing block to a new position. Use new_parent_id=null "
                "for top-level placement or a context_group ID to move/create it as a child."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "block_id": {"type": "string"},
                    "new_parent_id": {"type": ["string", "null"]},
                    "after_block_id": {"type": ["string", "null"]},
                },
                "required": ["block_id", "new_parent_id", "after_block_id"],
            },
        },
    },
]


BLUEPRINT_AGENT_SYSTEM_PROMPT = """\
És um assistente de planeamento de fichas de exercícios para o ensino secundário português.

Estás na fase de revisão iterativa do blueprint. O professor pode pedir-te para:
- Adicionar, remover ou reordenar questões
- Alterar tipos, dificuldade ou objetivos de questões
- Trocar questões do banco por geradas pela IA (ou vice-versa)
- Melhorar a cobertura curricular
- Ajustar a duração total

Usa as ferramentas `update_block`, `create_block`, `delete_block` e `move_block` para fazer alterações. \
Podes fazer múltiplas chamadas de ferramenta numa só resposta.

Regras:
1. Responde APENAS com chamadas de ferramentas. Nunca escrevas mensagens de texto ao utilizador.
2. Faz APENAS o que o professor pediu — nada mais, nada menos.
3. Quando o professor se refere a um child block dentro de um grupo, altera esse child block diretamente. \
NÃO substituas o grupo inteiro nem a lista completa de `children` se só queres mudar um filho.
4. Usa `update_block` para alterações parciais, `create_block` para criar novos blocos, \
`move_block` para reordenar e `delete_block` para remover.
5. Nunca inventes `question_id`; usa apenas IDs do banco fornecido.
6. Mantém a coerência estrutural: só podes usar `new_parent_id` ou `parent_id` com `null` ou com o ID de um bloco `context_group`.
7. Responde SEMPRE em português europeu.

--- TEMPLATE UTILIZADO ---
{template_info}

--- ESTADO ATUAL DO BLUEPRINT ---
{blueprint_json}

--- BANCO DE QUESTÕES DISPONÍVEIS ---
{bank_summary}
"""


async def process_blueprint_chat_turn(
    message: str,
    block_id: str | None,
    current_blueprint: Blueprint,
    conversation_history: list[dict],
    bank_questions: list[dict],
) -> tuple[str, Blueprint, list[dict]]:
    """
    Process one teacher message in the blueprint review chat.

    Returns:
        (ai_message_text, updated_blueprint, raw_tool_calls_for_frontend)
    """
    llm = _get_blueprint_llm()
    bank_summary = _format_bank_summary(bank_questions)
    blueprint_json = json.dumps(
        current_blueprint.model_dump(), ensure_ascii=False, indent=2
    )
    system_prompt = BLUEPRINT_AGENT_SYSTEM_PROMPT.format(
        template_info="Não disponível",
        blueprint_json=blueprint_json,
        bank_summary=bank_summary,
    )

    messages: list[BaseMessage] = [SystemMessage(content=system_prompt)]

    for msg in conversation_history:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            raw_tool_calls = msg.get("tool_calls", [])
            if raw_tool_calls:
                lc_tool_calls = []
                for i, tc in enumerate(raw_tool_calls):
                    lc_tool_calls.append({
                        "name": tc["name"],
                        "args": tc["args"],
                        "id": f"hist_{i}",
                    })
                messages.append(AIMessage(content=content or "", tool_calls=lc_tool_calls))
                for i, _tc in enumerate(raw_tool_calls):
                    messages.append(ToolMessage(content="OK", tool_call_id=f"hist_{i}"))
            else:
                messages.append(AIMessage(content=content))

    user_text = message
    if block_id:
        user_text = f"[Sobre o bloco {block_id}] {message}"
    messages.append(HumanMessage(content=user_text))

    blueprint = deepcopy(current_blueprint)
    all_tool_calls: list[dict] = []

    for iteration in range(MAX_TOOL_ITERATIONS):
        choice = "required" if iteration == 0 else "auto"
        response: AIMessage = await llm.ainvoke(
            messages, tools=TOOLS, tool_choice=choice
        )
        messages.append(response)

        if not response.tool_calls:
            break

        for tc in response.tool_calls:
            tool_name = tc["name"]
            tool_args = tc["args"]
            tool_call_id = tc.get("id", str(uuid.uuid4()))

            result = _apply_tool_call(blueprint, tool_name, tool_args)
            all_tool_calls.append({
                "name": tool_name,
                "args": tool_args,
                "result": result,
            })
            messages.append(ToolMessage(content=result["message"], tool_call_id=tool_call_id))

    ai_text = ""
    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and msg.content:
            ai_text = msg.content
            break

    return ai_text, blueprint, all_tool_calls


async def stream_blueprint_chat_turn(
    message: str,
    block_id: str | None,
    current_blueprint: Blueprint,
    conversation_history: list[dict],
    bank_questions: list[dict],
) -> AsyncGenerator[str, None]:
    """
    Streaming version of process_blueprint_chat_turn.

    Yields SSE events as each tool call is applied:
      {"type": "mutation", ...}
      {"type": "done", "blueprint": {...}, "tool_calls": [...]}
    """
    llm = _get_blueprint_llm()
    bank_summary = _format_bank_summary(bank_questions)
    blueprint_json = json.dumps(
        current_blueprint.model_dump(), ensure_ascii=False, indent=2
    )
    system_prompt = BLUEPRINT_AGENT_SYSTEM_PROMPT.format(
        template_info="Não disponível",
        blueprint_json=blueprint_json,
        bank_summary=bank_summary,
    )

    messages: list[BaseMessage] = [SystemMessage(content=system_prompt)]
    for msg in conversation_history:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            raw_tool_calls = msg.get("tool_calls", [])
            if raw_tool_calls:
                lc_tool_calls = []
                for i, tc in enumerate(raw_tool_calls):
                    lc_tool_calls.append({
                        "name": tc["name"],
                        "args": tc["args"],
                        "id": f"hist_{i}",
                    })
                messages.append(AIMessage(content=content or "", tool_calls=lc_tool_calls))
                for i, _tc in enumerate(raw_tool_calls):
                    messages.append(ToolMessage(content="OK", tool_call_id=f"hist_{i}"))
            else:
                messages.append(AIMessage(content=content))

    user_text = message
    if block_id:
        user_text = f"[Sobre o bloco {block_id}] {message}"
    messages.append(HumanMessage(content=user_text))

    blueprint = deepcopy(current_blueprint)
    all_tool_calls: list[dict] = []

    for iteration in range(MAX_TOOL_ITERATIONS):
        choice = "required" if iteration == 0 else "auto"
        response: AIMessage = await llm.ainvoke(
            messages, tools=TOOLS, tool_choice=choice
        )
        messages.append(response)

        if not response.tool_calls:
            break

        for tc in response.tool_calls:
            tool_name = tc["name"]
            tool_args = tc["args"]
            tool_call_id = tc.get("id", str(uuid.uuid4()))

            result = _apply_tool_call(blueprint, tool_name, tool_args)
            all_tool_calls.append({
                "name": tool_name,
                "args": tool_args,
                "result": result,
            })
            messages.append(ToolMessage(content=result["message"], tool_call_id=tool_call_id))
            yield f"data: {json.dumps({'type': 'mutation', 'mutation': result}, ensure_ascii=False)}\n\n"

    yield f"data: {json.dumps({'type': 'done', 'blueprint': blueprint.model_dump(), 'tool_calls': all_tool_calls}, ensure_ascii=False)}\n\n"


def _parse_block_payload(payload: dict, *, fallback_id: str | None = None) -> BlueprintBlock:
    block_id = payload.get("id") or fallback_id or str(uuid.uuid4())
    return BlueprintBlock(
        id=block_id,
        order=payload.get("order", 1),
        source=payload.get("source", "ai_generated"),
        question_id=payload.get("question_id"),
        curriculum_code=payload.get("curriculum_code", ""),
        curriculum_path=payload.get("curriculum_path"),
        type=payload.get("type", "short_answer"),
        goal=payload.get("goal", ""),
        difficulty=payload.get("difficulty"),
        group_label=payload.get("group_label"),
        reference_question_ids=payload.get("reference_question_ids", []),
        comments=[],
        children=payload.get("children"),
    )


def _find_block_and_container(
    blocks: list[BlueprintBlock],
    block_id: str,
    *,
    parent_id: str | None = None,
) -> tuple[BlueprintBlock | None, list[BlueprintBlock] | None, int | None, str | None]:
    for index, block in enumerate(blocks):
        if block.id == block_id:
            return block, blocks, index, parent_id
        if block.children:
            found, container, child_index, found_parent_id = _find_block_and_container(
                block.children,
                block_id,
                parent_id=block.id,
            )
            if found:
                return found, container, child_index, found_parent_id
    return None, None, None, None


def _normalize_orders(blocks: list[BlueprintBlock]) -> None:
    for index, block in enumerate(blocks, start=1):
        block.order = index
        if block.children:
            _normalize_orders(block.children)


def _validate_parent_target(blueprint: Blueprint, parent_id: str | None) -> list[BlueprintBlock] | None:
    if parent_id is None:
        return blueprint.blocks
    parent_block, _container, _index, _parent_id = _find_block_and_container(blueprint.blocks, parent_id)
    if not parent_block or parent_block.type != "context_group":
        return None
    if parent_block.children is None:
        parent_block.children = []
    return parent_block.children


def _insert_into_container(
    container: list[BlueprintBlock],
    block: BlueprintBlock,
    after_block_id: str | None,
) -> int:
    if after_block_id is None:
        container.insert(0, block)
        _normalize_orders(container)
        return 0

    for idx, existing in enumerate(container):
        if existing.id == after_block_id:
            container.insert(idx + 1, block)
            _normalize_orders(container)
            return idx + 1

    container.append(block)
    _normalize_orders(container)
    return len(container) - 1


def _apply_tool_call(blueprint: Blueprint, tool_name: str, args: dict) -> dict[str, Any]:
    if tool_name == "update_block":
        return _apply_update(blueprint, args)
    if tool_name == "create_block":
        return _apply_create(blueprint, args)
    if tool_name == "delete_block":
        return _apply_delete(blueprint, args)
    if tool_name == "move_block":
        return _apply_move(blueprint, args)
    return {
        "action": tool_name,
        "affected_block_ids": [],
        "message": f"Ferramenta desconhecida: {tool_name}",
    }


def _apply_update(blueprint: Blueprint, args: dict) -> dict[str, Any]:
    block_id = args.get("block_id", "")
    patch = args.get("patch") or {}
    block, _container, _index, parent_id = _find_block_and_container(blueprint.blocks, block_id)
    if not block:
        return {
            "action": "update_block",
            "affected_block_ids": [],
            "message": f"Bloco {block_id} não encontrado.",
        }

    for field in (
        "source",
        "question_id",
        "curriculum_code",
        "curriculum_path",
        "type",
        "goal",
        "difficulty",
        "group_label",
        "reference_question_ids",
    ):
        if field in patch:
            setattr(block, field, patch[field])

    if "order" in patch and isinstance(patch["order"], int):
        block.order = patch["order"]

    if parent_id:
        parent_block, parent_container, _idx, _ = _find_block_and_container(blueprint.blocks, parent_id)
        if parent_block and parent_container is not None and parent_block.children:
            parent_block.children.sort(key=lambda child: child.order)
            _normalize_orders(parent_block.children)
    else:
        blueprint.blocks.sort(key=lambda existing: existing.order)
        _normalize_orders(blueprint.blocks)

    return {
        "action": "update_block",
        "affected_block_ids": [block_id],
        "message": f"Bloco {block_id} atualizado.",
        "block": block.model_dump(),
    }


def _apply_create(blueprint: Blueprint, args: dict) -> dict[str, Any]:
    parent_id = args.get("parent_id")
    after_block_id = args.get("after_block_id")
    raw_block = args.get("block") or {}
    new_block = _parse_block_payload(raw_block)

    container = _validate_parent_target(blueprint, parent_id)
    if container is None:
        return {
            "action": "create_block",
            "affected_block_ids": [],
            "message": f"Parent inválido: {parent_id}",
        }

    _insert_into_container(container, new_block, after_block_id)
    if parent_id is None:
        _normalize_orders(blueprint.blocks)

    return {
        "action": "create_block",
        "affected_block_ids": [new_block.id],
        "message": f"Bloco {new_block.id} criado.",
        "block": new_block.model_dump(),
        "parent_id": parent_id,
    }


def _collect_descendant_ids(block: BlueprintBlock) -> list[str]:
    ids = [block.id]
    for child in block.children or []:
        ids.extend(_collect_descendant_ids(child))
    return ids


def _apply_delete(blueprint: Blueprint, args: dict) -> dict[str, Any]:
    block_id = args.get("block_id", "")
    block, container, index, parent_id = _find_block_and_container(blueprint.blocks, block_id)
    if not block or container is None or index is None:
        return {
            "action": "delete_block",
            "affected_block_ids": [],
            "message": f"Bloco {block_id} não encontrado.",
        }

    affected = _collect_descendant_ids(block)
    container.pop(index)
    if parent_id:
        parent_block, _parent_container, _idx, _ = _find_block_and_container(blueprint.blocks, parent_id)
        if parent_block and parent_block.children:
            _normalize_orders(parent_block.children)
    else:
        _normalize_orders(blueprint.blocks)

    return {
        "action": "delete_block",
        "affected_block_ids": affected,
        "message": f"Bloco {block_id} removido.",
    }


def _apply_move(blueprint: Blueprint, args: dict) -> dict[str, Any]:
    block_id = args.get("block_id", "")
    new_parent_id = args.get("new_parent_id")
    after_block_id = args.get("after_block_id")

    block, source_container, source_index, _source_parent_id = _find_block_and_container(blueprint.blocks, block_id)
    if not block or source_container is None or source_index is None:
        return {
            "action": "move_block",
            "affected_block_ids": [],
            "message": f"Bloco {block_id} não encontrado.",
        }

    target_container = _validate_parent_target(blueprint, new_parent_id)
    if target_container is None:
        return {
            "action": "move_block",
            "affected_block_ids": [],
            "message": f"Destino inválido: {new_parent_id}",
        }

    moving_block = source_container.pop(source_index)
    if source_container is target_container and after_block_id == block_id:
        source_container.insert(source_index, moving_block)
        _normalize_orders(source_container)
        return {
            "action": "move_block",
            "affected_block_ids": [block_id],
            "message": f"Bloco {block_id} manteve a posição.",
            "block": moving_block.model_dump(),
            "parent_id": new_parent_id,
        }

    _insert_into_container(target_container, moving_block, after_block_id)
    _normalize_orders(source_container)
    if target_container is not source_container:
        _normalize_orders(target_container)
    _normalize_orders(blueprint.blocks)

    return {
        "action": "move_block",
        "affected_block_ids": [block_id],
        "message": f"Bloco {block_id} movido.",
        "block": moving_block.model_dump(),
        "parent_id": new_parent_id,
    }


def _format_bank_summary(bank_questions: list[dict]) -> str:
    """Compact bank summary for the system prompt."""
    if not bank_questions:
        return "Sem questões no banco."

    lines = []
    for q in bank_questions:
        q_id = q.get("id", "?")
        q_type = q.get("type", "?")
        codes = ",".join(q.get("curriculum_codes") or [])
        content = q.get("content", {})
        question_text = content.get("question", "") if isinstance(content, dict) else ""
        short = question_text[:100].replace("\n", " ")
        lines.append(f"[{q_id}] {q_type} ({codes}) {short}")

    return "\n".join(lines)
