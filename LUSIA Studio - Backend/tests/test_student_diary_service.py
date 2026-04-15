import os
import unittest
from datetime import date
from unittest.mock import patch

os.environ.setdefault("SUPABASE_URL_B2B", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY_B2B", "test-service-key")
os.environ.setdefault("APP_AUTH_SECRET", "test-app-auth-secret")

from fastapi import HTTPException

from app.api.http.services import student_diary_service


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, db, table_name: str):
        self.db = db
        self.table_name = table_name
        self.operation = "select"
        self.payload = None
        self.filters: list[tuple[str, str, object]] = []
        self.orders: list[tuple[str, bool]] = []
        self.range_value: tuple[int, int] | None = None

    def select(self, _clause: str):
        self.operation = "select"
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

    def gte(self, key: str, value):
        self.filters.append(("gte", key, value))
        return self

    def lte(self, key: str, value):
        self.filters.append(("lte", key, value))
        return self

    def in_(self, key: str, values):
        self.filters.append(("in", key, list(values)))
        return self

    def order(self, key: str, desc: bool = False):
        self.orders.append((key, desc))
        return self

    def range(self, start: int, end: int):
        self.range_value = (start, end)
        return self

    def execute(self):
        return self.db.run(self)


class FakeDB:
    def __init__(self, tables: dict[str, list[dict]]):
        self.tables = {
            name: [dict(row) for row in rows] for name, rows in tables.items()
        }
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
            if op == "gte" and candidate < value:
                return False
            if op == "lte" and candidate > value:
                return False
            if op == "in" and candidate not in value:
                return False
        return True

    def _select(self, query: FakeQuery) -> list[dict]:
        rows = [
            dict(row)
            for row in self.tables[query.table_name]
            if self._matches(row, query.filters)
        ]
        for key, desc in reversed(query.orders):
            rows.sort(key=lambda row: row.get(key), reverse=desc)
        if query.range_value is not None:
            start, end = query.range_value
            rows = rows[start : end + 1]
        return rows

    def _insert(self, table_name: str, payload) -> list[dict]:
        items = payload if isinstance(payload, list) else [payload]
        inserted = []
        for item in items:
            self._counter += 1
            row = dict(item)
            row.setdefault("id", f"{table_name}-{self._counter}")
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


class StudentDiaryServiceTests(unittest.TestCase):
    def setUp(self):
        self.supabase_patch = patch.object(
            student_diary_service,
            "supabase_execute",
            new=lambda query, entity=None: query.execute(),
        )
        self.supabase_patch.start()

        self.db = FakeDB(
            {
                "student_diary_entries": [
                    {
                        "id": "e1",
                        "organization_id": "org-1",
                        "student_id": "student-1",
                        "teacher_id": "teacher-1",
                        "subject_id": "sub-1",
                        "entry_date": "2026-04-12",
                        "content": "Entry 1",
                        "created_at": "2026-04-12T09:00:00Z",
                        "updated_at": "2026-04-12T09:00:00Z",
                    },
                    {
                        "id": "e2",
                        "organization_id": "org-1",
                        "student_id": "student-1",
                        "teacher_id": "teacher-2",
                        "subject_id": None,
                        "entry_date": "2026-04-10",
                        "content": "Entry 2",
                        "created_at": "2026-04-10T10:00:00Z",
                        "updated_at": "2026-04-10T10:00:00Z",
                    },
                    {
                        "id": "e3",
                        "organization_id": "org-2",
                        "student_id": "student-1",
                        "teacher_id": "teacher-9",
                        "subject_id": "sub-9",
                        "entry_date": "2026-04-11",
                        "content": "Other org",
                        "created_at": "2026-04-11T10:00:00Z",
                        "updated_at": "2026-04-11T10:00:00Z",
                    },
                ],
                "profiles": [
                    {
                        "id": "teacher-1",
                        "full_name": "Teacher One",
                        "display_name": "T1",
                        "avatar_url": None,
                    },
                    {
                        "id": "teacher-2",
                        "full_name": "Teacher Two",
                        "display_name": None,
                        "avatar_url": "https://avatar/t2.png",
                    },
                ],
                "subjects": [
                    {
                        "id": "sub-1",
                        "name": "Matematica",
                        "color": "#1e40af",
                        "icon": "calculator",
                    },
                ],
            }
        )

    def tearDown(self):
        self.supabase_patch.stop()

    def test_list_entries_filters_by_org_student_date_subject(self):
        rows = student_diary_service.list_entries(
            self.db,
            "org-1",
            "student-1",
            date_from=date(2026, 4, 11),
            date_to=date(2026, 4, 13),
            subject_id="sub-1",
            limit=50,
            offset=0,
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], "e1")
        self.assertEqual(rows[0]["teacher_name"], "T1")
        self.assertEqual(rows[0]["subject_name"], "Matematica")

    def test_update_entry_allows_cross_teacher_edit_within_org(self):
        updated = student_diary_service.update_entry(
            self.db,
            "org-1",
            "student-1",
            "e1",
            {
                "content": "Edited by another teacher",
                "subject_id": None,
                "entry_date": date(2026, 4, 9),
            },
        )

        self.assertEqual(updated["content"], "Edited by another teacher")
        self.assertEqual(updated["subject_id"], None)
        self.assertEqual(updated["entry_date"], "2026-04-09")

    def test_delete_entry_hard_deletes_record(self):
        student_diary_service.delete_entry(self.db, "org-1", "student-1", "e2")
        remaining_ids = [r["id"] for r in self.db.tables["student_diary_entries"]]
        self.assertEqual(remaining_ids, ["e1", "e3"])

    def test_delete_entry_raises_404_for_missing_or_other_org(self):
        with self.assertRaises(HTTPException) as ctx:
            student_diary_service.delete_entry(self.db, "org-1", "student-1", "e3")
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
