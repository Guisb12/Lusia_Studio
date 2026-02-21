import os
import unittest

os.environ.setdefault("SUPABASE_URL_B2B", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY_B2B", "test-service-key")
os.environ.setdefault("APP_AUTH_SECRET", "test-app-auth-secret")

from app.api.http.services.materials_service import build_subject_catalog


class MaterialsSubjectCatalogTests(unittest.TestCase):
    def test_student_selected_subjects_are_prioritized_and_tagged_with_profile_grade(self):
        subjects = [
            {
                "id": "sub-mat",
                "name": "Matematica A",
                "slug": "secundario_mat_a",
                "color": "#1E40AF",
                "icon": "calculator",
                "education_level": "secundario",
                "grade_levels": ["10", "11", "12"],
                "is_custom": False,
            },
            {
                "id": "sub-econ",
                "name": "Economia A",
                "slug": "secundario_econ_a",
                "color": "#059669",
                "icon": "trending-up",
                "education_level": "secundario",
                "grade_levels": ["10", "11"],
                "is_custom": False,
            },
            {
                "id": "sub-custom",
                "name": "Projeto Integrado",
                "slug": "proj_int",
                "color": "#111827",
                "icon": "book",
                "education_level": "secundario",
                "grade_levels": ["10"],
                "is_custom": True,
            },
        ]
        profile = {
            "role": "student",
            "grade_level": "10o ano",
            "subject_ids": ["sub-econ", "sub-custom"],
            "subjects_taught": None,
        }

        result = build_subject_catalog(subjects, profile)

        selected_ids = [item["id"] for item in result["selected_subjects"]]
        self.assertEqual(selected_ids, ["sub-econ", "sub-custom"])
        self.assertEqual(result["selected_subjects"][0]["selected_grade"], "10")
        self.assertEqual(result["selected_subjects"][1]["selected_grade"], "10")

        global_groups = result["more_subjects"]["by_education_level"]
        self.assertEqual(len(global_groups), 1)
        self.assertEqual(global_groups[0]["education_level"], "secundario")
        self.assertEqual(global_groups[0]["subjects"][0]["id"], "sub-mat")
        self.assertEqual(result["more_subjects"]["custom"], [])

    def test_teacher_selection_matches_slug_and_name_without_accents(self):
        subjects = [
            {
                "id": "sub-port",
                "name": "Portugues",
                "slug": "secundario_port",
                "color": "#EF4444",
                "icon": "book",
                "education_level": "secundario",
                "grade_levels": ["10", "11", "12"],
                "is_custom": False,
            },
            {
                "id": "sub-filo",
                "name": "Filosofia",
                "slug": "secundario_fil",
                "color": "#F59E0B",
                "icon": "lightbulb",
                "education_level": "secundario",
                "grade_levels": ["10", "11"],
                "is_custom": False,
            },
        ]
        profile = {
            "role": "teacher",
            "grade_level": None,
            "subject_ids": [],
            "subjects_taught": ["portugues", "secundario_fil"],
        }

        result = build_subject_catalog(subjects, profile)
        selected_ids = [item["id"] for item in result["selected_subjects"]]
        self.assertEqual(selected_ids, ["sub-filo", "sub-port"])
        self.assertEqual(result["more_subjects"]["by_education_level"], [])

    def test_non_selected_custom_subjects_are_in_custom_group(self):
        subjects = [
            {
                "id": "sub-1",
                "name": "Matematica",
                "slug": "mat",
                "color": None,
                "icon": None,
                "education_level": "basico_3_ciclo",
                "grade_levels": ["7", "8", "9"],
                "is_custom": False,
            },
            {
                "id": "sub-custom",
                "name": "Robotica",
                "slug": "robotica",
                "color": None,
                "icon": None,
                "education_level": "basico_3_ciclo",
                "grade_levels": ["9"],
                "is_custom": True,
            },
        ]
        profile = {
            "role": "student",
            "grade_level": "9",
            "subject_ids": ["sub-1"],
            "subjects_taught": [],
        }

        result = build_subject_catalog(subjects, profile)

        self.assertEqual(result["selected_subjects"][0]["id"], "sub-1")
        self.assertEqual(result["more_subjects"]["custom"][0]["id"], "sub-custom")
        self.assertEqual(result["more_subjects"]["by_education_level"], [])


if __name__ == "__main__":
    unittest.main()
