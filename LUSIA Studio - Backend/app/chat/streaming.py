"""
SSE streaming for the Chat AI agent.

This module now treats each assistant turn as a run with:
- a structured SSE contract
- transcript persistence for user/assistant/tool messages
- compact content blocks for replayable assistant history
- a requires-action flow for clarification requests
"""

from __future__ import annotations

import re
import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, SystemMessage, ToolMessage

from app.chat.agent import get_compiled_graph
from app.chat.llm import resolve_chat_model
from app.chat.service import ChatService
from app.chat.tools import _resolve_subject
from app.core.config import settings
from app.pipeline.clients.openrouter import chat_completion

logger = logging.getLogger(__name__)

SUBJECT_CONTEXT_RE = re.compile(
    r"<subject_context\s+name=\"([^\"]*?)\"\s+color=\"([^\"]*?)\"\s+icon=\"([^\"]*?)\">.*?</subject_context>\s*",
    re.DOTALL,
)
FRONTEND_IMAGES_RE = re.compile(r"<frontend_images>[\s\S]*?</frontend_images>", re.DOTALL)
CONVERSATION_NAMER_FALLBACK_ICON = None


def _sse(data: dict[str, Any]) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _build_human_content(text: str, images: list[str] | None = None) -> str | list[dict[str, Any]]:
    """Build HumanMessage content: plain string or multimodal list with images."""
    if not images:
        return text
    parts: list[dict[str, Any]] = [{"type": "text", "text": text}]
    for url in images[:4]:
        if url and isinstance(url, str):
            parts.append({"type": "image_url", "image_url": {"url": url}})
    return parts


def _stringify(value: Any) -> str:
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False)
    except Exception:
        return str(value)


def _extract_raw_tool_text(raw: Any) -> str:
    if isinstance(raw, str):
        return raw

    raw_content = getattr(raw, "content", None)
    if isinstance(raw_content, str):
        return raw_content

    if isinstance(raw, dict):
        content = raw.get("content")
        if isinstance(content, str):
            return content

    return _stringify(raw)


def _unwrap_langchain_content_repr(text: str) -> str:
    match = re.search(r"content=(['\"])(.*)\1(?:\s+\w+=|$)", text, re.DOTALL)
    if match:
        return match.group(2)
    return text


def _extract_subject_context(content: str) -> dict[str, str | None] | None:
    match = SUBJECT_CONTEXT_RE.search(content)
    if not match:
        return None
    return {
        "name": match.group(1).strip() or None,
        "color": match.group(2).strip() or None,
        "icon": match.group(3).strip() or None,
    }


def _strip_chat_markup(content: str) -> str:
    clean = SUBJECT_CONTEXT_RE.sub("", content or "")
    clean = FRONTEND_IMAGES_RE.sub("", clean)
    clean = re.sub(r"<image\s+src=\"[^\"]*\"\s*/>", "", clean)
    return clean.strip()


def _normalize_conversation_title(raw: Any) -> str | None:
    if not isinstance(raw, str):
        return None
    title = " ".join(raw.split()).strip().strip("\"'")
    if not title:
        return None
    if len(title) > 60:
        title = title[:60].rsplit(" ", 1)[0].rstrip() or title[:60].rstrip()
    return title


def _pick_subject_icon(
    *,
    subject_name: str | None,
    explicit_subject_contexts: list[dict[str, str | None]],
    preferred_subjects: list[dict[str, Any]],
    grade_level: str,
) -> str | None:
    normalized_subject = (subject_name or "").strip().casefold()
    if normalized_subject:
        for subject in preferred_subjects:
            candidate_name = str(subject.get("name") or "").strip().casefold()
            if candidate_name == normalized_subject:
                icon = subject.get("icon")
                if isinstance(icon, str) and icon.strip():
                    return icon.strip()

        resolved = _resolve_subject(subject_name or "", grade_level)
        if resolved and resolved.icon:
            return resolved.icon

    for context in reversed(explicit_subject_contexts):
        icon = context.get("icon")
        if isinstance(icon, str) and icon.strip():
            return icon.strip()

    return CONVERSATION_NAMER_FALLBACK_ICON


async def _generate_conversation_naming(
    *,
    transcript_rows: list[dict[str, Any]],
    preferred_subjects: list[dict[str, Any]],
    grade_level: str,
) -> dict[str, str | None] | None:
    real_user_rows = [
        row
        for row in transcript_rows
        if row.get("role") == "user" and not (row.get("metadata") or {}).get("is_question_answer")
    ]
    if len(real_user_rows) < 3:
        return None

    explicit_subject_contexts = [
        context
        for row in real_user_rows
        if isinstance(row.get("content"), str)
        for context in [_extract_subject_context(row["content"])]
        if context
    ]
    prompt_messages: list[str] = []
    for row in transcript_rows:
        role = row.get("role")
        if role not in {"user", "assistant"}:
            continue
        if role == "user" and (row.get("metadata") or {}).get("is_question_answer"):
            continue

        raw_content = row.get("content")
        if not isinstance(raw_content, str):
            continue
        cleaned = _strip_chat_markup(raw_content)
        if cleaned:
            speaker = "Aluno" if role == "user" else "Lusia"
            prompt_messages.append(f"{speaker}: {cleaned}")

    if not prompt_messages:
        return None

    explicit_subject_names = [
        str(context.get("name") or "").strip()
        for context in explicit_subject_contexts
        if str(context.get("name") or "").strip()
    ]
    preferred_subject_names = [
        str(subject.get("name") or "").strip()
        for subject in preferred_subjects
        if str(subject.get("name") or "").strip()
    ]

    response = await chat_completion(
        system_prompt=(
            "Gera um nome curto para uma conversa de um estudante. "
            "Responde apenas em JSON com as chaves title e subject_name. "
            "title: 3 a 5 palavras, natural, especifico, sem aspas finais, sem pontuacao desnecessaria. "
            "subject_name: nome da disciplina principal se estiver clara; caso contrario null."
        ),
        user_prompt=(
            f"A conversa chegou agora a 3 mensagens reais do utilizador.\n"
            f"Usa a conversa completa ate este momento, incluindo respostas da assistente.\n"
            f"Ano escolar: {grade_level or 'desconhecido'}\n"
            f"Disciplinas preferidas: {', '.join(preferred_subject_names) or 'nenhuma'}\n"
            f"Disciplinas explicitamente escolhidas no composer: {', '.join(explicit_subject_names) or 'nenhuma'}\n\n"
            f"{chr(10).join(prompt_messages)}"
        ),
        response_format={"type": "json_object"},
        temperature=0.2,
        max_tokens=120,
        model=settings.CHAT_CONVERSATION_NAMER_MODEL,
    )

    title = _normalize_conversation_title(response.get("title"))
    subject_name_raw = response.get("subject_name")
    subject_name = subject_name_raw.strip() if isinstance(subject_name_raw, str) else None
    if subject_name == "":
        subject_name = None

    return {
        "title": title,
        "icon": _pick_subject_icon(
            subject_name=subject_name,
            explicit_subject_contexts=explicit_subject_contexts,
            preferred_subjects=preferred_subjects,
            grade_level=grade_level,
        ),
    }


def _flatten_text_blocks(content_blocks: Any) -> str:
    if not isinstance(content_blocks, list):
        return ""
    parts: list[str] = []
    for block in content_blocks:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "assistant_text":
            text = block.get("text")
            if isinstance(text, str) and text:
                parts.append(text)
        elif block.get("type") == "ask_questions":
            questions = block.get("questions")
            if isinstance(questions, list):
                for question in questions:
                    if not isinstance(question, dict):
                        continue
                    question_text = question.get("question")
                    if isinstance(question_text, str) and question_text:
                        parts.append(question_text)
        elif block.get("type") == "clarification_request":
            question = block.get("question")
            if isinstance(question, str) and question:
                parts.append(question)
    return "\n\n".join(parts).strip()


def _extract_text_values(value: Any) -> list[str]:
    parts: list[str] = []
    if value is None:
        return parts
    if isinstance(value, str):
        if value:
            parts.append(value)
        return parts
    if isinstance(value, list):
        for item in value:
            parts.extend(_extract_text_values(item))
        return parts
    if isinstance(value, dict):
        for key in ("text", "content", "reasoning", "summary"):
            raw = value.get(key)
            if isinstance(raw, str) and raw:
                parts.append(raw)
        details = value.get("details")
        if isinstance(details, list):
            parts.extend(_extract_text_values(details))
        return parts
    return parts


def _extract_reasoning_detail_text(detail: Any) -> str:
    if not isinstance(detail, dict):
        return ""
    detail_type = str(detail.get("type") or "").lower()
    if detail_type == "reasoning.encrypted":
        return ""
    if detail_type == "reasoning.summary":
        summary = detail.get("summary")
        return summary if isinstance(summary, str) else ""
    text = detail.get("text")
    return text if isinstance(text, str) else ""


def _extract_reasoning_deltas(
    chunk: AIMessageChunk,
    seen_reasoning: dict[str, str],
) -> list[str]:
    additional_kwargs = getattr(chunk, "additional_kwargs", None) or {}
    if not isinstance(additional_kwargs, dict):
        additional_kwargs = {}

    reasoning_details = additional_kwargs.get("reasoning_details")
    if isinstance(reasoning_details, list) and reasoning_details:
        deltas: list[str] = []
        for index, detail in enumerate(reasoning_details):
            text = _extract_reasoning_detail_text(detail)
            if not text:
                continue
            detail_id = None
            if isinstance(detail, dict):
                detail_id = detail.get("id")
                if detail_id is None:
                    detail_id = detail.get("index")
            key = str(detail_id if detail_id is not None else index)
            previous = seen_reasoning.get(key, "")
            if text.startswith(previous):
                delta = text[len(previous):]
            elif previous.startswith(text):
                delta = ""
            else:
                delta = text
            if delta:
                deltas.append(delta)
            seen_reasoning[key] = text
        if deltas:
            return deltas

    for key in ("reasoning", "reasoning_content", "reasoning_text", "thinking"):
        raw = additional_kwargs.get(key)
        parts = _extract_text_values(raw)
        if not parts:
            continue
        text = "".join(parts)
        previous = seen_reasoning.get(key, "")
        if text.startswith(previous):
            delta = text[len(previous):]
        elif previous.startswith(text):
            delta = ""
        else:
            delta = text
        if delta:
            seen_reasoning[key] = text
            return [delta]
        seen_reasoning[key] = text

    return []


def _extract_chunk_deltas(
    chunk: AIMessageChunk,
    seen_reasoning: dict[str, str],
) -> tuple[list[str], list[str]]:
    text_parts: list[str] = []

    content = getattr(chunk, "content", None)
    if isinstance(content, str):
        if content:
            text_parts.append(content)
    elif isinstance(content, list):
        for item in content:
            if isinstance(item, str):
                if item:
                    text_parts.append(item)
                continue
            if not isinstance(item, dict):
                continue
            item_type = str(item.get("type") or "").lower()
            raw_text = item.get("text")
            if item_type in {"text", "output_text"}:
                text_parts.extend(_extract_text_values(raw_text if raw_text is not None else item))

    return (
        [part for part in text_parts if part],
        _extract_reasoning_deltas(chunk, seen_reasoning),
    )


def _parse_clarification_output(raw: Any) -> dict[str, Any]:
    text = _unwrap_langchain_content_repr(_extract_raw_tool_text(raw))
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            question = str(data.get("question") or "").strip()
            reason = str(data.get("reason") or "").strip() or None
            if question:
                return {"question": question, "reason": reason}
    except Exception:
        pass
    question = text.strip() or "Podes esclarecer um pouco melhor o que precisas?"
    return {"question": question, "reason": None}


def _normalize_questions_payload(raw_questions: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_questions, list):
        return []
    normalized: list[dict[str, Any]] = []
    for question in raw_questions[:3]:
        model_dump = getattr(question, "model_dump", None)
        if callable(model_dump):
            try:
                question = model_dump()
            except Exception:
                question = {}
        if not isinstance(question, dict):
            continue
        question_text = str(question.get("question") or "").strip()
        raw_options = question.get("options")
        options = [
            str(option).strip()
            for option in (raw_options if isinstance(raw_options, list) else [])
            if str(option).strip()
        ][:4]
        question_type = str(question.get("type") or "single_select").strip().lower()
        if question_type not in {"single_select", "multi_select"}:
            question_type = "single_select"
        if question_text and len(options) >= 2:
            normalized.append(
                {
                    "question": question_text,
                    "options": options,
                    "type": question_type,
                }
            )
    return normalized


def _parse_structured_tool_output(raw: Any) -> dict[str, Any] | None:
    raw_text = _unwrap_langchain_content_repr(_extract_raw_tool_text(raw))
    try:
        data = json.loads(raw_text)
    except Exception:
        return None
    if not isinstance(data, dict):
        return None

    llm_text = data.get("llm_text")
    tool_data = data.get("tool_data")
    if not isinstance(llm_text, str) or not isinstance(tool_data, dict):
        return None

    return {
        "llm_text": llm_text,
        "tool_data": tool_data,
    }


def _visual_tool_metadata(
    *,
    args: dict[str, Any],
    payload: dict[str, Any],
) -> dict[str, Any]:
    return {
        "tool_name": "generate_visual",
        "status": payload.get("status") or "streaming",
        "input": args,
        "output": {
            "html": payload.get("html"),
            "visual_type": payload.get("visual_type") or args.get("type"),
            "layout": "note",
            "theme_colors": payload.get("theme_colors"),
            "error": payload.get("error"),
        },
        "display": {
            "type": "generated_visual",
            "title": payload.get("title") or args.get("title"),
            "visual_type": payload.get("visual_type") or args.get("type"),
            "html": payload.get("html"),
            "status": payload.get("status") or "streaming",
            "subject_name": payload.get("subject_name") or args.get("subject_name"),
            "subject_color": payload.get("subject_color"),
            "subject_icon": payload.get("subject_icon"),
            "theme_colors": payload.get("theme_colors"),
            "error": payload.get("error"),
        },
    }


def _row_to_history_messages(row: dict[str, Any]) -> list[Any]:
    role = row.get("role")
    content = row.get("content", "") or ""
    metadata = row.get("metadata") or {}
    content_blocks = row.get("content_blocks")

    if role == "user":
        images = metadata.get("images") if isinstance(metadata, dict) else None
        return [HumanMessage(content=_build_human_content(content, images))]

    if role == "assistant":
        message_kind = metadata.get("message_kind") if isinstance(metadata, dict) else None
        if message_kind == "assistant_tool_call":
            tool_calls = row.get("tool_calls") or []
            return [AIMessage(content="", tool_calls=tool_calls)]
        return [AIMessage(content=content or _flatten_text_blocks(content_blocks))]

    if role == "tool":
        tool_call_id = row.get("tool_call_id") or f"tool:{row.get('id')}"
        return [ToolMessage(content=content or _stringify(metadata), tool_call_id=tool_call_id)]

    if role == "system":
        return [SystemMessage(content=content)]

    return []


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
    model_mode: str = "fast",
    resume_run_id: str | None = None,
    is_question_answer: bool = False,
    idempotency_key: str | None = None,
) -> AsyncGenerator[str, None]:
    svc = ChatService()
    selected_model_mode = "thinking" if model_mode == "thinking" else "fast"
    selected_model_name = resolve_chat_model(selected_model_mode)
    request_payload = {
        "message": message,
        "images": images or [],
        "model_mode": selected_model_mode,
        "model_name": selected_model_name,
        "resume_run_id": resume_run_id,
    }
    run = svc.create_run(
        conversation_id,
        user_id,
        request_payload=request_payload,
        status_value="streaming",
        parent_run_id=resume_run_id,
        idempotency_key=idempotency_key,
        model_mode=selected_model_mode,
        model_name=selected_model_name,
    )
    run_id = run["id"]
    event_seq = 0

    def persist_event(frame: dict[str, Any], *, store: bool = True) -> None:
        nonlocal event_seq
        if not store:
            return
        event_seq += 1
        payload = {k: v for k, v in frame.items() if k != "type"}
        svc.save_run_event(
            run_id,
            seq=event_seq,
            event_type=str(frame.get("type") or "unknown"),
            block_id=int(frame.get("block_id") or 0),
            payload=payload,
        )

    if resume_run_id:
        svc.update_run(
            resume_run_id,
            user_id,
            status_value="completed",
            pending_action=None,
        )

    user_metadata: dict[str, Any] = {
        "images": images or [],
        "model_mode": selected_model_mode,
        "model_name": selected_model_name,
    }
    if resume_run_id:
        user_metadata["resume_run_id"] = resume_run_id
    if is_question_answer:
        user_metadata["is_question_answer"] = True
    user_message = svc.save_message(
        conversation_id,
        "user",
        message,
        run_id=run_id,
        metadata=user_metadata,
    )
    svc.update_run(run_id, user_id, user_message_id=user_message["id"])

    history_rows = svc.list_transcript_messages(conversation_id, user_id)
    history_messages: list[Any] = []
    for row in history_rows:
        history_messages.extend(_row_to_history_messages(row))

    graph = get_compiled_graph()
    state = {
        "messages": history_messages,
        "user_name": user_name,
        "grade_level": grade_level,
        "education_level": education_level,
        "preferred_subjects": preferred_subjects,
        "model_mode": selected_model_mode,
    }

    run_started_frame = {
        "type": "run.started",
        "run_id": run_id,
        "conversation_id": conversation_id,
        "status": "streaming",
        "model_mode": selected_model_mode,
        "model_name": selected_model_name,
        "resume_run_id": resume_run_id,
    }
    yield _sse(run_started_frame)
    persist_event(run_started_frame)

    assistant_call_message_id: str | None = None
    assistant_tool_calls: list[dict[str, Any]] = []
    content_blocks: list[dict[str, Any]] = []
    current_reasoning_block_index: int | None = None
    current_text_block_index: int | None = None
    seen_reasoning: dict[str, str] = {}
    clarification_emitted = False
    tool_call_counter = 0
    pending_tools: list[dict[str, Any]] = []

    def match_pending_visual_tool(payload: dict[str, Any]) -> dict[str, Any] | None:
        target_title = str(payload.get("title") or "").strip()
        target_type = str(payload.get("visual_type") or "").strip()
        for tool in reversed(pending_tools):
            if tool.get("name") != "generate_visual":
                continue
            args = tool.get("args") or {}
            arg_title = str(args.get("title") or "").strip()
            arg_type = str(args.get("type") or "").strip()
            if target_title and arg_title and arg_title != target_title:
                continue
            if target_type and arg_type and arg_type != target_type:
                continue
            return tool
        return None

    try:
        async for event in graph.astream_events(state, version="v2"):
            kind = event.get("event", "")

            if kind == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk and isinstance(chunk, AIMessageChunk):
                    text_deltas, reasoning_deltas = _extract_chunk_deltas(
                        chunk,
                        seen_reasoning,
                    )

                    for delta in reasoning_deltas:
                        if current_reasoning_block_index is None:
                            current_reasoning_block_index = len(content_blocks)
                            content_blocks.append(
                                {
                                    "id": f"reasoning-{current_reasoning_block_index}",
                                    "type": "reasoning_text",
                                    "block_id": current_reasoning_block_index,
                                    "text": "",
                                }
                            )
                        content_blocks[current_reasoning_block_index]["text"] += delta
                        reasoning_frame = {
                            "type": "reasoning",
                            "run_id": run_id,
                            "block_id": current_reasoning_block_index,
                            "delta": delta,
                        }
                        yield _sse(reasoning_frame)
                        persist_event(reasoning_frame, store=False)

                    for delta in text_deltas:
                        if current_text_block_index is None:
                            current_text_block_index = len(content_blocks)
                            content_blocks.append(
                                {
                                    "id": f"text-{current_text_block_index}",
                                    "type": "assistant_text",
                                    "block_id": current_text_block_index,
                                    "text": "",
                                }
                            )
                            block_started_frame = {
                                "type": "assistant.block.started",
                                "run_id": run_id,
                                "block_id": current_text_block_index,
                                "format": "markdown",
                            }
                            yield _sse(block_started_frame)
                            persist_event(block_started_frame)
                        content_blocks[current_text_block_index]["text"] += delta
                        delta_frame = {
                            "type": "assistant.block.delta",
                            "delta": delta,
                            "run_id": run_id,
                            "block_id": current_text_block_index,
                        }
                        yield _sse(delta_frame)
                        persist_event(delta_frame, store=False)

            elif kind == "on_custom_event":
                name = event.get("name", "")
                payload = event.get("data") or {}
                if not isinstance(payload, dict):
                    payload = {}

                if name == "chat_reasoning_delta":
                    delta = payload.get("delta")
                    if isinstance(delta, str) and delta:
                        if current_reasoning_block_index is None:
                            current_reasoning_block_index = len(content_blocks)
                            content_blocks.append(
                                {
                                    "id": f"reasoning-{current_reasoning_block_index}",
                                    "type": "reasoning_text",
                                    "block_id": current_reasoning_block_index,
                                    "text": "",
                                }
                            )
                        content_blocks[current_reasoning_block_index]["text"] += delta
                        reasoning_frame = {
                            "type": "reasoning",
                            "run_id": run_id,
                            "block_id": current_reasoning_block_index,
                            "delta": delta,
                        }
                        yield _sse(reasoning_frame)
                        persist_event(reasoning_frame, store=False)

                elif name == "chat_text_delta":
                    delta = payload.get("delta")
                    if isinstance(delta, str) and delta:
                        if current_text_block_index is None:
                            current_text_block_index = len(content_blocks)
                            content_blocks.append(
                                {
                                    "id": f"text-{current_text_block_index}",
                                    "type": "assistant_text",
                                    "block_id": current_text_block_index,
                                    "text": "",
                                }
                            )
                            block_started_frame = {
                                "type": "assistant.block.started",
                                "run_id": run_id,
                                "block_id": current_text_block_index,
                                "format": "markdown",
                            }
                            yield _sse(block_started_frame)
                            persist_event(block_started_frame)
                        content_blocks[current_text_block_index]["text"] += delta
                        delta_frame = {
                            "type": "assistant.block.delta",
                            "delta": delta,
                            "run_id": run_id,
                            "block_id": current_text_block_index,
                        }
                        yield _sse(delta_frame)
                        persist_event(delta_frame, store=False)

                elif name in {"chat_visual_snapshot", "chat_visual_done", "chat_visual_failed"}:
                    matched_tool = match_pending_visual_tool(payload)
                    if not matched_tool:
                        continue

                    block_id = matched_tool.get("block_id")
                    if block_id is None or block_id >= len(content_blocks):
                        continue

                    args = matched_tool.get("args") or {}
                    tool_call_id = matched_tool["id"]
                    metadata = _visual_tool_metadata(args=args, payload=payload)
                    content_blocks[block_id]["metadata"] = metadata
                    if isinstance(payload.get("html"), str):
                        content_blocks[block_id]["result"] = payload["html"]

                    if name == "chat_visual_snapshot":
                        frame = {
                            "type": "tool.visual.snapshot",
                            "run_id": run_id,
                            "block_id": block_id,
                            "tool_call_id": tool_call_id,
                            "tool_name": "generate_visual",
                            "html": payload.get("html"),
                            "title": payload.get("title") or args.get("title"),
                            "visual_type": payload.get("visual_type") or args.get("type"),
                            "metadata": metadata,
                        }
                        yield _sse(frame)
                        persist_event(frame, store=False)
                    elif name == "chat_visual_done":
                        content_blocks[block_id]["state"] = "completed"
                        frame = {
                            "type": "tool.visual.done",
                            "run_id": run_id,
                            "block_id": block_id,
                            "tool_call_id": tool_call_id,
                            "tool_name": "generate_visual",
                            "html": payload.get("html"),
                            "title": payload.get("title") or args.get("title"),
                            "visual_type": payload.get("visual_type") or args.get("type"),
                            "metadata": metadata,
                        }
                        yield _sse(frame)
                        persist_event(frame, store=False)
                    else:
                        content_blocks[block_id]["state"] = "failed"
                        frame = {
                            "type": "tool.visual.failed",
                            "run_id": run_id,
                            "block_id": block_id,
                            "tool_call_id": tool_call_id,
                            "tool_name": "generate_visual",
                            "message": str(payload.get("error") or "Visual generation failed."),
                            "metadata": metadata,
                        }
                        yield _sse(frame)
                        persist_event(frame, store=False)

            elif kind == "on_tool_start":
                name = event.get("name", "")
                tool_input = event.get("data", {}).get("input", {})
                if not name:
                    continue

                tool_call_counter += 1
                tool_call_id = f"{run_id}:tool:{tool_call_counter}"
                pending_tool = {
                    "id": tool_call_id,
                    "name": name,
                    "args": tool_input,
                    "block_id": None,
                }
                pending_tools.append(pending_tool)
                assistant_tool_calls.append(
                    {
                        "id": tool_call_id,
                        "name": name,
                        "args": tool_input,
                    }
                )

                if assistant_call_message_id is None:
                    call_message = svc.save_message(
                        conversation_id,
                        "assistant",
                        "",
                        run_id=run_id,
                        tool_calls=[],
                        metadata={"message_kind": "assistant_tool_call"},
                    )
                    assistant_call_message_id = call_message["id"]

                svc.update_message(
                    assistant_call_message_id,
                    conversation_id,
                    tool_calls=assistant_tool_calls,
                )

                # Interactive clarification without a tool row (legacy single question)
                if name == "request_clarification":
                    continue

                seen_reasoning.clear()
                current_reasoning_block_index = None
                current_text_block_index = None
                block_id = len(content_blocks)
                pending_tool["block_id"] = block_id
                content_blocks.append(
                    {
                        "id": tool_call_id,
                        "type": "tool_call",
                        "block_id": block_id,
                        "tool_name": name,
                        "args": tool_input,
                        "metadata": (
                            _visual_tool_metadata(
                                args=tool_input if isinstance(tool_input, dict) else {},
                                payload={
                                    "title": (tool_input or {}).get("title") if isinstance(tool_input, dict) else None,
                                    "visual_type": (tool_input or {}).get("type") if isinstance(tool_input, dict) else None,
                                    "subject_name": (tool_input or {}).get("subject_name") if isinstance(tool_input, dict) else None,
                                    "status": "streaming",
                                    "html": None,
                                    "theme_colors": None,
                                },
                            )
                            if name == "generate_visual" and isinstance(tool_input, dict)
                            else None
                        ),
                        "state": "running",
                    }
                )
                tool_started_frame = {
                    "type": "tool.call.started",
                    "run_id": run_id,
                    "block_id": block_id,
                    "tool_call_id": tool_call_id,
                    "tool_name": name,
                    "args": tool_input,
                }
                yield _sse(tool_started_frame)
                persist_event(tool_started_frame)

            elif kind == "on_tool_end":
                output = event.get("data", {}).get("output", "")
                name = event.get("name", "")
                if not name:
                    continue
                matched_tool = None
                for idx, pt in enumerate(pending_tools):
                    if pt["name"] == name:
                        matched_tool = pending_tools.pop(idx)
                        break
                matched_tool = matched_tool or {
                    "id": f"{run_id}:tool:unknown",
                    "name": name,
                    "args": {},
                    "block_id": None,
                }

                tool_call_id = matched_tool["id"]
                matched_args = matched_tool.get("args") or {}
                parsed_tool_output = _parse_structured_tool_output(output)
                content = (
                    parsed_tool_output["llm_text"]
                    if parsed_tool_output
                    else _unwrap_langchain_content_repr(_extract_raw_tool_text(output))
                )
                tool_metadata = {
                    "args": matched_args,
                    "message_kind": "tool_result",
                }
                if parsed_tool_output:
                    tool_metadata["tool_data"] = parsed_tool_output["tool_data"]
                tool_state = (
                    "failed"
                    if parsed_tool_output
                    and str(parsed_tool_output["tool_data"].get("status") or "").lower() in {"error", "failed"}
                    else "completed"
                )

                svc.save_message(
                    conversation_id,
                    "tool",
                    content,
                    run_id=run_id,
                    tool_call_id=tool_call_id,
                    tool_name=name,
                    metadata=tool_metadata,
                )

                if name == "ask_questions":
                    block_id = matched_tool.get("block_id")
                    if block_id is not None and block_id < len(content_blocks):
                        content_blocks[block_id]["result"] = content
                        content_blocks[block_id]["state"] = tool_state
                        if parsed_tool_output:
                            content_blocks[block_id]["metadata"] = parsed_tool_output["tool_data"]

                    tool_completed_frame = {
                        "type": "tool.call.completed",
                        "run_id": run_id,
                        "block_id": block_id or 0,
                        "tool_call_id": tool_call_id,
                        "tool_name": name,
                        "args": matched_args,
                        "content": content,
                        "state": tool_state,
                    }
                    if parsed_tool_output:
                        tool_completed_frame["metadata"] = parsed_tool_output["tool_data"]
                    yield _sse(tool_completed_frame)
                    persist_event(tool_completed_frame)

                    tool_result_frame = {
                        "type": "tool.result",
                        "run_id": run_id,
                        "block_id": block_id or 0,
                        "tool_call_id": tool_call_id,
                        "tool_name": name,
                        "args": matched_args,
                        "content": content,
                    }
                    if parsed_tool_output:
                        tool_result_frame["metadata"] = parsed_tool_output["tool_data"]
                    yield _sse(tool_result_frame)
                    persist_event(tool_result_frame)

                    raw_questions = matched_args.get("questions") if isinstance(matched_args, dict) else matched_args
                    questions = _normalize_questions_payload(raw_questions)
                    pending_action = {
                        "type": "ask_questions",
                        "action_id": tool_call_id,
                        "questions": questions,
                        "resume_run_id": run_id,
                        "model_mode": selected_model_mode,
                    }
                    assistant_summary = "\n\n".join(
                        q.get("question", "")
                        for q in questions
                        if isinstance(q, dict)
                    )
                    question_message = svc.save_message(
                        conversation_id,
                        "assistant",
                        assistant_summary,
                        run_id=run_id,
                        content_blocks=list(content_blocks),
                        metadata={
                            "message_kind": "assistant_final",
                            "run_status": "requires_action",
                            "model_mode": selected_model_mode,
                            "model_name": selected_model_name,
                            "pending_action": pending_action,
                        },
                    )
                    svc.update_run(
                        run_id,
                        user_id,
                        status_value="requires_action",
                        pending_action=pending_action,
                        assistant_message_id=question_message["id"],
                        model_mode=selected_model_mode,
                        model_name=selected_model_name,
                    )
                    requires_action_frame = {
                        "type": "run.requires_action",
                        "run_id": run_id,
                        "conversation_id": conversation_id,
                        "action": pending_action,
                    }
                    yield _sse(requires_action_frame)
                    persist_event(requires_action_frame)
                    clarification_emitted = True
                    break

                if name == "request_clarification":
                    clarification = _parse_clarification_output(output)
                    pending_action = {
                        "type": "clarification_request",
                        "action_id": tool_call_id,
                        "question": clarification["question"],
                        "reason": clarification.get("reason"),
                        "resume_run_id": run_id,
                        "model_mode": selected_model_mode,
                    }
                    clarification_message = svc.save_message(
                        conversation_id,
                        "assistant",
                        clarification["question"],
                        run_id=run_id,
                        content_blocks=[
                            {
                                "id": tool_call_id,
                                "type": "clarification_request",
                                "question": clarification["question"],
                                "reason": clarification.get("reason"),
                            }
                        ],
                        metadata={
                            "message_kind": "assistant_final",
                            "run_status": "requires_action",
                            "model_mode": selected_model_mode,
                            "model_name": selected_model_name,
                            "pending_action": pending_action,
                        },
                    )
                    svc.update_run(
                        run_id,
                        user_id,
                        status_value="requires_action",
                        pending_action=pending_action,
                        assistant_message_id=clarification_message["id"],
                        model_mode=selected_model_mode,
                        model_name=selected_model_name,
                    )
                    requires_action_frame = {
                        "type": "run.requires_action",
                        "run_id": run_id,
                        "conversation_id": conversation_id,
                        "action": pending_action,
                    }
                    yield _sse(requires_action_frame)
                    persist_event(requires_action_frame)
                    clarification_emitted = True
                    break

                block_id = matched_tool.get("block_id")
                if block_id is not None and block_id < len(content_blocks):
                    content_blocks[block_id]["result"] = content
                    content_blocks[block_id]["state"] = tool_state
                    if parsed_tool_output:
                        content_blocks[block_id]["metadata"] = parsed_tool_output["tool_data"]

                tool_completed_frame = {
                    "type": "tool.call.completed",
                    "run_id": run_id,
                    "block_id": block_id or 0,
                    "tool_call_id": tool_call_id,
                    "tool_name": name,
                    "args": matched_args,
                    "content": content,
                    "state": tool_state,
                }
                if parsed_tool_output:
                    tool_completed_frame["metadata"] = parsed_tool_output["tool_data"]
                yield _sse(tool_completed_frame)
                persist_event(tool_completed_frame)

                tool_result_frame = {
                    "type": "tool.result",
                    "run_id": run_id,
                    "block_id": block_id or 0,
                    "tool_call_id": tool_call_id,
                    "tool_name": name,
                    "args": matched_args,
                    "content": content,
                }
                if parsed_tool_output:
                    tool_result_frame["metadata"] = parsed_tool_output["tool_data"]
                yield _sse(tool_result_frame)
                persist_event(tool_result_frame)

    except Exception as e:
        logger.exception("Error during chat streaming")
        partial_text = _flatten_text_blocks(content_blocks)
        assistant_message = None
        if partial_text.strip() or content_blocks:
            assistant_message = svc.save_message(
                conversation_id,
                "assistant",
                partial_text,
                run_id=run_id,
                content_blocks=content_blocks,
                metadata={
                    "message_kind": "assistant_final",
                    "run_status": "failed",
                    "partial": True,
                    "model_mode": selected_model_mode,
                    "model_name": selected_model_name,
                },
            )
        svc.update_run(
            run_id,
            user_id,
            status_value="failed",
            error_message=str(e),
            assistant_message_id=assistant_message["id"] if assistant_message else None,
            model_mode=selected_model_mode,
            model_name=selected_model_name,
        )
        failed_frame = {
            "type": "run.failed",
            "run_id": run_id,
            "conversation_id": conversation_id,
            "model_mode": selected_model_mode,
            "model_name": selected_model_name,
            "message": str(e),
        }
        yield _sse(failed_frame)
        persist_event(failed_frame)
        yield _sse({"type": "error", "message": str(e), "run_id": run_id})
        return

    if clarification_emitted:
        return

    for block in content_blocks:
        if block.get("type") != "assistant_text":
            continue
        completed_frame = {
            "type": "assistant.block.completed",
            "run_id": run_id,
            "block_id": block.get("block_id", 0),
        }
        yield _sse(completed_frame)
        persist_event(completed_frame)

    assistant_text = _flatten_text_blocks(content_blocks)
    assistant_message = None
    if assistant_text.strip() or content_blocks:
        assistant_message = svc.save_message(
            conversation_id,
            "assistant",
            assistant_text,
            run_id=run_id,
            content_blocks=content_blocks,
            metadata={
                "message_kind": "assistant_final",
                "run_status": "completed",
                "model_mode": selected_model_mode,
                "model_name": selected_model_name,
            },
        )
        svc.update_run(
            run_id,
            user_id,
            status_value="completed",
            pending_action=None,
            assistant_message_id=assistant_message["id"],
            model_mode=selected_model_mode,
            model_name=selected_model_name,
        )
    else:
        svc.update_run(
            run_id,
            user_id,
            status_value="completed",
            pending_action=None,
            model_mode=selected_model_mode,
            model_name=selected_model_name,
        )

    completed_frame = {
        "type": "run.completed",
        "run_id": run_id,
        "conversation_id": conversation_id,
        "model_mode": selected_model_mode,
        "model_name": selected_model_name,
        "assistant_message_id": assistant_message["id"] if assistant_message else None,
        "status": "completed",
    }
    yield _sse(completed_frame)
    persist_event(completed_frame)

    try:
        conv = svc.get_conversation(conversation_id, user_id)
        if not conv.get("title"):
            naming = await _generate_conversation_naming(
                transcript_rows=svc.list_transcript_messages(conversation_id, user_id),
                preferred_subjects=preferred_subjects,
                grade_level=grade_level,
            )
            if naming and naming.get("title"):
                svc.update_conversation_naming(
                    conversation_id,
                    title=naming["title"],
                    icon=naming.get("icon"),
                )
    except Exception:
        logger.debug("Failed to auto-generate conversation naming", exc_info=True)
