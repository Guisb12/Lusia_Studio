"""
Step: Markdown → TipTap JSON converter.

Pure Python converter (no LLM call) that transforms structured markdown
into the TipTap/ProseMirror JSON format used by the frontend editor.

Uses markdown-it-py for parsing with the dollarmath plugin for LaTeX math.

Custom node handling:
  - $...$  → mathInline node with latex attribute
  - $$...$$ → paragraph(textAlign: "center") containing mathInline
  - artifact-image:// URLs → resolved to /api/artifacts/{id}/images/...
"""

from __future__ import annotations

import logging
import re

from markdown_it import MarkdownIt
from mdit_py_plugins.dollarmath import dollarmath_plugin

logger = logging.getLogger(__name__)

# artifact-image://{org_id}/{artifact_id}/images/{filename}
_ARTIFACT_IMAGE_RE = re.compile(
    r"artifact-image://[^/]+/([^/]+)/images/([^\s)]+)"
)


def convert_markdown_to_tiptap(markdown: str, artifact_id: str) -> dict:
    """
    Convert markdown to TipTap JSON document.

    Args:
        markdown: Structured markdown content (may contain artifact-image:// URLs
                  and math notation).
        artifact_id: Used to resolve artifact-image:// URLs.

    Returns:
        TipTap/ProseMirror JSON document dict.
    """
    # Resolve artifact-image:// URLs to frontend-accessible paths
    resolved = _resolve_image_urls(markdown, artifact_id)

    # Parse markdown into tokens
    md = MarkdownIt("commonmark", {"typographer": False})
    dollarmath_plugin(md, double_inline=True)
    md.enable("table")
    md.enable("strikethrough")

    tokens = md.parse(resolved)

    # Convert token stream to TipTap JSON
    content = _tokens_to_tiptap(tokens)

    return {
        "type": "doc",
        "content": content or [{"type": "paragraph"}],
    }


def _resolve_image_urls(markdown: str, artifact_id: str) -> str:
    """Rewrite artifact-image:// URLs to /api/artifacts/{id}/images/{filename}."""
    return _ARTIFACT_IMAGE_RE.sub(
        rf"/api/artifacts/{artifact_id}/images/\2",
        markdown,
    )


# ── Token → TipTap conversion ────────────────────────────────


def _tokens_to_tiptap(tokens: list) -> list[dict]:
    """Walk top-level token stream and build block-level TipTap nodes."""
    result: list[dict] = []
    i = 0

    while i < len(tokens):
        token = tokens[i]
        tt = token.type

        # ── Block-level openers ──────────────────────────

        if tt == "heading_open":
            level = int(token.tag[1])  # h1 → 1, h2 → 2, etc.
            inline_token = tokens[i + 1] if i + 1 < len(tokens) else None
            content = _inline_to_tiptap(inline_token) if inline_token else []
            result.append({
                "type": "heading",
                "attrs": {"level": level},
                "content": content or [{"type": "text", "text": " "}],
            })
            i += 3  # heading_open, inline, heading_close
            continue

        if tt == "paragraph_open":
            inline_token = tokens[i + 1] if i + 1 < len(tokens) else None
            content = _inline_to_tiptap(inline_token) if inline_token else []
            if content:
                result.append({"type": "paragraph", "content": content})
            else:
                result.append({"type": "paragraph"})
            i += 3  # paragraph_open, inline, paragraph_close
            continue

        if tt == "bullet_list_open":
            node, consumed = _parse_list(tokens, i, ordered=False)
            result.append(node)
            i += consumed
            continue

        if tt == "ordered_list_open":
            start_num = token.attrGet("start")
            node, consumed = _parse_list(tokens, i, ordered=True, start_num=start_num)
            result.append(node)
            i += consumed
            continue

        if tt == "blockquote_open":
            node, consumed = _parse_container(tokens, i, "blockquote", "blockquote_close")
            result.append(node)
            i += consumed
            continue

        if tt == "fence" or tt == "code_block":
            lang = token.info.strip() if token.info else None
            text_content = token.content
            # Remove trailing newline that markdown-it adds
            if text_content.endswith("\n"):
                text_content = text_content[:-1]
            node: dict = {
                "type": "codeBlock",
                "content": [{"type": "text", "text": text_content}] if text_content else [],
            }
            if lang:
                node["attrs"] = {"language": lang}
            result.append(node)
            i += 1
            continue

        if tt == "hr":
            result.append({"type": "horizontalRule"})
            i += 1
            continue

        # ── Math blocks ($$...$$) ────────────────────────

        if tt == "math_block" or tt == "math_block_double":
            latex = token.content.strip()
            result.append({
                "type": "paragraph",
                "attrs": {"textAlign": "center"},
                "content": [
                    {"type": "mathInline", "attrs": {"latex": latex}},
                ],
            })
            i += 1
            continue

        # ── Tables ───────────────────────────────────────

        if tt == "table_open":
            node, consumed = _parse_table(tokens, i)
            result.append(node)
            i += consumed
            continue

        # ── Inline-only token (e.g. standalone text) ─────

        if tt == "inline":
            content = _inline_to_tiptap(token)
            if content:
                result.append({"type": "paragraph", "content": content})
            i += 1
            continue

        # ── HTML block (pass through as paragraph) ───────

        if tt == "html_block":
            text = token.content.strip()
            if text:
                result.append({
                    "type": "paragraph",
                    "content": [{"type": "text", "text": text}],
                })
            i += 1
            continue

        # Skip closing tokens and unknown tokens
        i += 1

    return result


# ── List parsing ──────────────────────────────────────────────


def _parse_list(tokens: list, start: int, *, ordered: bool, start_num: int | None = None) -> tuple[dict, int]:
    """Parse a bullet_list or ordered_list block, returning (node, tokens_consumed)."""
    list_type = "orderedList" if ordered else "bulletList"
    close_type = "ordered_list_close" if ordered else "bullet_list_close"

    items: list[dict] = []
    i = start + 1  # skip the _open token

    while i < len(tokens):
        token = tokens[i]

        if token.type == close_type:
            i += 1
            break

        if token.type == "list_item_open":
            item_node, consumed = _parse_list_item(tokens, i)
            items.append(item_node)
            i += consumed
            continue

        i += 1

    node: dict = {"type": list_type, "content": items or [{"type": "listItem", "content": [{"type": "paragraph"}]}]}
    if ordered and start_num and start_num != 1:
        node["attrs"] = {"start": start_num}

    return node, i - start


def _parse_list_item(tokens: list, start: int) -> tuple[dict, int]:
    """Parse a list_item, which may contain paragraphs, nested lists, etc."""
    content: list[dict] = []
    i = start + 1  # skip list_item_open

    while i < len(tokens):
        token = tokens[i]

        if token.type == "list_item_close":
            i += 1
            break

        if token.type == "paragraph_open":
            inline_token = tokens[i + 1] if i + 1 < len(tokens) else None
            inline_content = _inline_to_tiptap(inline_token) if inline_token else []
            if inline_content:
                content.append({"type": "paragraph", "content": inline_content})
            else:
                content.append({"type": "paragraph"})
            i += 3  # paragraph_open, inline, paragraph_close
            continue

        if token.type == "bullet_list_open":
            node, consumed = _parse_list(tokens, i, ordered=False)
            content.append(node)
            i += consumed
            continue

        if token.type == "ordered_list_open":
            node, consumed = _parse_list(tokens, i, ordered=True)
            content.append(node)
            i += consumed
            continue

        # Inline token without paragraph wrapper (tight list)
        if token.type == "inline":
            inline_content = _inline_to_tiptap(token)
            if inline_content:
                content.append({"type": "paragraph", "content": inline_content})
            i += 1
            continue

        i += 1

    if not content:
        content = [{"type": "paragraph"}]

    return {"type": "listItem", "content": content}, i - start


# ── Container parsing (blockquote, etc.) ─────────────────────


def _parse_container(tokens: list, start: int, node_type: str, close_type: str) -> tuple[dict, int]:
    """Parse a container block (blockquote), recursively processing inner tokens."""
    inner_tokens: list = []
    i = start + 1
    depth = 1
    open_type = tokens[start].type

    while i < len(tokens) and depth > 0:
        if tokens[i].type == open_type:
            depth += 1
        elif tokens[i].type == close_type:
            depth -= 1
            if depth == 0:
                i += 1
                break

        inner_tokens.append(tokens[i])
        i += 1

    content = _tokens_to_tiptap(inner_tokens)

    return {
        "type": node_type,
        "content": content or [{"type": "paragraph"}],
    }, i - start


# ── Table parsing ────────────────────────────────────────────


def _parse_table(tokens: list, start: int) -> tuple[dict, int]:
    """Parse a GFM table into TipTap table nodes."""
    rows: list[dict] = []
    i = start + 1  # skip table_open
    in_header = False

    while i < len(tokens):
        token = tokens[i]

        if token.type == "table_close":
            i += 1
            break

        if token.type == "thead_open":
            in_header = True
            i += 1
            continue

        if token.type == "thead_close":
            in_header = False
            i += 1
            continue

        if token.type == "tbody_open" or token.type == "tbody_close":
            i += 1
            continue

        if token.type == "tr_open":
            row, consumed = _parse_table_row(tokens, i, is_header=in_header)
            rows.append(row)
            i += consumed
            continue

        i += 1

    return {
        "type": "table",
        "content": rows or [{"type": "tableRow", "content": [{"type": "tableCell", "content": [{"type": "paragraph"}]}]}],
    }, i - start


def _parse_table_row(tokens: list, start: int, *, is_header: bool) -> tuple[dict, int]:
    """Parse a table row (tr)."""
    cells: list[dict] = []
    i = start + 1  # skip tr_open
    cell_type = "tableHeader" if is_header else "tableCell"

    while i < len(tokens):
        token = tokens[i]

        if token.type == "tr_close":
            i += 1
            break

        if token.type in ("th_open", "td_open"):
            # Next token should be inline content
            inline_token = tokens[i + 1] if i + 1 < len(tokens) else None
            content = _inline_to_tiptap(inline_token) if inline_token else []
            cells.append({
                "type": cell_type,
                "content": [{"type": "paragraph", "content": content}] if content else [{"type": "paragraph"}],
            })
            i += 3  # th/td_open, inline, th/td_close
            continue

        i += 1

    return {"type": "tableRow", "content": cells}, i - start


# ── Inline token processing ─────────────────────────────────


def _inline_to_tiptap(token) -> list[dict]:
    """Convert an inline token's children to TipTap inline nodes."""
    if not token or not token.children:
        if token and token.content:
            return [{"type": "text", "text": token.content}]
        return []

    result: list[dict] = []
    mark_stack: list[dict] = []

    for child in token.children:
        ct = child.type

        # ── Mark openers ─────────────────────────

        if ct == "strong_open":
            mark_stack.append({"type": "bold"})
            continue

        if ct == "em_open":
            mark_stack.append({"type": "italic"})
            continue

        if ct == "s_open":
            mark_stack.append({"type": "strike"})
            continue

        if ct == "link_open":
            href = child.attrGet("href") or ""
            mark_stack.append({"type": "link", "attrs": {"href": href}})
            continue

        # ── Mark closers ─────────────────────────

        if ct in ("strong_close", "em_close", "s_close", "link_close"):
            # Pop the most recent mark of this type
            mark_type = {
                "strong_close": "bold",
                "em_close": "italic",
                "s_close": "strike",
                "link_close": "link",
            }[ct]
            for j in range(len(mark_stack) - 1, -1, -1):
                if mark_stack[j]["type"] == mark_type:
                    mark_stack.pop(j)
                    break
            continue

        # ── Text content ─────────────────────────

        if ct == "text":
            text = child.content
            if text:
                node: dict = {"type": "text", "text": text}
                if mark_stack:
                    node["marks"] = [m.copy() for m in mark_stack]
                result.append(node)
            continue

        if ct == "code_inline":
            text = child.content
            node = {"type": "text", "text": text}
            marks = [m.copy() for m in mark_stack] if mark_stack else []
            marks.append({"type": "code"})
            node["marks"] = marks
            result.append(node)
            continue

        # ── Inline math ($...$) ──────────────────

        if ct == "math_inline" or ct == "math_inline_double":
            latex = child.content.strip()
            result.append({
                "type": "mathInline",
                "attrs": {"latex": latex},
            })
            continue

        # ── Images ───────────────────────────────

        if ct == "image":
            src = child.attrGet("src") or ""
            alt = child.content or child.attrGet("alt") or ""
            title = child.attrGet("title")
            attrs: dict = {"src": src}
            if alt:
                attrs["alt"] = alt
            if title:
                attrs["title"] = title
            result.append({"type": "image", "attrs": attrs})
            continue

        # ── Line breaks ──────────────────────────

        if ct == "softbreak":
            # Soft breaks become hardBreak in TipTap for better formatting
            result.append({"type": "hardBreak"})
            continue

        if ct == "hardbreak":
            result.append({"type": "hardBreak"})
            continue

        # ── HTML inline (pass as text) ───────────

        if ct == "html_inline":
            text = child.content
            if text:
                node = {"type": "text", "text": text}
                if mark_stack:
                    node["marks"] = [m.copy() for m in mark_stack]
                result.append(node)
            continue

    return result
