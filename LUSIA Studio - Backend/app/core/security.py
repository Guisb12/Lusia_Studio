from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client

from app.core.database import get_b2b_db

security = HTTPBearer()


def _read_user_attr(user_obj, key: str):
    if isinstance(user_obj, dict):
        return user_obj.get(key)
    return getattr(user_obj, key, None)


async def get_authenticated_supabase_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Client = Depends(get_b2b_db),
):
    token = credentials.credentials
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
        )

    try:
        user_response = db.auth.get_user(token)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(exc)}",
        ) from exc

    supabase_user = getattr(user_response, "user", None)
    if not supabase_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )

    email_verified_at = _read_user_attr(supabase_user, "email_confirmed_at") or _read_user_attr(
        supabase_user, "confirmed_at"
    )

    return {
        "id": str(_read_user_attr(supabase_user, "id")),
        "email": _read_user_attr(supabase_user, "email"),
        "email_verified": bool(email_verified_at),
        "email_verified_at": email_verified_at,
        "raw": supabase_user,
    }


async def get_current_user(
    auth_user: dict = Depends(get_authenticated_supabase_user),
    db: Client = Depends(get_b2b_db),
):
    """
    Verify JWT token and get current user from Supabase Auth.
    """
    try:
        profile = (
            db.table("profiles").select("*").eq("id", auth_user["id"]).single().execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch user profile: {str(exc)}",
        ) from exc

    if not profile.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User profile not found. Complete organization registration or enrollment.",
        )

    merged = profile.data
    if not merged.get("email") and auth_user.get("email"):
        merged["email"] = auth_user["email"]
    merged["email_verified"] = bool(auth_user.get("email_verified", False))
    merged["email_verified_at"] = auth_user.get("email_verified_at")
    return merged


async def get_current_organization(
    current_user: dict = Depends(get_current_user),
) -> str:
    """
    Get current user's organization_id.
    """
    return current_user["organization_id"]
