"""
Image generation service — generates AI images and uploads to Supabase Storage.

Reusable across features (presentations, worksheets, etc.).
Uses OpenRouter's Gemini image models (Nano Banana family).
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from uuid import uuid4

from supabase import Client

from app.core.database import get_b2b_db
from app.pipeline.clients.openrouter import generate_image
from app.utils.db import supabase_execute

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parents[3] / "prompts" / "presentations"
IMAGE_BUCKET = "documents"  # Reuse existing private bucket

# ── Image type and style prompt loading ──────────────────────

_type_prompts: dict[str, str] = {}
_style_prompts: dict[str, str] = {}


def _load_prompts() -> None:
    """Load image type and style prompt blocks from markdown files."""
    global _type_prompts, _style_prompts

    if _type_prompts and _style_prompts:
        return  # Already loaded

    # Parse image_types.md — sections separated by ## headings
    types_path = PROMPTS_DIR / "image_types.md"
    if types_path.exists():
        _type_prompts = _parse_prompt_sections(types_path.read_text(encoding="utf-8"))

    # Parse image_styles.md — sections separated by ## headings
    styles_path = PROMPTS_DIR / "image_styles.md"
    if styles_path.exists():
        _style_prompts = _parse_prompt_sections(styles_path.read_text(encoding="utf-8"))

    logger.info(
        "Loaded image prompts: %d types (%s), %d styles (%s)",
        len(_type_prompts), list(_type_prompts.keys()),
        len(_style_prompts), list(_style_prompts.keys()),
    )


def _parse_prompt_sections(text: str) -> dict[str, str]:
    """Parse markdown with ## headings into {heading: content} dict."""
    sections: dict[str, str] = {}
    current_key: str | None = None
    current_lines: list[str] = []

    for line in text.split("\n"):
        if line.startswith("## ") and not line.startswith("## #"):
            if current_key and current_lines:
                sections[current_key] = "\n".join(current_lines).strip()
            current_key = line[3:].strip().lower()
            current_lines = []
        elif current_key is not None:
            current_lines.append(line)

    if current_key and current_lines:
        sections[current_key] = "\n".join(current_lines).strip()

    return sections


# ── Prompt building ──────────────────────────────────────────


# Aspect ratio mapping from planner names to API values
# Only use ratios confirmed supported by Gemini image models
ASPECT_RATIOS = {
    "16:9": "16:9",
    "1:1": "1:1",
    "3:4": "3:4",
    "4:3": "4:3",
    "2:1": "16:9",  # Fallback: 2:1 not supported, use 16:9
    "9:16": "9:16",
}


def build_image_prompt(
    *,
    image_type: str,
    style: str,
    content_prompt: str,
) -> str:
    """
    Build the full generation prompt by combining type + style + content.

    Args:
        image_type: One of: diagram, place, person, moment, specimen
        style: One of: illustration, sketch, watercolor
        content_prompt: The specific content description from the planner.

    Returns:
        Full prompt string for the image generation model.
    """
    _load_prompts()

    type_block = _type_prompts.get(image_type, "")
    style_block = _style_prompts.get(style, "")

    parts = []
    if style_block:
        parts.append(style_block)
    if type_block:
        parts.append(type_block)
    parts.append(content_prompt)

    full_prompt = "\n\n".join(parts)

    # Truncate if too long — image models have limited prompt capacity
    if len(full_prompt) > 4000:
        full_prompt = full_prompt[:4000]

    return full_prompt


# ── Single image generation + upload ─────────────────────────


async def generate_and_upload_image(
    *,
    org_id: str,
    artifact_id: str,
    image_id: str,
    image_type: str,
    style: str,
    content_prompt: str,
    aspect_ratio: str = "1:1",
) -> dict:
    """
    Generate one image and upload to Supabase Storage.

    Args:
        org_id: Organization ID for storage path.
        artifact_id: Artifact ID for storage path.
        image_id: Simple image identifier (e.g., "1", "2", "3").
        image_type: Type (diagram, place, person, moment, specimen).
        style: Style (illustration, sketch, watercolor).
        content_prompt: Content description from planner.
        aspect_ratio: Aspect ratio (16:9, 1:1, 3:4, 4:3, 2:1).

    Returns:
        Dict with: id, storage_path, public_url, status
    """
    db = get_b2b_db()

    # Build full prompt
    full_prompt = build_image_prompt(
        image_type=image_type,
        style=style,
        content_prompt=content_prompt,
    )

    api_ratio = ASPECT_RATIOS.get(aspect_ratio, "1:1")

    logger.info(
        "Generating image %s for artifact %s: type=%s, style=%s, ratio=%s, prompt=%s",
        image_id, artifact_id, image_type, style, api_ratio,
        content_prompt[:100],
    )

    try:
        # Generate image via OpenRouter
        image_bytes = await generate_image(
            prompt=full_prompt,
            aspect_ratio=api_ratio,
            image_size="0.5K",
        )

        # Upload to Supabase Storage
        storage_path = f"{org_id}/{artifact_id}/slides/{image_id}.png"

        db.storage.from_(IMAGE_BUCKET).upload(
            storage_path,
            image_bytes,
            {
                "content-type": "image/png",
                "upsert": "true",
                "cache-control": "3600",
            },
        )

        # Get signed URL (private bucket)
        result = db.storage.from_(IMAGE_BUCKET).create_signed_url(
            storage_path, expires_in=86400  # 24 hours
        )
        signed_url = result.get("signedURL") or result.get("signed_url", "")

        logger.info(
            "Image %s uploaded: %s (%d bytes)",
            image_id, storage_path, len(image_bytes),
        )

        return {
            "id": image_id,
            "storage_path": storage_path,
            "url": signed_url,
            "status": "completed",
        }

    except Exception as exc:
        logger.exception(
            "Image generation failed for %s (artifact %s): %s",
            image_id, artifact_id, exc,
        )
        return {
            "id": image_id,
            "storage_path": None,
            "url": None,
            "status": "failed",
            "error": str(exc)[:500],
        }


# ── Batch generation (parallel) ─────────────────────────────


async def generate_presentation_images(
    *,
    org_id: str,
    artifact_id: str,
    images: list[dict],
) -> list[dict]:
    """
    Generate all presentation images in parallel.

    Args:
        org_id: Organization ID.
        artifact_id: Presentation artifact ID.
        images: List of image specs from the planner, each with:
            id, type, style, prompt, ratio

    Returns:
        List of results with: id, storage_path, url, status
    """
    if not images:
        return []

    logger.info(
        "Generating %d images in parallel for artifact %s",
        len(images), artifact_id,
    )

    tasks = [
        generate_and_upload_image(
            org_id=org_id,
            artifact_id=artifact_id,
            image_id=img["id"],
            image_type=img.get("type", "diagram"),
            style=img.get("style", "illustration"),
            content_prompt=img.get("prompt", ""),
            aspect_ratio=img.get("ratio", "1:1"),
        )
        for img in images
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Convert exceptions to failed results
    final_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            final_results.append({
                "id": images[i]["id"],
                "storage_path": None,
                "url": None,
                "status": "failed",
                "error": str(result)[:500],
            })
        else:
            final_results.append(result)

    completed = sum(1 for r in final_results if r["status"] == "completed")
    logger.info(
        "Image generation complete: %d/%d succeeded for artifact %s",
        completed, len(final_results), artifact_id,
    )

    return final_results


# ── Post-processing: inject URLs into HTML ───────────────────


def inject_image_urls(slides_html: list[dict], image_results: list[dict]) -> list[dict]:
    """
    Replace data-image-id placeholders in slide HTML with actual image URLs.

    The executor generates: <img data-image-id="1" class="sl-image" src="">
    This function fills in the src attribute with the generated image URL.

    Args:
        slides_html: List of {id, html} dicts from the executor.
        image_results: List of image generation results with id and url.

    Returns:
        Updated slides_html with image URLs injected.
    """
    import re

    # Build lookup: image_id → url
    url_map = {
        r["id"]: r["url"]
        for r in image_results
        if r.get("url")
    }

    if not url_map:
        return slides_html

    for slide in slides_html:
        html = slide["html"]
        # Replace data-image-id="N" src="" with actual URL
        for img_id, url in url_map.items():
            # Match: data-image-id="N" ... src=""  or  src="" ... data-image-id="N"
            html = re.sub(
                rf'(<img[^>]*data-image-id="{re.escape(img_id)}"[^>]*?)src="[^"]*"',
                rf'\1src="{url}"',
                html,
            )
        slide["html"] = html

    return slides_html
