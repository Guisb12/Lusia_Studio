import asyncio
import os
import unittest

os.environ.setdefault("SUPABASE_URL_B2B", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY_B2B", "test-service-key")
os.environ.setdefault("APP_AUTH_SECRET", "test-app-auth-secret")

from fastapi import HTTPException

from app.api.deps import require_role
from app.api.http.services.enrollment_service import (
    issue_enrollment_token,
    verify_enrollment_token,
)
from app.core.config import settings


class RequireRoleTests(unittest.TestCase):
    def test_require_role_allows_expected_role(self):
        checker = require_role(["admin", "teacher"])
        current_user = {"id": "u1", "role": "teacher"}

        result = asyncio.run(checker(current_user=current_user))
        self.assertEqual(result, current_user)

    def test_require_role_rejects_missing_role_with_403(self):
        checker = require_role(["admin"])

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(checker(current_user={"id": "u1"}))

        self.assertEqual(ctx.exception.status_code, 403)


class EnrollmentTokenTests(unittest.TestCase):
    def test_issue_and_verify_enrollment_token(self):
        token = issue_enrollment_token("org-123", "teacher", ttl_seconds=60)
        payload = verify_enrollment_token(token)

        self.assertEqual(payload["organization_id"], "org-123")
        self.assertEqual(payload["role_hint"], "teacher")
        self.assertIn("exp", payload)

    def test_verify_rejects_tampered_token(self):
        token = issue_enrollment_token("org-123", "student", ttl_seconds=60)
        payload_part, signature_part = token.split(".", 1)
        tampered_payload_part = payload_part[:-1] + ("A" if payload_part[-1] != "A" else "B")
        tampered = f"{tampered_payload_part}.{signature_part}"

        with self.assertRaises(ValueError):
            verify_enrollment_token(tampered)

    def test_verify_rejects_expired_token(self):
        token = issue_enrollment_token("org-123", "student", ttl_seconds=-1)
        with self.assertRaises(ValueError):
            verify_enrollment_token(token)

    def test_issue_fails_without_app_auth_secret(self):
        original_secret = settings.APP_AUTH_SECRET
        settings.APP_AUTH_SECRET = ""
        try:
            with self.assertRaises(RuntimeError):
                issue_enrollment_token("org-123", "student")
        finally:
            settings.APP_AUTH_SECRET = original_secret


if __name__ == "__main__":
    unittest.main()
