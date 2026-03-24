"""
LLM factory for the Wizard agent.

Uses Kimi K2.5 via Fireworks on OpenRouter for reliable tool-calling.
"""

from __future__ import annotations

from langchain_openai import ChatOpenAI

from app.core.config import settings


def get_wizard_llm() -> ChatOpenAI:
    """Build a ChatOpenAI instance for the wizard agent."""
    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured.")

    model = settings.WIZARD_MODEL or "@preset/kimi-2-5-intstant"

    return ChatOpenAI(
        model=model,
        temperature=0.5,
        max_tokens=settings.CHAT_MAX_TOKENS,
        openai_api_key=settings.OPENROUTER_API_KEY,
        openai_api_base="https://openrouter.ai/api/v1",
        streaming=True,
    )
