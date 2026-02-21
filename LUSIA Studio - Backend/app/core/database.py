import inspect

import httpx
from supabase import Client, create_client
try:
    from gotrue.http_clients import SyncClient as GoTrueSyncClient
except ModuleNotFoundError:
    # supabase>=2.16 moved auth client package from gotrue -> supabase_auth
    from supabase_auth.http_clients import SyncClient as GoTrueSyncClient

from app.core.config import settings

# Compatibility shim:
# gotrue may pass `proxy=` but older httpx expects `proxies=`.
# This keeps current pinned deps usable on local environments.
if "proxy" not in inspect.signature(httpx.Client.__init__).parameters:
    _orig_init = GoTrueSyncClient.__init__

    def _patched_init(self, *args, proxy=None, **kwargs):
        if proxy is not None and "proxies" not in kwargs:
            kwargs["proxies"] = proxy
        return _orig_init(self, *args, **kwargs)

    GoTrueSyncClient.__init__ = _patched_init

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
