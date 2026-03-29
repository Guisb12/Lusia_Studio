import os
import unittest
from unittest.mock import patch

os.environ.setdefault("SUPABASE_URL_B2B", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY_B2B", "test-service-key")
os.environ.setdefault("APP_AUTH_SECRET", "test-app-auth-secret")

from fastapi import HTTPException

from app.api.http.schemas.grades import (
    ExamGradeUpdateIn,
    ElementGradeUpdateIn,
    EnrollmentCreateIn,
    EnrollmentUpdateIn,
    GradeSettingsCreateIn,
    GradeSettingsUpdateIn,
    PastYearSetupIn,
    PeriodGradeUpdateIn,
)
from app.api.http.services import grades_service


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, db, table_name: str):
        self.db = db
        self.table_name = table_name
        self.operation = "select"
        self.select_clause = "*"
        self.payload = None
        self.filters: list[tuple[str, str, object]] = []
        self.orders: list[tuple[str, bool]] = []
        self.limit_value = None

    def select(self, clause: str):
        self.operation = "select"
        self.select_clause = clause
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def eq(self, key: str, value):
        self.filters.append(("eq", key, value))
        return self

    def neq(self, key: str, value):
        self.filters.append(("neq", key, value))
        return self

    def in_(self, key: str, values):
        self.filters.append(("in", key, list(values)))
        return self

    def is_(self, key: str, value):
        self.filters.append(("is", key, value))
        return self

    def order(self, key: str, desc: bool = False):
        self.orders.append((key, desc))
        return self

    def limit(self, value: int):
        self.limit_value = value
        return self

    def execute(self):
        return self.db.run(self)


class FakeDB:
    def __init__(self, tables: dict[str, list[dict]]):
        self.tables = {name: [dict(row) for row in rows] for name, rows in tables.items()}
        self._counter = 0

    def table(self, table_name: str) -> FakeQuery:
        self.tables.setdefault(table_name, [])
        return FakeQuery(self, table_name)

    def run(self, query: FakeQuery) -> FakeResponse:
        if query.operation == "insert":
            return FakeResponse(self._insert(query.table_name, query.payload))
        if query.operation == "update":
            return FakeResponse(self._update(query))
        if query.operation == "delete":
            return FakeResponse(self._delete(query))
        return FakeResponse(self._select(query))

    def _matches(self, row: dict, filters: list[tuple[str, str, object]]) -> bool:
        for op, key, value in filters:
            candidate = row.get(key)
            if op == "eq" and candidate != value:
                return False
            if op == "neq" and candidate == value:
                return False
            if op == "in" and candidate not in value:
                return False
            if op == "is":
                wants_null = str(value).lower() == "null"
                if wants_null and candidate is not None:
                    return False
                if not wants_null and candidate is None:
                    return False
        return True

    def _select(self, query: FakeQuery) -> list[dict]:
        rows = [dict(row) for row in self.tables[query.table_name] if self._matches(row, query.filters)]
        for key, desc in reversed(query.orders):
            rows.sort(key=lambda row: (row.get(key) is None, row.get(key)), reverse=desc)
        if query.limit_value is not None:
            rows = rows[: query.limit_value]
        return [self._hydrate_row(query.table_name, row, query.select_clause) for row in rows]

    def _insert(self, table_name: str, payload) -> list[dict]:
        items = payload if isinstance(payload, list) else [payload]
        inserted = []
        for item in items:
            row = dict(item)
            row.setdefault("id", self._next_id(table_name))
            row.setdefault("created_at", self._counter)
            row.setdefault("updated_at", self._counter)
            self.tables[table_name].append(row)
            inserted.append(dict(row))
        return inserted

    def _update(self, query: FakeQuery) -> list[dict]:
        updated = []
        for row in self.tables[query.table_name]:
            if not self._matches(row, query.filters):
                continue
            row.update(dict(query.payload or {}))
            row["updated_at"] = self._counter
            updated.append(dict(row))
        return updated

    def _delete(self, query: FakeQuery) -> list[dict]:
        kept = []
        deleted = []
        for row in self.tables[query.table_name]:
            if self._matches(row, query.filters):
                deleted.append(dict(row))
            else:
                kept.append(row)
        self.tables[query.table_name] = kept
        return deleted

    def _hydrate_row(self, table_name: str, row: dict, select_clause: str) -> dict:
        hydrated = dict(row)
        if table_name == "student_subject_enrollments" and "subjects(" in select_clause:
            subject = self._find("subjects", hydrated.get("subject_id"))
            hydrated["subjects"] = self._project_subject(subject)
        elif table_name == "student_subject_periods" and "student_subject_enrollments" in select_clause:
            enrollment = self._find("student_subject_enrollments", hydrated.get("enrollment_id"))
            hydrated["student_subject_enrollments"] = dict(enrollment) if enrollment else None
        elif table_name == "subject_evaluation_elements" and "student_subject_periods" in select_clause:
            period = self._find("student_subject_periods", hydrated.get("period_id"))
            if period:
                enrollment = self._find("student_subject_enrollments", period.get("enrollment_id"))
                hydrated["student_subject_periods"] = {
                    **dict(period),
                    "student_subject_enrollments": dict(enrollment) if enrollment else None,
                }
        return hydrated

    def _project_subject(self, subject: dict | None) -> dict | None:
        if not subject:
            return None
        return {
            "id": subject.get("id"),
            "slug": subject.get("slug"),
            "name": subject.get("name"),
            "color": subject.get("color"),
            "icon": subject.get("icon"),
            "affects_cfs": subject.get("affects_cfs"),
            "has_national_exam": subject.get("has_national_exam"),
        }

    def _find(self, table_name: str, row_id: str | None) -> dict | None:
        if row_id is None:
            return None
        for row in self.tables.get(table_name, []):
            if row.get("id") == row_id:
                return row
        return None

    def _next_id(self, table_name: str) -> str:
        self._counter += 1
        return f"{table_name}-{self._counter}"


class GradesServiceTests(unittest.TestCase):
    def setUp(self):
        self.supabase_patch = patch.object(
            grades_service,
            "supabase_execute",
            new=lambda query, entity=None: query.execute(),
        )
        self.supabase_patch.start()

    def tearDown(self):
        self.supabase_patch.stop()

    def test_current_year_setup_creates_periods_and_historical_import_does_not(self):
        db = FakeDB(
            {
                "subjects": [
                    {"id": "sub-port", "name": "Português", "slug": "secundario_port", "has_national_exam": True},
                    {"id": "sub-mat", "name": "Matemática A", "slug": "secundario_mat_a", "has_national_exam": True},
                ],
                "profiles": [{"id": "student-1"}],
                "student_grade_settings": [],
                "student_subject_enrollments": [],
                "student_subject_periods": [],
                "student_annual_subject_grades": [],
            }
        )

        payload = GradeSettingsCreateIn(
            academic_year="2025-2026",
            education_level="secundario",
            graduation_cohort_year=2026,
            regime="trimestral",
            period_weights=[33.33, 33.33, 33.34],
            subject_ids=["sub-port"],
            year_level="12",
            course="ciencias_tecnologias",
            exam_candidate_subject_ids=[],
            past_year_grades=[
                {
                    "subject_id": "sub-mat",
                    "year_level": "11",
                    "academic_year": "2024-2025",
                    "annual_grade": 16,
                }
            ],
        )

        grades_service.create_settings(db, "student-1", payload)

        current_enrollment = next(
            row for row in db.tables["student_subject_enrollments"] if row["academic_year"] == "2025-2026"
        )
        past_enrollment = next(
            row for row in db.tables["student_subject_enrollments"] if row["academic_year"] == "2024-2025"
        )

        current_periods = [
            row for row in db.tables["student_subject_periods"] if row["enrollment_id"] == current_enrollment["id"]
        ]
        past_periods = [
            row for row in db.tables["student_subject_periods"] if row["enrollment_id"] == past_enrollment["id"]
        ]

        self.assertEqual(len(current_periods), 3)
        self.assertEqual(past_periods, [])
        self.assertTrue(current_enrollment["is_exam_candidate"])

    def test_locked_year_rejects_period_and_element_mutations(self):
        db = FakeDB(
            {
                "subjects": [{"id": "sub-hist", "name": "História", "slug": "secundario_hist_a"}],
                "student_grade_settings": [
                    {
                        "id": "settings-locked",
                        "student_id": "student-1",
                        "academic_year": "2024-2025",
                        "education_level": "secundario",
                        "regime": "trimestral",
                        "period_weights": ["33.33", "33.33", "33.34"],
                        "is_locked": True,
                    }
                ],
                "student_subject_enrollments": [
                    {
                        "id": "enrollment-1",
                        "student_id": "student-1",
                        "subject_id": "sub-hist",
                        "academic_year": "2024-2025",
                        "year_level": "12",
                        "settings_id": "settings-locked",
                        "is_active": True,
                        "is_exam_candidate": False,
                    }
                ],
                "student_subject_periods": [
                    {
                        "id": "period-1",
                        "enrollment_id": "enrollment-1",
                        "period_number": 1,
                        "is_overridden": False,
                    }
                ],
                "subject_evaluation_elements": [
                    {
                        "id": "element-1",
                        "period_id": "period-1",
                        "element_type": "teste",
                        "label": "Teste 1",
                        "weight_percentage": "100",
                    }
                ],
            }
        )

        with self.assertRaises(HTTPException):
            grades_service.update_period_grade(
                db,
                "student-1",
                "period-1",
                PeriodGradeUpdateIn(pauta_grade=15),
            )

        with self.assertRaises(HTTPException):
            grades_service.update_element_grade(
                db,
                "student-1",
                "element-1",
                17,
            )

        created = grades_service.create_enrollment(
            db,
            "student-1",
            EnrollmentCreateIn(
                subject_id="sub-hist",
                academic_year="2024-2025",
                year_level="12",
                is_exam_candidate=False,
            ),
            "settings-locked",
        )
        created_periods = [
            row for row in db.tables["student_subject_periods"] if row["enrollment_id"] == created["id"]
        ]
        self.assertEqual(created_periods, [])

        updated_exam_flag = grades_service.update_enrollment(
            db,
            "student-1",
            "enrollment-1",
            EnrollmentUpdateIn(is_exam_candidate=True),
        )
        self.assertTrue(updated_exam_flag["enrollment"]["is_exam_candidate"])

        updated = grades_service.update_enrollment(
            db,
            "student-1",
            "enrollment-1",
            EnrollmentUpdateIn(is_active=False),
        )
        self.assertFalse(updated["enrollment"]["is_active"])

    def test_period_override_does_not_require_reason(self):
        db = FakeDB(
            {
                "subjects": [{"id": "sub-mat", "name": "Matemática", "slug": "secundario_mat_a"}],
                "student_grade_settings": [
                    {
                        "id": "settings-1",
                        "student_id": "student-1",
                        "academic_year": "2025-2026",
                        "education_level": "secundario",
                        "regime": "trimestral",
                        "period_weights": ["33.33", "33.33", "33.34"],
                        "is_locked": False,
                    }
                ],
                "student_subject_enrollments": [
                    {
                        "id": "enrollment-1",
                        "student_id": "student-1",
                        "subject_id": "sub-mat",
                        "academic_year": "2025-2026",
                        "year_level": "10",
                        "settings_id": "settings-1",
                        "is_active": True,
                        "is_exam_candidate": False,
                    }
                ],
                "student_subject_periods": [
                    {
                        "id": "period-1",
                        "enrollment_id": "enrollment-1",
                        "period_number": 1,
                        "pauta_grade": 14,
                        "calculated_grade": 14,
                        "is_overridden": False,
                        "override_reason": None,
                    }
                ],
                "subject_evaluation_elements": [],
                "student_annual_subject_grades": [],
                "student_subject_cfd": [],
            }
        )

        updated = grades_service.override_period_grade(
            db,
            "student-1",
            "period-1",
            grades_service.PeriodGradeOverrideIn(pauta_grade=17, override_reason=None),
        )

        self.assertEqual(updated["period"]["pauta_grade"], 17)
        self.assertTrue(updated["period"]["is_overridden"])
        self.assertIsNone(updated["period"]["override_reason"])

    def test_portuguese_exam_candidate_is_forced_true(self):
        db = FakeDB(
            {
                "subjects": [{"id": "sub-port", "name": "Português", "slug": "secundario_port", "has_national_exam": True}],
                "profiles": [{"id": "student-1"}],
                "student_grade_settings": [],
                "student_subject_enrollments": [],
                "student_subject_periods": [],
                "student_annual_subject_grades": [],
            }
        )

        payload = GradeSettingsCreateIn(
            academic_year="2025-2026",
            education_level="secundario",
            graduation_cohort_year=2026,
            regime="trimestral",
            period_weights=[33.33, 33.33, 33.34],
            subject_ids=["sub-port"],
            year_level="12",
            course="linguas_humanidades",
            exam_candidate_subject_ids=[],
        )

        grades_service.create_settings(db, "student-1", payload)
        enrollment = db.tables["student_subject_enrollments"][0]
        self.assertTrue(enrollment["is_exam_candidate"])

        updated = grades_service.update_enrollment(
            db,
            "student-1",
            enrollment["id"],
            EnrollmentUpdateIn(is_exam_candidate=False),
        )
        self.assertTrue(updated["enrollment"]["is_exam_candidate"])

    def test_cannot_deactivate_enrollment_with_existing_data(self):
        db = FakeDB(
            {
                "subjects": [{"id": "sub-mat", "name": "Matemática", "slug": "secundario_mat_a"}],
                "student_grade_settings": [
                    {
                        "id": "settings-1",
                        "student_id": "student-1",
                        "academic_year": "2025-2026",
                        "education_level": "secundario",
                        "regime": "trimestral",
                        "period_weights": ["33.33", "33.33", "33.34"],
                        "is_locked": False,
                    }
                ],
                "student_subject_enrollments": [
                    {
                        "id": "enrollment-1",
                        "student_id": "student-1",
                        "subject_id": "sub-mat",
                        "academic_year": "2025-2026",
                        "year_level": "10",
                        "settings_id": "settings-1",
                        "is_active": True,
                        "is_exam_candidate": False,
                    }
                ],
                "student_subject_periods": [
                    {
                        "id": "period-1",
                        "enrollment_id": "enrollment-1",
                        "period_number": 1,
                        "pauta_grade": 16,
                        "qualitative_grade": None,
                    }
                ],
                "subject_evaluation_elements": [],
                "student_annual_subject_grades": [],
                "student_subject_cfd": [],
            }
        )

        with self.assertRaises(HTTPException) as ctx:
            grades_service.update_enrollment(
                db,
                "student-1",
                "enrollment-1",
                EnrollmentUpdateIn(is_active=False),
            )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("não pode ser removida", ctx.exception.detail)

    def test_get_board_data_returns_empty_periods_for_locked_year(self):
        db = FakeDB(
            {
                "subjects": [{"id": "sub-port", "name": "Português", "slug": "secundario_port"}],
                "student_grade_settings": [
                    {
                        "id": "settings-locked",
                        "student_id": "student-1",
                        "academic_year": "2024-2025",
                        "education_level": "secundario",
                        "regime": "trimestral",
                        "period_weights": ["33.33", "33.33", "33.34"],
                        "is_locked": True,
                    }
                ],
                "student_subject_enrollments": [
                    {
                        "id": "enrollment-1",
                        "student_id": "student-1",
                        "subject_id": "sub-port",
                        "academic_year": "2024-2025",
                        "year_level": "11",
                        "settings_id": "settings-locked",
                        "is_active": True,
                        "is_exam_candidate": False,
                    }
                ],
                "student_subject_periods": [
                    {"id": "period-1", "enrollment_id": "enrollment-1", "period_number": 1}
                ],
                "student_annual_subject_grades": [
                    {
                        "id": "annual-1",
                        "enrollment_id": "enrollment-1",
                        "raw_annual": "16",
                        "annual_grade": 16,
                        "is_locked": True,
                    }
                ],
            }
        )

        board = grades_service.get_board_data(db, "student-1", "2024-2025")

        self.assertTrue(board["settings"]["is_locked"])
        self.assertEqual(len(board["subjects"]), 1)
        self.assertEqual(board["subjects"][0]["periods"], [])
        self.assertEqual(board["subjects"][0]["annual_grade"]["annual_grade"], 16)

    def test_get_cfs_dashboard_keeps_cfd_and_cfs_calculations_after_batching(self):
        db = FakeDB(
            {
                "subjects": [
                    {"id": "sub-mat", "name": "Matemática A", "slug": "secundario_mat_a", "affects_cfs": True, "has_national_exam": True},
                    {"id": "sub-port", "name": "Português", "slug": "secundario_port", "affects_cfs": True, "has_national_exam": True},
                ],
                "student_grade_settings": [
                    {
                        "id": "settings-2025",
                        "student_id": "student-1",
                        "academic_year": "2025-2026",
                        "education_level": "secundario",
                        "graduation_cohort_year": 2026,
                        "regime": "trimestral",
                        "period_weights": ["33.33", "33.33", "33.34"],
                        "is_locked": False,
                    }
                ],
                "student_subject_enrollments": [
                    {
                        "id": "mat-10",
                        "student_id": "student-1",
                        "subject_id": "sub-mat",
                        "academic_year": "2023-2024",
                        "year_level": "10",
                        "settings_id": "settings-2025",
                        "is_active": True,
                        "is_exam_candidate": False,
                    },
                    {
                        "id": "mat-11",
                        "student_id": "student-1",
                        "subject_id": "sub-mat",
                        "academic_year": "2024-2025",
                        "year_level": "11",
                        "settings_id": "settings-2025",
                        "is_active": True,
                        "is_exam_candidate": False,
                    },
                    {
                        "id": "mat-12",
                        "student_id": "student-1",
                        "subject_id": "sub-mat",
                        "academic_year": "2025-2026",
                        "year_level": "12",
                        "settings_id": "settings-2025",
                        "is_active": True,
                        "is_exam_candidate": False,
                    },
                    {
                        "id": "port-12",
                        "student_id": "student-1",
                        "subject_id": "sub-port",
                        "academic_year": "2025-2026",
                        "year_level": "12",
                        "settings_id": "settings-2025",
                        "is_active": True,
                        "is_exam_candidate": False,
                    },
                ],
                "student_annual_subject_grades": [
                    {"id": "ag-1", "enrollment_id": "mat-10", "annual_grade": 14, "raw_annual": "14"},
                    {"id": "ag-2", "enrollment_id": "mat-11", "annual_grade": 15, "raw_annual": "15"},
                    {"id": "ag-3", "enrollment_id": "mat-12", "annual_grade": 16, "raw_annual": "16"},
                    {"id": "ag-4", "enrollment_id": "port-12", "annual_grade": 13, "raw_annual": "13"},
                ],
                "student_subject_cfd": [
                    {
                        "id": "cfd-port",
                        "student_id": "student-1",
                        "subject_id": "sub-port",
                        "academic_year": "2025-2026",
                        "exam_grade": 14,
                        "exam_grade_raw": 140,
                        "is_finalized": False,
                    }
                ],
                "student_cfs_snapshot": [],
            }
        )

        dashboard = grades_service.get_cfs_dashboard(db, "student-1")

        self.assertEqual(dashboard["computed_cfs"], 14.5)
        self.assertEqual(dashboard["computed_dges"], 145)

        math_cfd = next(row for row in dashboard["cfds"] if row["subject_id"] == "sub-mat")
        port_cfd = next(row for row in dashboard["cfds"] if row["subject_id"] == "sub-port")

        self.assertEqual(math_cfd["cfd_grade"], 15)
        self.assertEqual(port_cfd["cfd_grade"], 13)
        self.assertTrue(port_cfd["is_exam_candidate"])
        self.assertEqual(port_cfd["exam_grade_raw"], 140)

    def test_get_board_data_returns_period_summaries_without_embedded_elements(self):
        db = FakeDB(
            {
                "subjects": [{"id": "sub-mat", "name": "Matemática", "slug": "secundario_mat_a"}],
                "student_grade_settings": [
                    {
                        "id": "settings-1",
                        "student_id": "student-1",
                        "academic_year": "2025-2026",
                        "education_level": "secundario",
                        "regime": "trimestral",
                        "period_weights": ["33.33", "33.33", "33.34"],
                        "is_locked": False,
                    }
                ],
                "student_subject_enrollments": [
                    {
                        "id": "enrollment-1",
                        "student_id": "student-1",
                        "subject_id": "sub-mat",
                        "academic_year": "2025-2026",
                        "year_level": "10",
                        "settings_id": "settings-1",
                        "is_active": True,
                        "is_exam_candidate": False,
                    }
                ],
                "student_subject_periods": [
                    {
                        "id": "period-1",
                        "enrollment_id": "enrollment-1",
                        "period_number": 1,
                        "pauta_grade": 16,
                        "is_overridden": False,
                        "is_locked": False,
                    }
                ],
                "subject_evaluation_elements": [
                    {
                        "id": "element-1",
                        "period_id": "period-1",
                        "element_type": "teste",
                        "label": "Teste 1",
                        "weight_percentage": "100",
                    }
                ],
                "student_annual_subject_grades": [],
            }
        )

        board = grades_service.get_board_data(db, "student-1", "2025-2026")
        period = board["subjects"][0]["periods"][0]

        self.assertTrue(period["has_elements"])
        self.assertNotIn("elements", period)

    def test_get_board_data_keeps_domain_subjects_without_embedding_domain_elements(self):
        db = FakeDB(
            {
                "subjects": [{"id": "sub-mat", "name": "Matemática", "slug": "secundario_mat_a"}],
                "student_grade_settings": [
                    {
                        "id": "settings-1",
                        "student_id": "student-1",
                        "academic_year": "2025-2026",
                        "education_level": "secundario",
                        "regime": "trimestral",
                        "period_weights": ["33.33", "33.33", "33.34"],
                        "is_locked": False,
                    }
                ],
                "student_subject_enrollments": [
                    {
                        "id": "enrollment-1",
                        "student_id": "student-1",
                        "subject_id": "sub-mat",
                        "academic_year": "2025-2026",
                        "year_level": "10",
                        "settings_id": "settings-1",
                        "is_active": True,
                        "is_exam_candidate": False,
                    }
                ],
                "student_subject_periods": [
                    {"id": "period-1", "enrollment_id": "enrollment-1", "period_number": 1}
                ],
                "subject_evaluation_domains": [
                    {
                        "id": "domain-1",
                        "enrollment_id": "enrollment-1",
                        "domain_type": "teste",
                        "label": "Testes",
                        "period_weights": ["100", "100", "100"],
                        "sort_order": 0,
                    }
                ],
                "subject_evaluation_elements": [
                    {
                        "id": "element-1",
                        "domain_id": "domain-1",
                        "period_number": 1,
                        "label": "Teste 1",
                        "weight_percentage": "100",
                        "raw_grade": "16",
                    }
                ],
                "student_annual_subject_grades": [],
            }
        )

        board = grades_service.get_board_data(db, "student-1", "2025-2026")
        domains = board["subjects"][0]["domains"]

        self.assertEqual(len(domains), 1)
        self.assertEqual(domains[0]["label"], "Testes")
        self.assertEqual(domains[0]["elements"], [])

    def test_get_cfs_dashboard_is_read_only_for_missing_cfd_rows(self):
        db = FakeDB(
            {
                "subjects": [
                    {"id": "sub-mat", "name": "Matemática A", "slug": "secundario_mat_a", "affects_cfs": True, "has_national_exam": True},
                ],
                "student_grade_settings": [
                    {
                        "id": "settings-2025",
                        "student_id": "student-1",
                        "academic_year": "2025-2026",
                        "education_level": "secundario",
                        "graduation_cohort_year": 2026,
                        "regime": "trimestral",
                        "period_weights": ["33.33", "33.33", "33.34"],
                        "is_locked": False,
                    }
                ],
                "student_subject_enrollments": [
                    {
                        "id": "mat-10",
                        "student_id": "student-1",
                        "subject_id": "sub-mat",
                        "academic_year": "2023-2024",
                        "year_level": "10",
                        "settings_id": "settings-2025",
                        "is_active": True,
                        "is_exam_candidate": False,
                    },
                    {
                        "id": "mat-11",
                        "student_id": "student-1",
                        "subject_id": "sub-mat",
                        "academic_year": "2024-2025",
                        "year_level": "11",
                        "settings_id": "settings-2025",
                        "is_active": True,
                        "is_exam_candidate": False,
                    },
                ],
                "student_annual_subject_grades": [
                    {"id": "ag-1", "enrollment_id": "mat-10", "annual_grade": 14, "raw_annual": "14"},
                    {"id": "ag-2", "enrollment_id": "mat-11", "annual_grade": 15, "raw_annual": "15"},
                ],
                "student_subject_cfd": [],
                "student_cfs_snapshot": [],
            }
        )

        dashboard = grades_service.get_cfs_dashboard(db, "student-1")

        self.assertEqual(len(db.tables["student_subject_cfd"]), 0)
        self.assertTrue(dashboard["cfds"][0]["id"].startswith("virtual-cfd--"))

    def test_get_cfs_dashboard_uses_simple_mean_for_2025_graduation_cohort(self):
        db = FakeDB(
            {
                "subjects": [
                    {"id": "sub-tri", "name": "Disciplina Trienal", "slug": "secundario_mat_a", "affects_cfs": True, "has_national_exam": False},
                    {"id": "sub-ann", "name": "Disciplina Anual", "slug": "secundario_geo_a", "affects_cfs": True, "has_national_exam": False},
                ],
                "student_grade_settings": [
                    {
                        "id": "settings-2024",
                        "student_id": "student-1",
                        "academic_year": "2024-2025",
                        "education_level": "secundario",
                        "graduation_cohort_year": 2025,
                        "regime": "trimestral",
                        "period_weights": ["33.33", "33.33", "33.34"],
                        "is_locked": False,
                    }
                ],
                "student_subject_enrollments": [
                    {
                        "id": "tri-10",
                        "student_id": "student-1",
                        "subject_id": "sub-tri",
                        "academic_year": "2022-2023",
                        "year_level": "10",
                        "settings_id": "settings-2024",
                        "is_active": True,
                        "is_exam_candidate": False,
                    },
                    {
                        "id": "tri-11",
                        "student_id": "student-1",
                        "subject_id": "sub-tri",
                        "academic_year": "2023-2024",
                        "year_level": "11",
                        "settings_id": "settings-2024",
                        "is_active": True,
                        "is_exam_candidate": False,
                    },
                    {
                        "id": "tri-12",
                        "student_id": "student-1",
                        "subject_id": "sub-tri",
                        "academic_year": "2024-2025",
                        "year_level": "12",
                        "settings_id": "settings-2024",
                        "is_active": True,
                        "is_exam_candidate": False,
                    },
                    {
                        "id": "ann-12",
                        "student_id": "student-1",
                        "subject_id": "sub-ann",
                        "academic_year": "2024-2025",
                        "year_level": "12",
                        "settings_id": "settings-2024",
                        "is_active": True,
                        "is_exam_candidate": False,
                    },
                ],
                "student_annual_subject_grades": [
                    {"id": "ag-1", "enrollment_id": "tri-10", "annual_grade": 20, "raw_annual": "20"},
                    {"id": "ag-2", "enrollment_id": "tri-11", "annual_grade": 20, "raw_annual": "20"},
                    {"id": "ag-3", "enrollment_id": "tri-12", "annual_grade": 20, "raw_annual": "20"},
                    {"id": "ag-4", "enrollment_id": "ann-12", "annual_grade": 10, "raw_annual": "10"},
                ],
                "student_subject_cfd": [],
                "student_cfs_snapshot": [],
            }
        )

        dashboard = grades_service.get_cfs_dashboard(db, "student-1")

        self.assertEqual(dashboard["computed_cfs"], 15.0)
        self.assertEqual(dashboard["computed_dges"], 150)

    def test_basico_default_exam_weight_is_thirty_percent(self):
        self.assertEqual(
            grades_service._resolve_default_exam_weight(education_level="basico_3_ciclo"),
            grades_service.Decimal("30"),
        )

    def test_update_exam_grade_creates_missing_cfd_and_returns_summary_payload(self):
        db = FakeDB(
            {
                "subjects": [
                    {"id": "sub-port", "name": "Português", "slug": "secundario_port", "affects_cfs": True, "has_national_exam": True},
                ],
                "student_grade_settings": [
                    {
                        "id": "settings-2025",
                        "student_id": "student-1",
                        "academic_year": "2025-2026",
                        "education_level": "secundario",
                        "graduation_cohort_year": 2026,
                        "regime": "trimestral",
                        "period_weights": ["33.33", "33.33", "33.34"],
                        "is_locked": False,
                    }
                ],
                "student_subject_enrollments": [
                    {
                        "id": "port-12",
                        "student_id": "student-1",
                        "subject_id": "sub-port",
                        "academic_year": "2025-2026",
                        "year_level": "12",
                        "settings_id": "settings-2025",
                        "is_active": True,
                        "is_exam_candidate": False,
                    },
                ],
                "student_annual_subject_grades": [
                    {"id": "ag-4", "enrollment_id": "port-12", "annual_grade": 13, "raw_annual": "13"},
                ],
                "student_subject_cfd": [],
                "student_cfs_snapshot": [],
            }
        )

        result = grades_service.update_exam_grade(
            db,
            "student-1",
            "virtual-cfd--sub-port--2025-2026",
            ExamGradeUpdateIn(exam_grade_raw=140, exam_weight=25),
        )

        self.assertEqual(len(db.tables["student_subject_cfd"]), 1)
        self.assertEqual(result["cfd"]["subject_id"], "sub-port")
        self.assertEqual(result["cfd"]["exam_grade_raw"], 140)
        self.assertIn("computed_cfs", result)

    def test_malformed_cumulative_weights_falls_back_to_non_cumulative(self):
        db = FakeDB(
            {
                "student_grade_settings": [
                    {
                        "id": "settings-1",
                        "student_id": "student-1",
                        "academic_year": "2025-2026",
                        "education_level": "secundario",
                        "regime": "trimestral",
                        "period_weights": ["30", "30", "40"],
                        "is_locked": False,
                    }
                ],
                "student_subject_enrollments": [
                    {
                        "id": "enrollment-1",
                        "student_id": "student-1",
                        "subject_id": "sub-mat",
                        "academic_year": "2025-2026",
                        "year_level": "10",
                        "settings_id": "settings-1",
                        "is_active": True,
                        "is_exam_candidate": False,
                        "cumulative_weights": [[100], ["", 60], [25, 30, 45]],
                    }
                ],
                "student_subject_periods": [
                    {
                        "id": "period-1",
                        "enrollment_id": "enrollment-1",
                        "period_number": 1,
                        "own_raw": "14.4",
                        "own_grade": 14,
                        "is_overridden": False,
                    },
                    {
                        "id": "period-2",
                        "enrollment_id": "enrollment-1",
                        "period_number": 2,
                        "own_raw": "15.6",
                        "own_grade": 16,
                        "is_overridden": False,
                    },
                    {
                        "id": "period-3",
                        "enrollment_id": "enrollment-1",
                        "period_number": 3,
                        "own_raw": "17.2",
                        "own_grade": 17,
                        "is_overridden": False,
                    },
                ],
                "student_annual_subject_grades": [],
            }
        )

        grades_service._recalculate_cumulative_cascade(db, "enrollment-1")

        period_2 = next(row for row in db.tables["student_subject_periods"] if row["id"] == "period-2")
        annual = db.tables["student_annual_subject_grades"][0]

        self.assertEqual(period_2["cumulative_raw"], "15.6")
        self.assertEqual(period_2["cumulative_grade"], 16)
        self.assertEqual(period_2["pauta_grade"], 16)
        self.assertEqual(annual["annual_grade"], 17)

    def test_cumulative_annual_uses_latest_pauta_override(self):
        db = FakeDB(
            {
                "student_grade_settings": [
                    {
                        "id": "settings-1",
                        "student_id": "student-1",
                        "academic_year": "2025-2026",
                        "education_level": "secundario",
                        "regime": "trimestral",
                        "period_weights": ["30", "30", "40"],
                        "is_locked": False,
                    }
                ],
                "student_subject_enrollments": [
                    {
                        "id": "enrollment-1",
                        "student_id": "student-1",
                        "subject_id": "sub-mat",
                        "academic_year": "2025-2026",
                        "year_level": "10",
                        "settings_id": "settings-1",
                        "is_active": True,
                        "is_exam_candidate": False,
                        "cumulative_weights": [[100], [40, 60], [25, 30, 45]],
                    }
                ],
                "student_subject_periods": [
                    {
                        "id": "period-1",
                        "enrollment_id": "enrollment-1",
                        "period_number": 1,
                        "pauta_grade": 14,
                        "cumulative_grade": 14,
                        "cumulative_raw": "14.0",
                    },
                    {
                        "id": "period-2",
                        "enrollment_id": "enrollment-1",
                        "period_number": 2,
                        "pauta_grade": 15,
                        "cumulative_grade": 15,
                        "cumulative_raw": "15.0",
                    },
                    {
                        "id": "period-3",
                        "enrollment_id": "enrollment-1",
                        "period_number": 3,
                        "pauta_grade": 19,
                        "cumulative_grade": 16,
                        "cumulative_raw": "16.2",
                    },
                ],
                "student_annual_subject_grades": [],
            }
        )

        grades_service._try_recalculate_annual(db, "enrollment-1")

        annual = db.tables["student_annual_subject_grades"][0]
        self.assertEqual(annual["annual_grade"], 19)
        self.assertEqual(annual["raw_annual"], "19")

    def test_non_cumulative_annual_matches_final_period_pauta(self):
        db = FakeDB(
            {
                "student_grade_settings": [
                    {
                        "id": "settings-1",
                        "student_id": "student-1",
                        "academic_year": "2025-2026",
                        "education_level": "secundario",
                        "regime": "trimestral",
                        "period_weights": ["33.33", "33.33", "33.34"],
                        "is_locked": False,
                    }
                ],
                "student_subject_enrollments": [
                    {
                        "id": "enrollment-1",
                        "student_id": "student-1",
                        "subject_id": "sub-aib",
                        "academic_year": "2025-2026",
                        "year_level": "12",
                        "settings_id": "settings-1",
                        "is_active": True,
                        "is_exam_candidate": False,
                        "cumulative_weights": None,
                    }
                ],
                "student_subject_periods": [
                    {
                        "id": "period-1",
                        "enrollment_id": "enrollment-1",
                        "period_number": 1,
                        "pauta_grade": 14,
                    },
                    {
                        "id": "period-2",
                        "enrollment_id": "enrollment-1",
                        "period_number": 2,
                        "pauta_grade": 16,
                    },
                    {
                        "id": "period-3",
                        "enrollment_id": "enrollment-1",
                        "period_number": 3,
                        "pauta_grade": 20,
                    },
                ],
                "student_annual_subject_grades": [],
            }
        )

        grades_service._try_recalculate_annual(db, "enrollment-1")

        annual = db.tables["student_annual_subject_grades"][0]
        self.assertEqual(annual["annual_grade"], 20)
        self.assertEqual(annual["raw_annual"], "20")

    def test_update_settings_requires_confirmation_when_data_exists(self):
        db = FakeDB(
            {
                "student_grade_settings": [
                    {
                        "id": "settings-1",
                        "student_id": "student-1",
                        "academic_year": "2025-2026",
                        "education_level": "basico_2_ciclo",
                        "grade_scale": "scale_0_100",
                        "regime": "trimestral",
                        "period_weights": ["33.33", "33.33", "33.34"],
                        "is_locked": False,
                    }
                ],
                "student_subject_enrollments": [
                    {
                        "id": "enrollment-1",
                        "student_id": "student-1",
                        "subject_id": "sub-1",
                        "academic_year": "2025-2026",
                        "year_level": "6",
                        "settings_id": "settings-1",
                        "is_active": True,
                        "is_exam_candidate": False,
                    }
                ],
                "student_subject_periods": [
                    {
                        "id": "period-1",
                        "enrollment_id": "enrollment-1",
                        "period_number": 1,
                        "pauta_grade": 4,
                    }
                ],
                "subject_evaluation_elements": [],
                "student_annual_subject_grades": [],
                "subject_evaluation_domains": [],
                "student_subject_cfd": [],
                "student_cfs_snapshot": [],
            }
        )

        with self.assertRaises(HTTPException):
            grades_service.update_settings(
                db,
                "student-1",
                "settings-1",
                GradeSettingsUpdateIn(
                    grade_scale="scale_0_100",
                    regime="semestral",
                    period_weights=[50, 50],
                    confirm_reset=False,
                ),
            )

    def test_update_settings_resets_grade_graph_and_rebuilds_periods(self):
        db = FakeDB(
            {
                "student_grade_settings": [
                    {
                        "id": "settings-1",
                        "student_id": "student-1",
                        "academic_year": "2025-2026",
                        "education_level": "basico_2_ciclo",
                        "grade_scale": "scale_0_20",
                        "regime": "trimestral",
                        "period_weights": ["33.33", "33.33", "33.34"],
                        "is_locked": False,
                    }
                ],
                "student_subject_enrollments": [
                    {
                        "id": "enrollment-1",
                        "student_id": "student-1",
                        "subject_id": "sub-1",
                        "academic_year": "2025-2026",
                        "year_level": "6",
                        "settings_id": "settings-1",
                        "is_active": True,
                        "is_exam_candidate": False,
                        "cumulative_weights": [[100], [40, 60], [25, 30, 45]],
                    }
                ],
                "student_subject_periods": [
                    {
                        "id": "period-1",
                        "enrollment_id": "enrollment-1",
                        "period_number": 1,
                        "pauta_grade": 4,
                        "qualitative_grade": None,
                        "raw_calculated": "4",
                        "calculated_grade": 4,
                        "is_overridden": False,
                        "override_reason": None,
                        "own_raw": "4",
                        "own_grade": 4,
                        "cumulative_raw": "4",
                        "cumulative_grade": 4,
                    },
                    {
                        "id": "period-2",
                        "enrollment_id": "enrollment-1",
                        "period_number": 2,
                        "pauta_grade": 5,
                        "qualitative_grade": None,
                        "raw_calculated": "5",
                        "calculated_grade": 5,
                        "is_overridden": False,
                        "override_reason": None,
                        "own_raw": "5",
                        "own_grade": 5,
                        "cumulative_raw": "4.5",
                        "cumulative_grade": 5,
                    },
                    {
                        "id": "period-3",
                        "enrollment_id": "enrollment-1",
                        "period_number": 3,
                        "pauta_grade": 5,
                        "qualitative_grade": None,
                        "raw_calculated": "5",
                        "calculated_grade": 5,
                        "is_overridden": True,
                        "override_reason": "manual",
                        "own_raw": "5",
                        "own_grade": 5,
                        "cumulative_raw": "4.8",
                        "cumulative_grade": 5,
                    },
                ],
                "subject_evaluation_domains": [
                    {
                        "id": "domain-1",
                        "enrollment_id": "enrollment-1",
                        "domain_type": "teste",
                        "label": "Testes",
                        "period_weights": ["100", "100", "100"],
                    }
                ],
                "subject_evaluation_elements": [
                    {
                        "id": "element-flat",
                        "period_id": "period-1",
                        "element_type": "teste",
                        "label": "Teste 1",
                        "weight_percentage": "100",
                        "raw_grade": "4",
                    },
                    {
                        "id": "element-domain",
                        "domain_id": "domain-1",
                        "period_number": 2,
                        "element_type": "teste",
                        "label": "Teste 2",
                        "weight_percentage": "100",
                        "raw_grade": "5",
                    },
                ],
                "student_annual_subject_grades": [
                    {
                        "id": "annual-1",
                        "enrollment_id": "enrollment-1",
                        "raw_annual": "5",
                        "annual_grade": 5,
                    }
                ],
                "student_subject_cfd": [
                    {
                        "id": "cfd-1",
                        "student_id": "student-1",
                        "subject_id": "sub-1",
                        "academic_year": "2025-2026",
                        "exam_grade": 14,
                        "exam_grade_raw": 140,
                        "exam_weight": "25",
                    }
                ],
                "student_cfs_snapshot": [
                    {
                        "id": "snapshot-1",
                        "student_id": "student-1",
                        "academic_year": "2025-2026",
                    }
                ],
            }
        )

        updated = grades_service.update_settings(
            db,
            "student-1",
            "settings-1",
            GradeSettingsUpdateIn(
                grade_scale="scale_0_20",
                regime="semestral",
                period_weights=[50, 50],
                confirm_reset=True,
            ),
        )

        self.assertEqual(updated["grade_scale"], "scale_0_20")
        self.assertEqual(updated["regime"], "semestral")
        self.assertEqual(updated["period_weights"], ["50", "50"])
        self.assertEqual(db.tables["subject_evaluation_domains"], [])
        self.assertEqual(db.tables["subject_evaluation_elements"], [])
        self.assertEqual(db.tables["student_annual_subject_grades"], [])
        self.assertEqual(db.tables["student_subject_cfd"], [])
        self.assertEqual(db.tables["student_cfs_snapshot"], [])

        enrollment = db.tables["student_subject_enrollments"][0]
        self.assertIsNone(enrollment["cumulative_weights"])

        periods = sorted(
            db.tables["student_subject_periods"],
            key=lambda row: row["period_number"],
        )
        self.assertEqual([row["period_number"] for row in periods], [1, 2])
        for period in periods:
            self.assertIsNone(period.get("pauta_grade"))
            self.assertIsNone(period.get("raw_calculated"))
            self.assertIsNone(period.get("calculated_grade"))
            self.assertFalse(period.get("is_overridden"))
            self.assertIsNone(period.get("override_reason"))
            self.assertIsNone(period.get("own_raw"))
            self.assertIsNone(period.get("own_grade"))
            self.assertIsNone(period.get("cumulative_raw"))
            self.assertIsNone(period.get("cumulative_grade"))

    def test_update_settings_converts_numeric_scales_without_reset(self):
        db = FakeDB(
            {
                "student_grade_settings": [
                    {
                        "id": "settings-1",
                        "student_id": "student-1",
                        "academic_year": "2025-2026",
                        "education_level": "basico_2_ciclo",
                        "grade_scale": "scale_0_100",
                        "regime": "trimestral",
                        "period_weights": ["33.33", "33.33", "33.34"],
                        "is_locked": False,
                    }
                ],
                "student_subject_enrollments": [
                    {
                        "id": "enrollment-1",
                        "student_id": "student-1",
                        "subject_id": "sub-1",
                        "academic_year": "2025-2026",
                        "year_level": "6",
                        "settings_id": "settings-1",
                        "is_active": True,
                        "is_exam_candidate": False,
                    }
                ],
                "student_subject_periods": [
                    {
                        "id": "period-1",
                        "enrollment_id": "enrollment-1",
                        "period_number": 1,
                        "pauta_grade": 4,
                        "raw_calculated": "74.5",
                        "calculated_grade": 4,
                        "own_raw": "74.5",
                        "own_grade": 4,
                        "cumulative_raw": "74.5",
                        "cumulative_grade": 4,
                        "is_overridden": False,
                    }
                ],
                "subject_evaluation_domains": [
                    {
                        "id": "domain-1",
                        "enrollment_id": "enrollment-1",
                        "domain_type": "teste",
                        "label": "Testes",
                        "period_weights": ["100", "100", "100"],
                    }
                ],
                "subject_evaluation_elements": [
                    {
                        "id": "element-flat",
                        "period_id": "period-1",
                        "element_type": "teste",
                        "label": "Teste 1",
                        "weight_percentage": "100",
                        "raw_grade": "80",
                    },
                    {
                        "id": "element-domain",
                        "domain_id": "domain-1",
                        "period_number": 1,
                        "element_type": "teste",
                        "label": "Teste 2",
                        "weight_percentage": "100",
                        "raw_grade": "70",
                    },
                ],
                "student_annual_subject_grades": [
                    {
                        "id": "annual-1",
                        "enrollment_id": "enrollment-1",
                        "raw_annual": "4",
                        "annual_grade": 4,
                    }
                ],
                "student_subject_cfd": [],
                "student_cfs_snapshot": [],
            }
        )

        updated = grades_service.update_settings(
            db,
            "student-1",
            "settings-1",
            GradeSettingsUpdateIn(
                grade_scale="scale_0_20",
                regime="trimestral",
                period_weights=[33.33, 33.33, 33.34],
                confirm_reset=False,
            ),
        )

        self.assertEqual(updated["grade_scale"], "scale_0_20")
        self.assertEqual(len(db.tables["student_subject_periods"]), 1)
        self.assertEqual(len(db.tables["subject_evaluation_domains"]), 1)
        self.assertEqual(len(db.tables["subject_evaluation_elements"]), 2)

        period = db.tables["student_subject_periods"][0]
        self.assertEqual(period["pauta_grade"], 15)
        self.assertEqual(period["calculated_grade"], 15)
        self.assertEqual(period["raw_calculated"], "14.9")
        self.assertEqual(period["own_grade"], 15)
        self.assertEqual(period["cumulative_grade"], 15)

        flat_element = next(
            row for row in db.tables["subject_evaluation_elements"] if row["id"] == "element-flat"
        )
        domain_element = next(
            row for row in db.tables["subject_evaluation_elements"] if row["id"] == "element-domain"
        )
        self.assertEqual(flat_element["raw_grade"], "16")
        self.assertEqual(domain_element["raw_grade"], "14")

        annual = db.tables["student_annual_subject_grades"][0]
        self.assertEqual(annual["annual_grade"], 15)
        self.assertEqual(annual["raw_annual"], "15")


if __name__ == "__main__":
    unittest.main()
