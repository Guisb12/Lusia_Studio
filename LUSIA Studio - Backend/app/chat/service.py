"""
Chat service — DB operations for conversations and messages.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException, status

from app.chat.tools import _resolve_subject_by_name
from app.core.database import get_b2b_db
from app.utils.db import supabase_execute

logger = logging.getLogger(__name__)
UNSET = object()
SUBJECT_CONTEXT_RE = re.compile(
    r"<subject_context\s+name=\"([^\"]*?)\"\s+color=\"([^\"]*?)\"\s+icon=\"([^\"]*?)\">.*?</subject_context>\s*",
    re.DOTALL,
)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_missing_chat_run_column_error(exc: HTTPException, column_name: str) -> bool:
    detail = getattr(exc, "detail", "")
    if not isinstance(detail, str):
        return False
    return f"Could not find the '{column_name}' column of 'chat_runs'" in detail


class ChatService:
    """Encapsulates all chat-related database operations."""

    def __init__(self):
        self.db = get_b2b_db()

    # ── Conversations ───────────────────────────────────────────────────

    def _extract_subject_context(self, content: Any) -> dict[str, str | None] | None:
        if not isinstance(content, str):
            return None
        match = SUBJECT_CONTEXT_RE.search(content)
        if not match:
            return None
        return {
            "name": match.group(1).strip() or None,
            "color": match.group(2).strip() or None,
            "icon": match.group(3).strip() or None,
        }

    def _enrich_conversations_with_subject_color(self, conversations: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not conversations:
            return conversations

        conversation_ids = [str(row.get("id")) for row in conversations if row.get("id")]
        if not conversation_ids:
            return conversations

        message_resp = supabase_execute(
            self.db.table("chat_messages")
            .select("conversation_id, content, metadata, sequence, created_at")
            .in_("conversation_id", conversation_ids)
            .eq("role", "user")
            .order("sequence", desc=False)
            .order("created_at", desc=False),
            entity="chat_messages",
        )

        subject_context_by_conversation: dict[str, dict[str, str | None]] = {}
        for row in message_resp.data or []:
            conversation_id = str(row.get("conversation_id") or "")
            if not conversation_id or conversation_id in subject_context_by_conversation:
                continue
            context = self._extract_subject_context(row.get("content"))
            if context:
                subject_context_by_conversation[conversation_id] = context

        enriched: list[dict[str, Any]] = []
        for conversation in conversations:
            payload = dict(conversation)
            context = subject_context_by_conversation.get(str(payload.get("id") or ""))

            if context:
                if not payload.get("icon") and context.get("icon"):
                    payload["icon"] = context.get("icon")
                if context.get("color"):
                    payload["color"] = context.get("color")

            if not payload.get("color"):
                resolved = _resolve_subject_by_name(str(payload.get("title") or ""))
                if resolved and resolved.color:
                    payload["color"] = resolved.color
                if resolved and not payload.get("icon") and resolved.icon:
                    payload["icon"] = resolved.icon

            enriched.append(payload)

        return enriched

    def list_conversations(self, user_id: str) -> dict:
        resp = supabase_execute(
            self.db.table("chat_conversations")
            .select("id, title, icon, created_at, updated_at")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(50),
            entity="chat_conversations",
        )
        return {"conversations": self._enrich_conversations_with_subject_color(resp.data or [])}

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
        created = dict(resp.data[0])
        created.setdefault("color", None)
        return created

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

    def update_conversation_naming(
        self,
        conversation_id: str,
        *,
        title: Any = UNSET,
        icon: Any = UNSET,
    ) -> None:
        updates: dict[str, Any] = {}
        if title is not UNSET:
            updates["title"] = title
        if icon is not UNSET:
            updates["icon"] = icon
        if not updates:
            return
        supabase_execute(
            self.db.table("chat_conversations")
            .update(updates)
            .eq("id", conversation_id),
            entity="chat_conversation",
        )

    def update_conversation_title(self, conversation_id: str, title: str) -> None:
        self.update_conversation_naming(conversation_id, title=title)

    def touch_conversation(self, conversation_id: str) -> None:
        """Update updated_at timestamp."""
        supabase_execute(
            self.db.table("chat_conversations")
            .update({"updated_at": _utcnow_iso()})
            .eq("id", conversation_id),
            entity="chat_conversation",
        )

    # ── Messages ────────────────────────────────────────────────────────

    def _next_message_sequence(self, conversation_id: str) -> int:
        resp = supabase_execute(
            self.db.table("chat_messages")
            .select("sequence")
            .eq("conversation_id", conversation_id)
            .order("sequence", desc=True)
            .limit(1),
            entity="chat_messages",
        )
        if resp.data:
            return int(resp.data[0].get("sequence") or 0) + 1
        return 1

    def list_messages(self, conversation_id: str, user_id: str) -> dict:
        # Verify ownership
        self.get_conversation(conversation_id, user_id)

        resp = supabase_execute(
            self.db.table("chat_messages")
            .select("id, role, content, run_id, sequence, tool_calls, tool_call_id, tool_name, content_blocks, metadata, created_at")
            .eq("conversation_id", conversation_id)
            .order("sequence", desc=False)
            .order("created_at", desc=False),
            entity="chat_messages",
        )
        return {"messages": resp.data or []}

    def list_transcript_messages(self, conversation_id: str, user_id: str) -> list[dict[str, Any]]:
        return self.list_messages(conversation_id, user_id).get("messages", [])

    def save_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        *,
        run_id: Optional[str] = None,
        sequence: Optional[int] = None,
        tool_calls: Any = None,
        tool_call_id: Optional[str] = None,
        tool_name: Optional[str] = None,
        content_blocks: Any = None,
        metadata: Optional[dict] = None,
    ) -> dict:
        row: dict[str, Any] = {
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "sequence": sequence if sequence is not None else self._next_message_sequence(conversation_id),
        }
        if run_id is not None:
            row["run_id"] = run_id
        if tool_calls is not None:
            row["tool_calls"] = tool_calls
        if tool_call_id is not None:
            row["tool_call_id"] = tool_call_id
        if tool_name is not None:
            row["tool_name"] = tool_name
        if content_blocks is not None:
            row["content_blocks"] = content_blocks
        if metadata is not None:
            row["metadata"] = metadata

        resp = supabase_execute(
            self.db.table("chat_messages").insert(row),
            entity="chat_message",
        )

        # Touch the conversation's updated_at
        self.touch_conversation(conversation_id)

        return resp.data[0] if resp.data else row

    def update_message(
        self,
        message_id: str,
        conversation_id: str,
        *,
        content: Any = UNSET,
        tool_calls: Any = UNSET,
        tool_call_id: Any = UNSET,
        tool_name: Any = UNSET,
        content_blocks: Any = UNSET,
        metadata: Any = UNSET,
    ) -> dict:
        updates: dict[str, Any] = {}
        if content is not UNSET:
            updates["content"] = content
        if tool_calls is not UNSET:
            updates["tool_calls"] = tool_calls
        if tool_call_id is not UNSET:
            updates["tool_call_id"] = tool_call_id
        if tool_name is not UNSET:
            updates["tool_name"] = tool_name
        if content_blocks is not UNSET:
            updates["content_blocks"] = content_blocks
        if metadata is not UNSET:
            updates["metadata"] = metadata

        if not updates:
            return {"id": message_id}

        resp = supabase_execute(
            self.db.table("chat_messages")
            .update(updates)
            .eq("id", message_id)
            .eq("conversation_id", conversation_id),
            entity="chat_message",
        )
        self.touch_conversation(conversation_id)
        if resp.data:
            return resp.data[0]
        return {"id": message_id, **updates}

    # ── Runs ────────────────────────────────────────────────────────────

    def create_run(
        self,
        conversation_id: str,
        user_id: str,
        *,
        request_payload: Optional[dict] = None,
        status_value: str = "queued",
        parent_run_id: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        model_mode: Optional[str] = None,
        model_name: Optional[str] = None,
    ) -> dict:
        self.get_conversation(conversation_id, user_id)

        if idempotency_key:
            existing = supabase_execute(
                self.db.table("chat_runs")
                .select("*")
                .eq("conversation_id", conversation_id)
                .eq("user_id", user_id)
                .eq("idempotency_key", idempotency_key)
                .limit(1),
                entity="chat_runs",
            )
            if existing.data:
                return existing.data[0]

        payload: dict[str, Any] = {
            "conversation_id": conversation_id,
            "user_id": user_id,
            "status": status_value,
            "request_payload": request_payload or {},
            "started_at": _utcnow_iso(),
            "updated_at": _utcnow_iso(),
        }
        if parent_run_id is not None:
            payload["parent_run_id"] = parent_run_id
        if idempotency_key is not None:
            payload["idempotency_key"] = idempotency_key
        if model_mode is not None:
            payload["model_mode"] = model_mode
        if model_name is not None:
            payload["model_name"] = model_name

        try:
            resp = supabase_execute(
                self.db.table("chat_runs").insert(payload),
                entity="chat_run",
            )
        except HTTPException as exc:
            if (
                "model_mode" in payload
                and _is_missing_chat_run_column_error(exc, "model_mode")
            ) or (
                "model_name" in payload
                and _is_missing_chat_run_column_error(exc, "model_name")
            ):
                logger.warning(
                    "chat_runs model columns are not available yet; retrying run insert without dedicated model fields"
                )
                payload.pop("model_mode", None)
                payload.pop("model_name", None)
                resp = supabase_execute(
                    self.db.table("chat_runs").insert(payload),
                    entity="chat_run",
                )
            else:
                raise
        self.touch_conversation(conversation_id)
        if not resp.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create chat run.",
            )
        return resp.data[0]

    def get_run(self, run_id: str, user_id: str) -> dict:
        resp = supabase_execute(
            self.db.table("chat_runs")
            .select("*")
            .eq("id", run_id)
            .eq("user_id", user_id)
            .limit(1),
            entity="chat_run",
        )
        if not resp.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat run not found.",
            )
        return resp.data[0]

    def update_run(
        self,
        run_id: str,
        user_id: str,
        *,
        status_value: Any = UNSET,
        pending_action: Any = UNSET,
        error_message: Any = UNSET,
        user_message_id: Any = UNSET,
        assistant_message_id: Any = UNSET,
        model_mode: Any = UNSET,
        model_name: Any = UNSET,
        completed_at: Any = UNSET,
    ) -> dict:
        current = self.get_run(run_id, user_id)
        updates: dict[str, Any] = {"updated_at": _utcnow_iso()}
        if status_value is not UNSET:
            updates["status"] = status_value
        if pending_action is not UNSET:
            updates["pending_action"] = pending_action
        if error_message is not UNSET:
            updates["error_message"] = error_message
        if user_message_id is not UNSET:
            updates["user_message_id"] = user_message_id
        if assistant_message_id is not UNSET:
            updates["assistant_message_id"] = assistant_message_id
        if model_mode is not UNSET:
            updates["model_mode"] = model_mode
        if model_name is not UNSET:
            updates["model_name"] = model_name
        if completed_at is not UNSET:
            updates["completed_at"] = completed_at
        elif status_value in {"requires_action", "completed", "failed", "cancelled"}:
            updates["completed_at"] = _utcnow_iso()

        try:
            resp = supabase_execute(
                self.db.table("chat_runs")
                .update(updates)
                .eq("id", run_id)
                .eq("user_id", user_id),
                entity="chat_run",
            )
        except HTTPException as exc:
            if (
                "model_mode" in updates
                and _is_missing_chat_run_column_error(exc, "model_mode")
            ) or (
                "model_name" in updates
                and _is_missing_chat_run_column_error(exc, "model_name")
            ):
                logger.warning(
                    "chat_runs model columns are not available yet; retrying run update without dedicated model fields"
                )
                updates.pop("model_mode", None)
                updates.pop("model_name", None)
                resp = supabase_execute(
                    self.db.table("chat_runs")
                    .update(updates)
                    .eq("id", run_id)
                    .eq("user_id", user_id),
                    entity="chat_run",
                )
            else:
                raise
        self.touch_conversation(current["conversation_id"])
        if resp.data:
            return resp.data[0]
        return {"id": run_id, **updates}

    def save_run_event(
        self,
        run_id: str,
        *,
        seq: int,
        event_type: str,
        payload: Optional[dict] = None,
        block_id: int = 0,
    ) -> dict:
        row = {
            "run_id": run_id,
            "seq": seq,
            "event_type": event_type,
            "block_id": block_id,
            "payload": payload or {},
        }
        resp = supabase_execute(
            self.db.table("chat_run_events").insert(row),
            entity="chat_run_event",
        )
        return resp.data[0] if resp.data else row

    def list_run_events(self, run_id: str, user_id: str) -> list[dict[str, Any]]:
        self.get_run(run_id, user_id)
        resp = supabase_execute(
            self.db.table("chat_run_events")
            .select("id, seq, event_type, block_id, payload, created_at")
            .eq("run_id", run_id)
            .order("seq", desc=False),
            entity="chat_run_events",
        )
        return resp.data or []

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
