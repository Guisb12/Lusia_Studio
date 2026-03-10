"""
In-process pipeline task manager — replaces ARQ/Redis worker.

Manages background asyncio tasks with semaphore-based concurrency control
and broadcasts status events to per-user SSE subscriber queues.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@dataclass
class JobMeta:
    artifact_id: str
    job_id: str
    user_id: str
    category: str | None = None
    year_levels: list[str] | None = None
    status: str = "pending"
    step_label: str = "Na fila..."
    error_message: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "artifact_id": self.artifact_id,
            "job_id": self.job_id,
            "step": self.status,
            "step_label": self.step_label,
        }


class PipelineTaskManager:
    """Singleton managing document processing background tasks."""

    def __init__(self, max_concurrency: int = 3):
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._tasks: dict[str, asyncio.Task] = {}          # artifact_id → Task
        self._jobs: dict[str, JobMeta] = {}                 # artifact_id → metadata
        self._subscribers: dict[str, set[asyncio.Queue]] = {}  # user_id → queues
        self._lock = asyncio.Lock()

    # ── Public API ─────────────────────────────────────────────

    async def enqueue(
        self,
        artifact_id: str,
        job_id: str,
        user_id: str,
        category: str | None = None,
        year_levels: list[str] | None = None,
    ) -> None:
        """Register a pipeline job and start it as a background task."""
        async with self._lock:
            # Skip if already running
            if artifact_id in self._tasks and not self._tasks[artifact_id].done():
                logger.warning("Task for artifact %s already running, skipping", artifact_id)
                return

            meta = JobMeta(
                artifact_id=artifact_id,
                job_id=job_id,
                user_id=user_id,
                category=category,
                year_levels=year_levels,
            )
            self._jobs[artifact_id] = meta

            task = asyncio.create_task(
                self._run_with_semaphore(artifact_id),
                name=f"pipeline-{artifact_id}",
            )
            self._tasks[artifact_id] = task

        # Broadcast initial pending status
        self._broadcast(user_id, {
            "type": "status",
            "artifact_id": artifact_id,
            "job_id": job_id,
            "step": "pending",
            "step_label": "Na fila...",
        })

        logger.info("Enqueued pipeline task for artifact %s (job %s)", artifact_id, job_id)

    def subscribe(self, user_id: str) -> asyncio.Queue:
        """Create a subscriber queue for SSE streaming."""
        queue: asyncio.Queue = asyncio.Queue()
        if user_id not in self._subscribers:
            self._subscribers[user_id] = set()
        self._subscribers[user_id].add(queue)
        return queue

    def unsubscribe(self, user_id: str, queue: asyncio.Queue) -> None:
        """Remove a subscriber queue when SSE connection closes."""
        subs = self._subscribers.get(user_id)
        if subs:
            subs.discard(queue)
            if not subs:
                del self._subscribers[user_id]

    def get_active_jobs(self, user_id: str) -> list[dict[str, Any]]:
        """Return current state of all active jobs for a user (for SSE hydration)."""
        return [
            meta.to_dict()
            for meta in self._jobs.values()
            if meta.user_id == user_id
        ]

    async def shutdown(self, timeout: float = 30.0) -> None:
        """Wait for in-flight tasks to complete on server shutdown."""
        tasks = list(self._tasks.values())
        if not tasks:
            return

        logger.info("Waiting for %d pipeline tasks to finish (timeout: %.0fs)...", len(tasks), timeout)
        done, pending = await asyncio.wait(tasks, timeout=timeout)

        if pending:
            logger.warning("Cancelling %d pipeline tasks that didn't finish in time", len(pending))
            for t in pending:
                t.cancel()
            await asyncio.gather(*pending, return_exceptions=True)

        logger.info("Pipeline shutdown complete (%d finished, %d cancelled)", len(done), len(pending))

    # ── Internal ───────────────────────────────────────────────

    async def _run_with_semaphore(self, artifact_id: str) -> None:
        """Acquire semaphore, run pipeline, broadcast events, clean up."""
        meta = self._jobs.get(artifact_id)
        if not meta:
            return

        try:
            async with self._semaphore:
                from app.pipeline.tasks import run_pipeline

                def on_step_change(status: str, step_label: str) -> None:
                    meta.status = status
                    meta.step_label = step_label
                    self._broadcast(meta.user_id, {
                        "type": "status",
                        "artifact_id": artifact_id,
                        "job_id": meta.job_id,
                        "step": status,
                        "step_label": step_label,
                    })

                await run_pipeline(
                    artifact_id,
                    meta.job_id,
                    meta.category,
                    meta.year_levels,
                    on_step_change=on_step_change,
                )

            # Success
            meta.status = "completed"
            self._broadcast(meta.user_id, {
                "type": "completed",
                "artifact_id": artifact_id,
            })
            logger.info("Pipeline task completed for artifact %s", artifact_id)

        except Exception as exc:
            error_msg = str(exc)[:1000]
            meta.status = "failed"
            meta.error_message = error_msg
            self._broadcast(meta.user_id, {
                "type": "failed",
                "artifact_id": artifact_id,
                "error_message": error_msg,
            })
            logger.exception("Pipeline task failed for artifact %s", artifact_id)

        finally:
            # Clean up after a short delay (allows late SSE reconnections to
            # see the final state via get_active_jobs hydration)
            await asyncio.sleep(5.0)
            self._tasks.pop(artifact_id, None)
            self._jobs.pop(artifact_id, None)

    def _broadcast(self, user_id: str, event: dict) -> None:
        """Push event to all SSE subscriber queues for this user."""
        subs = self._subscribers.get(user_id)
        if not subs:
            return
        for queue in subs:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning("SSE queue full for user %s, dropping event", user_id)


# Module-level singleton
pipeline_manager = PipelineTaskManager(settings.PIPELINE_MAX_CONCURRENCY)
