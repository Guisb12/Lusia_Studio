"""
ARQ worker definition for document processing pipeline.
"""

from __future__ import annotations

import logging

from arq import create_pool
from arq.connections import RedisSettings

from app.core.config import settings

logger = logging.getLogger(__name__)


def _redis_settings() -> RedisSettings:
    """Parse REDIS_URL into ARQ RedisSettings."""
    return RedisSettings.from_dsn(settings.REDIS_URL)


async def enqueue_pipeline_job(
    artifact_id: str,
    job_id: str,
    document_category: str | None = None,
    year_levels: list[str] | None = None,
) -> None:
    """Enqueue a document processing job from the API layer."""
    pool = await create_pool(_redis_settings())
    await pool.enqueue_job(
        "process_document_pipeline",
        artifact_id,
        job_id,
        document_category,
        year_levels,
    )
    logger.info("Enqueued pipeline job %s for artifact %s", job_id, artifact_id)


# ── ARQ worker configuration (run with: arq app.pipeline.worker.WorkerSettings) ──

async def process_document_pipeline(
    ctx: dict,
    artifact_id: str,
    job_id: str,
    document_category: str | None = None,
    year_levels: list[str] | None = None,
) -> None:
    """Entry point called by ARQ worker. Delegates to the pipeline orchestrator."""
    from app.pipeline.tasks import run_pipeline
    await run_pipeline(artifact_id, job_id, document_category, year_levels)


class WorkerSettings:
    """ARQ worker settings."""
    redis_settings = _redis_settings()
    functions = [process_document_pipeline]
    max_jobs = settings.PIPELINE_MAX_CONCURRENCY
    job_timeout = 600  # 10 minutes per job
    max_tries = 3
    retry_defer = 30  # seconds between retries
