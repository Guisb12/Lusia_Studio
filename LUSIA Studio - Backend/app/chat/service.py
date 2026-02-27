"""
Chat service — DB operations for conversations and messages.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import HTTPException, status

from app.core.database import get_b2b_db
from app.utils.db import supabase_execute

logger = logging.getLogger(__name__)


class ChatService:
    """Encapsulates all chat-related database operations."""

    def __init__(self):
        self.db = get_b2b_db()

    # ── Conversations ───────────────────────────────────────────────────

    def list_conversations(self, user_id: str) -> dict:
        resp = supabase_execute(
            self.db.table("chat_conversations")
            .select("id, title, created_at, updated_at")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(50),
            entity="chat_conversations",
        )
        return {"conversations": resp.data or []}

    def create_conversation(self, user_id: str) -> dict:
        resp = supabase_execute(
            self.db.table("chat_conversations")
            .insert({"user_id": user_id}),
            entity="chat_conversation",
        )
        if not resp.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create conversation.",
            )
        return resp.data[0]

    def get_conversation(self, conversation_id: str, user_id: str) -> dict:
        resp = supabase_execute(
            self.db.table("chat_conversations")
            .select("*")
            .eq("id", conversation_id)
            .eq("user_id", user_id)
            .limit(1),
            entity="chat_conversation",
        )
        if not resp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found.",
            )
        return resp.data[0]

    def delete_conversation(self, conversation_id: str, user_id: str) -> None:
        # Verify ownership first
        self.get_conversation(conversation_id, user_id)
        supabase_execute(
            self.db.table("chat_conversations")
            .delete()
            .eq("id", conversation_id)
            .eq("user_id", user_id),
            entity="chat_conversation",
        )

    def update_conversation_title(self, conversation_id: str, title: str) -> None:
        supabase_execute(
            self.db.table("chat_conversations")
            .update({"title": title})
            .eq("id", conversation_id),
            entity="chat_conversation",
        )

    def touch_conversation(self, conversation_id: str) -> None:
        """Update updated_at timestamp."""
        supabase_execute(
            self.db.table("chat_conversations")
            .update({"updated_at": "now()"})
            .eq("id", conversation_id),
            entity="chat_conversation",
        )

    # ── Messages ────────────────────────────────────────────────────────

    def list_messages(self, conversation_id: str, user_id: str) -> dict:
        # Verify ownership
        self.get_conversation(conversation_id, user_id)

        resp = supabase_execute(
            self.db.table("chat_messages")
            .select("id, role, content, tool_calls, tool_name, metadata, created_at")
            .eq("conversation_id", conversation_id)
            .order("created_at", desc=False),
            entity="chat_messages",
        )
        return {"messages": resp.data or []}

    def save_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        *,
        tool_calls: Any = None,
        tool_call_id: Optional[str] = None,
        tool_name: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> dict:
        row: dict[str, Any] = {
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
        }
        if tool_calls is not None:
            row["tool_calls"] = tool_calls
        if tool_call_id is not None:
            row["tool_call_id"] = tool_call_id
        if tool_name is not None:
            row["tool_name"] = tool_name
        if metadata is not None:
            row["metadata"] = metadata

        resp = supabase_execute(
            self.db.table("chat_messages").insert(row),
            entity="chat_message",
        )

        # Touch the conversation's updated_at
        self.touch_conversation(conversation_id)

        return resp.data[0] if resp.data else row

    # ── User Subjects ───────────────────────────────────────────────────

    def get_user_preferred_subjects(self, user: dict) -> list[dict]:
        """Fetch full subject details for a user's preferred subject_ids."""
        subject_ids = user.get("subject_ids") or []
        if not subject_ids:
            return []

        # Filter out empty strings
        subject_ids = [sid for sid in subject_ids if str(sid).strip()]
        if not subject_ids:
            return []

        resp = supabase_execute(
            self.db.table("subjects")
            .select("id, name, slug, education_level")
            .in_("id", subject_ids),
            entity="subjects",
        )
        return resp.data or []
