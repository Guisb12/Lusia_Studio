"""
Onboarding objectives for trial organizations.

Returns a set of guided objectives with real-time progress so admins
of trial centres can track what to explore between onboarding meetings.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends

from app.api.deps import require_admin
from app.api.http.schemas.onboarding_objectives import (
    ObjectiveOut,
    OnboardingObjectivesResponse,
)
from app.core.database import get_b2b_db

router = APIRouter()


@router.get("", response_model=OnboardingObjectivesResponse)
async def get_onboarding_objectives(
    current_user: dict = Depends(require_admin),
):
    org_id = current_user.get("organization_id")
    if not org_id:
        return OnboardingObjectivesResponse(objectives=[], all_completed=False)

    db = get_b2b_db()

    # Check if the organization is on trial
    org_res = (
        db.table("organizations")
        .select("status")
        .eq("id", org_id)
        .single()
        .execute()
    )
    if not org_res.data or org_res.data.get("status") != "trial":
        return OnboardingObjectivesResponse(objectives=[], all_completed=False)

    # --- Gather metrics in parallel-ish (sync client, but fast queries) ---

    # 1. Active students count
    students_res = (
        db.table("profiles")
        .select("id", count="exact")
        .eq("organization_id", org_id)
        .eq("role", "student")
        .eq("status", "active")
        .execute()
    )
    student_count = students_res.count if students_res.count is not None else 0

    # 2. Sessions scheduled for the upcoming week (next Mon-Sun)
    today = datetime.utcnow().date()
    days_until_monday = (7 - today.weekday()) % 7
    if days_until_monday == 0:
        days_until_monday = 7
    next_monday = today + timedelta(days=days_until_monday)
    next_sunday = next_monday + timedelta(days=6)

    sessions_res = (
        db.table("calendar_sessions")
        .select("id", count="exact")
        .eq("organization_id", org_id)
        .gte("starts_at", next_monday.isoformat())
        .lte("starts_at", f"{next_sunday.isoformat()}T23:59:59")
        .execute()
    )
    session_count = sessions_res.count if sessions_res.count is not None else 0

    # 3. Active classrooms count
    classrooms_res = (
        db.table("classrooms")
        .select("id", count="exact")
        .eq("organization_id", org_id)
        .eq("status", "active")
        .execute()
    )
    classroom_count = classrooms_res.count if classrooms_res.count is not None else 0

    # --- Build objectives ---
    student_target = 3
    session_target = 1
    classroom_target = 1

    objectives = [
        ObjectiveOut(
            id="enroll_students",
            title="Ajuda os teus alunos a criar conta",
            description="Partilha o código de inscrição com pelo menos 3 alunos para que possam aceder à plataforma.",
            current=min(student_count, student_target),
            target=student_target,
            completed=student_count >= student_target,
        ),
        ObjectiveOut(
            id="schedule_sessions",
            title="Agenda as sessões da próxima semana",
            description="Cria pelo menos uma sessão no calendário para a próxima semana.",
            current=min(session_count, session_target),
            target=session_target,
            completed=session_count >= session_target,
        ),
        ObjectiveOut(
            id="create_classroom",
            title="Cria a tua primeira turma",
            description="Organiza os teus alunos criando uma turma no painel de turmas.",
            current=min(classroom_count, classroom_target),
            target=classroom_target,
            completed=classroom_count >= classroom_target,
        ),
    ]

    all_done = all(o.completed for o in objectives)

    return OnboardingObjectivesResponse(
        objectives=objectives,
        all_completed=all_done,
    )
