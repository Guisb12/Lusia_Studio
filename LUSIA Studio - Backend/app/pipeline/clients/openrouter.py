"""
OpenRouter API client for AI chat completions.

Generic async client using httpx for structured JSON output.
Used by the categorization, question extraction, and quiz generation steps.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from typing import TypeVar

import httpx
import instructor
from openai import AsyncOpenAI
from pydantic import BaseModel

from app.core.config import settings

T = TypeVar("T", bound=BaseModel)

logger = logging.getLogger(__name__)

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# Retry config
MAX_RETRIES = 3
RETRY_DELAYS = [2, 4, 8]  # seconds
REQUEST_TIMEOUT = 120.0  # seconds


class OpenRouterError(Exception):
    """Non-retryable OpenRouter API error."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


async def chat_completion(
    *,
    system_prompt: str,
    user_prompt: str | list[dict],
    response_format: dict | None = None,
    temperature: float = 0.1,
    max_tokens: int = 8192,
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

    model = settings.OPENROUTER_MODEL or "google/gemini-3-flash-preview"

    # Support both plain text and multimodal content blocks
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
                content = data["choices"][0]["message"]["content"]

                # Strip markdown code fences if the LLM wraps JSON in ```json ... ```
                content = content.strip()
                if content.startswith("```"):
                    # Remove opening fence (```json or ```)
                    first_newline = content.index("\n")
                    content = content[first_newline + 1 :]
                    # Remove closing fence
                    if content.endswith("```"):
                        content = content[:-3].rstrip()

                return json.loads(content)

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

        except json.JSONDecodeError as exc:
            raise OpenRouterError(
                f"Failed to parse JSON from OpenRouter response: {exc}"
            ) from exc

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
) -> str:
    """
    Send a chat completion request to OpenRouter and return raw text.

    Same as chat_completion() but without JSON mode — returns the LLM's
    response as a plain string. Used for tasks like markdown restructuring
    where the output is free-form text, not JSON.
    """
    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured.")

    model = settings.OPENROUTER_MODEL or "google/gemini-3-flash-preview"
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


# ── Instructor-based streaming client ────────────────────────


def _get_instructor_client() -> instructor.AsyncInstructor:
    """
    Build an instructor-wrapped AsyncOpenAI client pointed at OpenRouter.

    Uses instructor.Mode.JSON for structured output parsing.
    """
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

    logger.info(
        "Starting instructor streaming call (model=%s, response_model=%s)",
        model,
        response_model.__name__,
    )

    items = client.chat.completions.create_iterable(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_model=response_model,
        temperature=temperature,
        max_tokens=max_tokens,
    )

    async for item in items:
        yield item
