"""
Step: LLM Markdown Structurer — clean up raw OCR/pandoc markdown.

Only runs when conversion_requested=True. Takes the raw markdown
(potentially messy OCR output or pandoc conversion) and asks the LLM
to restructure it with proper heading hierarchy, lists, formatting, etc.
WITHOUT altering the actual content.
"""

from __future__ import annotations

import logging

from supabase import Client

from app.pipeline.clients.openrouter import chat_completion_text
from app.pipeline.steps.image_utils import resolve_images_for_llm

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """\
You are a document formatting specialist. Your ONLY job is to restructure \
a raw markdown document so it has correct, clean formatting. You must NOT \
alter, summarize, add, or remove any content — only fix the structure.

Rules:
1. **Headings**: Use a proper hierarchy. The document title (if present) \
should be H1 (#). Major sections should be H2 (##). Sub-sections H3 (###). \
Do NOT skip levels (e.g. going from H1 to H3 without H2).

2. **Lists**: Fix broken bullet lists (use - for unordered) and numbered \
lists (use 1. 2. 3.). Ensure proper nesting with indentation.

3. **Paragraphs**: Separate paragraphs with blank lines. Remove stray line \
breaks within paragraphs (merge lines that belong together).

4. **Bold/Italic**: Preserve existing bold (**text**) and italic (*text*) \
formatting. Fix broken formatting where obvious (e.g. unclosed markers).

5. **Tables**: If the document contains tabular data that was broken by OCR, \
reconstruct it as a proper markdown table with | separators and header row.

6. **Math**: Preserve ALL math notation EXACTLY as-is. Do NOT modify \
anything between $ and $ or between $$ and $$. These are LaTeX expressions.

7. **Images**: Preserve ALL image references EXACTLY as-is. Do NOT modify \
any ![...](...) markdown image syntax, especially artifact-image:// URLs.

8. **Question markers**: Preserve any {{question:...}} markers exactly as-is.

9. **Code blocks**: Preserve code blocks (``` fenced or indented) as-is.

10. Return ONLY the restructured markdown. No explanations, no wrapping, \
no preamble. The output should be valid markdown ready for conversion.\
"""


async def structure_markdown(
    db: Client,
    org_id: str,
    artifact_id: str,
    markdown: str,
) -> str:
    """
    Send raw markdown to the LLM for structural cleanup.

    The LLM sees images via multimodal content blocks (so it understands
    diagrams/figures in context) but only restructures the text.

    Returns the restructured markdown string.
    """
    logger.info(
        "Structuring markdown for artifact %s (%d chars)",
        artifact_id,
        len(markdown),
    )

    # Resolve artifact-image:// URLs to multimodal content blocks
    # so the LLM can see images for context while restructuring
    multimodal_content = await resolve_images_for_llm(db, markdown)

    result = await chat_completion_text(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=multimodal_content,
        temperature=0.1,
        max_tokens=32768,
    )

    # Strip any markdown code fences the LLM might wrap the response in
    result = result.strip()
    if result.startswith("```markdown"):
        result = result[len("```markdown"):].strip()
    elif result.startswith("```md"):
        result = result[len("```md"):].strip()
    elif result.startswith("```"):
        result = result[3:].strip()
    if result.endswith("```"):
        result = result[:-3].rstrip()

    logger.info(
        "Structured markdown for artifact %s: %d → %d chars",
        artifact_id,
        len(markdown),
        len(result),
    )

    return result
