"""
Reusable Supabase helpers for consistent error handling and pagination.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpcore
import httpx
from fastapi import HTTPException, status
from supabase import Client

from app.schemas.pagination import PaginatedResponse, PaginationParams

logger = logging.getLogger(__name__)

SUPABASE_RETRY_DELAYS_SECONDS = (0.15, 0.5, 1.0)


def _is_transient_supabase_error(exc: Exception) -> bool:
    return isinstance(
        exc,
        (
            httpx.ReadError,
            httpx.ConnectError,
            httpx.TimeoutException,
            httpcore.ReadError,
            httpcore.ConnectError,
            httpcore.TimeoutException,
        ),
    )


def supabase_execute(query, *, entity: str = "record") -> Any:
    """
    Execute a Supabase query builder and return the response.
    Wraps the call so every caller gets a uniform 500 on failure.
    """
    last_exc: Exception | None = None

    for attempt, delay in enumerate((0.0, *SUPABASE_RETRY_DELAYS_SECONDS), start=1):
        if delay > 0:
            time.sleep(delay)

        try:
            return query.execute()
        except Exception as exc:
            last_exc = exc
            if _is_transient_supabase_error(exc) and attempt <= len(SUPABASE_RETRY_DELAYS_SECONDS):
                logger.warning(
                    "Transient Supabase error for %s (attempt %d/%d): %s",
                    entity,
                    attempt,
                    len(SUPABASE_RETRY_DELAYS_SECONDS) + 1,
                    exc,
                )
                continue

            logger.exception("Supabase query failed for %s", entity)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error while accessing {entity}: {str(exc)}",
            ) from exc

    # Defensive fallback; loop should always either return or raise above.
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=f"Database error while accessing {entity}: {str(last_exc) if last_exc else 'unknown error'}",
    )


def parse_single_or_404(response, *, entity: str = "record") -> dict:
    """
    Return the first row from a Supabase response, or raise 404.
    """
    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{entity.capitalize()} not found",
        )
    return response.data[0]


def paginated_query(
    db: Client,
    table: str,
    *,
    select: str = "*",
    filters: dict[str, Any] | None = None,
    is_filters: dict[str, str] | None = None,
    contains_filters: dict[str, list] | None = None,
    order_by: str = "created_at",
    ascending: bool = False,
    pagination: PaginationParams,
    entity: str = "records",
) -> PaginatedResponse:
    """
    Build a paginated Supabase query with common filter patterns.

    - filters: exact-match eq() filters
    - is_filters: is_() filters (e.g. {"deleted_at": "null"})
    - contains_filters: contains() filters for array columns
    """
    query = db.table(table).select(select, count="exact")

    if filters:
        for col, val in filters.items():
            if val is not None:
                query = query.eq(col, val)

    if is_filters:
        for col, val in is_filters.items():
            query = query.is_(col, val)

    if contains_filters:
        for col, val in contains_filters.items():
            query = query.contains(col, val)

    query = query.order(order_by, desc=not ascending)

    start = pagination.offset
    end = start + pagination.per_page - 1
    query = query.range(start, end)

    response = supabase_execute(query, entity=entity)

    return PaginatedResponse(
        data=response.data or [],
        page=pagination.page,
        per_page=pagination.per_page,
        total=response.count or 0,
    )
