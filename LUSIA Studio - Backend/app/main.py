from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.http.router import api_router
from app.core.config import settings

app = FastAPI(
    title="LUSIA Studio API",
    description="",
    version="0.1.0",
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
