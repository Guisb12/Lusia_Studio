"""
Members service — business logic for listing and managing org members.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from supabase import Client

from app.api.http.schemas.members import MemberUpdateRequest
from app.schemas.pagination import PaginatedResponse, PaginationParams
from app.utils.db import paginated_query, parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)

MEMBER_SELECT = (
    "id,full_name,display_name,email,role,status,"
    "avatar_url,grade_level,course,school_name,phone,"
    "subjects_taught,subject_ids,class_ids,"
    "parent_name,parent_email,parent_phone,"
    "hourly_rate,onboarding_completed,created_at"
)


def list_members(
    db: Client,
    org_id: str,
    *,
    role_filter: str | None = None,
    status_filter: str | None = None,
    pagination: PaginationParams,
) -> PaginatedResponse:
    filters: dict = {"organization_id": org_id}
    if status_filter:
        filters["status"] = status_filter

    # Support comma-separated roles (e.g. "admin,teacher")
    if role_filter and "," in role_filter:
        roles = [r.strip() for r in role_filter.split(",")]
        # Build query manually to use .in_() for multi-role
        query = (
            db.table("profiles")
            .select(MEMBER_SELECT, count="exact")
            .in_("role", roles)
        )
        for col, val in filters.items():
            if val is not None:
                query = query.eq(col, val)
        query = query.order("created_at", desc=True)
        start = pagination.offset
        end = start + pagination.per_page - 1
        query = query.range(start, end)
        response = supabase_execute(query, entity="members")
        return PaginatedResponse(
            data=response.data or [],
            page=pagination.page,
            per_page=pagination.per_page,
            total=response.count or 0,
        )

    if role_filter:
        filters["role"] = role_filter

    return paginated_query(
        db,
        "profiles",
        select=MEMBER_SELECT,
        filters=filters,
        order_by="created_at",
        ascending=False,
        pagination=pagination,
        entity="members",
    )


def get_member(db: Client, org_id: str, member_id: str) -> dict:
    response = supabase_execute(
        db.table("profiles")
        .select(MEMBER_SELECT)
        .eq("organization_id", org_id)
        .eq("id", member_id)
        .limit(1),
        entity="member",
    )
    return parse_single_or_404(response, entity="member")


def update_member(
    db: Client,
    org_id: str,
    member_id: str,
    payload: MemberUpdateRequest,
) -> dict:
    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        return get_member(db, org_id, member_id)

    response = supabase_execute(
        db.table("profiles")
        .update(update_data)
        .eq("organization_id", org_id)
        .eq("id", member_id),
        entity="member",
    )
    return parse_single_or_404(response, entity="member")


def remove_member(db: Client, org_id: str, member_id: str) -> dict:
    """Soft-remove: set status to 'suspended'."""
    response = supabase_execute(
        db.table("profiles")
        .update({"status": "suspended"})
        .eq("organization_id", org_id)
        .eq("id", member_id),
        entity="member",
    )
    return parse_single_or_404(response, entity="member")


# ── Student detail endpoints ──────────────────────────────────────


def get_member_sessions(
    db: Client,
    org_id: str,
    member_id: str,
    *,
    as_teacher: bool = False,
    date_from: str | None = None,
    date_to: str | None = None,
) -> list[dict]:
    """List calendar sessions for a member (as student or as teacher)."""
    query = (
        db.table("calendar_sessions")
        .select(
            "id,title,starts_at,ends_at,teacher_id,subject_ids,student_ids,created_at"
        )
        .eq("organization_id", org_id)
    )

    if as_teacher:
        query = query.eq("teacher_id", member_id)
    else:
        query = query.contains("student_ids", [member_id])

    if date_from:
        query = query.gte("starts_at", date_from)
    if date_to:
        query = query.lte("starts_at", date_to)

    query = query.order("starts_at", desc=True).limit(200)

    response = supabase_execute(query, entity="sessions")
    sessions = response.data or []

    # Hydrate subject names
    all_subject_ids: set[str] = set()
    for s in sessions:
        for sid in s.get("subject_ids") or []:
            all_subject_ids.add(sid)

    subject_map: dict[str, dict] = {}
    if all_subject_ids:
        try:
            resp = (
                db.table("subjects")
                .select("id,name,color")
                .in_("id", list(all_subject_ids))
                .execute()
            )
            for subj in resp.data or []:
                subject_map[subj["id"]] = subj
        except Exception:
            pass

    for s in sessions:
        s["subjects"] = [
            subject_map[sid]
            for sid in (s.get("subject_ids") or [])
            if sid in subject_map
        ]

    return sessions


def get_member_assignments(
    db: Client,
    org_id: str,
    member_id: str,
    teacher_id: str,
    role: str,
) -> list[dict]:
    """List student_assignments for this student, hydrated with assignment info."""
    response = supabase_execute(
        db.table("student_assignments")
        .select(
            "id,assignment_id,status,grade,feedback,submitted_at,graded_at,created_at"
        )
        .eq("organization_id", org_id)
        .eq("student_id", member_id)
        .order("created_at", desc=True)
        .limit(50),
        entity="student_assignments",
    )
    student_assignments = response.data or []
    if not student_assignments:
        return []

    # Fetch parent assignments
    assignment_ids = list({sa["assignment_id"] for sa in student_assignments})
    assignments_resp = supabase_execute(
        db.table("assignments")
        .select("id,title,due_date,status,teacher_id")
        .in_("id", assignment_ids),
        entity="assignments",
    )
    assignment_map = {a["id"]: a for a in (assignments_resp.data or [])}

    result = []
    for sa in student_assignments:
        assignment = assignment_map.get(sa["assignment_id"])
        if not assignment:
            continue
        # For non-admin teachers, only show their own assignments
        if role != "admin" and assignment.get("teacher_id") != teacher_id:
            continue
        sa["assignment_title"] = assignment.get("title")
        sa["due_date"] = assignment.get("due_date")
        sa["assignment_status"] = assignment.get("status")
        result.append(sa)

    return result


def get_member_stats(
    db: Client,
    org_id: str,
    member_id: str,
    teacher_id: str,
    role: str,
) -> dict:
    """Aggregate statistics for a student."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    twelve_weeks_ago = now - timedelta(weeks=12)

    # Sessions query
    sessions_query = (
        db.table("calendar_sessions")
        .select("id,starts_at", count="exact")
        .eq("organization_id", org_id)
        .contains("student_ids", [member_id])
    )

    all_sessions_resp = supabase_execute(sessions_query, entity="sessions")
    total_sessions = all_sessions_resp.count or 0
    all_sessions = all_sessions_resp.data or []

    # Count sessions this month
    sessions_this_month = sum(
        1
        for s in all_sessions
        if s.get("starts_at") and s["starts_at"] >= month_start.isoformat()
    )

    # Weekly session counts (last 12 weeks)
    weekly_sessions: list[dict] = []
    for i in range(12):
        week_start = twelve_weeks_ago + timedelta(weeks=i)
        week_end = week_start + timedelta(weeks=1)
        count = sum(
            1
            for s in all_sessions
            if s.get("starts_at")
            and week_start.isoformat() <= s["starts_at"] < week_end.isoformat()
        )
        weekly_sessions.append({
            "week": week_start.strftime("%d/%m"),
            "count": count,
        })

    # Assignments
    sa_resp = supabase_execute(
        db.table("student_assignments")
        .select("id,assignment_id,status,grade", count="exact")
        .eq("organization_id", org_id)
        .eq("student_id", member_id),
        entity="student_assignments",
    )
    all_sa = sa_resp.data or []
    total_assignments = sa_resp.count or 0

    # Filter by teacher if not admin
    if role != "admin" and all_sa:
        a_ids = list({sa["assignment_id"] for sa in all_sa})
        a_resp = supabase_execute(
            db.table("assignments")
            .select("id,title,teacher_id")
            .in_("id", a_ids),
            entity="assignments",
        )
        teacher_assignment_ids = {
            a["id"] for a in (a_resp.data or []) if a.get("teacher_id") == teacher_id
        }
        all_sa = [sa for sa in all_sa if sa["assignment_id"] in teacher_assignment_ids]
        total_assignments = len(all_sa)

    completed = sum(
        1 for sa in all_sa if sa.get("status") in ("submitted", "graded")
    )
    graded = [sa for sa in all_sa if sa.get("grade") is not None]
    avg_grade = (
        round(sum(sa["grade"] for sa in graded) / len(graded), 1) if graded else None
    )
    completion_rate = round(completed / total_assignments, 2) if total_assignments else 0

    # Grade list for chart
    grade_list = []
    if graded:
        # Fetch assignment titles
        graded_a_ids = list({sa["assignment_id"] for sa in graded})
        titles_resp = supabase_execute(
            db.table("assignments")
            .select("id,title")
            .in_("id", graded_a_ids),
            entity="assignments",
        )
        title_map = {a["id"]: a.get("title") or "Sem título" for a in (titles_resp.data or [])}
        for sa in graded:
            grade_list.append({
                "title": title_map.get(sa["assignment_id"], "Sem título"),
                "grade": sa["grade"],
            })

    return {
        "total_sessions": total_sessions,
        "sessions_this_month": sessions_this_month,
        "total_assignments": total_assignments,
        "completed_assignments": completed,
        "average_grade": avg_grade,
        "completion_rate": completion_rate,
        "weekly_sessions": weekly_sessions,
        "grade_list": grade_list,
    }


# ── Teacher stats (admin-only) ──────────────────────────────────


def get_teacher_stats(
    db: Client,
    org_id: str,
    teacher_id: str,
) -> dict:
    """Aggregate statistics for a teacher: sessions, hours, earnings."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    twelve_weeks_ago = now - timedelta(weeks=12)

    # All sessions taught by this teacher
    all_sessions_resp = supabase_execute(
        db.table("calendar_sessions")
        .select("id,starts_at,ends_at", count="exact")
        .eq("organization_id", org_id)
        .eq("teacher_id", teacher_id),
        entity="sessions",
    )
    total_sessions = all_sessions_resp.count or 0
    all_sessions = all_sessions_resp.data or []

    # Sessions this month
    sessions_this_month = sum(
        1
        for s in all_sessions
        if s.get("starts_at") and s["starts_at"] >= month_start.isoformat()
    )

    # Total hours (sum of session durations)
    total_hours = 0.0
    for s in all_sessions:
        start = s.get("starts_at")
        end = s.get("ends_at")
        if start and end:
            try:
                dt_start = datetime.fromisoformat(start.replace("Z", "+00:00"))
                dt_end = datetime.fromisoformat(end.replace("Z", "+00:00"))
                total_hours += (dt_end - dt_start).total_seconds() / 3600
            except (ValueError, TypeError):
                pass
    total_hours = round(total_hours, 1)

    # Weekly session counts (last 12 weeks)
    weekly_sessions: list[dict] = []
    for i in range(12):
        week_start = twelve_weeks_ago + timedelta(weeks=i)
        week_end = week_start + timedelta(weeks=1)
        count = sum(
            1
            for s in all_sessions
            if s.get("starts_at")
            and week_start.isoformat() <= s["starts_at"] < week_end.isoformat()
        )
        weekly_sessions.append({
            "week": week_start.strftime("%d/%m"),
            "count": count,
        })

    # Fetch hourly rate from profile
    profile_resp = supabase_execute(
        db.table("profiles")
        .select("hourly_rate")
        .eq("id", teacher_id)
        .limit(1),
        entity="profile",
    )
    profile = (profile_resp.data or [{}])[0]
    hourly_rate = profile.get("hourly_rate")

    total_earnings = (
        round(total_hours * hourly_rate, 2)
        if hourly_rate is not None
        else None
    )

    return {
        "total_sessions": total_sessions,
        "sessions_this_month": sessions_this_month,
        "total_hours": total_hours,
        "hourly_rate": hourly_rate,
        "total_earnings": total_earnings,
        "weekly_sessions": weekly_sessions,
    }
