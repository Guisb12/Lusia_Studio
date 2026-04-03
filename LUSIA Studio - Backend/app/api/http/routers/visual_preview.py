"""
Visual & Image preview endpoints — DEV ONLY.

Exposes visual and image generation without auth for iterating on prompts.
"""

from __future__ import annotations

import base64

from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel

from app.api.http.services.image_generation_service import build_image_prompt
from app.api.http.services.visual_generation_service import generate_visual
from app.pipeline.clients.openrouter import generate_image

router = APIRouter()


# ── Visual preview ───────────────────────────────────────────

class VisualPreviewIn(BaseModel):
    visual_type: str  # "static_visual" | "interactive_visual"
    prompt: str
    layout: str = "full"  # "full" | "split" | "note"
    theme_colors: dict[str, str] | None = None


class VisualPreviewOut(BaseModel):
    html: str
    visual_type: str
    layout: str


@router.post("/generate", response_model=VisualPreviewOut)
async def preview_generate(payload: VisualPreviewIn):
    """Generate a visual and return the raw HTML/SVG output."""
    output = await generate_visual(
        visual_type=payload.visual_type,
        prompt=payload.prompt,
        layout=payload.layout,
        theme_colors=payload.theme_colors,
    )

    return VisualPreviewOut(
        html=output,
        visual_type=payload.visual_type,
        layout=payload.layout,
    )


# ── Image preview ────────────────────────────────────────────

class ImagePreviewIn(BaseModel):
    image_type: str  # "diagram" | "place" | "person" | "moment" | "specimen"
    style: str  # "illustration" | "sketch" | "watercolor"
    prompt: str
    aspect_ratio: str = "1:1"


@router.post("/generate-image")
async def preview_generate_image(payload: ImagePreviewIn):
    """Generate an image and return it as PNG."""
    full_prompt = build_image_prompt(
        image_type=payload.image_type,
        style=payload.style,
        content_prompt=payload.prompt,
    )

    # Use 1K for wider ratios — 0.5K at 16:9 produces tiny 512×288 images
    size = "1K" if payload.aspect_ratio in ("16:9", "9:16") else "0.5K"

    image_bytes = await generate_image(
        prompt=full_prompt,
        aspect_ratio=payload.aspect_ratio,
        image_size=size,
    )

    return Response(
        content=image_bytes,
        media_type="image/png",
    )
