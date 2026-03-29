"""
SSE streaming for the Wizard agent.

Translates LangGraph streaming output into Server-Sent Events.
Adapted from app/chat/streaming.py — no DB persistence, receives full
message history from the frontend.
"""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import AsyncGenerator

from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    HumanMessage,
    ToolMessage,
)

from app.wizard.llm import get_wizard_llm
from app.wizard.agent import build_wizard_graph

logger = logging.getLogger(__name__)


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _parse_text_questions(text: str) -> list[dict] | None:
    """
    Parse questions that the model wrote as text instead of calling ask_questions.

    Detects the pattern:
      [Perguntei: "question text" — opções: opt1, opt2, opt3]

    Returns a list of question dicts compatible with ask_questions tool,
    or None if no pattern found.
    """
    import re

    questions = []

    # Pattern 1: [Perguntei: "..." — opções: ...]
    pattern = re.compile(
        r'\[Perguntei:\s*["\u201c](.+?)["\u201d]\s*[\u2014—-]+\s*op[çc][õo]es:\s*(.+?)\]',
        re.IGNORECASE | re.DOTALL,
    )

    for match in pattern.finditer(text):
        question_text = match.group(1).strip()
        options_raw = match.group(2).strip()

        # Split options by comma, cleaning up
        options = [
            opt.strip().strip('"').strip("'").strip()
            for opt in re.split(r',\s*(?=[A-Z]|\d|["\u201c])', options_raw)
            if opt.strip()
        ]

        if question_text and len(options) >= 2:
            questions.append({
                "question": question_text,
                "options": options[:4],  # max 4
                "type": "single_select",
            })

    if questions:
        return questions

    # Pattern 2: Question ending with ? followed by numbered/lettered options
    # e.g.: "Que aspecto focar?\n1. Opção A\n2. Opção B\n3. Opção C"
    blocks = re.split(r'\n\s*\n', text)
    for block in blocks:
        lines = block.strip().split('\n')
        if len(lines) < 3:
            continue

        # First line or lines with ? is the question
        q_lines = []
        opt_lines = []
        found_opts = False
        for line in lines:
            stripped = line.strip()
            if not found_opts and re.match(r'^[1-4a-d][\.\)]\s', stripped):
                found_opts = True
            if found_opts:
                opt_lines.append(stripped)
            else:
                q_lines.append(stripped)

        if q_lines and opt_lines and len(opt_lines) >= 2:
            question_text = ' '.join(q_lines).strip()
            if '?' not in question_text:
                continue
            options = [
                re.sub(r'^[1-4a-d][\.\)]\s*', '', o).strip()
                for o in opt_lines
                if o.strip()
            ]
            if len(options) >= 2:
                questions.append({
                    "question": question_text,
                    "options": options[:4],
                    "type": "single_select",
                })

    return questions if questions else None


def _rebuild_langchain_messages(
    messages: list[dict],
) -> list[HumanMessage | AIMessage | ToolMessage]:
    """Convert frontend message dicts into LangChain message objects."""
    lc_messages = []
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "user":
            lc_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            lc_messages.append(AIMessage(content=content))
        elif role == "tool":
            lc_messages.append(
                ToolMessage(
                    content=content,
                    tool_call_id=msg.get("tool_call_id", ""),
                )
            )
    return lc_messages


async def stream_wizard_response(
    *,
    messages: list[dict],
    system_prompt: str,
) -> AsyncGenerator[str, None]:
    """
    Async generator that streams the wizard agent response as SSE events.

    Event types (same as chat):
      - run_status: {"type": "run_status", "status": "streaming"|"done"}
      - token: {"type": "token", "delta": "..."}
      - tool_call: {"type": "tool_call", "name": "..."}
      - tool_call_args: {"type": "tool_call_args", "name": "...", "args": {...}}
      - tool_result: {"type": "tool_result", "name": "...", "content": "..."}
      - error: {"type": "error", "message": "..."}
    """
    run_id = str(uuid.uuid4())

    lc_messages = _rebuild_langchain_messages(messages)
    graph = build_wizard_graph()

    state = {
        "messages": lc_messages,
        "system_prompt": system_prompt,
    }

    yield _sse({"type": "run_status", "status": "streaming", "run_id": run_id})

    accumulated_text = ""
    had_tool_call = False

    try:
        async for event in graph.astream_events(state, version="v2"):
            kind = event.get("event", "")

            # Token streaming from LLM
            if kind == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk and isinstance(chunk, AIMessageChunk):
                    if chunk.content and isinstance(chunk.content, str):
                        accumulated_text += chunk.content
                        yield _sse({
                            "type": "token",
                            "delta": chunk.content,
                            "run_id": run_id,
                        })

                    if chunk.tool_call_chunks:
                        had_tool_call = True
                        for tc_chunk in chunk.tool_call_chunks:
                            if tc_chunk.get("name"):
                                yield _sse({
                                    "type": "tool_call",
                                    "name": tc_chunk["name"],
                                    "run_id": run_id,
                                })

            # Tool execution starts — full args available
            elif kind == "on_tool_start":
                had_tool_call = True
                name = event.get("name", "")
                tool_input = event.get("data", {}).get("input", {})
                logger.info("Wizard tool_start: %s args=%s", name, tool_input)
                if name:
                    yield _sse({
                        "type": "tool_call_args",
                        "name": name,
                        "args": tool_input,
                        "run_id": run_id,
                    })

            # Tool execution results
            elif kind == "on_tool_end":
                name = event.get("name", "")
                output = event.get("data", {}).get("output", "")
                if name:
                    content = str(output) if not isinstance(output, str) else output
                    yield _sse({
                        "type": "tool_result",
                        "name": name,
                        "content": content,
                        "run_id": run_id,
                    })

    except Exception as e:
        logger.exception("Error during wizard streaming")
        yield _sse({"type": "error", "message": str(e), "run_id": run_id})

    # ── Fallback: parse text questions into synthetic tool call ──
    if not had_tool_call and accumulated_text:
        parsed = _parse_text_questions(accumulated_text)
        if parsed:
            logger.warning(
                "Wizard model wrote questions as text. Parsing %d questions into synthetic tool call.",
                len(parsed),
            )

            # Strip the [Perguntei:] blocks from the text and emit clean version
            import re as _re
            clean_text = _re.sub(
                r'\[Perguntei:.*?\]',
                '',
                accumulated_text,
                flags=_re.DOTALL | _re.IGNORECASE,
            ).strip()
            # Remove trailing whitespace and empty lines
            clean_text = _re.sub(r'\n\s*\n\s*\n', '\n\n', clean_text).strip()

            yield _sse({
                "type": "text_replace",
                "text": clean_text,
                "run_id": run_id,
            })

            yield _sse({
                "type": "tool_call",
                "name": "ask_questions",
                "run_id": run_id,
            })
            yield _sse({
                "type": "tool_call_args",
                "name": "ask_questions",
                "args": {"questions": parsed},
                "run_id": run_id,
                "synthetic": True,  # flag so frontend can inject warning on next turn
            })
            yield _sse({
                "type": "tool_result",
                "name": "ask_questions",
                "content": "Questions sent to teacher. Awaiting response.",
                "run_id": run_id,
            })

    yield _sse({"type": "run_status", "status": "done", "run_id": run_id})


async def stream_instructions(
    *,
    conversation_summary: str,
    system_prompt: str,
) -> AsyncGenerator[str, None]:
    """
    Stream the final instruction paragraph (no tools, simple LLM call).
    """
    run_id = str(uuid.uuid4())
    llm = get_wizard_llm()

    yield _sse({"type": "run_status", "status": "streaming", "run_id": run_id})

    try:
        from langchain_core.messages import SystemMessage as SysMsg

        msgs = [
            SysMsg(content=system_prompt),
            HumanMessage(content=conversation_summary),
        ]

        async for chunk in llm.astream(msgs):
            if chunk.content and isinstance(chunk.content, str):
                yield _sse({
                    "type": "token",
                    "delta": chunk.content,
                    "run_id": run_id,
                })

    except Exception as e:
        logger.exception("Error during instructions streaming")
        yield _sse({"type": "error", "message": str(e), "run_id": run_id})

    yield _sse({"type": "run_status", "status": "done", "run_id": run_id})
