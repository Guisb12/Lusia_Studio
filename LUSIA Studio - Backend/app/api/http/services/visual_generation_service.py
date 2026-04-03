"""
Visual generation service — generates static Rough.js diagrams and interactive HTML
visuals via a dedicated LLM call.

Reusable across features (presentations, notes, chat).
Uses OpenRouter's Gemini Flash for code generation.
"""

from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import AsyncGenerator
from pathlib import Path

from app.core.config import settings
from app.pipeline.clients.openrouter import chat_completion_text, chat_completion_text_stream

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parents[3] / "prompts" / "visuals"

VISUAL_MODEL = settings.OPENROUTER_MODEL or "google/gemini-3-flash-preview"

# ── Layout → dimensions mapping ─────────────────────────────

LAYOUT_DIMENSIONS = {
    # full: inside a slide with heading (~100px), so visual gets ~380px of height
    "full": {"width": 1184, "height": 380, "label": "full (1184×380px — dentro de slide com heading)"},
    "split": {"width": 560, "height": 380, "label": "split (560×380px)"},
    "note": {"width": 800, "height": 500, "label": "note (800×500px)"},
}

# ── Default theme colors (brand) ────────────────────────────

DEFAULT_THEME: dict[str, str] = {
    "primary": "#15316b",
    "accent": "#0a1bb6",
    "accent-soft": "rgba(10,27,182,0.08)",
    "muted": "#6b7a8d",
    "surface": "#f8f7f4",
    "background": "#ffffff",
    "border": "rgba(21,49,107,0.12)",
    "success": "#10b981",
    "error": "#ef4444",
}

# ── Prompt loading ───────────────────────────────────────────

_prompts_cache: dict[str, str] = {}


def _load_prompt(visual_type: str) -> str:
    """Load the prompt file for a given visual type. Cached after first load."""
    if visual_type in _prompts_cache:
        return _prompts_cache[visual_type]

    filename_map = {
        "static_visual": "static_visual.md",
        "interactive_visual": "interactive_visual.md",
    }

    filename = filename_map.get(visual_type)
    if not filename:
        raise ValueError(f"Unknown visual type: {visual_type}")

    path = PROMPTS_DIR / filename
    if not path.exists():
        raise FileNotFoundError(f"Visual prompt not found: {path}")

    content = path.read_text(encoding="utf-8")
    _prompts_cache[visual_type] = content

    logger.info("Loaded visual prompt: %s (%d chars)", visual_type, len(content))
    return content


# ── System prompt building ───────────────────────────────────


def _build_system_prompt(
    *,
    visual_type: str,
    layout: str,
    theme_colors: dict[str, str] | None = None,
) -> str:
    """
    Build the full system prompt by combining:
    1. Theme/dimension prefix (injected runtime context)
    2. Type-specific prompt file
    """
    base_prompt = _load_prompt(visual_type)

    # Resolve theme
    theme = {**DEFAULT_THEME}
    if theme_colors:
        theme.update(theme_colors)

    # Resolve layout dimensions
    dims = LAYOUT_DIMENSIONS.get(layout, LAYOUT_DIMENSIONS["full"])

    margin = 30
    usable_w = dims["width"] - margin * 2
    usable_h = dims["height"] - margin * 2

    # Build context prefix — AGGRESSIVE about dimensions
    prefix_lines = [
        "# DIMENSÕES OBRIGATÓRIAS — LÊ ISTO PRIMEIRO",
        "",
        f'viewBox="0 0 {dims["width"]} {dims["height"]}"',
        "",
        f"**Largura total: {dims['width']}px. Altura total: {dims['height']}px.**",
        f"**Margem de segurança: {margin}px em cada borda.**",
        f"**Zona útil: x {margin}-{dims['width']-margin}, y {margin}-{dims['height']-margin} → {usable_w}×{usable_h}px.**",
        "",
        f"NENHUM elemento (forma, texto, seta) pode ter coordenadas fora de x [{margin}, {dims['width']-margin}] e y [{margin}, {dims['height']-margin}].",
        f"Se um texto ou forma ultrapassa x={dims['width']-margin} ou y={dims['height']-margin}, está FORA do canvas e será cortado.",
        "",
        "---",
        "",
        "## Cores do tema:",
    ]
    for key, value in theme.items():
        prefix_lines.append(f"- **{key}**: `{value}`")

    prefix = "\n".join(prefix_lines)

    return f"{prefix}\n\n---\n\n{base_prompt}"


# ── Output extraction ────────────────────────────────────────


def _extract_output(raw: str, visual_type: str) -> str:
    """
    Extract the visual output from LLM response.

    Both types (static_visual, interactive_visual) output HTML+JS snippets
    using Rough.js. Strip code fences and return.
    """
    # Strip markdown code fences
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        # Remove opening fence (```html, ```svg, ```, etc.)
        first_newline = cleaned.index("\n") if "\n" in cleaned else len(cleaned)
        cleaned = cleaned[first_newline + 1:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    return cleaned


# ── Core: single visual generation ───────────────────────────


async def generate_visual(
    *,
    visual_type: str,
    prompt: str,
    layout: str = "full",
    theme_colors: dict[str, str] | None = None,
    context: str | None = None,
    model: str | None = None,
) -> str:
    """
    Generate a single visual (SVG, interactive HTML, or graph).

    Args:
        visual_type: "static_visual" | "interactive_visual"
        prompt: Pedagogical description of what to generate.
        layout: "full" | "split" | "note" — determines dimensions.
        theme_colors: Optional theme color overrides (accent, primary, etc.).
        context: Optional surrounding context (slide title + description).

    Returns:
        Generated SVG string or HTML+JS snippet.
    """
    system_prompt = _build_system_prompt(
        visual_type=visual_type,
        layout=layout,
        theme_colors=theme_colors,
    )

    # Build user prompt
    user_parts = []
    if context:
        user_parts.append(f"Contexto do slide/secção:\n{context}")
    user_parts.append(prompt)
    user_prompt = "\n\n---\n\n".join(user_parts)

    # Select max_tokens based on type
    max_tokens = 16384 if visual_type == "interactive_visual" else 12000

    logger.info(
        "Generating visual: type=%s, layout=%s, prompt=%s",
        visual_type, layout, prompt[:100],
    )

    raw = await chat_completion_text(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.2,
        max_tokens=max_tokens,
        model=model or VISUAL_MODEL,
    )

    output = _extract_output(raw, visual_type)

    logger.info(
        "Visual generated: type=%s, output=%d chars",
        visual_type, len(output),
    )

    return output


async def generate_visual_stream(
    *,
    visual_type: str,
    prompt: str,
    layout: str = "full",
    theme_colors: dict[str, str] | None = None,
    context: str | None = None,
    model: str | None = None,
) -> AsyncGenerator[str, None]:
    """
    Stream progressively fuller HTML snapshots for a visual.
    """
    system_prompt = _build_system_prompt(
        visual_type=visual_type,
        layout=layout,
        theme_colors=theme_colors,
    )

    user_parts = []
    if context:
        user_parts.append(f"Contexto do slide/secção:\n{context}")
    user_parts.append(prompt)
    user_prompt = "\n\n---\n\n".join(user_parts)

    max_tokens = 16384 if visual_type == "interactive_visual" else 12000
    raw_parts: list[str] = []
    last_snapshot = ""

    async for chunk in chat_completion_text_stream(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.2,
        max_tokens=max_tokens,
        model=model or VISUAL_MODEL,
    ):
        raw_parts.append(chunk)
        snapshot = _extract_output("".join(raw_parts), visual_type)
        if snapshot and snapshot != last_snapshot:
            last_snapshot = snapshot
            yield snapshot

    final_snapshot = _extract_output("".join(raw_parts), visual_type)
    if final_snapshot and final_snapshot != last_snapshot:
        yield final_snapshot


# ── Single visual generation + optional storage ──────────────


async def generate_and_store_visual(
    *,
    org_id: str,
    artifact_id: str,
    visual_id: str,
    visual_type: str,
    prompt: str,
    layout: str = "full",
    theme_colors: dict[str, str] | None = None,
    context: str | None = None,
) -> dict:
    """
    Generate a visual and optionally store it in Supabase Storage.

    - static_visual: Returned inline as HTML snippet (Rough.js diagram).
    - interactive_visual: Returned inline as HTML+JS (Rough.js + controls).

    Returns:
        Dict with: id, type, html, url (if stored), status, error (if failed).
    """
    try:
        output = await generate_visual(
            visual_type=visual_type,
            prompt=prompt,
            layout=layout,
            theme_colors=theme_colors,
            context=context,
        )

        # All visual types (illustrative_svg, interactive, graph) produce
        # HTML+JS snippets that are injected inline into slides.
        # No file storage needed — the HTML is embedded directly.
        return {
            "id": visual_id,
            "type": visual_type,
            "html": output,
            "status": "completed",
        }

    except Exception as exc:
        logger.exception(
            "Visual generation failed for %s (artifact %s): %s",
            visual_id, artifact_id, exc,
        )
        return {
            "id": visual_id,
            "type": visual_type,
            "html": None,
            "status": "failed",
            "error": str(exc)[:500],
        }


# ── Batch generation for presentations (parallel) ───────────


async def generate_presentation_visuals(
    *,
    org_id: str,
    artifact_id: str,
    visuals: list[dict],
    theme_colors: dict[str, str] | None = None,
    plan_slides: list[dict] | None = None,
) -> list[dict]:
    """
    Generate all presentation visuals in parallel.

    Args:
        org_id: Organization ID.
        artifact_id: Presentation artifact ID.
        visuals: List of visual specs from the planner, each with:
            id, type, prompt, layout, slide_id
        theme_colors: Optional theme color overrides.
        plan_slides: Full slide list from planner (for context extraction).

    Returns:
        List of results with: id, type, html, url, status.
    """
    if not visuals:
        return []

    logger.info(
        "Generating %d visuals in parallel for artifact %s",
        len(visuals), artifact_id,
    )

    # Build context map from plan slides: slide_id → "title: description"
    context_map: dict[str, str] = {}
    if plan_slides:
        for slide in plan_slides:
            sid = slide.get("id", "")
            title = slide.get("title", "")
            desc = slide.get("description", "")
            if title or desc:
                context_map[sid] = f"{title}\n{desc}".strip()

    tasks = [
        generate_and_store_visual(
            org_id=org_id,
            artifact_id=artifact_id,
            visual_id=v["id"],
            visual_type=v.get("type", "static_visual"),
            prompt=v.get("prompt", ""),
            layout=v.get("layout", "full"),
            theme_colors=theme_colors,
            context=context_map.get(v.get("slide_id", "")),
        )
        for v in visuals
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Convert exceptions to failed results
    final_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            final_results.append({
                "id": visuals[i]["id"],
                "type": visuals[i].get("type", "static_visual"),
                "html": None,
                    "status": "failed",
                "error": str(result)[:500],
            })
        else:
            final_results.append(result)

    completed = sum(1 for r in final_results if r["status"] == "completed")
    logger.info(
        "Visual generation complete: %d/%d succeeded for artifact %s",
        completed, len(final_results), artifact_id,
    )

    return final_results


# ── Post-processing: inject visual HTML into slides ──────────


def inject_visual_html(
    slides_html: list[dict],
    visual_results: list[dict],
) -> list[dict]:
    """
    Replace data-visual-id placeholders in slide HTML with generated content.

    The executor generates:
        <div data-visual-id="v1" class="sl-visual"></div>

    This function replaces the entire div with the generated HTML, also
    substituting the VID prefix in IDs with the actual visual ID.

    Args:
        slides_html: List of {id, html} dicts from the executor.
        visual_results: List of visual generation results.

    Returns:
        Updated slides_html with visual HTML injected.
    """
    # Build lookup: visual_id → html
    html_map = {
        r["id"]: r["html"]
        for r in visual_results
        if r.get("html")
    }

    if not html_map:
        return slides_html

    for slide in slides_html:
        html = slide["html"]

        for vid, visual_html in html_map.items():
            # Replace VID prefix with actual visual ID for unique IDs
            resolved_html = visual_html.replace("VID-", f"{vid}-")

            # Find the opening tag of the visual placeholder
            marker = f'data-visual-id="{vid}"'
            pos = html.find(marker)
            if pos == -1:
                continue

            # Find the start of the <div that contains this marker
            div_start = html.rfind("<div", 0, pos)
            if div_start == -1:
                continue

            # Find the matching closing </div> by counting nested divs
            search_start = html.index(">", pos) + 1
            depth = 1
            i = search_start
            while i < len(html) and depth > 0:
                if html[i:i+4] == "<div":
                    depth += 1
                elif html[i:i+6] == "</div>":
                    depth -= 1
                    if depth == 0:
                        # Found the matching close
                        div_end = i + 6
                        html = html[:div_start] + resolved_html + html[div_end:]
                        break
                i += 1

        slide["html"] = html

    return slides_html
