from fastapi import APIRouter

from app.api.http.routers import (
    analytics,
    artifacts,
    assignments,
    auth,
    calendar,
    chat,
    classrooms,
    diagram_generation,
    document_upload,
    grades,
    health,
    materials,
    members,
    note_generation,
    onboarding_objectives,
    organizations,
    presentation_generation,
    quiz_generation,
    quiz_questions,
    session_types,
    subjects,
    wizard,
    worksheet_generation,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(
    organizations.router, prefix="/organizations", tags=["organizations"]
)
api_router.include_router(classrooms.router, prefix="/classrooms", tags=["classrooms"])
api_router.include_router(members.router, prefix="/members", tags=["members"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(subjects.router, prefix="/subjects", tags=["subjects"])
api_router.include_router(calendar.router, prefix="/calendar", tags=["calendar"])
api_router.include_router(materials.router, prefix="/materials", tags=["materials"])
api_router.include_router(artifacts.router, prefix="/artifacts", tags=["artifacts"])
api_router.include_router(assignments.router, prefix="/assignments", tags=["assignments"])
api_router.include_router(grades.router, prefix="/grades", tags=["grades"])
api_router.include_router(
    quiz_questions.router,
    prefix="/quiz-questions",
    tags=["quiz-questions"],
)
api_router.include_router(
    document_upload.router,
    prefix="/documents",
    tags=["documents"],
)
api_router.include_router(
    quiz_generation.router,
    prefix="/quiz-generation",
    tags=["quiz-generation"],
)
api_router.include_router(
    worksheet_generation.router,
    prefix="/worksheet-generation",
    tags=["worksheet-generation"],
)
api_router.include_router(
    presentation_generation.router,
    prefix="/presentations",
    tags=["presentations"],
)
api_router.include_router(
    note_generation.router,
    prefix="/notes",
    tags=["notes"],
)
api_router.include_router(
    diagram_generation.router,
    prefix="/diagrams",
    tags=["diagrams"],
)
api_router.include_router(
    session_types.router,
    prefix="/session-types",
    tags=["session-types"],
)
api_router.include_router(
    analytics.router,
    prefix="/analytics",
    tags=["analytics"],
)
api_router.include_router(
    onboarding_objectives.router,
    prefix="/onboarding-objectives",
    tags=["onboarding-objectives"],
)
api_router.include_router(
    wizard.router,
    prefix="/wizard",
    tags=["wizard"],
)
