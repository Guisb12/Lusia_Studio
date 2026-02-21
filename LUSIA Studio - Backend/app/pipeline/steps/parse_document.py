"""
Step 1: Parse uploaded documents to Markdown.

- PDF  → Mistral OCR API
- DOCX → Pandoc
- MD   → passthrough
- TXT  → passthrough
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from supabase import Client

logger = logging.getLogger(__name__)


async def parse_document(db: Client, storage_path: str, source_type: str) -> str:
    """
    Download the file from Supabase Storage and convert to Markdown.

    Returns the markdown content (may contain base64 images for PDF).
    """
    # Download file from storage
    file_bytes = _download_file(db, storage_path)

    if source_type == "pdf":
        return await _parse_pdf(file_bytes)
    elif source_type == "docx":
        return _parse_docx(file_bytes, storage_path)
    elif source_type in ("md", "txt"):
        return file_bytes.decode("utf-8", errors="replace")
    else:
        logger.warning("Unknown source_type %s, treating as text", source_type)
        return file_bytes.decode("utf-8", errors="replace")


def _download_file(db: Client, storage_path: str) -> bytes:
    """Download a file from the documents bucket."""
    try:
        response = db.storage.from_("documents").download(storage_path)
        return response
    except Exception as exc:
        raise RuntimeError(f"Failed to download {storage_path}: {exc}") from exc


async def _parse_pdf(file_bytes: bytes) -> str:
    """Parse PDF via Mistral OCR API."""
    from app.pipeline.clients.mistral_ocr import ocr_pdf

    logger.info("Parsing PDF via Mistral OCR (%d bytes)", len(file_bytes))
    return await ocr_pdf(file_bytes)


def _parse_docx(file_bytes: bytes, storage_path: str) -> str:
    """Parse DOCX via Pandoc."""
    import pypandoc

    # Write to a temp file since pypandoc needs a file path
    suffix = Path(storage_path).suffix or ".docx"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        tmp.write(file_bytes)
        tmp.flush()

        logger.info("Converting DOCX via Pandoc: %s", tmp.name)
        markdown = pypandoc.convert_file(
            tmp.name,
            "md",
            format="docx",
            extra_args=["--wrap=none"],
        )

    return markdown
