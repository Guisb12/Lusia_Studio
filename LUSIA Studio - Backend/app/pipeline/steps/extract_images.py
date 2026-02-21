"""
Step 2: Extract base64 images from markdown and upload to Supabase Storage.

Scans the markdown for inline base64 image data URIs, uploads each to the
document-images bucket, and replaces the data URI with the public Storage URL.
"""

from __future__ import annotations

import base64
import logging
import re
from uuid import uuid4

from supabase import Client

logger = logging.getLogger(__name__)

IMAGE_BUCKET = "documents"

# Matches markdown images with base64 data URIs:
# ![alt](data:image/png;base64,iVBOR...)
BASE64_IMAGE_RE = re.compile(
    r"!\[([^\]]*)\]\((data:image/(png|jpeg|jpg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=\s]+))\)"
)

MIME_EXTENSIONS = {
    "png": ".png",
    "jpeg": ".jpg",
    "jpg": ".jpg",
    "gif": ".gif",
    "webp": ".webp",
    "svg+xml": ".svg",
}


async def extract_and_replace_images(
    db: Client,
    org_id: str,
    user_id: str,
    artifact_id: str,
    markdown: str,
) -> str:
    """
    Find all base64-encoded images in markdown, upload each to storage,
    and replace the data URI with the public URL.
    """
    matches = list(BASE64_IMAGE_RE.finditer(markdown))
    if not matches:
        logger.info("No base64 images found in document")
        return markdown

    logger.info("Found %d base64 images to extract", len(matches))

    # Process from last to first so string indices remain valid
    for match in reversed(matches):
        alt_text = match.group(1)
        full_data_uri = match.group(2)
        image_type = match.group(3)
        b64_data = match.group(4)

        try:
            # Decode the base64 data
            image_bytes = base64.b64decode(b64_data)
            if not image_bytes:
                continue

            # Determine extension and MIME
            ext = MIME_EXTENSIONS.get(image_type, ".png")
            content_type = f"image/{image_type}"

            # Upload to storage: org/artifact_id/images/<uuid>.<ext>
            image_path = f"{org_id}/{artifact_id}/images/{uuid4().hex}{ext}"

            db.storage.from_(IMAGE_BUCKET).upload(
                image_path,
                image_bytes,
                {"content-type": content_type, "upsert": "false"},
            )

            # Store a backend-resolvable reference instead of a public URL
            # The API will generate signed URLs when serving the artifact
            replacement = f"![{alt_text}](artifact-image://{image_path})"
            markdown = (
                markdown[: match.start()]
                + replacement
                + markdown[match.end() :]
            )

            logger.debug("Extracted image -> %s", image_path)

        except Exception as exc:
            logger.warning(
                "Failed to extract image at position %d: %s",
                match.start(),
                exc,
            )
            continue

    return markdown
