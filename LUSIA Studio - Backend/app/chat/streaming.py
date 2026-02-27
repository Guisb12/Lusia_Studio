"""
SSE streaming for the Chat AI agent.

Translates LangGraph streaming output into Server-Sent Events.
"""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import AsyncGenerator

from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, ToolMessage

from app.chat.agent import get_compiled_graph
from app.chat.service import ChatService

logger = logging.getLogger(__name__)


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _build_human_content(text: str, images: list[str] | None = None) -> str | list:
    """Build HumanMessage content: plain string or multimodal list with images."""
    if not images:
        return text
    parts: list[dict] = [{"type": "text", "text": text}]
    for url in images[:4]:
        if url and isinstance(url, str):
            parts.append({"type": "image_url", "image_url": {"url": url}})
    return parts


async def stream_chat_response(
    *,
    conversation_id: str,
    user_id: str,
    message: str,
    images: list[str] | None = None,
    user_name: str,
    grade_level: str,
    education_level: str,
    preferred_subjects: list[dict],
) -> AsyncGenerator[str, None]:
    """
    Async generator that streams the AI response as SSE events.

    Event types:
      - run_status: {"type": "run_status", "status": "streaming"|"done"}
      - token: {"type": "token", "delta": "..."}
      - tool_call: {"type": "tool_call", "name": "..."}
      - tool_call_args: {"type": "tool_call_args", "name": "...", "args": {...}}
      - tool_result: {"type": "tool_result", "name": "...", "content": "..."}
      - error: {"type": "error", "message": "..."}
    """
    run_id = str(uuid.uuid4())
    svc = ChatService()

    # Save user message to DB (images stored in metadata for reload)
    user_metadata = {"images": images} if images else None
    svc.save_message(conversation_id, "user", message, metadata=user_metadata)

    # Load conversation history from DB
    history_result = svc.list_messages(conversation_id, user_id)
    history_messages = []
    for msg in history_result.get("messages", []):
        role = msg.get("role")
        content = msg.get("content", "")
        if role == "user":
            history_messages.append(HumanMessage(content=content))
        elif role == "assistant":
            history_messages.append(AIMessage(content=content))
        # Skip tool/system messages for simplicity — the agent rebuilds system prompt

    # Replace the last user message with multimodal content if images present
    if images and history_messages and isinstance(history_messages[-1], HumanMessage):
        history_messages[-1] = HumanMessage(
            content=_build_human_content(message, images),
        )

    graph = get_compiled_graph()

    state = {
        "messages": history_messages,
        "user_name": user_name,
        "grade_level": grade_level,
        "education_level": education_level,
        "preferred_subjects": preferred_subjects,
    }

    yield _sse({"type": "run_status", "status": "streaming", "run_id": run_id})

    full_response = ""
    # Track all tool executions: [{name, args, result}]
    tool_executions: list[dict] = []
    # Stack of pending tools for pairing start→end (supports sequential calls)
    _pending_tools: list[dict] = []

    try:
        async for event in graph.astream_events(state, version="v2"):
            kind = event.get("event", "")

            # Token streaming from LLM
            if kind == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk and isinstance(chunk, AIMessageChunk):
                    # Text content
                    if chunk.content and isinstance(chunk.content, str):
                        full_response += chunk.content
                        yield _sse({
                            "type": "token",
                            "delta": chunk.content,
                            "run_id": run_id,
                        })

                    # Tool call name (fires early, as LLM generates)
                    if chunk.tool_call_chunks:
                        for tc_chunk in chunk.tool_call_chunks:
                            if tc_chunk.get("name"):
                                yield _sse({
                                    "type": "tool_call",
                                    "name": tc_chunk["name"],
                                    "run_id": run_id,
                                })

            # Tool execution starts — full args available
            elif kind == "on_tool_start":
                name = event.get("name", "")
                tool_input = event.get("data", {}).get("input", {})
                if name:
                    _pending_tools.append({"name": name, "args": tool_input})
                    yield _sse({
                        "type": "tool_call_args",
                        "name": name,
                        "args": tool_input,
                        "run_id": run_id,
                    })

            # Tool execution results
            elif kind == "on_tool_end":
                output = event.get("data", {}).get("output", "")
                name = event.get("name", "")
                if name:
                    content = str(output) if not isinstance(output, str) else output
                    # Send full result to frontend (no truncation)
                    yield _sse({
                        "type": "tool_result",
                        "name": name,
                        "content": content,
                        "run_id": run_id,
                    })
                    # Record execution for DB persistence — match with pending tool
                    matched_args = {}
                    for idx, pt in enumerate(_pending_tools):
                        if pt["name"] == name:
                            matched_args = pt["args"]
                            _pending_tools.pop(idx)
                            break
                    tool_executions.append({
                        "name": name,
                        "args": matched_args,
                        "result": content[:2000],
                    })

    except Exception as e:
        logger.exception("Error during chat streaming")
        yield _sse({"type": "error", "message": str(e), "run_id": run_id})

    # Save assistant response to DB
    if full_response.strip() or tool_executions:
        svc.save_message(
            conversation_id,
            "assistant",
            full_response,
            tool_calls=tool_executions if tool_executions else None,
        )

    # Auto-generate title for new conversations
    try:
        conv = svc.get_conversation(conversation_id, user_id)
        if not conv.get("title"):
            _generate_title_sync(svc, conversation_id, message)
    except Exception:
        logger.debug("Failed to auto-generate conversation title", exc_info=True)

    yield _sse({"type": "run_status", "status": "done", "run_id": run_id})


def _generate_title_sync(svc: ChatService, conversation_id: str, first_message: str) -> None:
    """Generate a short conversation title from the first user message (sync, best-effort)."""
    # Simple heuristic: use first 50 chars of user message as title
    title = first_message.strip()[:60]
    if len(first_message.strip()) > 60:
        title = title.rsplit(" ", 1)[0] + "..."
    if title:
        svc.update_conversation_title(conversation_id, title)
