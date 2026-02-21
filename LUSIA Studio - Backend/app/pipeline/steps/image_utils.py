"""
Shared image resolver for multimodal LLM calls.

Scans text for artifact-image:// URLs, downloads images from Supabase storage,
and builds interleaved multimodal content blocks for OpenAI/OpenRouter format.
"""

from __future__ import annotations

import base64
import logging
import mimetypes
import re

from supabase import Client

logger = logging.getLogger(__name__)

DOCUMENT_BUCKET = "documents"

# Pattern to match artifact-image:// references in markdown
_IMAGE_PATTERN = re.compile(
    r"!\[([^\]]*)\]\(artifact-image://([^)]+)\)"
)


async def resolve_images_for_llm(db: Client, text: str) -> list[dict]:
    """
    Scan text for artifact-image:// URLs, download each from Supabase storage,
    and return interleaved multimodal content blocks.

    Returns a list of content blocks suitable for OpenAI/OpenRouter multimodal
    messages:
        [
            {"type": "text", "text": "..."},
            {"type": "image_url", "image_url": {"url": "data:image/...;base64,..."}},
            {"type": "text", "text": "..."},
        ]

    Non-fatal: if an image download fails, the artifact-image:// URL is kept
    as plain text.
    """
    matches = list(_IMAGE_PATTERN.finditer(text))

    if not matches:
        return [{"type": "text", "text": text}]

    content_blocks: list[dict] = []
    last_end = 0

    for match in matches:
        # Add text before this image
        if match.start() > last_end:
            preceding_text = text[last_end:match.start()]
            if preceding_text.strip():
                content_blocks.append({"type": "text", "text": preceding_text})

        storage_path = match.group(2)
        alt_text = match.group(1)

        try:
            image_bytes = db.storage.from_(DOCUMENT_BUCKET).download(storage_path)

            # Determine MIME type from path
            mime_type, _ = mimetypes.guess_type(storage_path)
            if not mime_type or not mime_type.startswith("image/"):
                mime_type = "image/png"  # fallback

            b64_data = base64.b64encode(image_bytes).decode("ascii")
            data_url = f"data:{mime_type};base64,{b64_data}"

            content_blocks.append({
                "type": "image_url",
                "image_url": {"url": data_url},
            })

            logger.debug("Resolved image for LLM: %s (%s)", alt_text, storage_path)

        except Exception:
            logger.warning(
                "Failed to download image, keeping reference as text: %s",
                storage_path,
                exc_info=True,
            )
            content_blocks.append({"type": "text", "text": match.group(0)})

        last_end = match.end()

    # Add any trailing text
    if last_end < len(text):
        trailing_text = text[last_end:]
        if trailing_text.strip():
            content_blocks.append({"type": "text", "text": trailing_text})

    return content_blocks
