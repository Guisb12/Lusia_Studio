"""
Worksheet blueprint chat agent — processes teacher messages during the
iterative blueprint review phase.

Uses LangChain ChatOpenAI with tool-calling. The agent has two tools
(upsert_block, delete_block) and runs a synchronous loop (max 3 iterations)
to apply mutations before returning the updated blueprint.
"""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import AsyncGenerator
from copy import deepcopy

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


# ── LLM factory ──────────────────────────────────────────────


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


# ── Tool definitions (OpenAI function format) ────────────────


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "upsert_block",
            "description": (
                "Create or update a block in the worksheet blueprint. "
                "Use an existing block ID to update, or a new UUID to create a new block. "
                "For context_group blocks, include a 'children' array of child blocks."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "Block ID. Existing ID to update, or new UUID to create.",
                    },
                    "order": {
                        "type": "integer",
                        "description": "Position in the worksheet (1-based).",
                    },
                    "source": {
                        "type": "string",
                        "enum": ["bank", "ai_generated"],
                        "description": "'bank' for existing question, 'ai_generated' for new.",
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
                    "reference_question_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Bank question IDs as style examples (ai_generated only).",
                    },
                    "difficulty": {
                        "type": ["string", "null"],
                        "description": "Difficulty level: Fácil, Médio, Difícil, or mixed.",
                    },
                    "group_label": {
                        "type": ["string", "null"],
                        "description": "Group label (e.g. 'Grupo I'). Null for flat blocks.",
                    },
                    "children": {
                        "type": ["array", "null"],
                        "description": "Child blocks for context_group. Null for other types.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "order": {"type": "integer"},
                                "source": {"type": "string"},
                                "question_id": {"type": ["string", "null"]},
                                "curriculum_code": {"type": "string"},
                                "type": {"type": "string"},
                                "goal": {"type": "string"},
                                "reference_question_ids": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                            },
                            "required": ["id", "order", "source", "type", "goal"],
                        },
                    },
                },
                "required": ["id", "order", "source", "curriculum_code", "type", "goal"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_block",
            "description": (
                "Remove a block from the blueprint. "
                "If the block is a context_group, all children are also removed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "Block ID to remove.",
                    },
                },
                "required": ["id"],
            },
        },
    },
]


# ── System prompt ─────────────────────────────────────────────


BLUEPRINT_AGENT_SYSTEM_PROMPT = """\
És um assistente de planeamento de fichas de exercícios para o ensino secundário português.

Estás na fase de revisão iterativa do blueprint. O professor pode pedir-te para:
- Adicionar, remover ou reordenar questões
- Alterar tipos, dificuldade ou objetivos de questões
- Trocar questões do banco por geradas pela IA (ou vice-versa)
- Melhorar a cobertura curricular
- Ajustar a duração total

Usa as ferramentas `upsert_block` e `delete_block` para fazer alterações. \
Podes fazer múltiplas chamadas de ferramenta numa só resposta.

Regras:
1. Responde APENAS com chamadas de ferramentas. Nunca escrevas mensagens de texto ao utilizador. \
Usa sempre upsert_block ou delete_block.
2. Faz APENAS o que o professor pediu — nada mais, nada menos. \
Se o professor pede para adicionar uma questão, adiciona UMA questão e NÃO toques nas existentes. \
Se o professor pede para alterar uma questão, altera APENAS essa questão. \
Nunca faças alterações não solicitadas.
3. Responde SEMPRE em português europeu.
4. Quando o professor faz um pedido sobre um bloco específico (identificado por block_id), \
altera apenas esse bloco.
5. Mantém a ordem (order) consistente — sem buracos nem duplicados.
6. Para criar novos blocos, gera um novo UUID para o campo id.
7. Nunca inventes question_ids — só usa IDs de questões que aparecem no banco fornecido.
8. O campo `reference_question_ids` só faz sentido em blocos `ai_generated`.

--- TEMPLATE UTILIZADO ---
{template_info}

O template define a estrutura base da ficha. O professor pode pedir ajustes \
que alterem a estrutura (adicionar/remover questões, mudar tipos). \
Respeita sempre o pedido do professor, mesmo que se desvie do template original.

--- ESTADO ATUAL DO BLUEPRINT ---
{blueprint_json}

--- BANCO DE QUESTÕES DISPONÍVEIS ---
{bank_summary}
"""


# ── Public API ───────────────────────────────────────────────


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

    # Build bank summary (compact: id, type, curriculum_codes, first 80 chars of question)
    bank_summary = _format_bank_summary(bank_questions)

    # Build system prompt with current blueprint
    blueprint_json = json.dumps(
        current_blueprint.model_dump(), ensure_ascii=False, indent=2
    )
    system_prompt = BLUEPRINT_AGENT_SYSTEM_PROMPT.format(
        template_info="Não disponível",
        blueprint_json=blueprint_json,
        bank_summary=bank_summary,
    )

    # Build message history
    messages: list[BaseMessage] = [SystemMessage(content=system_prompt)]

    for msg in conversation_history:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            # Reconstruct AIMessage with tool_calls so the LLM has full context
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
                # Add corresponding ToolMessages so the history is valid
                for i, tc in enumerate(raw_tool_calls):
                    messages.append(
                        ToolMessage(content="OK", tool_call_id=f"hist_{i}")
                    )
            else:
                messages.append(AIMessage(content=content))

    # Add the new user message
    user_text = message
    if block_id:
        user_text = f"[Sobre o bloco {block_id}] {message}"
    messages.append(HumanMessage(content=user_text))

    # Run tool-calling loop
    blueprint = deepcopy(current_blueprint)
    all_tool_calls: list[dict] = []

    # First call: tool_choice="required" so the AI must act.
    # Subsequent calls (if any): tool_choice="auto" so it can stop when done.
    for iteration in range(MAX_TOOL_ITERATIONS):
        choice = "required" if iteration == 0 else "auto"
        response: AIMessage = await llm.ainvoke(
            messages, tools=TOOLS, tool_choice=choice
        )
        messages.append(response)

        # If no tool calls, we're done
        if not response.tool_calls:
            break

        # Apply tool calls
        for tc in response.tool_calls:
            tool_name = tc["name"]
            tool_args = tc["args"]
            tool_call_id = tc.get("id", str(uuid.uuid4()))

            all_tool_calls.append({
                "name": tool_name,
                "args": tool_args,
            })

            result = _apply_tool_call(blueprint, tool_name, tool_args)

            messages.append(
                ToolMessage(content=result, tool_call_id=tool_call_id)
            )

    # Extract the final text response
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
      {"type": "upsert", "block": {...}}
      {"type": "delete", "block_id": "..."}
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
                for i, tc in enumerate(raw_tool_calls):
                    messages.append(
                        ToolMessage(content="OK", tool_call_id=f"hist_{i}")
                    )
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

            all_tool_calls.append({
                "name": tool_name,
                "args": tool_args,
            })

            result = _apply_tool_call(blueprint, tool_name, tool_args)

            messages.append(
                ToolMessage(content=result, tool_call_id=tool_call_id)
            )

            # Emit SSE event immediately after each tool call
            if tool_name == "upsert_block":
                block_id_arg = tool_args.get("id", "")
                block = next(
                    (b for b in blueprint.blocks if b.id == block_id_arg), None
                )
                if block:
                    yield f"data: {json.dumps({'type': 'upsert', 'block': block.model_dump()}, ensure_ascii=False)}\n\n"
            elif tool_name == "delete_block":
                yield f"data: {json.dumps({'type': 'delete', 'block_id': tool_args.get('id', '')})}\n\n"

    # Final done event
    yield f"data: {json.dumps({'type': 'done', 'blueprint': blueprint.model_dump(), 'tool_calls': all_tool_calls}, ensure_ascii=False)}\n\n"


# ── Tool execution ────────────────────────────────────────────


def _apply_tool_call(blueprint: Blueprint, tool_name: str, args: dict) -> str:
    """Apply a tool call to the blueprint. Returns a result string for the LLM."""
    if tool_name == "upsert_block":
        return _apply_upsert(blueprint, args)
    elif tool_name == "delete_block":
        return _apply_delete(blueprint, args)
    else:
        return f"Unknown tool: {tool_name}"


def _apply_upsert(blueprint: Blueprint, args: dict) -> str:
    """Create or update a block in the blueprint."""
    block_id = args.get("id", str(uuid.uuid4()))

    # Parse children if present
    children = None
    raw_children = args.get("children")
    if isinstance(raw_children, list):
        children = []
        for raw_child in raw_children:
            child = BlueprintBlock(
                id=raw_child.get("id", str(uuid.uuid4())),
                order=raw_child.get("order", 1),
                source=raw_child.get("source", "ai_generated"),
                question_id=raw_child.get("question_id"),
                curriculum_code=raw_child.get("curriculum_code", args.get("curriculum_code", "")),
                curriculum_path=raw_child.get("curriculum_path"),
                type=raw_child.get("type", "short_answer"),
                goal=raw_child.get("goal", ""),
                reference_question_ids=raw_child.get("reference_question_ids", []),
            )
            children.append(child)

    # Check if block exists — MERGE only the fields the AI provided
    for i, block in enumerate(blueprint.blocks):
        if block.id == block_id:
            existing = block
            if "order" in args:
                existing.order = args["order"]
            if "source" in args:
                existing.source = args["source"]
            if "question_id" in args:
                existing.question_id = args["question_id"]
            if "curriculum_code" in args:
                existing.curriculum_code = args["curriculum_code"]
            if "curriculum_path" in args:
                existing.curriculum_path = args["curriculum_path"]
            if "type" in args:
                existing.type = args["type"]
            if "goal" in args:
                existing.goal = args["goal"]
            if "reference_question_ids" in args:
                existing.reference_question_ids = args["reference_question_ids"]
            if "difficulty" in args:
                existing.difficulty = args["difficulty"]
            if "group_label" in args:
                existing.group_label = args["group_label"]
            if children is not None:
                existing.children = children
            # comments are NEVER overwritten by the AI
            return f"Block {block_id} updated at position {existing.order}."

    # New block — create from scratch
    new_block = BlueprintBlock(
        id=block_id,
        order=args.get("order", len(blueprint.blocks) + 1),
        source=args.get("source", "ai_generated"),
        question_id=args.get("question_id"),
        curriculum_code=args.get("curriculum_code", ""),
        curriculum_path=args.get("curriculum_path"),
        type=args.get("type", "short_answer"),
        goal=args.get("goal", ""),
        difficulty=args.get("difficulty"),
        group_label=args.get("group_label"),
        reference_question_ids=args.get("reference_question_ids", []),
        children=children,
    )
    blueprint.blocks.append(new_block)
    blueprint.blocks.sort(key=lambda b: b.order)

    return f"Block {block_id} created at position {new_block.order}."


def _apply_delete(blueprint: Blueprint, args: dict) -> str:
    """Delete a block from the blueprint."""
    block_id = args.get("id", "")
    original_len = len(blueprint.blocks)
    blueprint.blocks = [b for b in blueprint.blocks if b.id != block_id]

    if len(blueprint.blocks) < original_len:
        # Re-number orders
        for i, block in enumerate(blueprint.blocks):
            block.order = i + 1
        return f"Block {block_id} deleted. Orders renumbered."

    return f"Block {block_id} not found."


# ── Helpers ──────────────────────────────────────────────────


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
