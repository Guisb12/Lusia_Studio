import os
import unittest
from unittest.mock import patch

os.environ.setdefault("SUPABASE_URL_B2B", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY_B2B", "test-service-key")
os.environ.setdefault("APP_AUTH_SECRET", "test-app-auth-secret")

from app.api.http.schemas.calendar import SessionUpdate
from app.api.http.services import calendar_service


class CalendarServiceTests(unittest.TestCase):
    def test_update_keeps_existing_inactive_session_type_without_resnapshot(self):
        existing = {
            "id": "session-1",
            "organization_id": "org-1",
            "teacher_id": "teacher-1",
            "session_type_id": "legacy-type",
            "starts_at": "2026-03-12T10:00:00",
            "ends_at": "2026-03-12T11:00:00",
        }
        payload = SessionUpdate(session_type_id="legacy-type", title="Updated title")

        with patch.object(calendar_service, "_snapshot_session_type") as snapshot_mock:
            provided, update_data = calendar_service._build_session_update_data(
                db=None,  # type: ignore[arg-type]
                org_id="org-1",
                existing=existing,
                payload=payload,
            )

        self.assertEqual(provided, {"session_type_id", "title"})
        self.assertEqual(update_data, {"title": "Updated title"})
        snapshot_mock.assert_not_called()

    def test_update_resnapshots_when_session_type_changes(self):
        existing = {
            "id": "session-1",
            "organization_id": "org-1",
            "teacher_id": "teacher-1",
            "session_type_id": "legacy-type",
            "starts_at": "2026-03-12T10:00:00",
            "ends_at": "2026-03-12T11:00:00",
        }
        payload = SessionUpdate(session_type_id="active-type")

        snapshot = {
            "session_type_id": "active-type",
            "snapshot_student_price": 25.0,
            "snapshot_teacher_cost": 10.0,
        }
        with patch.object(calendar_service, "_snapshot_session_type", return_value=snapshot) as snapshot_mock:
            provided, update_data = calendar_service._build_session_update_data(
                db=None,  # type: ignore[arg-type]
                org_id="org-1",
                existing=existing,
                payload=payload,
            )

        self.assertEqual(provided, {"session_type_id"})
        self.assertEqual(update_data, snapshot)
        snapshot_mock.assert_called_once_with(None, "org-1", "active-type")
