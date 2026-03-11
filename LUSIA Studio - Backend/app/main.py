import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.http.router import api_router
from app.core.config import settings
from app.pipeline.task_manager import pipeline_manager

logger = logging.getLogger(__name__)


async def _recover_orphaned_jobs() -> None:
    """Find artifacts stuck in processing (server crashed mid-pipeline) and re-enqueue."""
    from app.core.database import get_b2b_db
    from app.utils.db import supabase_execute

    try:
        db = get_b2b_db()
        response = supabase_execute(
            db.table("artifacts")
            .select("id, user_id, document_jobs(id, metadata)")
            .eq("is_processed", False)
            .eq("processing_failed", False)
            .eq("artifact_type", "uploaded_file")
            .order("created_at", desc=False),
            entity="artifacts",
        )
        orphans = response.data or []
        count = 0
        for artifact in orphans:
            jobs = artifact.get("document_jobs") or []
            if not jobs:
                continue
            latest_job = jobs[-1]
            job_metadata = latest_job.get("metadata") or {}
            await pipeline_manager.enqueue(
                artifact["id"],
                latest_job["id"],
                artifact["user_id"],
                job_metadata.get("document_category"),
                job_metadata.get("year_levels"),
            )
            count += 1
        if count:
            logger.info("Recovered %d orphaned pipeline jobs", count)
    except Exception:
        logger.exception("Failed to recover orphaned pipeline jobs")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # STARTUP: recover orphaned jobs from previous crash/restart
    await _recover_orphaned_jobs()
    yield
    # SHUTDOWN: wait for in-flight tasks to finish
    await pipeline_manager.shutdown(timeout=30.0)


app = FastAPI(
    title="LUSIA Studio API",
    description="",
    version="0.1.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

# CORS - origins configurable via FRONTEND_URL env var
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
    }


@app.get("/")
async def root():
    return {"message": "Teacher CRM API"}


app.include_router(api_router, prefix="/api/v1")
