"""
Assignments service — business logic for TPC/homework CRUD.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException, status as http_status
from supabase import Client

from app.api.http.schemas.assignments import (
    AssignmentCreateIn,
    StudentAssignmentUpdateIn,
    TeacherGradeIn,
)
from app.utils.db import parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)

ASSIGNMENT_SELECT = (
    "id,organization_id,teacher_id,class_id,student_ids,"
    "artifact_id,title,instructions,due_date,"
    "status,grades_released_at,created_at,updated_at"
)

STUDENT_ASSIGNMENT_SELECT = (
    "id,assignment_id,student_id,organization_id,"
    "progress,submission,grade,feedback,"
    "status,auto_graded,started_at,submitted_at,"
    "graded_at,created_at,updated_at"
)


def _is_nonempty_answer(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, dict, set)):
        return len(value) > 0
    return True


def _to_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    return str(value)


def _to_bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        raw = value.strip().lower()
        if raw in {"true", "1", "yes"}:
            return True
        if raw in {"false", "0", "no"}:
            return False
    return None


def _extract_question_ids(artifact_content: Any) -> list[str]:
    if not isinstance(artifact_content, dict):
        return []

    ordered_ids: list[str] = []
    seen: set[str] = set()

    def _push(raw: Any) -> None:
        value = _to_string(raw)
        if not value or value in seen:
            return
        seen.add(value)
        ordered_ids.append(value)

    for key in ("question_ids", "quiz_question_ids"):
        raw_ids = artifact_content.get(key)
        if isinstance(raw_ids, list):
            for raw_id in raw_ids:
                _push(raw_id)

    quiz_section = artifact_content.get("quiz")
    if isinstance(quiz_section, dict):
        raw_ids = quiz_section.get("question_ids") or quiz_section.get("quiz_question_ids")
        if isinstance(raw_ids, list):
            for raw_id in raw_ids:
                _push(raw_id)

    inline_questions = artifact_content.get("questions")
    if isinstance(inline_questions, list):
        for entry in inline_questions:
            if not isinstance(entry, dict):
                continue
            _push(entry.get("id") or entry.get("question_id"))

    return ordered_ids


def _extract_answers(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    answers = payload.get("answers")
    if isinstance(answers, dict):
        return answers
    return payload


def _normalize_pairs(value: Any) -> set[tuple[str, str]]:
    pairs: set[tuple[str, str]] = set()
    if isinstance(value, dict):
        value = value.get("pairs", value)

    if isinstance(value, dict):
        for left_id, right_id in value.items():
            left = _to_string(left_id)
            right = _to_string(right_id)
            if left and right:
                pairs.add((left, right))
        return pairs

    if isinstance(value, list):
        for pair in value:
            if isinstance(pair, (list, tuple)) and len(pair) == 2:
                left = _to_string(pair[0])
                right = _to_string(pair[1])
                if left and right:
                    pairs.add((left, right))
            elif isinstance(pair, dict):
                left = _to_string(pair.get("left_id") or pair.get("left"))
                right = _to_string(pair.get("right_id") or pair.get("right"))
                if left and right:
                    pairs.add((left, right))
    return pairs


def _normalize_id_list(value: Any, *, preserve_order: bool = False) -> list[str]:
    if isinstance(value, dict):
        value = value.get("value") or value.get("selected") or value.get("order")
    if not isinstance(value, list):
        return []

    if preserve_order:
        return [raw for raw in (_to_string(item) for item in value) if raw]

    unique = sorted(
        {
            normalized
            for item in value
            for normalized in [_to_string(item)]
            if normalized
        }
    )
    return [item for item in unique if item]


def _deterministic_id(question_id: str, namespace: str, discriminator: str | int) -> str:
    """Produce the same stable ID as the frontend normalizeQuestionForEditor."""
    return f"{question_id}__{namespace}_{discriminator}"


def _normalize_question_for_grading(question: dict) -> dict:
    """
    Convert a DB question from label-based schema (solution: "B")
    to the deterministic-ID-based schema that the frontend uses,
    so _grade_question can compare against student answers.
    """
    import re as _re

    question = dict(question)
    content = dict(question.get("content") or {})
    question["content"] = content
    q_type = question.get("type")
    q_id = _to_string(question.get("id")) or ""

    if q_type in ("multiple_choice", "multiple_response"):
        raw_options = content.get("options") or []
        options = []
        for idx, opt in enumerate(raw_options):
            opt = dict(opt) if isinstance(opt, dict) else {"text": str(opt)}
            if not opt.get("id"):
                opt["id"] = _deterministic_id(q_id, "opt", opt.get("label", idx))
            options.append(opt)
        content["options"] = options

        if q_type == "multiple_choice":
            if not content.get("correct_answer") and content.get("solution") is not None:
                sol_label = str(content["solution"])
                match = next((o for o in options if str(o.get("label", "")) == sol_label), None)
                if match:
                    content["correct_answer"] = match["id"]
        else:
            if not content.get("correct_answers"):
                solution = content.get("solution")
                if isinstance(solution, list):
                    labels = [str(s) for s in solution]
                    content["correct_answers"] = [
                        o["id"] for o in options if str(o.get("label", "")) in labels
                    ]

    elif q_type == "ordering":
        raw_items = content.get("items") or content.get("options") or []
        items = []
        for idx, item in enumerate(raw_items):
            item = dict(item) if isinstance(item, dict) else {"text": str(item)}
            if not item.get("id"):
                item["id"] = _deterministic_id(q_id, "item", item.get("label", idx))
            items.append(item)
        content["items"] = items

        if not content.get("correct_order"):
            solution = content.get("solution")
            if isinstance(solution, list):
                labels = [str(s) for s in solution]
                content["correct_order"] = [
                    next((i["id"] for i in items if str(i.get("label", "")) == label), None)
                    for label in labels
                ]
                content["correct_order"] = [x for x in content["correct_order"] if x]

    elif q_type == "matching":
        raw_left = list(content.get("left_items") or [])
        raw_right = list(content.get("right_items") or [])

        if not raw_left and not raw_right and isinstance(content.get("options"), list):
            for opt in content["options"]:
                label = str(opt.get("label", ""))
                if _re.match(r"^\d+$", label):
                    raw_right.append(opt)
                else:
                    raw_left.append(opt)

        left_items = []
        for idx, item in enumerate(raw_left):
            item = dict(item) if isinstance(item, dict) else {"text": str(item)}
            if not item.get("id"):
                item["id"] = _deterministic_id(q_id, "left", item.get("label", idx))
            left_items.append(item)

        right_items = []
        for idx, item in enumerate(raw_right):
            item = dict(item) if isinstance(item, dict) else {"text": str(item)}
            if not item.get("id"):
                item["id"] = _deterministic_id(q_id, "right", item.get("label", idx))
            right_items.append(item)

        content["left_items"] = left_items
        content["right_items"] = right_items

        if not content.get("correct_pairs"):
            solution = content.get("solution")
            if isinstance(solution, list):
                pairs = []
                for pair in solution:
                    if isinstance(pair, dict):
                        left_label = str(pair.get("left", ""))
                        right_label = str(pair.get("right", ""))
                    elif isinstance(pair, (list, tuple)) and len(pair) == 2:
                        left_label, right_label = str(pair[0]), str(pair[1])
                    else:
                        continue
                    left = next((i for i in left_items if str(i.get("label", "")) == left_label), None)
                    right = next((i for i in right_items if str(i.get("label", "")) == right_label), None)
                    if left and right:
                        pairs.append([left["id"], right["id"]])
                content["correct_pairs"] = pairs

    elif q_type == "fill_blank":
        solution = content.get("solution") or []
        raw_options = content.get("options") or []

        already_flat = (
            raw_options
            and isinstance(raw_options[0], dict)
            and raw_options[0].get("id")
        )

        if already_flat:
            options = []
            for idx, opt in enumerate(raw_options):
                opt = dict(opt)
                if not opt.get("id"):
                    opt["id"] = _deterministic_id(q_id, "fopt", opt.get("text", opt.get("label", idx)))
                options.append(opt)
            content["options"] = options

            blanks = content.get("blanks") or []
            new_blanks = []
            for idx, blank in enumerate(blanks):
                blank = dict(blank)
                if not blank.get("id"):
                    blank["id"] = _deterministic_id(q_id, "blank", idx)
                new_blanks.append(blank)
            content["blanks"] = new_blanks
        else:
            opt_map: dict[str, str] = {}
            flat_options: list[dict] = []

            def _add_opt(text: str) -> None:
                if not text or text in opt_map:
                    return
                oid = _deterministic_id(q_id, "fopt", text)
                opt_map[text] = oid
                flat_options.append({"id": oid, "text": text})

            if isinstance(solution, list):
                for sol in solution:
                    answer_text = str(sol.get("answer") if isinstance(sol, dict) else sol or "")
                    _add_opt(answer_text)

            if raw_options and isinstance(raw_options[0], list):
                for per_blank_opts in raw_options:
                    if isinstance(per_blank_opts, list):
                        for opt_text in per_blank_opts:
                            _add_opt(str(opt_text))

            content["options"] = flat_options

            blanks = []
            if isinstance(solution, list):
                for sol_idx, sol in enumerate(solution):
                    answer_text = str(sol.get("answer") if isinstance(sol, dict) else sol or "")
                    match_id = opt_map.get(answer_text, "")
                    blanks.append({
                        "id": _deterministic_id(q_id, "blank", sol_idx),
                        "correct_answer": match_id,
                    })
            content["blanks"] = blanks

    elif q_type == "true_false":
        if content.get("correct_answer") is None and content.get("solution") is not None:
            sol = content["solution"]
            content["correct_answer"] = sol in (True, "true", "V")

    elif q_type == "short_answer":
        if not content.get("correct_answers"):
            sol = content.get("solution")
            if sol is not None:
                content["correct_answers"] = [str(sol)]

    return question


def _grade_question(question: dict, answer_entry: Any) -> Optional[bool]:
    question_type = question.get("type")
    content = question.get("content") or {}
    answer_value = answer_entry
    if isinstance(answer_entry, dict) and "value" in answer_entry:
        answer_value = answer_entry.get("value")

    if question_type == "multiple_choice":
        correct = _to_string(content.get("correct_answer"))
        if not correct:
            return None
        if isinstance(answer_value, dict):
            answer_value = answer_value.get("selected_option_id") or answer_value.get("option_id")
        selected = _to_string(answer_value)
        return selected == correct

    if question_type == "true_false":
        correct = _to_bool(content.get("correct_answer"))
        if correct is None:
            return None
        selected = _to_bool(answer_value)
        return selected == correct

    if question_type == "fill_blank":
        blanks = content.get("blanks")
        if not isinstance(blanks, list) or not blanks:
            return None

        correct_by_blank: dict[str, str] = {}
        for blank in blanks:
            if not isinstance(blank, dict):
                continue
            blank_id = _to_string(blank.get("id"))
            correct_id = _to_string(blank.get("correct_answer"))
            if blank_id and correct_id:
                correct_by_blank[blank_id] = correct_id
        if not correct_by_blank:
            return None

        selected_by_blank: dict[str, str] = {}
        source = answer_value
        if isinstance(source, dict):
            source = source.get("blanks", source)
        if isinstance(source, list):
            for item in source:
                if not isinstance(item, dict):
                    continue
                blank_id = _to_string(item.get("id") or item.get("blank_id"))
                selected = _to_string(
                    item.get("selected_option_id") or item.get("answer") or item.get("value")
                )
                if blank_id and selected:
                    selected_by_blank[blank_id] = selected
        elif isinstance(source, dict):
            for blank_id, selected in source.items():
                selected_id = _to_string(selected)
                key = _to_string(blank_id)
                if key and selected_id:
                    selected_by_blank[key] = selected_id

        return all(
            selected_by_blank.get(blank_id) == correct_id
            for blank_id, correct_id in correct_by_blank.items()
        )

    if question_type == "matching":
        correct_pairs = _normalize_pairs(content.get("correct_pairs"))
        if not correct_pairs:
            return None
        selected_pairs = _normalize_pairs(answer_value)
        return selected_pairs == correct_pairs

    if question_type == "short_answer":
        correct_answers = content.get("correct_answers")
        if not isinstance(correct_answers, list) or not correct_answers:
            return None
        case_sensitive = bool(content.get("case_sensitive", False))
        selected = _to_string(
            answer_value.get("text") if isinstance(answer_value, dict) else answer_value
        )
        selected = (selected or "").strip()
        if not case_sensitive:
            selected = selected.lower()

        normalized_correct = {
            (str(ans).strip() if case_sensitive else str(ans).strip().lower())
            for ans in correct_answers
            if _is_nonempty_answer(ans)
        }
        return selected in normalized_correct

    if question_type == "multiple_response":
        correct_answers = _normalize_id_list(content.get("correct_answers"))
        if not correct_answers:
            return None
        selected_answers = _normalize_id_list(answer_value)
        return selected_answers == correct_answers

    if question_type == "ordering":
        correct_order = _normalize_id_list(content.get("correct_order"), preserve_order=True)
        if not correct_order:
            return None
        selected_order = _normalize_id_list(answer_value, preserve_order=True)
        return selected_order == correct_order

    return None


def _grade_quiz_attempt(questions: list[dict], attempt_payload: Any) -> tuple[Optional[float], Optional[dict]]:
    answers = _extract_answers(attempt_payload)
    if not questions:
        return None, None

    # Normalize all questions so that solution-based DB format is converted
    # to correct_answer-based format with deterministic IDs matching the frontend.
    normalized_questions = [_normalize_question_for_grading(q) for q in questions]

    total_questions = 0
    correct_questions = 0
    answered_questions = 0
    per_question: list[dict[str, Any]] = []

    for question in normalized_questions:
        question_id = _to_string(question.get("id"))
        if not question_id:
            continue

        answer = answers.get(question_id)
        if _is_nonempty_answer(answer):
            answered_questions += 1

        is_correct = _grade_question(question, answer)
        if is_correct is None:
            continue

        total_questions += 1
        if is_correct:
            correct_questions += 1

        per_question.append(
            {
                "question_id": question_id,
                "type": question.get("type"),
                "is_correct": is_correct,
                "answered": _is_nonempty_answer(answer),
            }
        )

    if total_questions == 0:
        return None, None

    score = round((correct_questions / total_questions) * 100, 2)
    return score, {
        "score": score,
        "total_questions": total_questions,
        "correct_questions": correct_questions,
        "answered_questions": answered_questions,
        "results": per_question,
    }


def _load_quiz_questions_for_student_assignment(db: Client, student_assignment: dict) -> list[dict]:
    assignment_id = student_assignment.get("assignment_id")
    if not assignment_id:
        return []

    assignment_response = supabase_execute(
        db.table("assignments")
        .select("id,organization_id,artifact_id")
        .eq("id", assignment_id)
        .limit(1),
        entity="assignment",
    )
    if not assignment_response.data:
        return []

    assignment = assignment_response.data[0]
    artifact_id = assignment.get("artifact_id")
    if not artifact_id:
        return []

    artifact_response = supabase_execute(
        db.table("artifacts")
        .select("id,artifact_type,content")
        .eq("id", artifact_id)
        .eq("organization_id", assignment.get("organization_id"))
        .limit(1),
        entity="artifact",
    )
    if not artifact_response.data:
        return []

    artifact = artifact_response.data[0]
    if artifact.get("artifact_type") != "quiz":
        return []

    question_ids = _extract_question_ids(artifact.get("content"))
    if not question_ids:
        return []

    questions_response = supabase_execute(
        db.table("questions")
        .select("id,type,content")
        .eq("organization_id", assignment.get("organization_id"))
        .in_("id", question_ids),
        entity="questions",
    )
    questions = questions_response.data or []
    questions_by_id = {q["id"]: q for q in questions}
    return [questions_by_id[qid] for qid in question_ids if qid in questions_by_id]


def _hydrate_assignment(db: Client, assignment: dict) -> dict:
    """Add teacher name, artifact info, and student summary to an assignment."""
    # Teacher name
    try:
        teacher_resp = (
            db.table("profiles")
            .select("full_name,display_name")
            .eq("id", assignment["teacher_id"])
            .limit(1)
            .execute()
        )
        if teacher_resp.data:
            t = teacher_resp.data[0]
            assignment["teacher_name"] = t.get("display_name") or t.get("full_name")
    except Exception:
        assignment["teacher_name"] = None

    # Artifact info
    artifact_id = assignment.get("artifact_id")
    if artifact_id:
        try:
            art_resp = (
                db.table("artifacts")
                .select("id,artifact_type,artifact_name,icon")
                .eq("id", artifact_id)
                .limit(1)
                .execute()
            )
            assignment["artifact"] = art_resp.data[0] if art_resp.data else None
        except Exception:
            assignment["artifact"] = None
    else:
        assignment["artifact"] = None

    # Student count and submitted count
    student_ids = assignment.get("student_ids") or []
    assignment["student_count"] = len(student_ids)

    try:
        sa_resp = (
            db.table("student_assignments")
            .select("id,status")
            .eq("assignment_id", assignment["id"])
            .execute()
        )
        rows = sa_resp.data or []
        assignment["submitted_count"] = sum(
            1 for r in rows if r.get("status") in ("submitted", "graded")
        )
    except Exception:
        assignment["submitted_count"] = 0

    # Hydrate students
    if student_ids:
        try:
            students_resp = (
                db.table("profiles")
                .select("id,full_name,display_name,avatar_url")
                .in_("id", student_ids)
                .execute()
            )
            assignment["students"] = students_resp.data or []
        except Exception:
            assignment["students"] = []
    else:
        assignment["students"] = []

    return assignment


def list_assignments(
    db: Client,
    org_id: str,
    user_id: str,
    role: str,
    *,
    status_filter: Optional[str] = None,
) -> list[dict]:
    """List assignments based on role."""
    query = (
        db.table("assignments")
        .select(ASSIGNMENT_SELECT)
        .eq("organization_id", org_id)
    )

    if role in ("teacher", "admin"):
        if role == "teacher":
            query = query.eq("teacher_id", user_id)
    else:
        # Students see published assignments where they're included
        query = query.eq("status", "published").contains("student_ids", [user_id])

    if status_filter:
        query = query.eq("status", status_filter)

    query = query.order("created_at", desc=True)

    response = supabase_execute(query, entity="assignments")
    assignments = response.data or []
    return [_hydrate_assignment(db, a) for a in assignments]


def create_assignment(
    db: Client,
    org_id: str,
    teacher_id: str,
    payload: AssignmentCreateIn,
) -> dict:
    """Create an assignment and auto-create student_assignments rows."""
    insert_data = {
        "organization_id": org_id,
        "teacher_id": teacher_id,
        "status": payload.status,
    }
    if payload.title:
        insert_data["title"] = payload.title
    if payload.instructions:
        insert_data["instructions"] = payload.instructions
    if payload.artifact_id:
        insert_data["artifact_id"] = payload.artifact_id
    if payload.class_id:
        insert_data["class_id"] = payload.class_id
    if payload.student_ids:
        insert_data["student_ids"] = payload.student_ids
    if payload.due_date:
        insert_data["due_date"] = payload.due_date.isoformat()

    response = supabase_execute(
        db.table("assignments").insert(insert_data),
        entity="assignment",
    )
    assignment = parse_single_or_404(response, entity="assignment")

    # Auto-create student_assignments rows
    student_ids = payload.student_ids or []
    if student_ids:
        sa_rows = [
            {
                "assignment_id": assignment["id"],
                "student_id": sid,
                "organization_id": org_id,
            }
            for sid in student_ids
        ]
        try:
            db.table("student_assignments").insert(sa_rows).execute()
        except Exception as exc:
            logger.warning("Failed to create student_assignments rows: %s", exc)

    return _hydrate_assignment(db, assignment)


def get_assignment_detail(
    db: Client,
    assignment_id: str,
    org_id: str,
) -> dict:
    """Get a single assignment with hydrated info."""
    response = supabase_execute(
        db.table("assignments")
        .select(ASSIGNMENT_SELECT)
        .eq("id", assignment_id)
        .eq("organization_id", org_id)
        .limit(1),
        entity="assignment",
    )
    assignment = parse_single_or_404(response, entity="assignment")
    return _hydrate_assignment(db, assignment)


def delete_assignment(
    db: Client,
    assignment_id: str,
    teacher_id: str,
) -> None:
    """Delete an assignment and its student_assignment rows."""
    # Verify ownership
    response = supabase_execute(
        db.table("assignments")
        .select("id")
        .eq("id", assignment_id)
        .eq("teacher_id", teacher_id)
        .limit(1),
        entity="assignment",
    )
    parse_single_or_404(response, entity="assignment")

    # Delete student_assignments first (FK constraint)
    try:
        db.table("student_assignments").delete().eq("assignment_id", assignment_id).execute()
    except Exception as exc:
        logger.warning("Failed to delete student_assignments: %s", exc)

    supabase_execute(
        db.table("assignments").delete().eq("id", assignment_id),
        entity="assignment",
    )


def update_assignment_status(
    db: Client,
    assignment_id: str,
    teacher_id: str,
    new_status: str,
) -> dict:
    """Update assignment status (draft → published → closed)."""
    # Verify ownership
    response = supabase_execute(
        db.table("assignments")
        .select(ASSIGNMENT_SELECT)
        .eq("id", assignment_id)
        .eq("teacher_id", teacher_id)
        .limit(1),
        entity="assignment",
    )
    existing = parse_single_or_404(response, entity="assignment")

    update_data = {"status": new_status}
    if new_status == "closed" and not existing.get("grades_released_at"):
        update_data["grades_released_at"] = datetime.now(timezone.utc).isoformat()

    response = supabase_execute(
        db.table("assignments")
        .update(update_data)
        .eq("id", assignment_id),
        entity="assignment",
    )
    assignment = parse_single_or_404(response, entity="assignment")
    return _hydrate_assignment(db, assignment)


def list_student_assignments(
    db: Client,
    assignment_id: str,
    org_id: str,
    teacher_id: str,
    role: str,
) -> list[dict]:
    """Get all student_assignments for an assignment, hydrated with student info."""
    assignment_query = (
        db.table("assignments")
        .select("id")
        .eq("id", assignment_id)
        .eq("organization_id", org_id)
    )
    if role == "teacher":
        assignment_query = assignment_query.eq("teacher_id", teacher_id)

    assignment_response = supabase_execute(
        assignment_query.limit(1),
        entity="assignment",
    )
    parse_single_or_404(assignment_response, entity="assignment")

    response = supabase_execute(
        db.table("student_assignments")
        .select(STUDENT_ASSIGNMENT_SELECT)
        .eq("assignment_id", assignment_id)
        .eq("organization_id", org_id)
        .order("created_at", desc=False),
        entity="student_assignments",
    )
    rows = response.data or []

    # Hydrate with student names
    student_ids = [r["student_id"] for r in rows]
    student_map = {}
    if student_ids:
        try:
            s_resp = (
                db.table("profiles")
                .select("id,full_name,display_name,avatar_url")
                .in_("id", student_ids)
                .execute()
            )
            for s in (s_resp.data or []):
                student_map[s["id"]] = s
        except Exception:
            pass

    for row in rows:
        info = student_map.get(row["student_id"], {})
        row["student_name"] = info.get("display_name") or info.get("full_name")
        row["student_avatar"] = info.get("avatar_url")

    return rows


def get_my_assignments(
    db: Client,
    student_id: str,
    org_id: str,
) -> list[dict]:
    """Get student's own assignment rows with assignment info."""
    response = supabase_execute(
        db.table("student_assignments")
        .select(STUDENT_ASSIGNMENT_SELECT)
        .eq("student_id", student_id)
        .eq("organization_id", org_id)
        .order("created_at", desc=True),
        entity="student_assignments",
    )
    rows = response.data or []

    # Hydrate with assignment details
    assignment_ids = list({r["assignment_id"] for r in rows})
    assignment_map = {}
    if assignment_ids:
        try:
            a_resp = (
                db.table("assignments")
                .select(ASSIGNMENT_SELECT)
                .in_("id", assignment_ids)
                .in_("status", ["published", "closed"])
                .execute()
            )
            for a in (a_resp.data or []):
                assignment_map[a["id"]] = a
        except Exception:
            pass

    # Hydrate artifact info for each assignment
    artifact_ids = list({a["artifact_id"] for a in assignment_map.values() if a.get("artifact_id")})
    artifact_map = {}
    if artifact_ids:
        try:
            art_resp = (
                db.table("artifacts")
                .select("id,artifact_type,artifact_name,icon")
                .in_("id", artifact_ids)
                .execute()
            )
            for art in (art_resp.data or []):
                artifact_map[art["id"]] = art
        except Exception:
            pass

    for a in assignment_map.values():
        artifact_id = a.get("artifact_id")
        a["artifact"] = artifact_map.get(artifact_id) if artifact_id else None

    # Filter to published/closed assignments and attach info
    result = []
    for row in rows:
        assignment = assignment_map.get(row["assignment_id"])
        if assignment:
            row["assignment"] = assignment
            result.append(row)

    return result


def update_student_assignment(
    db: Client,
    sa_id: str,
    student_id: str,
    payload: StudentAssignmentUpdateIn,
) -> dict:
    """Update a student_assignment (progress or submission)."""
    # Verify ownership
    response = supabase_execute(
        db.table("student_assignments")
        .select(STUDENT_ASSIGNMENT_SELECT)
        .eq("id", sa_id)
        .eq("student_id", student_id)
        .limit(1),
        entity="student_assignment",
    )
    existing = parse_single_or_404(response, entity="student_assignment")

    # Guard: reject attempts to revert a terminal status back to in_progress.
    # This prevents the race condition where a slow autosave PATCH lands after
    # submission and silently reverts the student's completed work.
    if (
        existing.get("status") in ("submitted", "graded")
        and payload.status == "in_progress"
    ):
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="Cannot revert a submitted assignment.",
        )

    update_data = {}
    now = datetime.now(timezone.utc).isoformat()

    if payload.progress is not None:
        update_data["progress"] = payload.progress
    if payload.submission is not None:
        update_data["submission"] = payload.submission
        update_data["submitted_at"] = now
    if payload.status:
        update_data["status"] = payload.status
        if payload.status == "in_progress":
            if not existing.get("started_at"):
                update_data["started_at"] = now
        elif payload.status == "submitted":
            update_data["submitted_at"] = now

    # Only grade on actual submission — autosave (progress only) skips grading
    # to avoid 3 unnecessary DB queries per autosave and fluctuating grades.
    grading_source: Any = None
    if payload.submission is not None:
        grading_source = payload.submission
    elif payload.status == "submitted" and payload.submission is None:
        grading_source = existing.get("submission") or existing.get("progress")

    if grading_source is not None:
        questions = _load_quiz_questions_for_student_assignment(db, existing)
        grade, grading = _grade_quiz_attempt(questions, grading_source)
        if grade is not None:
            update_data["grade"] = grade
            update_data["auto_graded"] = True
            update_data["graded_at"] = now
            # Promote to graded status when auto-grading succeeds
            if payload.status == "submitted":
                update_data["status"] = "graded"
            if payload.submission is not None and isinstance(payload.submission, dict):
                enriched_submission = dict(payload.submission)
                enriched_submission["grading"] = grading
                update_data["submission"] = enriched_submission

    update_data["updated_at"] = now

    response = supabase_execute(
        db.table("student_assignments")
        .update(update_data)
        .eq("id", sa_id)
        .eq("student_id", student_id),
        entity="student_assignment",
    )
    return parse_single_or_404(response, entity="student_assignment")


def teacher_grade_student_assignment(
    db: Client,
    sa_id: str,
    teacher_id: str,
    payload: TeacherGradeIn,
) -> dict:
    """Teacher grades or overrides a student assignment."""
    # Fetch the student_assignment
    sa_response = supabase_execute(
        db.table("student_assignments")
        .select(STUDENT_ASSIGNMENT_SELECT)
        .eq("id", sa_id)
        .limit(1),
        entity="student_assignment",
    )
    existing = parse_single_or_404(sa_response, entity="student_assignment")

    # Verify teacher owns the assignment
    assignment_response = supabase_execute(
        db.table("assignments")
        .select("id,teacher_id")
        .eq("id", existing["assignment_id"])
        .eq("teacher_id", teacher_id)
        .limit(1),
        entity="assignment",
    )
    parse_single_or_404(assignment_response, entity="assignment")

    now = datetime.now(timezone.utc).isoformat()
    update_data: dict[str, Any] = {
        "status": "graded",
        "graded_at": now,
        "updated_at": now,
        "auto_graded": False,
    }

    if payload.feedback is not None:
        update_data["feedback"] = payload.feedback

    # Apply question overrides if provided
    if payload.question_overrides:
        submission = existing.get("submission") or {}
        grading = submission.get("grading") if isinstance(submission, dict) else None
        if isinstance(grading, dict) and isinstance(grading.get("results"), list):
            results = list(grading["results"])
            for result in results:
                qid = result.get("question_id")
                if qid and qid in payload.question_overrides:
                    result["is_correct"] = payload.question_overrides[qid]
                    result["teacher_override"] = True

            # Recompute score from overridden results
            total = len(results)
            correct = sum(1 for r in results if r.get("is_correct"))
            new_score = round((correct / total) * 100, 2) if total > 0 else 0.0
            grading = dict(grading)
            grading["results"] = results
            grading["score"] = new_score
            grading["correct_questions"] = correct

            enriched_submission = dict(submission)
            enriched_submission["grading"] = grading
            update_data["submission"] = enriched_submission
            if payload.grade is None:
                update_data["grade"] = new_score
        # If no grading data, overrides are noted but grade must come from payload

    if payload.grade is not None:
        update_data["grade"] = max(0.0, min(100.0, payload.grade))

    response = supabase_execute(
        db.table("student_assignments")
        .update(update_data)
        .eq("id", sa_id),
        entity="student_assignment",
    )
    return parse_single_or_404(response, entity="student_assignment")
