import unittest

from app.api.http.schemas.worksheet_generation import Blueprint, BlueprintBlock
from app.api.http.services.worksheet_blueprint_agent import _apply_tool_call
from app.api.http.services.worksheet_resolution import _resolved_sort_key


def _child(block_id: str, order: int, goal: str) -> BlueprintBlock:
    return BlueprintBlock(
        id=block_id,
        order=order,
        source="ai_generated",
        curriculum_code="CODE",
        type="short_answer",
        goal=goal,
    )


class WorksheetBlueprintAgentTests(unittest.TestCase):
    def setUp(self):
        self.blueprint = Blueprint(
            blocks=[
                BlueprintBlock(
                    id="group-1",
                    order=1,
                    source="ai_generated",
                    curriculum_code="CODE",
                    type="context_group",
                    goal="Grupo I",
                    group_label="Grupo I",
                    children=[
                        _child("child-1", 1, "Primeira"),
                        _child("child-2", 2, "Segunda"),
                    ],
                ),
                BlueprintBlock(
                    id="top-1",
                    order=2,
                    source="ai_generated",
                    curriculum_code="CODE",
                    type="multiple_choice",
                    goal="Top-level",
                ),
            ]
        )

    def test_update_child_only_mutates_target_child(self):
        result = _apply_tool_call(
            self.blueprint,
            "update_block",
            {"block_id": "child-2", "patch": {"goal": "Alterada"}},
        )

        self.assertEqual(result["affected_block_ids"], ["child-2"])
        children = self.blueprint.blocks[0].children or []
        self.assertEqual(children[0].goal, "Primeira")
        self.assertEqual(children[1].goal, "Alterada")

    def test_create_child_inserts_after_sibling_and_normalizes_order(self):
        result = _apply_tool_call(
            self.blueprint,
            "create_block",
            {
                "parent_id": "group-1",
                "after_block_id": "child-1",
                "block": {
                    "id": "child-new",
                    "source": "ai_generated",
                    "curriculum_code": "CODE",
                    "type": "short_answer",
                    "goal": "Nova",
                },
            },
        )

        self.assertEqual(result["affected_block_ids"], ["child-new"])
        children = self.blueprint.blocks[0].children or []
        self.assertEqual([child.id for child in children], ["child-1", "child-new", "child-2"])
        self.assertEqual([child.order for child in children], [1, 2, 3])

    def test_move_child_reorders_within_group(self):
        result = _apply_tool_call(
            self.blueprint,
            "move_block",
            {
                "block_id": "child-2",
                "new_parent_id": "group-1",
                "after_block_id": None,
            },
        )

        self.assertEqual(result["affected_block_ids"], ["child-2"])
        children = self.blueprint.blocks[0].children or []
        self.assertEqual([child.id for child in children], ["child-2", "child-1"])
        self.assertEqual([child.order for child in children], [1, 2])

    def test_delete_group_removes_descendants(self):
        result = _apply_tool_call(
            self.blueprint,
            "delete_block",
            {"block_id": "group-1"},
        )

        self.assertEqual(
            result["affected_block_ids"],
            ["group-1", "child-1", "child-2"],
        )
        self.assertEqual([block.id for block in self.blueprint.blocks], ["top-1"])
        self.assertEqual(self.blueprint.blocks[0].order, 1)


class WorksheetResolutionOrderingTests(unittest.TestCase):
    def test_group_parent_and_children_sort_by_structural_order(self):
        resolved = [
            {"question_id": "group-2-child", "order": 2, "top_level_order": 2, "child_order": 2, "parent_question_id": "group-2"},
            {"question_id": "group-1-child-2", "order": 1, "top_level_order": 1, "child_order": 2, "parent_question_id": "group-1"},
            {"question_id": "group-2", "order": 2, "top_level_order": 2, "child_order": None},
            {"question_id": "group-1", "order": 1, "top_level_order": 1, "child_order": None},
            {"question_id": "group-1-child-1", "order": 1, "top_level_order": 1, "child_order": 1, "parent_question_id": "group-1"},
        ]

        resolved.sort(key=_resolved_sort_key)

        self.assertEqual(
            [item["question_id"] for item in resolved],
            ["group-1", "group-1-child-1", "group-1-child-2", "group-2", "group-2-child"],
        )


if __name__ == "__main__":
    unittest.main()
