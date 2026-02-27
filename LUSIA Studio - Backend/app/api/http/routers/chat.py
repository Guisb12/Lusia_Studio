"""
Chat AI router — conversations CRUD and SSE streaming.
"""

import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse

from app.chat.schemas import (
    ConversationListOut,
    ConversationOut,
    MessageListOut,
    SendMessageRequest,
)
from app.chat.service import ChatService
from app.chat.streaming import stream_chat_response
from app.chat.tools import _year_to_education_level
from app.core.database import get_b2b_db
from app.core.security import get_current_user

logger = logging.getLogger(__name__)

CHAT_IMAGE_BUCKET = "chat-images"
CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}

router = APIRouter()


@router.get("/conversations", response_model=ConversationListOut)
async def list_conversations(
    current_user: dict = Depends(get_current_user),
):
    """List the current user's chat conversations."""
    svc = ChatService()
    return svc.list_conversations(current_user["id"])


@router.post("/conversations", response_model=ConversationOut)
async def create_conversation(
    current_user: dict = Depends(get_current_user),
):
    """Create a new chat conversation."""
    svc = ChatService()
    return svc.create_conversation(current_user["id"])


@router.get("/conversations/{conversation_id}/messages", response_model=MessageListOut)
async def list_messages(
    conversation_id: str,
    current_user: dict = Depends(get_current_user),
):
    """List all messages in a conversation."""
    svc = ChatService()
    return svc.list_messages(conversation_id, current_user["id"])


@router.post("/conversations/{conversation_id}/stream")
async def stream_message(
    conversation_id: str,
    body: SendMessageRequest,
    current_user: dict = Depends(get_current_user),
):
    """Send a message and stream the AI response as Server-Sent Events."""
    if not body.message.strip() and not body.images:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mensagem ou imagem obrigatória.",
        )

    svc = ChatService()

    # Verify ownership
    svc.get_conversation(conversation_id, current_user["id"])

    # Get student's preferred subjects for AI context
    subjects = svc.get_user_preferred_subjects(current_user)

    grade_level = current_user.get("grade_level") or ""
    education_level = _year_to_education_level(grade_level) or ""

    generator = stream_chat_response(
        conversation_id=conversation_id,
        user_id=current_user["id"],
        message=body.message,
        images=body.images,
        user_name=(
            current_user.get("display_name")
            or current_user.get("full_name")
            or "Estudante"
        ),
        grade_level=grade_level,
        education_level=education_level,
        preferred_subjects=subjects,
    )

    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a conversation and all its messages."""
    svc = ChatService()
    svc.delete_conversation(conversation_id, current_user["id"])


@router.post("/storage/upload")
async def upload_chat_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload an image for use in chat messages. Returns the public URL."""
    if not file.content_type or file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo de ficheiro não suportado. Aceites: {', '.join(ALLOWED_IMAGE_TYPES)}",
        )

    file_bytes = await file.read()
    if len(file_bytes) > CHAT_IMAGE_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Imagem demasiado grande (máx. 10 MB).",
        )

    user_id = current_user["id"]
    org_id = current_user.get("organization_id", "default")
    ext = "." + (file.content_type.split("/")[-1] if file.content_type else "jpg")
    if ext == ".jpeg":
        ext = ".jpg"
    storage_path = f"{org_id}/{user_id}/{uuid4().hex}{ext}"

    db = get_b2b_db()
    try:
        # Ensure bucket exists
        try:
            db.storage.get_bucket(CHAT_IMAGE_BUCKET)
        except Exception:
            db.storage.create_bucket(
                CHAT_IMAGE_BUCKET,
                options={"public": True},
            )

        db.storage.from_(CHAT_IMAGE_BUCKET).upload(
            storage_path,
            file_bytes,
            {"content-type": file.content_type, "upsert": "false"},
        )
    except Exception as exc:
        logger.exception("Chat image upload failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Falha ao fazer upload: {str(exc)}",
        ) from exc

    public_url = db.storage.from_(CHAT_IMAGE_BUCKET).get_public_url(storage_path)
    return {"url": public_url, "path": storage_path}
