import base64
import hashlib
import hmac
import json
import time
from typing import Literal

from app.core.config import settings

RoleHint = Literal["teacher", "student"]


def _get_secret() -> bytes:
    secret = settings.APP_AUTH_SECRET
    if not secret:
        raise RuntimeError(
            "APP_AUTH_SECRET must be set for enrollment token signing."
        )
    return secret.encode("utf-8")


def _urlsafe_b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _urlsafe_b64decode(data: str) -> bytes:
    pad_len = (4 - len(data) % 4) % 4
    return base64.urlsafe_b64decode(f"{data}{'=' * pad_len}")


def issue_enrollment_token(
    organization_id: str,
    role_hint: RoleHint,
    ttl_seconds: int | None = None,
) -> str:
    ttl = ttl_seconds if ttl_seconds is not None else settings.ENROLLMENT_TOKEN_TTL_SECONDS
    now = int(time.time())
    payload = {
        "organization_id": organization_id,
        "role_hint": role_hint,
        "iat": now,
        "exp": now + int(ttl),
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode(
        "utf-8"
    )
    signature = hmac.new(_get_secret(), payload_bytes, hashlib.sha256).digest()
    return f"{_urlsafe_b64encode(payload_bytes)}.{_urlsafe_b64encode(signature)}"


def verify_enrollment_token(token: str) -> dict:
    try:
        payload_part, signature_part = token.split(".", 1)
        payload_bytes = _urlsafe_b64decode(payload_part)
        given_sig = _urlsafe_b64decode(signature_part)
    except Exception as exc:
        raise ValueError("Malformed enrollment token") from exc

    expected_sig = hmac.new(_get_secret(), payload_bytes, hashlib.sha256).digest()
    if not hmac.compare_digest(given_sig, expected_sig):
        raise ValueError("Invalid enrollment token signature")

    try:
        payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception as exc:
        raise ValueError("Invalid enrollment token payload") from exc

    exp = int(payload.get("exp", 0))
    iat = int(payload.get("iat", 0))
    if exp <= iat:
        raise ValueError("Enrollment token lifetime is invalid")
    if exp <= int(time.time()):
        raise ValueError("Enrollment token expired")

    role_hint = payload.get("role_hint")
    if role_hint not in ("teacher", "student"):
        raise ValueError("Enrollment token role is invalid")

    organization_id = payload.get("organization_id")
    if not organization_id:
        raise ValueError("Enrollment token organization is missing")

    return payload
