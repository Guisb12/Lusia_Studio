from fastapi import Depends, HTTPException, status

from app.core.security import get_current_user


def require_role(allowed_roles: list[str]):
    """
    Dependency to check if user has required role.
    Usage: require_role(["admin", "teacher"])
    """

    async def role_checker(current_user: dict = Depends(get_current_user)):
        role = current_user.get("role")
        if not role or role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role}' not allowed. Required: {allowed_roles}",
            )
        return current_user

    return role_checker


# Common role dependencies
require_admin = require_role(["admin"])
require_teacher = require_role(["admin", "teacher"])
require_student = require_role(["student"])
