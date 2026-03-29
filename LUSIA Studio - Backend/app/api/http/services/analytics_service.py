"""
Analytics service — financial calculations for admin, teacher, and student dashboards.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from supabase import Client

from app.utils.db import supabase_execute

logger = logging.getLogger(__name__)

# Analytics is an aggregation service — it reads session rows and computes
# dashboard-level metrics. There is no entity list/detail pattern, so the
# summary/detail SELECT split does not apply. This constant defines the
# minimal columns needed for financial calculations.
ANALYTICS_SESSION_SELECT = (
    "id,teacher_id,student_ids,session_type_id,"
    "snapshot_student_price,snapshot_teacher_cost,"
    "starts_at,ends_at"
)


def _parse_dt(iso_str: str) -> datetime:
    """Parse an ISO datetime string."""
    return datetime.fromisoformat(iso_str.replace("Z", "+00:00"))


def _parse_date_only(value: str) -> Optional[date]:
    """Parse YYYY-MM-DD values used by analytics filters."""
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _session_duration_hours(session: dict) -> float:
    """Compute session duration in hours."""
    start = session.get("starts_at")
    end = session.get("ends_at")
    if not start or not end:
        return 0.0
    try:
        return (_parse_dt(end) - _parse_dt(start)).total_seconds() / 3600
    except (ValueError, TypeError):
        return 0.0


def _session_financials(session: dict) -> tuple[float, float, float, float]:
    """
    Compute (duration_hours, revenue, cost, profit) for a session.
    Revenue = snapshot_student_price * hours * num_students
    Cost = snapshot_teacher_cost * hours
    """
    hours = _session_duration_hours(session)
    student_price = session.get("snapshot_student_price")
    teacher_cost = session.get("snapshot_teacher_cost")
    num_students = len(session.get("student_ids") or [])

    revenue = (float(student_price) * hours * num_students) if student_price is not None else 0.0
    cost = (float(teacher_cost) * hours) if teacher_cost is not None else 0.0
    profit = revenue - cost

    return hours, revenue, cost, profit


def _period_key(iso_str: str, granularity: str) -> str:
    """Generate a period key from an ISO datetime string."""
    dt = _parse_dt(iso_str)
    if granularity == "daily":
        return dt.strftime("%Y-%m-%d")
    if granularity == "weekly":
        iso_year, iso_week, _ = dt.isocalendar()
        return f"{iso_year}-W{iso_week:02d}"
    return dt.strftime("%Y-%m")


def _fetch_sessions(
    db: Client,
    org_id: str,
    *,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    teacher_id: Optional[str] = None,
    session_type_id: Optional[str] = None,
) -> list[dict]:
    """Fetch sessions for analytics with optional filters."""
    query = (
        db.table("calendar_sessions")
        .select(ANALYTICS_SESSION_SELECT)
        .eq("organization_id", org_id)
    )
    if date_from:
        parsed_from = _parse_date_only(date_from)
        query = query.gte("starts_at", parsed_from.isoformat() if parsed_from else date_from)
    if date_to:
        parsed_to = _parse_date_only(date_to)
        if parsed_to:
            query = query.lt("starts_at", (parsed_to + timedelta(days=1)).isoformat())
        else:
            query = query.lte("starts_at", date_to)
    if teacher_id:
        query = query.eq("teacher_id", teacher_id)
    if session_type_id:
        query = query.eq("session_type_id", session_type_id)

    query = query.order("starts_at", desc=False).limit(5000)
    response = supabase_execute(query, entity="analytics_sessions")
    return response.data or []


def _fetch_profile_map(db: Client, ids: list[str]) -> dict[str, dict]:
    """Batch-fetch profiles by ID."""
    if not ids:
        return {}
    try:
        resp = (
            db.table("profiles")
            .select("id,full_name,display_name,avatar_url")
            .in_("id", ids)
            .execute()
        )
        return {
            row["id"]: {
                "name": row.get("display_name") or row.get("full_name") or "",
                "avatar_url": row.get("avatar_url"),
            }
            for row in (resp.data or [])
        }
    except Exception:
        logger.warning("Failed to fetch profiles for analytics")
        return {}


def _fetch_session_type_map(db: Client, ids: list[str]) -> dict[str, dict]:
    """Batch-fetch session types by ID."""
    if not ids:
        return {}
    try:
        resp = (
            db.table("session_types")
            .select("id,name,color")
            .in_("id", ids)
            .execute()
        )
        return {row["id"]: row for row in (resp.data or [])}
    except Exception:
        logger.warning("Failed to fetch session types for analytics")
        return {}


def get_admin_dashboard(
    db: Client,
    org_id: str,
    *,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    teacher_id: Optional[str] = None,
    session_type_id: Optional[str] = None,
    granularity: str = "monthly",
) -> dict:
    """Full organization financial dashboard for admins."""
    sessions = _fetch_sessions(
        db, org_id,
        date_from=date_from,
        date_to=date_to,
        teacher_id=teacher_id,
        session_type_id=session_type_id,
    )

    total_revenue = 0.0
    total_cost = 0.0
    total_hours = 0.0

    teacher_agg: dict[str, dict] = defaultdict(
        lambda: {"sessions": 0, "hours": 0.0, "cost": 0.0, "revenue": 0.0}
    )
    student_agg: dict[str, dict] = defaultdict(
        lambda: {"sessions": 0, "hours": 0.0, "billed": 0.0}
    )
    type_agg: dict[str, dict] = defaultdict(
        lambda: {"sessions": 0, "revenue": 0.0, "cost": 0.0}
    )
    time_agg: dict[str, dict] = defaultdict(
        lambda: {"revenue": 0.0, "cost": 0.0, "profit": 0.0, "count": 0}
    )

    for s in sessions:
        hours, revenue, cost, profit = _session_financials(s)
        total_revenue += revenue
        total_cost += cost
        total_hours += hours

        tid = s.get("teacher_id", "")
        teacher_agg[tid]["sessions"] += 1
        teacher_agg[tid]["hours"] += hours
        teacher_agg[tid]["cost"] += cost
        teacher_agg[tid]["revenue"] += revenue

        student_price = s.get("snapshot_student_price")
        for sid in (s.get("student_ids") or []):
            student_agg[sid]["sessions"] += 1
            student_agg[sid]["hours"] += hours
            if student_price is not None:
                student_agg[sid]["billed"] += float(student_price) * hours

        st_id = s.get("session_type_id") or "_none"
        type_agg[st_id]["sessions"] += 1
        type_agg[st_id]["revenue"] += revenue
        type_agg[st_id]["cost"] += cost

        if s.get("starts_at"):
            pk = _period_key(s["starts_at"], granularity)
            time_agg[pk]["revenue"] += revenue
            time_agg[pk]["cost"] += cost
            time_agg[pk]["profit"] += profit
            time_agg[pk]["count"] += 1

    total_sessions = len(sessions)

    # Hydrate names
    all_teacher_ids = list(teacher_agg.keys())
    all_student_ids = list(student_agg.keys())
    all_type_ids = [tid for tid in type_agg.keys() if tid != "_none"]

    profile_map = _fetch_profile_map(db, all_teacher_ids + all_student_ids)
    type_map = _fetch_session_type_map(db, all_type_ids)

    by_teacher = [
        {
            "teacher_id": tid,
            "teacher_name": profile_map.get(tid, {}).get("name"),
            "avatar_url": profile_map.get(tid, {}).get("avatar_url"),
            "total_sessions": agg["sessions"],
            "total_hours": round(agg["hours"], 1),
            "total_cost": round(agg["cost"], 2),
            "total_revenue_generated": round(agg["revenue"], 2),
        }
        for tid, agg in sorted(teacher_agg.items(), key=lambda x: x[1]["revenue"], reverse=True)
    ]

    by_student = [
        {
            "student_id": sid,
            "student_name": profile_map.get(sid, {}).get("name"),
            "avatar_url": profile_map.get(sid, {}).get("avatar_url"),
            "total_sessions": agg["sessions"],
            "total_hours": round(agg["hours"], 1),
            "total_billed": round(agg["billed"], 2),
        }
        for sid, agg in sorted(student_agg.items(), key=lambda x: x[1]["billed"], reverse=True)
    ]

    by_session_type = [
        {
            "session_type_id": tid if tid != "_none" else None,
            "session_type_name": type_map.get(tid, {}).get("name") if tid != "_none" else "Sem tipo",
            "color": type_map.get(tid, {}).get("color") if tid != "_none" else None,
            "total_sessions": agg["sessions"],
            "total_revenue": round(agg["revenue"], 2),
            "total_cost": round(agg["cost"], 2),
        }
        for tid, agg in sorted(type_agg.items(), key=lambda x: x[1]["revenue"], reverse=True)
    ]

    time_series = [
        {
            "period": pk,
            "revenue": round(agg["revenue"], 2),
            "cost": round(agg["cost"], 2),
            "profit": round(agg["profit"], 2),
            "session_count": agg["count"],
        }
        for pk, agg in sorted(time_agg.items())
    ]

    return {
        "summary": {
            "total_revenue": round(total_revenue, 2),
            "total_cost": round(total_cost, 2),
            "total_profit": round(total_revenue - total_cost, 2),
            "total_sessions": total_sessions,
            "total_hours": round(total_hours, 1),
            "average_revenue_per_session": round(total_revenue / total_sessions, 2) if total_sessions else 0,
            "average_cost_per_session": round(total_cost / total_sessions, 2) if total_sessions else 0,
        },
        "by_teacher": by_teacher,
        "by_student": by_student,
        "by_session_type": by_session_type,
        "time_series": time_series,
    }


def get_teacher_dashboard(
    db: Client,
    org_id: str,
    teacher_id: str,
    *,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    granularity: str = "monthly",
) -> dict:
    """Teacher financial dashboard — their earnings and revenue generated."""
    sessions = _fetch_sessions(
        db, org_id, date_from=date_from, date_to=date_to, teacher_id=teacher_id,
    )

    total_earnings = 0.0
    total_revenue = 0.0
    total_hours = 0.0
    student_agg: dict[str, dict] = defaultdict(
        lambda: {"sessions": 0, "hours": 0.0, "billed": 0.0}
    )
    time_agg: dict[str, dict] = defaultdict(
        lambda: {"revenue": 0.0, "cost": 0.0, "profit": 0.0, "count": 0}
    )

    for s in sessions:
        hours, revenue, cost, profit = _session_financials(s)
        total_earnings += cost  # teacher earns the cost side
        total_revenue += revenue
        total_hours += hours

        student_price = s.get("snapshot_student_price")
        for sid in (s.get("student_ids") or []):
            student_agg[sid]["sessions"] += 1
            student_agg[sid]["hours"] += hours
            if student_price is not None:
                student_agg[sid]["billed"] += float(student_price) * hours

        if s.get("starts_at"):
            pk = _period_key(s["starts_at"], granularity)
            time_agg[pk]["revenue"] += revenue
            time_agg[pk]["cost"] += cost
            time_agg[pk]["profit"] += profit
            time_agg[pk]["count"] += 1

    all_student_ids = list(student_agg.keys())
    profile_map = _fetch_profile_map(db, all_student_ids)

    by_student = [
        {
            "student_id": sid,
            "student_name": profile_map.get(sid, {}).get("name"),
            "avatar_url": profile_map.get(sid, {}).get("avatar_url"),
            "total_sessions": agg["sessions"],
            "total_hours": round(agg["hours"], 1),
            "total_billed": round(agg["billed"], 2),
        }
        for sid, agg in sorted(student_agg.items(), key=lambda x: x[1]["billed"], reverse=True)
    ]

    time_series = [
        {
            "period": pk,
            "revenue": round(agg["revenue"], 2),
            "cost": round(agg["cost"], 2),
            "profit": round(agg["profit"], 2),
            "session_count": agg["count"],
        }
        for pk, agg in sorted(time_agg.items())
    ]

    return {
        "total_earnings": round(total_earnings, 2),
        "total_sessions": len(sessions),
        "total_hours": round(total_hours, 1),
        "revenue_generated": round(total_revenue, 2),
        "by_student": by_student,
        "time_series": time_series,
    }


def get_student_dashboard(
    db: Client,
    org_id: str,
    student_id: str,
    *,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    granularity: str = "monthly",
) -> dict:
    """Student financial dashboard — their spending breakdown."""
    query = (
        db.table("calendar_sessions")
        .select(ANALYTICS_SESSION_SELECT)
        .eq("organization_id", org_id)
        .contains("student_ids", [student_id])
    )
    if date_from:
        parsed_from = _parse_date_only(date_from)
        query = query.gte("starts_at", parsed_from.isoformat() if parsed_from else date_from)
    if date_to:
        parsed_to = _parse_date_only(date_to)
        if parsed_to:
            query = query.lt("starts_at", (parsed_to + timedelta(days=1)).isoformat())
        else:
            query = query.lte("starts_at", date_to)

    query = query.order("starts_at", desc=False).limit(5000)
    response = supabase_execute(query, entity="student_analytics")
    sessions = response.data or []

    total_spent = 0.0
    total_hours = 0.0
    session_costs: list[dict] = []
    time_agg: dict[str, dict] = defaultdict(
        lambda: {"spent": 0.0, "count": 0}
    )

    for s in sessions:
        hours = _session_duration_hours(s)
        total_hours += hours

        student_price = s.get("snapshot_student_price")
        cost_for_student = float(student_price) * hours if student_price is not None else 0.0
        total_spent += cost_for_student

        session_costs.append({
            "session_id": s["id"],
            "starts_at": s.get("starts_at"),
            "ends_at": s.get("ends_at"),
            "hours": round(hours, 2),
            "cost": round(cost_for_student, 2),
            "session_type_id": s.get("session_type_id"),
        })

        if s.get("starts_at"):
            pk = _period_key(s["starts_at"], granularity)
            time_agg[pk]["spent"] += cost_for_student
            time_agg[pk]["count"] += 1

    time_series = [
        {
            "period": pk,
            "revenue": round(agg["spent"], 2),
            "cost": 0,
            "profit": 0,
            "session_count": agg["count"],
        }
        for pk, agg in sorted(time_agg.items())
    ]

    return {
        "total_spent": round(total_spent, 2),
        "total_sessions": len(sessions),
        "total_hours": round(total_hours, 1),
        "session_costs": session_costs,
        "time_series": time_series,
    }
