from fastapi import APIRouter

from app.api.http.routers import (
    artifacts,
    assignments,
    auth,
    calendar,
    chat,
    classrooms,
    document_upload,
    grades,
    health,
    materials,
    members,
    organizations,
    quiz_generation,
    quiz_questions,
    subjects,
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
