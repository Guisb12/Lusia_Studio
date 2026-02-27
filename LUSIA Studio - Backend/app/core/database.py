from supabase import Client, create_client

from app.core.config import settings

# Lazily initialized clients to avoid import-time failures.
supabase_b2b: Client | None = None
supabase_content: Client | None = None


def _build_b2b_client() -> Client:
    return create_client(settings.SUPABASE_URL_B2B, settings.SUPABASE_SERVICE_KEY_B2B)


def _build_content_client() -> Client:
    if not settings.SUPABASE_URL_B2C or not settings.SUPABASE_SERVICE_KEY_B2C:
        raise RuntimeError(
            "B2C Supabase is not configured. Set SUPABASE_URL_B2C and SUPABASE_SERVICE_KEY_B2C "
            "before using content endpoints."
        )
    return create_client(settings.SUPABASE_URL_B2C, settings.SUPABASE_SERVICE_KEY_B2C)


def get_b2b_db() -> Client:
    """Get B2B database client (users/orgs)."""
    global supabase_b2b
    if supabase_b2b is None:
        supabase_b2b = _build_b2b_client()
    return supabase_b2b


def get_content_db() -> Client:
    """Get content database client (exams/questions - READ ONLY)."""
    # All content is now in the B2B database
    return get_b2b_db()
