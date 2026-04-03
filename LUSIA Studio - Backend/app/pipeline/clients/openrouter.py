"""
OpenRouter API client for AI chat completions.

Generic async client using httpx for structured JSON output.
Used by the categorization, question extraction, and quiz generation steps.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING, Any, TypeVar

import httpx
from openai import AsyncOpenAI
from pydantic import BaseModel

from app.core.config import settings

if TYPE_CHECKING:
    import instructor

T = TypeVar("T", bound=BaseModel)

logger = logging.getLogger(__name__)

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Retry config
MAX_RETRIES = 3
RETRY_DELAYS = [2, 4, 8]  # seconds
REQUEST_TIMEOUT = 120.0  # seconds
MAX_JSON_FIX_RETRIES = 2  # extra LLM calls to fix malformed JSON

JSON_FIX_PROMPT = (
    "Your previous response was not valid JSON. Below is the output you produced "
    "and the parsing error. Please return ONLY the corrected, valid JSON — no "
    "explanations, no markdown fences, just the raw JSON.\n\n"
    "--- YOUR OUTPUT ---\n{output}\n\n"
    "--- ERROR ---\n{error}"
)


class OpenRouterError(Exception):
    """Non-retryable OpenRouter API error."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _strip_code_fences(content: str) -> str:
    """Strip markdown code fences (```json ... ```) from LLM output."""
    content = content.strip()
    if content.startswith("```"):
        first_newline = content.index("\n")
        content = content[first_newline + 1:]
        if content.endswith("```"):
            content = content[:-3].rstrip()
    return content


def parse_json_text(content: str) -> dict:
    """Strip fences and parse JSON with the same lenient fallback used internally."""
    return _parse_json_lenient(_strip_code_fences(content))


def _parse_json_lenient(content: str) -> dict:
    """
    Parse JSON from LLM output, falling back to backslash sanitization
    for common LaTeX escaping issues.

    Raises json.JSONDecodeError if both attempts fail.
    """
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        _VALID_JSON_ESCAPES = frozenset('"\\/bfnrtu')
        sanitized = re.sub(
            r'\\(.)',
            lambda m: m.group(0) if m.group(1) in _VALID_JSON_ESCAPES else '\\\\' + m.group(1),
            content,
        )
        return json.loads(sanitized)


async def _retry_json_with_fix(
    *,
    messages: list[dict],
    malformed_output: str,
    parse_error: str,
    model: str,
    response_format: dict | None,
    temperature: float,
    max_tokens: int,
    headers: dict,
) -> dict:
    """
    Re-call the LLM with the conversation context + the malformed output +
    the parse error, so the model can self-correct.

    Tries up to MAX_JSON_FIX_RETRIES times.
    """
    fix_messages = list(messages)  # copy original conversation

    for fix_attempt in range(MAX_JSON_FIX_RETRIES):
        # Append the malformed assistant output and the error as a user correction
        fix_messages.append({"role": "assistant", "content": malformed_output})
        fix_messages.append({
            "role": "user",
            "content": JSON_FIX_PROMPT.format(
                output=malformed_output[:8000],
                error=parse_error,
            ),
        })

        payload: dict = {
            "model": model,
            "messages": fix_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            payload["response_format"] = response_format

        logger.warning(
            "JSON fix retry %d/%d — asking model to correct malformed output",
            fix_attempt + 1,
            MAX_JSON_FIX_RETRIES,
        )

        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
                response = await client.post(
                    OPENROUTER_API_URL,
                    json=payload,
                    headers=headers,
                )

            if response.status_code != 200:
                raise OpenRouterError(
                    f"OpenRouter returned {response.status_code} during JSON fix retry: "
                    f"{response.text[:500]}",
                    status_code=response.status_code,
                )

            data = response.json()
            content = data["choices"][0]["message"]["content"]
            content = _strip_code_fences(content)
            return _parse_json_lenient(content)

        except json.JSONDecodeError as exc:
            malformed_output = content  # type: ignore[possibly-undefined]
            parse_error = str(exc)
            logger.warning(
                "JSON fix retry %d/%d still produced invalid JSON: %s",
                fix_attempt + 1,
                MAX_JSON_FIX_RETRIES,
                exc,
            )
            continue

    raise OpenRouterError(
        f"Failed to obtain valid JSON after {MAX_JSON_FIX_RETRIES} fix retries. "
        f"Last error: {parse_error}"
    )


async def chat_completion(
    *,
    system_prompt: str,
    user_prompt: str | list[dict],
    response_format: dict | None = None,
    temperature: float = 0.1,
    max_tokens: int = 8192,
    model: str | None = None,
) -> dict:
    """
    Send a chat completion request to OpenRouter and return parsed JSON.

    Args:
        system_prompt: System message for the LLM.
        user_prompt: User message — plain text string OR a list of multimodal
            content blocks (e.g. text + image_url dicts) following the
            OpenAI/OpenRouter message format.
        response_format: Optional response format (e.g. {"type": "json_object"}).
        temperature: Sampling temperature (default 0.1 for deterministic output).
        max_tokens: Maximum tokens in the response.

    Returns:
        Parsed JSON dict from the LLM response.

    Raises:
        OpenRouterError: On non-retryable API errors.
        RuntimeError: If OPENROUTER_API_KEY is not configured.
    """
    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured.")

    model = model or settings.OPENROUTER_MODEL or "google/gemini-3-flash-preview"

    # Support both plain text and multimodal content blocks
    user_content: str | list[dict] = user_prompt

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    payload: dict = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if response_format:
        payload["response_format"] = response_format

    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }

    last_error: Exception | None = None

    for attempt in range(MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
                response = await client.post(
                    OPENROUTER_API_URL,
                    json=payload,
                    headers=headers,
                )

            if response.status_code == 200:
                data = response.json()
                choice = data["choices"][0]
                content = choice["message"]["content"]
                finish_reason = choice.get("finish_reason", "stop")

                # Detect truncated output — LLM hit token limit
                if finish_reason == "length":
                    logger.warning(
                        "OpenRouter response truncated (finish_reason=length, max_tokens=%d). "
                        "Output may be incomplete.",
                        max_tokens,
                    )

                content = _strip_code_fences(content)

                try:
                    return _parse_json_lenient(content)
                except json.JSONDecodeError as exc:
                    # JSON parsing failed even after sanitization —
                    # retry by asking the model to fix its own output
                    logger.warning(
                        "JSON parse failed after sanitization: %s — "
                        "attempting self-correction retry",
                        exc,
                    )
                    return await _retry_json_with_fix(
                        messages=messages,
                        malformed_output=content,
                        parse_error=str(exc),
                        model=model,
                        response_format=response_format,
                        temperature=temperature,
                        max_tokens=max_tokens,
                        headers=headers,
                    )

            # Retryable status codes
            if response.status_code in (429, 500, 502, 503, 504):
                last_error = OpenRouterError(
                    f"OpenRouter returned {response.status_code}: {response.text[:500]}",
                    status_code=response.status_code,
                )
                if attempt < MAX_RETRIES:
                    delay = RETRY_DELAYS[attempt]
                    logger.warning(
                        "OpenRouter %d (attempt %d/%d), retrying in %ds...",
                        response.status_code,
                        attempt + 1,
                        MAX_RETRIES + 1,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    continue

            # Non-retryable error
            raise OpenRouterError(
                f"OpenRouter returned {response.status_code}: {response.text[:500]}",
                status_code=response.status_code,
            )

        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            last_error = exc
            if attempt < MAX_RETRIES:
                delay = RETRY_DELAYS[attempt]
                logger.warning(
                    "OpenRouter connection error (attempt %d/%d): %s, retrying in %ds...",
                    attempt + 1,
                    MAX_RETRIES + 1,
                    str(exc),
                    delay,
                )
                await asyncio.sleep(delay)
                continue

    # All retries exhausted
    raise OpenRouterError(
        f"OpenRouter request failed after {MAX_RETRIES + 1} attempts: {last_error}"
    )


async def chat_completion_text(
    *,
    system_prompt: str,
    user_prompt: str | list[dict],
    temperature: float = 0.1,
    max_tokens: int = 16384,
    model: str | None = None,
) -> str:
    """
    Send a chat completion request to OpenRouter and return raw text.

    Same as chat_completion() but without JSON mode — returns the LLM's
    response as a plain string. Used for tasks like markdown restructuring
    where the output is free-form text, not JSON.
    """
    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured.")

    model = model or settings.OPENROUTER_MODEL or "google/gemini-3-flash-preview"
    user_content: str | list[dict] = user_prompt

    payload: dict = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }

    last_error: Exception | None = None

    for attempt in range(MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
                response = await client.post(
                    OPENROUTER_API_URL,
                    json=payload,
                    headers=headers,
                )

            if response.status_code == 200:
                data = response.json()
                return data["choices"][0]["message"]["content"]

            # Retryable status codes
            if response.status_code in (429, 500, 502, 503, 504):
                last_error = OpenRouterError(
                    f"OpenRouter returned {response.status_code}: {response.text[:500]}",
                    status_code=response.status_code,
                )
                if attempt < MAX_RETRIES:
                    delay = RETRY_DELAYS[attempt]
                    logger.warning(
                        "OpenRouter %d (attempt %d/%d), retrying in %ds...",
                        response.status_code,
                        attempt + 1,
                        MAX_RETRIES + 1,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    continue

            # Non-retryable error
            raise OpenRouterError(
                f"OpenRouter returned {response.status_code}: {response.text[:500]}",
                status_code=response.status_code,
            )

        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            last_error = exc
            if attempt < MAX_RETRIES:
                delay = RETRY_DELAYS[attempt]
                logger.warning(
                    "OpenRouter connection error (attempt %d/%d): %s, retrying in %ds...",
                    attempt + 1,
                    MAX_RETRIES + 1,
                    str(exc),
                    delay,
                )
                await asyncio.sleep(delay)
                continue

    # All retries exhausted
    raise OpenRouterError(
        f"OpenRouter text request failed after {MAX_RETRIES + 1} attempts: {last_error}"
    )


def _coerce_stream_text_chunk(content: Any) -> str:
    """Normalize streamed content payloads into plain text, skipping thinking blocks."""
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

            # Skip thinking blocks — only yield visible text
            if item.get("type") == "thinking":
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


async def chat_completion_text_stream(
    *,
    system_prompt: str,
    user_prompt: str | list[dict],
    response_format: dict | None = None,
    temperature: float = 0.1,
    max_tokens: int = 16384,
    model: str | None = None,
) -> AsyncGenerator[str, None]:
    """
    Stream raw text chunks from OpenRouter.

    Keeps the same executor prompt/response shape as chat_completion_text(),
    but yields cumulative text deltas as they arrive from the provider.
    """
    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured.")

    model = model or settings.OPENROUTER_MODEL or "google/gemini-3-flash-preview"
    user_content: str | list[dict] = user_prompt

    payload: dict = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": True,
    }
    if response_format:
        payload["response_format"] = response_format

    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }

    timeout = httpx.Timeout(REQUEST_TIMEOUT, read=None)
    last_error: Exception | None = None

    for attempt in range(MAX_RETRIES + 1):
        emitted_any = False

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
                                return

                            try:
                                chunk = json.loads(data)
                            except json.JSONDecodeError:
                                logger.debug("Skipping malformed OpenRouter stream chunk: %s", data[:200])
                                continue

                            choices = chunk.get("choices") or []
                            if not choices:
                                continue

                            delta = choices[0].get("delta", {})
                            text_chunk = _coerce_stream_text_chunk(delta.get("content"))
                            if text_chunk:
                                emitted_any = True
                                yield text_chunk

                        return

                    if response.status_code in (429, 500, 502, 503, 504):
                        error_text = await response.aread()
                        last_error = OpenRouterError(
                            f"OpenRouter returned {response.status_code}: {error_text[:500].decode(errors='ignore')}",
                            status_code=response.status_code,
                        )
                        if attempt < MAX_RETRIES:
                            delay = RETRY_DELAYS[attempt]
                            logger.warning(
                                "OpenRouter stream %d (attempt %d/%d), retrying in %ds...",
                                response.status_code,
                                attempt + 1,
                                MAX_RETRIES + 1,
                                delay,
                            )
                            await asyncio.sleep(delay)
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
                    "OpenRouter stream connection error (attempt %d/%d): %s, retrying in %ds...",
                    attempt + 1,
                    MAX_RETRIES + 1,
                    str(exc),
                    delay,
                )
                await asyncio.sleep(delay)
                continue

    raise OpenRouterError(
        f"OpenRouter text stream failed after {MAX_RETRIES + 1} attempts: {last_error}"
    )


# ── Image generation ─────────────────────────────────────────


IMAGE_REQUEST_TIMEOUT = 60.0  # seconds — image gen is faster than text


async def generate_image(
    *,
    prompt: str,
    model: str | None = None,
    aspect_ratio: str = "1:1",
    image_size: str = "0.5K",
) -> bytes:
    """
    Generate an image via OpenRouter and return raw PNG bytes.

    Uses the Gemini image generation models (Nano Banana family).
    The response contains base64-encoded image data which is decoded
    and returned as bytes — ready to upload to storage.

    Args:
        prompt: Text description of the image to generate.
        model: OpenRouter model ID. Defaults to settings.OPENROUTER_IMAGE_MODEL.
        aspect_ratio: Output aspect ratio (1:1, 3:4, 4:3, 16:9, etc.).
        image_size: Resolution tier (0.5K, 1K, 2K).

    Returns:
        Raw image bytes (PNG format).

    Raises:
        OpenRouterError: If the API call fails after retries.
    """
    import base64

    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured.")

    model = model or settings.OPENROUTER_IMAGE_MODEL

    image_cfg: dict = {"aspect_ratio": aspect_ratio}
    if image_size and image_size != "0.5K":
        image_cfg["image_size"] = image_size

    payload: dict = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "modalities": ["image", "text"],
        "image_config": image_cfg,
        "stream": False,
    }

    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }

    logger.info(
        "Image generation request: model=%s, config=%s, prompt_len=%d",
        model, image_cfg, len(prompt),
    )

    last_error: Exception | None = None

    for attempt in range(MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=IMAGE_REQUEST_TIMEOUT) as client:
                response = await client.post(
                    OPENROUTER_API_URL,
                    json=payload,
                    headers=headers,
                )

            if response.status_code == 200:
                data = response.json()
                message = data["choices"][0]["message"]

                # Extract base64 image from response
                images = message.get("images", [])
                if not images:
                    raise OpenRouterError(
                        "Image generation returned no images in response."
                    )

                image_url = images[0].get("image_url", {}).get("url", "")
                if not image_url.startswith("data:image/"):
                    raise OpenRouterError(
                        f"Unexpected image URL format: {image_url[:100]}"
                    )

                # Parse data URL: "data:image/png;base64,iVBORw0KGgo..."
                _, b64_data = image_url.split(",", 1)
                image_bytes = base64.b64decode(b64_data)

                logger.info(
                    "Image generated: model=%s, ratio=%s, size=%s, bytes=%d",
                    model, aspect_ratio, image_size, len(image_bytes),
                )
                return image_bytes

            # Retryable status codes
            if response.status_code in (429, 500, 502, 503, 504):
                last_error = OpenRouterError(
                    f"OpenRouter image returned {response.status_code}: {response.text[:500]}",
                    status_code=response.status_code,
                )
                if attempt < MAX_RETRIES:
                    delay = RETRY_DELAYS[attempt]
                    logger.warning(
                        "OpenRouter image %d (attempt %d/%d), retrying in %ds...",
                        response.status_code,
                        attempt + 1,
                        MAX_RETRIES + 1,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    continue

            raise OpenRouterError(
                f"OpenRouter image returned {response.status_code}: {response.text[:500]}",
                status_code=response.status_code,
            )

        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            last_error = exc
            if attempt < MAX_RETRIES:
                delay = RETRY_DELAYS[attempt]
                logger.warning(
                    "OpenRouter image connection error (attempt %d/%d): %s, retrying in %ds...",
                    attempt + 1,
                    MAX_RETRIES + 1,
                    str(exc),
                    delay,
                )
                await asyncio.sleep(delay)
                continue

    raise OpenRouterError(
        f"OpenRouter image request failed after {MAX_RETRIES + 1} attempts: {last_error}"
    )


# ── Instructor-based streaming client ────────────────────────


def _get_instructor_client() -> Any:
    """
    Build an instructor-wrapped AsyncOpenAI client pointed at OpenRouter.

    Uses instructor.Mode.JSON for structured output parsing.
    """
    import instructor

    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured.")

    openai_client = AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=settings.OPENROUTER_API_KEY,
    )
    return instructor.from_openai(openai_client, mode=instructor.Mode.JSON)


async def chat_completion_stream(
    *,
    system_prompt: str,
    user_prompt: str,
    response_model: type[T],
    temperature: float = 0.1,
    max_tokens: int = 16384,
) -> AsyncGenerator[T, None]:
    """
    Stream structured LLM output, yielding one validated Pydantic object at a time.

    Uses the instructor library's create_iterable() which accumulates partial
    JSON from the stream and yields each complete, validated item as it arrives.

    If the stream fails due to malformed JSON or validation errors, retries up to
    MAX_JSON_FIX_RETRIES times by sending the error context back to the model
    so it can self-correct.

    Args:
        system_prompt: System message for the LLM.
        user_prompt: User message (plain text).
        response_model: Pydantic model class for each streamed item.
        temperature: Sampling temperature.
        max_tokens: Maximum tokens in the response.

    Yields:
        Validated Pydantic model instances, one per streamed item.
    """
    client = _get_instructor_client()
    model = settings.OPENROUTER_MODEL or "google/gemini-3-flash-preview"

    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    for stream_attempt in range(MAX_JSON_FIX_RETRIES + 1):
        logger.info(
            "Starting instructor streaming call (model=%s, response_model=%s, attempt=%d/%d)",
            model,
            response_model.__name__,
            stream_attempt + 1,
            MAX_JSON_FIX_RETRIES + 1,
        )

        try:
            items = client.chat.completions.create_iterable(
                model=model,
                messages=messages,
                response_model=response_model,
                temperature=temperature,
                max_tokens=max_tokens,
            )

            async for item in items:
                yield item

            # Stream completed successfully — exit the retry loop
            return

        except Exception as exc:
            is_last_attempt = stream_attempt >= MAX_JSON_FIX_RETRIES
            if is_last_attempt:
                logger.error(
                    "Instructor streaming failed after %d attempts: %s",
                    MAX_JSON_FIX_RETRIES + 1,
                    exc,
                )
                raise

            logger.warning(
                "Instructor streaming failed (attempt %d/%d): %s — "
                "retrying with error context",
                stream_attempt + 1,
                MAX_JSON_FIX_RETRIES + 1,
                exc,
            )

            # Build retry context: append the error as conversation history
            # so the model can self-correct on the next attempt
            error_detail = str(exc)
            messages.append({
                "role": "assistant",
                "content": f"[generation failed with error]",
            })
            messages.append({
                "role": "user",
                "content": (
                    "Your previous response caused a parsing/validation error. "
                    "Please try again, producing valid JSON that matches the "
                    "required schema.\n\n"
                    f"Error: {error_detail[:4000]}"
                ),
            })
