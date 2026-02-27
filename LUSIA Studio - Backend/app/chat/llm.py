"""
LLM factory for the Chat AI feature.

Uses ChatOpenAI pointed at OpenRouter for tool-calling + streaming support.
"""

from __future__ import annotations

from langchain_openai import ChatOpenAI

from app.core.config import settings


def get_chat_llm() -> ChatOpenAI:
    """Build a ChatOpenAI instance pointed at OpenRouter."""
    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured.")

    model = settings.CHAT_MODEL or settings.OPENROUTER_MODEL
    return ChatOpenAI(
        model=model,
        temperature=settings.CHAT_TEMPERATURE,
        max_tokens=settings.CHAT_MAX_TOKENS,
        openai_api_key=settings.OPENROUTER_API_KEY,
        openai_api_base="https://openrouter.ai/api/v1",
        streaming=True,
    )
