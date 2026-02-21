"""
Mistral OCR API client for PDF parsing.

Uses the Mistral AI SDK to process PDF documents via their OCR API.
Returns markdown text with inline base64 images.
"""

from __future__ import annotations

import base64
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


async def ocr_pdf(pdf_bytes: bytes) -> str:
    """
    Send a PDF to Mistral OCR API and return markdown content.

    The returned markdown may contain inline base64 images in the format:
    ![image](data:image/png;base64,...)

    These will be extracted and uploaded separately in the extract_images step.
    """
    from mistralai import Mistral

    if not settings.MISTRAL_API_KEY:
        raise RuntimeError("MISTRAL_API_KEY is not configured.")

    client = Mistral(api_key=settings.MISTRAL_API_KEY)

    # Encode PDF as base64 for the API
    pdf_b64 = base64.standard_b64encode(pdf_bytes).decode("utf-8")

    # Use Mistral's OCR endpoint with image extraction enabled
    response = client.ocr.process(
        model="mistral-ocr-latest",
        document={
            "type": "document_url",
            "document_url": f"data:application/pdf;base64,{pdf_b64}",
        },
        include_image_base64=True,
    )

    # Build a map of image_id -> base64 data URI from all pages
    image_map: dict[str, str] = {}
    for page in (response.pages or []):
        for img in (page.images or []):
            if img.id and img.image_base64:
                image_map[img.id] = img.image_base64

    # Combine all page markdown and replace image refs with base64 data URIs
    markdown_parts = []
    for page in (response.pages or []):
        if not page.markdown:
            continue
        md = page.markdown
        # Replace ![alt](img-N.jpeg) with the actual base64 data URI
        for img_id, data_uri in image_map.items():
            md = md.replace(f"]({img_id})", f"]({data_uri})")
        markdown_parts.append(md)

    return "\n\n---\n\n".join(markdown_parts)
