"""
LLM factory for the Chat AI feature.

Uses ChatOpenAI pointed at OpenRouter for tool-calling + streaming support.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Literal, Optional

import httpx
from langchain_core.callbacks.manager import adispatch_custom_event
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage
from langchain_core.messages.tool import tool_call
from langchain_core.outputs import ChatGenerationChunk
from langchain_core.runnables import RunnableConfig
from langchain_core.utils.function_calling import convert_to_openai_tool
from langchain_openai import ChatOpenAI
from langchain_openai.chat_models.base import (
    _convert_delta_to_message_chunk,
    _convert_message_to_dict,
    _create_usage_metadata,
)

from app.core.config import settings
from app.pipeline.clients.openrouter import (
    MAX_RETRIES,
    OPENROUTER_API_URL,
    REQUEST_TIMEOUT,
    RETRY_DELAYS,
    OpenRouterError,
    parse_json_text,
)


ChatModelMode = Literal["fast", "thinking"]
logger = logging.getLogger(__name__)


class OpenRouterChatOpenAI(ChatOpenAI):
    """ChatOpenAI variant that preserves OpenRouter reasoning fields in stream deltas."""

    def _convert_chunk_to_generation_chunk(
        self,
        chunk: dict,
        default_chunk_class: type,
        base_generation_info: Optional[dict],
    ) -> Optional[ChatGenerationChunk]:
        if chunk.get("type") == "content.delta":
            return None

        token_usage = chunk.get("usage")
        choices = chunk.get("choices", []) or chunk.get("chunk", {}).get("choices", [])
        usage_metadata = _create_usage_metadata(token_usage) if token_usage else None

        if len(choices) == 0:
            return ChatGenerationChunk(
                message=default_chunk_class(content="", usage_metadata=usage_metadata),
                generation_info=base_generation_info,
            )

        choice = choices[0]
        delta = choice.get("delta")
        if delta is None:
            return None

        message_chunk = _convert_delta_to_message_chunk(delta, default_chunk_class)
        generation_info = {**base_generation_info} if base_generation_info else {}

        if finish_reason := choice.get("finish_reason"):
            generation_info["finish_reason"] = finish_reason
            if model_name := chunk.get("model"):
                generation_info["model_name"] = model_name
            if system_fingerprint := chunk.get("system_fingerprint"):
                generation_info["system_fingerprint"] = system_fingerprint
            if service_tier := chunk.get("service_tier"):
                generation_info["service_tier"] = service_tier

        logprobs = choice.get("logprobs")
        if logprobs:
            generation_info["logprobs"] = logprobs

        if isinstance(message_chunk, AIMessageChunk):
            extra_fields = {}
            for key in ("reasoning", "reasoning_details"):
                value = delta.get(key)
                if value not in (None, "", []):
                    extra_fields[key] = value
            if extra_fields:
                message_chunk = message_chunk.model_copy(
                    update={
                        "additional_kwargs": {
                            **(message_chunk.additional_kwargs or {}),
                            **extra_fields,
                        }
                    }
                )
            if usage_metadata:
                message_chunk.usage_metadata = usage_metadata

        return ChatGenerationChunk(
            message=message_chunk,
            generation_info=generation_info or None,
        )


def _coerce_stream_text_chunk(content: Any) -> str:
    """Normalize streamed content payloads into plain text."""
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
                continue
            if not isinstance(item, dict):
                continue

            text = item.get("text")
            if isinstance(text, str):
                parts.append(text)
                continue

            if item.get("type") == "text":
                nested_text = item.get("content")
                if isinstance(nested_text, str):
                    parts.append(nested_text)

        return "".join(parts)

    return ""


def _extract_reasoning_delta_text(detail: dict[str, Any]) -> str:
    detail_type = str(detail.get("type") or "").lower()
    if detail_type == "reasoning.encrypted":
        return ""
    if detail_type == "reasoning.summary":
        summary = detail.get("summary")
        return summary if isinstance(summary, str) else ""
    text = detail.get("text")
    return text if isinstance(text, str) else ""


def _extract_reasoning_deltas_from_delta(
    delta: dict[str, Any],
    seen_reasoning: dict[str, str],
) -> list[str]:
    reasoning_details = delta.get("reasoning_details")
    if isinstance(reasoning_details, list) and reasoning_details:
        deltas: list[str] = []
        for idx, detail in enumerate(reasoning_details):
            if not isinstance(detail, dict):
                continue
            text = _extract_reasoning_delta_text(detail)
            if not text:
                continue
            raw_key = detail.get("id")
            if raw_key is None:
                raw_key = detail.get("index")
            key = str(raw_key if raw_key is not None else idx)
            previous = seen_reasoning.get(key, "")
            if text.startswith(previous):
                delta_text = text[len(previous):]
            elif previous.startswith(text):
                delta_text = ""
            else:
                delta_text = text
            if delta_text:
                deltas.append(delta_text)
            seen_reasoning[key] = text
        if deltas:
            return deltas

    for key in ("reasoning", "reasoning_content", "reasoning_text", "thinking"):
        raw = delta.get(key)
        if not isinstance(raw, str) or not raw:
            continue
        previous = seen_reasoning.get(key, "")
        if raw.startswith(previous):
            delta_text = raw[len(previous):]
        elif previous.startswith(raw):
            delta_text = ""
        else:
            delta_text = raw
        seen_reasoning[key] = raw
        if delta_text:
            return [delta_text]

    return []


def _merge_tool_call_delta(
    raw_tool_call: dict[str, Any],
    tool_calls_by_index: dict[int, dict[str, Any]],
) -> None:
    index = int(raw_tool_call.get("index") or 0)
    current = tool_calls_by_index.setdefault(
        index,
        {
            "id": None,
            "type": "function",
            "function": {"name": "", "arguments": ""},
        },
    )

    raw_id = raw_tool_call.get("id")
    if raw_id:
        current["id"] = raw_id

    raw_type = raw_tool_call.get("type")
    if raw_type:
        current["type"] = raw_type

    function = raw_tool_call.get("function") or {}
    if not isinstance(function, dict):
        return

    raw_name = function.get("name")
    if isinstance(raw_name, str) and raw_name:
        current["function"]["name"] += raw_name

    raw_arguments = function.get("arguments")
    if isinstance(raw_arguments, str) and raw_arguments:
        current["function"]["arguments"] += raw_arguments


def _build_tool_calls_from_raw(
    tool_calls_by_index: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    resolved: list[dict[str, Any]] = []
    for index in sorted(tool_calls_by_index):
        raw_tool_call = tool_calls_by_index[index]
        function = raw_tool_call.get("function") or {}
        name = str(function.get("name") or "").strip()
        if not name:
            continue

        raw_arguments = str(function.get("arguments") or "").strip()
        if not raw_arguments:
            args: dict[str, Any] = {}
        else:
            try:
                parsed = parse_json_text(raw_arguments)
            except Exception:
                logger.warning("Failed to parse streamed tool arguments for %s", name)
                parsed = {}
            args = parsed if isinstance(parsed, dict) else {"input": parsed}

        resolved.append(
            tool_call(
                name=name,
                args=args,
                id=raw_tool_call.get("id") or f"tool_call_{index}",
            )
        )

    return resolved


async def invoke_thinking_chat_model(
    *,
    messages: list[BaseMessage],
    tools: list[Any],
    config: Optional[RunnableConfig] = None,
) -> AIMessage:
    """Call OpenRouter directly for thinking mode to preserve raw stream cadence."""
    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured.")

    model = resolve_chat_model("thinking")
    payload: dict[str, Any] = {
        "model": model,
        "messages": [_convert_message_to_dict(message) for message in messages],
        "tools": [convert_to_openai_tool(tool) for tool in tools],
        "tool_choice": "auto",
        "temperature": settings.CHAT_TEMPERATURE,
        "max_tokens": settings.CHAT_MAX_TOKENS,
        "reasoning": {
            "enabled": True,
            "exclude": False,
        },
        "stream": True,
    }

    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    timeout = httpx.Timeout(REQUEST_TIMEOUT, read=None)
    last_error: Exception | None = None

    for attempt in range(MAX_RETRIES + 1):
        emitted_any = False
        text_parts: list[str] = []
        seen_reasoning: dict[str, str] = {}
        tool_calls_by_index: dict[int, dict[str, Any]] = {}

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST",
                    OPENROUTER_API_URL,
                    json=payload,
                    headers=headers,
                ) as response:
                    if response.status_code == 200:
                        async for line in response.aiter_lines():
                            trimmed = line.strip()
                            if not trimmed or not trimmed.startswith("data:"):
                                continue

                            data = trimmed[5:].strip()
                            if data == "[DONE]":
                                return AIMessage(
                                    content="".join(text_parts),
                                    tool_calls=_build_tool_calls_from_raw(tool_calls_by_index),
                                )

                            try:
                                chunk = json.loads(data)
                            except json.JSONDecodeError:
                                logger.debug("Skipping malformed OpenRouter stream chunk: %s", data[:200])
                                continue

                            choices = chunk.get("choices") or []
                            if not choices:
                                continue

                            delta = choices[0].get("delta") or {}
                            if not isinstance(delta, dict):
                                continue

                            text_delta = _coerce_stream_text_chunk(delta.get("content"))
                            if text_delta:
                                emitted_any = True
                                text_parts.append(text_delta)
                                await adispatch_custom_event(
                                    "chat_text_delta",
                                    {"delta": text_delta},
                                    config=config,
                                )

                            for reasoning_delta in _extract_reasoning_deltas_from_delta(delta, seen_reasoning):
                                emitted_any = True
                                await adispatch_custom_event(
                                    "chat_reasoning_delta",
                                    {"delta": reasoning_delta},
                                    config=config,
                                )

                            raw_tool_calls = delta.get("tool_calls") or []
                            if isinstance(raw_tool_calls, list):
                                for raw_tool_call in raw_tool_calls:
                                    if isinstance(raw_tool_call, dict):
                                        _merge_tool_call_delta(raw_tool_call, tool_calls_by_index)

                        return AIMessage(
                            content="".join(text_parts),
                            tool_calls=_build_tool_calls_from_raw(tool_calls_by_index),
                        )

                    if response.status_code in (429, 500, 502, 503, 504):
                        error_text = await response.aread()
                        last_error = OpenRouterError(
                            f"OpenRouter returned {response.status_code}: {error_text[:500].decode(errors='ignore')}",
                            status_code=response.status_code,
                        )
                        if attempt < MAX_RETRIES:
                            delay = RETRY_DELAYS[attempt]
                            logger.warning(
                                "OpenRouter chat stream %d (attempt %d/%d), retrying in %ds...",
                                response.status_code,
                                attempt + 1,
                                MAX_RETRIES + 1,
                                delay,
                            )
                            await __import__("asyncio").sleep(delay)
                            continue

                    error_text = await response.aread()
                    raise OpenRouterError(
                        f"OpenRouter returned {response.status_code}: {error_text[:500].decode(errors='ignore')}",
                        status_code=response.status_code,
                    )
        except (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError) as exc:
            last_error = exc
            if emitted_any:
                raise OpenRouterError(
                    f"OpenRouter stream interrupted after partial output: {exc}"
                ) from exc
            if attempt < MAX_RETRIES:
                delay = RETRY_DELAYS[attempt]
                logger.warning(
                    "OpenRouter chat stream connection error (attempt %d/%d): %s, retrying in %ds...",
                    attempt + 1,
                    MAX_RETRIES + 1,
                    str(exc),
                    delay,
                )
                await __import__("asyncio").sleep(delay)
                continue

    raise OpenRouterError(
        f"OpenRouter chat stream failed after {MAX_RETRIES + 1} attempts: {last_error}"
    )


def resolve_chat_model(mode: ChatModelMode = "fast") -> str:
    if mode == "thinking":
        return settings.CHAT_THINKING_MODEL or "@preset/kimi-k2-5-thinking"
    return settings.CHAT_MODEL or settings.OPENROUTER_MODEL


def get_chat_llm(mode: ChatModelMode = "fast") -> ChatOpenAI:
    """Build a ChatOpenAI instance pointed at OpenRouter."""
    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured.")

    model = resolve_chat_model(mode)
    extra_body = None
    if mode == "thinking":
        extra_body = {
            "reasoning": {
                "enabled": True,
                "exclude": False,
            }
        }

    return OpenRouterChatOpenAI(
        model=model,
        temperature=settings.CHAT_TEMPERATURE,
        max_tokens=settings.CHAT_MAX_TOKENS,
        openai_api_key=settings.OPENROUTER_API_KEY,
        openai_api_base="https://openrouter.ai/api/v1",
        streaming=True,
        extra_body=extra_body,
    )
