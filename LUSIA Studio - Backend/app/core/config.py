from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Environment
    ENVIRONMENT: str = "development"

    # Frontend URL (for CORS)
    FRONTEND_URL: str = "http://localhost:3000"

    # B2B Supabase (main database - org/users)
    SUPABASE_URL_B2B: str
    SUPABASE_KEY_B2B: Optional[str] = None
    SUPABASE_SERVICE_KEY_B2B: str

    # B2C Supabase (content library - READ ONLY)
    SUPABASE_URL_B2C: Optional[str] = None
    SUPABASE_SERVICE_KEY_B2C: Optional[str] = None

    # OpenAI key for AI features
    OPENAI_API_KEY: Optional[str] = None

    # Redis (for ARQ job queue)
    REDIS_URL: str = "redis://localhost:6379"

    # Mistral API for PDF OCR
    MISTRAL_API_KEY: Optional[str] = None

    # OpenRouter API for AI categorization and question extraction
    OPENROUTER_API_KEY: Optional[str] = None
    OPENROUTER_MODEL: str = "google/gemini-3-flash-preview"

    # Pipeline config
    PIPELINE_MAX_CONCURRENCY: int = 3
    DOCUMENT_MAX_SIZE_MB: int = 50

    # App-level signing secret for enrollment flow tokens
    APP_AUTH_SECRET: str
    ENROLLMENT_TOKEN_TTL_SECONDS: int = 604800

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
