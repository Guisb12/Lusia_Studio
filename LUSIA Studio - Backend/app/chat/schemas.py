"""Pydantic schemas for the Chat AI feature."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class SendMessageRequest(BaseModel):
    message: str = Field("", max_length=10000)
    images: list[str] = Field(default_factory=list, max_length=4)
    model_mode: str = Field(default="fast", pattern="^(fast|thinking)$")
    resume_run_id: Optional[str] = None
    idempotency_key: Optional[str] = Field(default=None, max_length=128)
    is_question_answer: bool = False


class ConversationOut(BaseModel):
    id: str
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ConversationListOut(BaseModel):
    conversations: list[ConversationOut]


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    run_id: Optional[str] = None
    sequence: Optional[int] = None
    tool_calls: Optional[Any] = None
    tool_call_id: Optional[str] = None
    tool_name: Optional[str] = None
    content_blocks: Optional[Any] = None
    metadata: Optional[dict] = None
    created_at: datetime


class MessageListOut(BaseModel):
    messages: list[MessageOut]
