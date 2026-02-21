import os
import time
import unittest

os.environ.setdefault("SUPABASE_URL_B2B", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY_B2B", "test-service-key")
os.environ.setdefault("APP_AUTH_SECRET", "test-app-auth-secret")

from pydantic import ValidationError

from app.api.http.schemas.auth import MemberCompleteRequest
from app.api.http.services.auth_service import (
    generate_enrollment_code,
    normalize_enrollment_code,
)
from app.api.http.services.enrollment_service import issue_enrollment_token, verify_enrollment_token
from app.core.config import settings


class EnrollmentCodeTests(unittest.TestCase):
    def test_normalize_enrollment_code(self):
        normalized = normalize_enrollment_code("  Escola_XY - PROF - A1B2C3  ")
        self.assertEqual(normalized, "escola-xy-prof-a1b2c3")

    def test_generate_enrollment_code_is_normalized(self):
        code = generate_enrollment_code("my-school", "teacher")
        self.assertTrue(code.startswith("my-school-prof-"))
        self.assertEqual(code, code.lower())


class MemberCompleteSchemaTests(unittest.TestCase):
    def test_requires_token_or_code(self):
        with self.assertRaises(ValidationError):
            MemberCompleteRequest(full_name="Jane")

    def test_allows_enrollment_code_only(self):
        payload = MemberCompleteRequest(full_name="Jane", enrollment_code="abc-prof-123")
        self.assertEqual(payload.enrollment_code, "abc-prof-123")

    def test_allows_enrollment_token_only(self):
        payload = MemberCompleteRequest(full_name="Jane", enrollment_token="dummy.token")
        self.assertEqual(payload.enrollment_token, "dummy.token")


class EnrollmentTokenLifetimeTests(unittest.TestCase):
    def test_issue_uses_configurable_default_ttl(self):
        original_ttl = settings.ENROLLMENT_TOKEN_TTL_SECONDS
        settings.ENROLLMENT_TOKEN_TTL_SECONDS = 42
        try:
            token = issue_enrollment_token("org-123", "student")
            payload = verify_enrollment_token(token)
            self.assertEqual(payload["exp"] - payload["iat"], 42)
            self.assertGreaterEqual(payload["exp"], int(time.time()))
        finally:
            settings.ENROLLMENT_TOKEN_TTL_SECONDS = original_ttl


if __name__ == "__main__":
    unittest.main()
