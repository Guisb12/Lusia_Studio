"""
Grades service — business logic for the grade calculator (Calculadora de Médias).

All grade calculations use Python Decimal for precision, matching
PostgreSQL NUMERIC columns. This avoids floating-point errors that
could cause incorrect rounding at critical thresholds (e.g. 9.5 → 10 vs 9.4 → 9).
"""

from __future__ import annotations

import logging
import math
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from fastapi import HTTPException, status
from supabase import Client

from app.api.http.schemas.grades import (
    BasicoExamGradeUpdateIn,
    EnrollmentCreateIn,
    EnrollmentUpdateIn,
    EvaluationElementIn,
    ExamGradeUpdateIn,
    GradeSettingsCreateIn,
    PeriodGradeOverrideIn,
    PeriodGradeUpdateIn,
)
from app.utils.db import parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)


# ── Helpers ──────────────────────────────────────────────────


def _dec(value) -> Decimal:
    """Convert any numeric value to Decimal safely."""
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def _round_half_up(value: Decimal) -> int:
    """Standard arithmetic rounding (half-up) to integer."""
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _truncate_one_decimal(value: Decimal) -> float:
    """Truncate to 1 decimal place (never round up). 14.68 → 14.6."""
    shifted = value * 10
    truncated = Decimal(math.floor(shifted))
    return float(truncated / 10)


def _verify_period_ownership(db: Client, period_id: str, student_id: str) -> dict:
    """Verify a period belongs to the student, return the period row."""
    resp = supabase_execute(
        db.table("student_subject_periods")
        .select("*, student_subject_enrollments!inner(student_id)")
        .eq("id", period_id)
        .limit(1),
        entity="period",
    )
    period = parse_single_or_404(resp, entity="period")
    enrollment = period.get("student_subject_enrollments", {})
    if enrollment.get("student_id") != student_id:
        raise HTTPException(status_code=403, detail="Not your period")
    return period


def _verify_element_ownership(db: Client, element_id: str, student_id: str) -> dict:
    """Verify an element belongs to the student, return the element row."""
    resp = supabase_execute(
        db.table("subject_evaluation_elements")
        .select(
            "*, student_subject_periods!inner("
            "id, enrollment_id, student_subject_enrollments!inner(student_id)"
            ")"
        )
        .eq("id", element_id)
        .limit(1),
        entity="element",
    )
    element = parse_single_or_404(resp, entity="element")
    period = element.get("student_subject_periods", {})
    enrollment = period.get("student_subject_enrollments", {})
    if enrollment.get("student_id") != student_id:
        raise HTTPException(status_code=403, detail="Not your element")
    return element


# ── Settings ─────────────────────────────────────────────────


def get_settings(db: Client, student_id: str, academic_year: str) -> Optional[dict]:
    """Get grade settings for a student and academic year."""
    resp = supabase_execute(
        db.table("student_grade_settings")
        .select("*")
        .eq("student_id", student_id)
        .eq("academic_year", academic_year)
        .limit(1),
        entity="grade_settings",
    )
    if not resp.data:
        return None
    return resp.data[0]


def create_settings(
    db: Client, student_id: str, payload: GradeSettingsCreateIn
) -> dict:
    """Create grade settings + enrollments + empty periods for an academic year."""
    # Validate weights sum to 100
    weight_sum = sum(Decimal(str(w)) for w in payload.period_weights)
    if weight_sum != Decimal("100"):
        raise HTTPException(
            status_code=400,
            detail=f"Period weights must sum to 100, got {float(weight_sum)}",
        )

    num_periods = len(payload.period_weights)
    if payload.regime == "semestral" and num_periods != 2:
        raise HTTPException(status_code=400, detail="Semestral regime requires 2 weights")
    if payload.regime == "trimestral" and num_periods != 3:
        raise HTTPException(status_code=400, detail="Trimestral regime requires 3 weights")

    # Check for existing settings
    existing = get_settings(db, student_id, payload.academic_year)
    if existing:
        raise HTTPException(status_code=409, detail="Settings already exist for this year")

    # Create settings
    settings_data = {
        "student_id": student_id,
        "academic_year": payload.academic_year,
        "education_level": payload.education_level,
        "graduation_cohort_year": payload.graduation_cohort_year,
        "regime": payload.regime,
        "course": payload.course,
        "period_weights": [str(w) for w in payload.period_weights],
        "is_locked": False,
    }
    resp = supabase_execute(
        db.table("student_grade_settings").insert(settings_data),
        entity="grade_settings",
    )
    settings = parse_single_or_404(resp, entity="grade_settings")
    settings_id = settings["id"]

    # Sync course to profiles so it appears in class pickers and student lists
    if payload.course:
        try:
            db.table("profiles").update({"course": payload.course}).eq("id", student_id).execute()
        except Exception:
            logger.warning("Failed to sync course to profile for student %s", student_id)

    exam_ids = set(payload.exam_candidate_subject_ids or [])

    # Create enrollments + periods for each subject
    for subject_id in payload.subject_ids:
        enrollment_data = {
            "student_id": student_id,
            "subject_id": subject_id,
            "academic_year": payload.academic_year,
            "year_level": payload.year_level,
            "settings_id": settings_id,
            "is_active": True,
            "is_exam_candidate": subject_id in exam_ids,
        }
        enrollment_resp = supabase_execute(
            db.table("student_subject_enrollments").insert(enrollment_data),
            entity="enrollment",
        )
        enrollment = parse_single_or_404(enrollment_resp, entity="enrollment")

        # Create empty periods
        period_rows = [
            {
                "enrollment_id": enrollment["id"],
                "period_number": p + 1,
            }
            for p in range(num_periods)
        ]
        supabase_execute(
            db.table("student_subject_periods").insert(period_rows),
            entity="periods",
        )

    # ── Import past year grades (for 11º/12º) ──
    if payload.past_year_grades:
        _import_past_year_grades(
            db, student_id, payload, settings_id, num_periods
        )

    return settings


def _import_past_year_grades(
    db: Client,
    student_id: str,
    payload: GradeSettingsCreateIn,
    current_settings_id: str,
    num_periods: int,
) -> None:
    """Create settings + enrollments + annual grades for past years."""
    from collections import defaultdict

    # Group past grades by academic year
    by_year: dict[str, list] = defaultdict(list)
    for pg in payload.past_year_grades:
        by_year[pg.academic_year].append(pg)

    for past_year, grades in by_year.items():
        # Check if settings already exist for this past year
        existing = get_settings(db, student_id, past_year)
        if existing:
            past_settings_id = existing["id"]
        else:
            # Create settings for the past year (mirrors current year config)
            past_settings_data = {
                "student_id": student_id,
                "academic_year": past_year,
                "education_level": payload.education_level,
                "graduation_cohort_year": payload.graduation_cohort_year,
                "regime": payload.regime,
                "course": payload.course,
                "period_weights": [str(w) for w in payload.period_weights],
                "is_locked": True,  # Past years are locked
            }
            resp = supabase_execute(
                db.table("student_grade_settings").insert(past_settings_data),
                entity="grade_settings",
            )
            past_settings = parse_single_or_404(resp, entity="grade_settings")
            past_settings_id = past_settings["id"]

        # Create enrollments + annual grades for each subject in this past year
        for pg in grades:
            # Check if enrollment already exists
            existing_enr_resp = supabase_execute(
                db.table("student_subject_enrollments")
                .select("id")
                .eq("student_id", student_id)
                .eq("subject_id", pg.subject_id)
                .eq("academic_year", past_year)
                .limit(1),
                entity="enrollment",
            )
            if existing_enr_resp.data:
                enrollment_id = existing_enr_resp.data[0]["id"]
            else:
                enrollment_data = {
                    "student_id": student_id,
                    "subject_id": pg.subject_id,
                    "academic_year": past_year,
                    "year_level": pg.year_level,
                    "settings_id": past_settings_id,
                    "is_active": True,
                    "is_exam_candidate": False,
                }
                enr_resp = supabase_execute(
                    db.table("student_subject_enrollments").insert(enrollment_data),
                    entity="enrollment",
                )
                enrollment = parse_single_or_404(enr_resp, entity="enrollment")
                enrollment_id = enrollment["id"]

                # Create empty periods so the board view works for past years
                period_rows = [
                    {"enrollment_id": enrollment_id, "period_number": p + 1}
                    for p in range(num_periods)
                ]
                supabase_execute(
                    db.table("student_subject_periods").insert(period_rows),
                    entity="periods",
                )

            # Upsert annual grade only if a grade was provided
            if pg.annual_grade is not None:
                existing_ag_resp = supabase_execute(
                    db.table("student_annual_subject_grades")
                    .select("id")
                    .eq("enrollment_id", enrollment_id)
                    .limit(1),
                    entity="annual_grade",
                )

                annual_data = {
                    "enrollment_id": enrollment_id,
                    "raw_annual": str(pg.annual_grade),
                    "annual_grade": pg.annual_grade,
                    "is_locked": True,
                }

                if existing_ag_resp.data:
                    supabase_execute(
                        db.table("student_annual_subject_grades")
                        .update(annual_data)
                        .eq("id", existing_ag_resp.data[0]["id"]),
                        entity="annual_grade",
                    )
                else:
                    supabase_execute(
                        db.table("student_annual_subject_grades").insert(annual_data),
                        entity="annual_grade",
                    )


def setup_past_year(
    db: Client,
    student_id: str,
    payload,  # PastYearSetupIn
) -> dict:
    """
    Initialize a past academic year: create settings (copied from current year),
    enrollments, empty periods, and optional annual grades.
    Returns the board data for that year.
    """
    past_year = payload.academic_year
    year_level = payload.year_level

    # Find the student's most recent settings to use as template
    settings_resp = supabase_execute(
        db.table("student_grade_settings")
        .select("*")
        .eq("student_id", student_id)
        .order("academic_year", desc=True)
        .limit(1),
        entity="settings",
    )
    if not settings_resp.data:
        raise HTTPException(status_code=400, detail="No grade settings found. Complete setup first.")
    template = settings_resp.data[0]

    # Get or create settings for this past year
    existing = get_settings(db, student_id, past_year)
    if existing:
        past_settings_id = existing["id"]
        num_periods = len(existing["period_weights"])
    else:
        past_settings_data = {
            "student_id": student_id,
            "academic_year": past_year,
            "education_level": template["education_level"],
            "graduation_cohort_year": template.get("graduation_cohort_year"),
            "regime": template.get("regime"),
            "course": template.get("course"),
            "period_weights": template["period_weights"],
            "is_locked": True,
        }
        resp = supabase_execute(
            db.table("student_grade_settings").insert(past_settings_data),
            entity="grade_settings",
        )
        past_settings = parse_single_or_404(resp, entity="grade_settings")
        past_settings_id = past_settings["id"]
        num_periods = len(template["period_weights"])

    # Create enrollments + periods + annual grades
    for subj in payload.subjects:
        # Check if enrollment already exists
        existing_enr = supabase_execute(
            db.table("student_subject_enrollments")
            .select("id")
            .eq("student_id", student_id)
            .eq("subject_id", subj.subject_id)
            .eq("academic_year", past_year)
            .limit(1),
            entity="enrollment",
        )
        if existing_enr.data:
            enrollment_id = existing_enr.data[0]["id"]
        else:
            enrollment_data = {
                "student_id": student_id,
                "subject_id": subj.subject_id,
                "academic_year": past_year,
                "year_level": year_level,
                "settings_id": past_settings_id,
                "is_active": True,
                "is_exam_candidate": False,
            }
            enr_resp = supabase_execute(
                db.table("student_subject_enrollments").insert(enrollment_data),
                entity="enrollment",
            )
            enrollment = parse_single_or_404(enr_resp, entity="enrollment")
            enrollment_id = enrollment["id"]

            # Create empty periods
            period_rows = [
                {"enrollment_id": enrollment_id, "period_number": p + 1}
                for p in range(num_periods)
            ]
            supabase_execute(
                db.table("student_subject_periods").insert(period_rows),
                entity="periods",
            )

        # Upsert annual grade if provided
        if subj.annual_grade is not None:
            existing_ag = supabase_execute(
                db.table("student_annual_subject_grades")
                .select("id")
                .eq("enrollment_id", enrollment_id)
                .limit(1),
                entity="annual_grade",
            )
            annual_data = {
                "enrollment_id": enrollment_id,
                "raw_annual": str(subj.annual_grade),
                "annual_grade": subj.annual_grade,
                "is_locked": True,
            }
            if existing_ag.data:
                supabase_execute(
                    db.table("student_annual_subject_grades")
                    .update(annual_data)
                    .eq("id", existing_ag.data[0]["id"]),
                    entity="annual_grade",
                )
            else:
                supabase_execute(
                    db.table("student_annual_subject_grades").insert(annual_data),
                    entity="annual_grade",
                )

    return get_board_data(db, student_id, past_year)


def lock_settings(db: Client, student_id: str, settings_id: str) -> dict:
    """Lock settings to prevent changes."""
    resp = supabase_execute(
        db.table("student_grade_settings")
        .update({"is_locked": True})
        .eq("id", settings_id)
        .eq("student_id", student_id),
        entity="grade_settings",
    )
    return parse_single_or_404(resp, entity="grade_settings")


# ── Enrollments ──────────────────────────────────────────────


def list_enrollments(
    db: Client, student_id: str, academic_year: str
) -> list[dict]:
    """List enrollments for a student and year, with subject details."""
    resp = supabase_execute(
        db.table("student_subject_enrollments")
        .select("*, subjects(name, slug, color, icon, affects_cfs, has_national_exam)")
        .eq("student_id", student_id)
        .eq("academic_year", academic_year)
        .order("created_at", desc=False),
        entity="enrollments",
    )
    rows = resp.data or []
    for row in rows:
        subj = row.pop("subjects", {}) or {}
        row["subject_name"] = subj.get("name")
        row["subject_slug"] = subj.get("slug")
        row["subject_color"] = subj.get("color")
        row["subject_icon"] = subj.get("icon")
        row["affects_cfs"] = subj.get("affects_cfs")
        row["has_national_exam"] = subj.get("has_national_exam")
    return rows


def create_enrollment(
    db: Client, student_id: str, payload: EnrollmentCreateIn, settings_id: str
) -> dict:
    """Add a single subject enrollment."""
    data = {
        "student_id": student_id,
        "subject_id": payload.subject_id,
        "academic_year": payload.academic_year,
        "year_level": payload.year_level,
        "settings_id": settings_id,
        "is_active": True,
        "is_exam_candidate": payload.is_exam_candidate,
    }
    resp = supabase_execute(
        db.table("student_subject_enrollments").insert(data),
        entity="enrollment",
    )
    enrollment = parse_single_or_404(resp, entity="enrollment")

    # Get period count from settings
    settings = get_settings(db, student_id, payload.academic_year)
    num_periods = len(settings["period_weights"]) if settings else 3

    period_rows = [
        {"enrollment_id": enrollment["id"], "period_number": p + 1}
        for p in range(num_periods)
    ]
    supabase_execute(
        db.table("student_subject_periods").insert(period_rows),
        entity="periods",
    )
    return enrollment


def update_enrollment(
    db: Client, student_id: str, enrollment_id: str, payload: EnrollmentUpdateIn
) -> dict:
    """Update enrollment flags (deactivate, exam candidate)."""
    update_data = {}
    if payload.is_active is not None:
        update_data["is_active"] = payload.is_active
    if payload.is_exam_candidate is not None:
        update_data["is_exam_candidate"] = payload.is_exam_candidate
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    resp = supabase_execute(
        db.table("student_subject_enrollments")
        .update(update_data)
        .eq("id", enrollment_id)
        .eq("student_id", student_id),
        entity="enrollment",
    )
    return parse_single_or_404(resp, entity="enrollment")


# ── Period Grades ────────────────────────────────────────────


def update_period_grade(
    db: Client, student_id: str, period_id: str, payload: PeriodGradeUpdateIn
) -> dict:
    """Direct pauta grade entry (Mode A)."""
    _verify_period_ownership(db, period_id, student_id)

    update_data = {"is_overridden": False, "override_reason": None}
    if payload.pauta_grade is not None:
        update_data["pauta_grade"] = payload.pauta_grade
        update_data["calculated_grade"] = payload.pauta_grade
    if payload.qualitative_grade is not None:
        update_data["qualitative_grade"] = payload.qualitative_grade

    resp = supabase_execute(
        db.table("student_subject_periods")
        .update(update_data)
        .eq("id", period_id),
        entity="period",
    )
    period = parse_single_or_404(resp, entity="period")

    # Trigger annual grade recalculation
    _try_recalculate_annual(db, period["enrollment_id"])

    return period


def override_period_grade(
    db: Client, student_id: str, period_id: str, payload: PeriodGradeOverrideIn
) -> dict:
    """Override calculated grade with manual pauta + reason."""
    _verify_period_ownership(db, period_id, student_id)

    update_data = {
        "pauta_grade": payload.pauta_grade,
        "is_overridden": True,
        "override_reason": payload.override_reason,
    }
    resp = supabase_execute(
        db.table("student_subject_periods")
        .update(update_data)
        .eq("id", period_id),
        entity="period",
    )
    period = parse_single_or_404(resp, entity="period")

    _try_recalculate_annual(db, period["enrollment_id"])

    return period


# ── Evaluation Elements ──────────────────────────────────────


def get_elements(db: Client, student_id: str, period_id: str) -> list[dict]:
    """Get evaluation elements for a period."""
    _verify_period_ownership(db, period_id, student_id)

    resp = supabase_execute(
        db.table("subject_evaluation_elements")
        .select("*")
        .eq("period_id", period_id)
        .order("created_at", desc=False),
        entity="elements",
    )
    return resp.data or []


def replace_elements(
    db: Client, student_id: str, period_id: str, elements: list[EvaluationElementIn]
) -> list[dict]:
    """Replace all elements for a period (bulk set)."""
    _verify_period_ownership(db, period_id, student_id)

    # Validate weights sum to 100
    weight_sum = sum(Decimal(str(e.weight_percentage)) for e in elements)
    if weight_sum != Decimal("100"):
        raise HTTPException(
            status_code=400,
            detail=f"Element weights must sum to 100, got {float(weight_sum)}",
        )

    # Delete existing elements
    supabase_execute(
        db.table("subject_evaluation_elements")
        .delete()
        .eq("period_id", period_id),
        entity="elements",
    )

    # Insert new elements
    rows = [
        {
            "period_id": period_id,
            "element_type": e.element_type,
            "label": e.label,
            "icon": e.icon,
            "weight_percentage": str(e.weight_percentage),
            "raw_grade": str(e.raw_grade) if e.raw_grade is not None else None,
        }
        for e in elements
    ]
    if rows:
        supabase_execute(
            db.table("subject_evaluation_elements").insert(rows),
            entity="elements",
        )

    # Recalculate period grade
    recalculate_period_grade(db, period_id)

    resp = supabase_execute(
        db.table("subject_evaluation_elements")
        .select("*")
        .eq("period_id", period_id)
        .order("created_at", desc=False),
        entity="elements",
    )
    return resp.data or []


def update_element_grade(
    db: Client, student_id: str, element_id: str, raw_grade: Optional[float]
) -> dict:
    """Update a single element's grade."""
    element = _verify_element_ownership(db, element_id, student_id)

    update_data = {
        "raw_grade": str(raw_grade) if raw_grade is not None else None,
    }
    resp = supabase_execute(
        db.table("subject_evaluation_elements")
        .update(update_data)
        .eq("id", element_id),
        entity="element",
    )
    updated = parse_single_or_404(resp, entity="element")

    # Recalculate period grade
    recalculate_period_grade(db, element["period_id"])

    return updated


def copy_elements_to_other_periods(
    db: Client, student_id: str, period_id: str
) -> int:
    """Copy element types/weights from one period to all other periods of the same enrollment."""
    period = _verify_period_ownership(db, period_id, student_id)

    # Get source elements
    source_elements = get_elements(db, student_id, period_id)
    if not source_elements:
        raise HTTPException(status_code=400, detail="No elements to copy")

    # Get all periods for this enrollment
    resp = supabase_execute(
        db.table("student_subject_periods")
        .select("id, period_number")
        .eq("enrollment_id", period["enrollment_id"])
        .neq("id", period_id)
        .order("period_number", desc=False),
        entity="periods",
    )
    other_periods = resp.data or []

    copied_count = 0
    for target_period in other_periods:
        # Delete existing elements in target
        supabase_execute(
            db.table("subject_evaluation_elements")
            .delete()
            .eq("period_id", target_period["id"]),
            entity="elements",
        )
        # Copy structure (not grades)
        rows = [
            {
                "period_id": target_period["id"],
                "element_type": e["element_type"],
                "label": e["label"],
                "icon": e.get("icon"),
                "weight_percentage": e["weight_percentage"],
                "raw_grade": None,
            }
            for e in source_elements
        ]
        if rows:
            supabase_execute(
                db.table("subject_evaluation_elements").insert(rows),
                entity="elements",
            )
            copied_count += 1

    return copied_count


# ── Algorithm A: Period Grade Calculation ────────────────────


def recalculate_period_grade(db: Client, period_id: str) -> dict:
    """
    Recalculate a period's grade from its evaluation elements.
    raw_calculated = SUM(element.raw_grade × element.weight_percentage / 100)
    calculated_grade = ROUND_HALF_UP(raw_calculated)
    """
    resp = supabase_execute(
        db.table("subject_evaluation_elements")
        .select("weight_percentage, raw_grade")
        .eq("period_id", period_id),
        entity="elements",
    )
    elements = resp.data or []

    if not elements:
        # No elements — clear calculated fields
        supabase_execute(
            db.table("student_subject_periods")
            .update({"raw_calculated": None, "calculated_grade": None})
            .eq("id", period_id),
            entity="period",
        )
        return {}

    graded = [e for e in elements if e.get("raw_grade") is not None]
    if not graded:
        supabase_execute(
            db.table("student_subject_periods")
            .update({"raw_calculated": None, "calculated_grade": None})
            .eq("id", period_id),
            entity="period",
        )
        return {}

    raw_calculated = sum(
        _dec(e["raw_grade"]) * _dec(e["weight_percentage"]) / Decimal("100")
        for e in graded
    )
    calculated_grade = _round_half_up(raw_calculated)

    update_data = {
        "raw_calculated": str(raw_calculated),
        "calculated_grade": calculated_grade,
    }

    # If not overridden, also update pauta_grade
    period_resp = supabase_execute(
        db.table("student_subject_periods")
        .select("is_overridden, enrollment_id")
        .eq("id", period_id)
        .limit(1),
        entity="period",
    )
    period = period_resp.data[0] if period_resp.data else {}
    if not period.get("is_overridden"):
        update_data["pauta_grade"] = calculated_grade

    supabase_execute(
        db.table("student_subject_periods")
        .update(update_data)
        .eq("id", period_id),
        entity="period",
    )

    # Cascade: try to recalculate annual
    if period.get("enrollment_id"):
        _try_recalculate_annual(db, period["enrollment_id"])

    return update_data


# ── Algorithm B: Annual Grade (CAF) ─────────────────────────


def _try_recalculate_annual(db: Client, enrollment_id: str) -> Optional[dict]:
    """Attempt to recalculate the annual grade if all periods have pauta grades."""
    # Get enrollment to find settings
    enrollment_resp = supabase_execute(
        db.table("student_subject_enrollments")
        .select("settings_id")
        .eq("id", enrollment_id)
        .limit(1),
        entity="enrollment",
    )
    if not enrollment_resp.data:
        return None
    settings_id = enrollment_resp.data[0]["settings_id"]

    # Get settings for weights
    settings_resp = supabase_execute(
        db.table("student_grade_settings")
        .select("period_weights")
        .eq("id", settings_id)
        .limit(1),
        entity="settings",
    )
    if not settings_resp.data:
        return None
    weights = settings_resp.data[0]["period_weights"]

    # Get all periods for this enrollment
    periods_resp = supabase_execute(
        db.table("student_subject_periods")
        .select("period_number, pauta_grade")
        .eq("enrollment_id", enrollment_id)
        .order("period_number", desc=False),
        entity="periods",
    )
    periods = periods_resp.data or []

    # Check if all periods have pauta grades
    if not all(p.get("pauta_grade") is not None for p in periods):
        # Not all periods graded — delete existing annual grade if any
        supabase_execute(
            db.table("student_annual_subject_grades")
            .delete()
            .eq("enrollment_id", enrollment_id),
            entity="annual_grade",
        )
        return None

    # Calculate: raw_annual = SUM(pauta_grade[i] × weight[i] / 100)
    raw_annual = Decimal("0")
    for period in periods:
        idx = period["period_number"] - 1
        if idx < len(weights):
            raw_annual += _dec(period["pauta_grade"]) * _dec(weights[idx]) / Decimal("100")

    annual_grade = _round_half_up(raw_annual)

    # Upsert annual grade
    existing_resp = supabase_execute(
        db.table("student_annual_subject_grades")
        .select("id")
        .eq("enrollment_id", enrollment_id)
        .limit(1),
        entity="annual_grade",
    )

    annual_data = {
        "enrollment_id": enrollment_id,
        "raw_annual": str(raw_annual),
        "annual_grade": annual_grade,
    }

    if existing_resp.data:
        supabase_execute(
            db.table("student_annual_subject_grades")
            .update(annual_data)
            .eq("id", existing_resp.data[0]["id"]),
            entity="annual_grade",
        )
    else:
        supabase_execute(
            db.table("student_annual_subject_grades").insert(annual_data),
            entity="annual_grade",
        )

    return annual_data


# ── Board Data ───────────────────────────────────────────────


def get_board_data(db: Client, student_id: str, academic_year: str) -> dict:
    """Get full kanban board data: settings + subjects with periods + annual grades."""
    settings = get_settings(db, student_id, academic_year)
    if not settings:
        return {"settings": None, "subjects": []}

    enrollments = list_enrollments(db, student_id, academic_year)

    subjects = []
    for enrollment in enrollments:
        # Get periods with elements
        periods_resp = supabase_execute(
            db.table("student_subject_periods")
            .select("*")
            .eq("enrollment_id", enrollment["id"])
            .order("period_number", desc=False),
            entity="periods",
        )
        periods = periods_resp.data or []

        # Get elements for each period
        for period in periods:
            elements_resp = supabase_execute(
                db.table("subject_evaluation_elements")
                .select("*")
                .eq("period_id", period["id"])
                .order("created_at", desc=False),
                entity="elements",
            )
            period["elements"] = elements_resp.data or []

        # Get annual grade
        annual_resp = supabase_execute(
            db.table("student_annual_subject_grades")
            .select("*")
            .eq("enrollment_id", enrollment["id"])
            .limit(1),
            entity="annual_grade",
        )
        annual_grade = annual_resp.data[0] if annual_resp.data else None

        subjects.append({
            "enrollment": enrollment,
            "periods": periods,
            "annual_grade": annual_grade,
        })

    return {"settings": settings, "subjects": subjects}


# ── Annual Grades List ───────────────────────────────────────


def get_annual_grades(db: Client, student_id: str, academic_year: str) -> list[dict]:
    """Get all annual grades for a year."""
    enrollments = list_enrollments(db, student_id, academic_year)
    results = []
    for enrollment in enrollments:
        resp = supabase_execute(
            db.table("student_annual_subject_grades")
            .select("*")
            .eq("enrollment_id", enrollment["id"])
            .limit(1),
            entity="annual_grade",
        )
        if resp.data:
            grade = resp.data[0]
            grade["subject_name"] = enrollment.get("subject_name")
            grade["subject_id"] = enrollment.get("subject_id")
            results.append(grade)
    return results


def update_annual_grade(
    db: Client,
    student_id: str,
    subject_id: str,
    academic_year: str,
    annual_grade: int,
) -> dict:
    """Update (or create) an annual grade for a past year."""
    # Find enrollment for this student + subject + year
    enrollment_resp = supabase_execute(
        db.table("student_subject_enrollments")
        .select("id")
        .eq("student_id", student_id)
        .eq("subject_id", subject_id)
        .eq("academic_year", academic_year)
        .limit(1),
        entity="enrollment",
    )
    if not enrollment_resp.data:
        raise HTTPException(
            status_code=404,
            detail=f"No enrollment found for subject in {academic_year}",
        )
    enrollment_id = enrollment_resp.data[0]["id"]

    # Upsert annual grade
    existing_resp = supabase_execute(
        db.table("student_annual_subject_grades")
        .select("id")
        .eq("enrollment_id", enrollment_id)
        .limit(1),
        entity="annual_grade",
    )

    annual_data = {
        "enrollment_id": enrollment_id,
        "raw_annual": str(annual_grade),
        "annual_grade": annual_grade,
    }

    if existing_resp.data:
        resp = supabase_execute(
            db.table("student_annual_subject_grades")
            .update(annual_data)
            .eq("id", existing_resp.data[0]["id"]),
            entity="annual_grade",
        )
    else:
        annual_data["is_locked"] = False
        resp = supabase_execute(
            db.table("student_annual_subject_grades").insert(annual_data),
            entity="annual_grade",
        )

    return parse_single_or_404(resp, entity="annual_grade")


# ── Algorithm C: CIF (Multi-Year Internal Average) ──────────


def _compute_cif(annual_grades: list[int]) -> tuple[Decimal, int]:
    """Compute CIF from annual grades across years."""
    n = len(annual_grades)
    if n == 0:
        raise ValueError("No annual grades")
    total = sum(_dec(g) for g in annual_grades)
    cif_raw = total / Decimal(str(n))
    cif_grade = _round_half_up(cif_raw)
    return cif_raw, cif_grade


# ── Algorithm D: CFD (CIF + Exam) ───────────────────────────


def _compute_cfd(
    cif_grade: int,
    exam_grade_raw: Optional[int],
    exam_weight: Optional[Decimal],
) -> tuple[Decimal, int]:
    """Compute CFD by blending CIF with exam grade.

    Args:
        cif_grade: Internal classification (0-20, integer).
        exam_grade_raw: Exam score on the 0-200 scale (raw IAVE result).
            CE = exam_grade_raw / 10 (e.g. 145 → 14.5, not rounded).
        exam_weight: Exam weight as percentage (e.g. Decimal("25")).
    """
    if exam_grade_raw is None or exam_weight is None:
        return _dec(cif_grade), cif_grade

    ce = _dec(exam_grade_raw) / Decimal("10")  # 145 → 14.5
    internal_weight = Decimal("100") - exam_weight
    cfd_raw = (_dec(cif_grade) * internal_weight + ce * exam_weight) / Decimal("100")
    cfd_grade = _round_half_up(cfd_raw)
    return cfd_raw, cfd_grade


# ── CFS Dashboard ────────────────────────────────────────────


def get_cfs_dashboard(db: Client, student_id: str) -> dict:
    """Get CFS dashboard data: all CFDs across all years."""
    # Get latest settings (for cohort year)
    settings_resp = supabase_execute(
        db.table("student_grade_settings")
        .select("*")
        .eq("student_id", student_id)
        .order("academic_year", desc=True)
        .limit(1),
        entity="settings",
    )
    settings = settings_resp.data[0] if settings_resp.data else None

    # Get all enrollments across all years
    enrollments_resp = supabase_execute(
        db.table("student_subject_enrollments")
        .select("*, subjects(name, slug, affects_cfs, has_national_exam)")
        .eq("student_id", student_id)
        .eq("is_active", True)
        .order("academic_year", desc=False),
        entity="enrollments",
    )
    enrollments = enrollments_resp.data or []

    # Group by subject
    subject_enrollments: dict[str, list[dict]] = {}
    subject_info: dict[str, dict] = {}
    for e in enrollments:
        sid = e["subject_id"]
        subj = e.pop("subjects", {}) or {}
        if sid not in subject_info:
            subject_info[sid] = subj
        subject_enrollments.setdefault(sid, []).append(e)

    cfds = []
    for subject_id, enrs in subject_enrollments.items():
        info = subject_info.get(subject_id, {})
        duration_years = len(enrs)

        # Gather annual grades per year
        annual_grades_list = []
        annual_grades_detail = []
        for enr in sorted(enrs, key=lambda x: x["academic_year"]):
            ag_resp = supabase_execute(
                db.table("student_annual_subject_grades")
                .select("*")
                .eq("enrollment_id", enr["id"])
                .limit(1),
                entity="annual_grade",
            )
            if ag_resp.data:
                ag = ag_resp.data[0]
                annual_grades_list.append(ag["annual_grade"])
                annual_grades_detail.append({
                    "year_level": enr["year_level"],
                    "academic_year": enr["academic_year"],
                    "annual_grade": ag["annual_grade"],
                })

        if not annual_grades_list:
            continue

        # Compute CIF
        cif_raw, cif_grade = _compute_cif(annual_grades_list)

        # Get or create CFD record
        terminal_year = enrs[-1]["academic_year"]
        existing_cfd_resp = supabase_execute(
            db.table("student_subject_cfd")
            .select("*")
            .eq("student_id", student_id)
            .eq("subject_id", subject_id)
            .eq("academic_year", terminal_year)
            .limit(1),
            entity="cfd",
        )
        existing_cfd = existing_cfd_resp.data[0] if existing_cfd_resp.data else None

        # Only use exam grade when the student is an exam candidate
        terminal_enrollment = enrs[-1]
        is_candidate = terminal_enrollment.get("is_exam_candidate", False)

        exam_grade_raw = None
        exam_grade = None
        exam_weight = None
        education_level = settings.get("education_level", "") if settings else ""
        is_basico_3 = education_level == "basico_3_ciclo"

        if existing_cfd and is_candidate:
            exam_grade_raw = existing_cfd.get("exam_grade_raw")
            exam_grade = existing_cfd.get("exam_grade")
            if not is_basico_3 and exam_grade_raw is None:
                # Secundário: fall back to rounded × 10 for legacy data
                eg = existing_cfd.get("exam_grade")
                exam_grade_raw = eg * 10 if eg is not None else None

        if is_basico_3:
            # Básico 3º Ciclo: 30% weight, use converted level (1-5)
            if exam_grade_raw is not None and info.get("has_national_exam"):
                exam_weight = Decimal("30")
                exam_level = _convert_percentage_to_level(exam_grade_raw)
                cfd_raw = (_dec(cif_grade) * Decimal("70") + _dec(exam_level) * Decimal("30")) / Decimal("100")
                cfd_grade = _round_half_up(cfd_raw)
            else:
                cfd_raw, cfd_grade = _dec(cif_grade), cif_grade
        else:
            if exam_grade_raw is not None:
                # Post-2023 cohorts: always 25%. Legacy: biennial 25%, triennial 30%.
                cohort_year = settings.get("graduation_cohort_year") if settings else None
                if cohort_year and cohort_year >= 2023:
                    exam_weight = Decimal("25")
                else:
                    exam_weight = Decimal("25") if duration_years == 2 else Decimal("30")
            cfd_raw, cfd_grade = _compute_cfd(cif_grade, exam_grade_raw, exam_weight)

        cfd_data = {
            "student_id": student_id,
            "subject_id": subject_id,
            "academic_year": terminal_year,
            "cif_raw": str(cif_raw),
            "cif_grade": cif_grade,
            "exam_grade": exam_grade,
            "exam_grade_raw": exam_grade_raw,
            "exam_weight": str(float(exam_weight)) if exam_weight else None,
            "cfd_raw": str(cfd_raw),
            "cfd_grade": cfd_grade,
        }

        if existing_cfd and not existing_cfd.get("is_finalized"):
            supabase_execute(
                db.table("student_subject_cfd")
                .update(cfd_data)
                .eq("id", existing_cfd["id"]),
                entity="cfd",
            )
            cfd_data["id"] = existing_cfd["id"]
            cfd_data["is_finalized"] = existing_cfd.get("is_finalized", False)
        elif not existing_cfd:
            cfd_data["is_finalized"] = False
            resp = supabase_execute(
                db.table("student_subject_cfd").insert(cfd_data),
                entity="cfd",
            )
            cfd_data = resp.data[0] if resp.data else cfd_data
        else:
            cfd_data = existing_cfd

        # Hydrate
        cfd_data["subject_name"] = info.get("name")
        cfd_data["subject_slug"] = info.get("slug")
        cfd_data["affects_cfs"] = info.get("affects_cfs", True)
        cfd_data["has_national_exam"] = info.get("has_national_exam", False)
        cfd_data["is_exam_candidate"] = is_candidate
        cfd_data["duration_years"] = duration_years
        cfd_data["annual_grades"] = annual_grades_detail

        cfds.append(cfd_data)

    # Compute CFS preview
    computed_cfs = None
    computed_dges = None
    if settings and cfds:
        computed_cfs, computed_dges = _compute_cfs_value(
            cfds,
            settings.get("graduation_cohort_year"),
        )

    # Get existing snapshot
    snapshot = None
    if settings:
        snap_resp = supabase_execute(
            db.table("student_cfs_snapshot")
            .select("*")
            .eq("student_id", student_id)
            .order("created_at", desc=True)
            .limit(1),
            entity="snapshot",
        )
        snapshot = snap_resp.data[0] if snap_resp.data else None

    return {
        "settings": settings,
        "cfds": cfds,
        "snapshot": snapshot,
        "computed_cfs": computed_cfs,
        "computed_dges": computed_dges,
    }


# ── Algorithm E: CFS (The GPA) ──────────────────────────────


def _compute_cfs_value(
    cfds: list[dict], cohort_year: Optional[int]
) -> tuple[Optional[float], Optional[int]]:
    """
    Compute CFS from all CFDs.
    Pre-2025: Simple mean of all CFDs
    Post-2025: Weighted mean (triennial ×3, biennial ×2, annual ×1)
    """
    eligible = [c for c in cfds if c.get("affects_cfs", True)]
    if not eligible:
        return None, None

    use_weighted = cohort_year is not None and cohort_year >= 2025

    if use_weighted:
        numerator = Decimal("0")
        denominator = Decimal("0")
        for c in eligible:
            dur = _dec(c.get("duration_years", 1))
            numerator += _dec(c["cfd_grade"]) * dur
            denominator += dur
        if denominator == 0:
            return None, None
        cfs_raw = numerator / denominator
    else:
        total = sum(_dec(c["cfd_grade"]) for c in eligible)
        cfs_raw = total / Decimal(str(len(eligible)))

    cfs_value = _truncate_one_decimal(cfs_raw)
    dges_value = round(cfs_value * 10)
    return cfs_value, dges_value


def update_exam_grade(
    db: Client, student_id: str, cfd_id: str, payload: ExamGradeUpdateIn
) -> dict:
    """Enter/update national exam grade for a CFD."""
    # Verify ownership
    resp = supabase_execute(
        db.table("student_subject_cfd")
        .select("*")
        .eq("id", cfd_id)
        .eq("student_id", student_id)
        .limit(1),
        entity="cfd",
    )
    cfd = parse_single_or_404(resp, entity="cfd")

    if cfd.get("is_finalized"):
        raise HTTPException(status_code=400, detail="CFD is already finalized")

    # Store both raw (0-200) and rounded (0-20)
    raw_200 = payload.exam_grade_raw
    exam_grade_20 = _round_half_up(_dec(raw_200) / Decimal("10"))

    update_data = {
        "exam_grade": exam_grade_20,
        "exam_grade_raw": raw_200,
    }
    resp = supabase_execute(
        db.table("student_subject_cfd")
        .update(update_data)
        .eq("id", cfd_id),
        entity="cfd",
    )
    return parse_single_or_404(resp, entity="cfd")


def _convert_percentage_to_level(score: int) -> int:
    """Convert a Prova Final percentage (0-100) to level (1-5) using standard thresholds."""
    if score >= 90:
        return 5
    if score >= 70:
        return 4
    if score >= 50:
        return 3
    if score >= 20:
        return 2
    return 1


def update_basico_exam_grade(
    db: Client, student_id: str, cfd_id: str, payload: BasicoExamGradeUpdateIn
) -> dict:
    """Enter/update Prova Final grade for a Básico 3º Ciclo CFD."""
    # Verify ownership
    resp = supabase_execute(
        db.table("student_subject_cfd")
        .select("*")
        .eq("id", cfd_id)
        .eq("student_id", student_id)
        .limit(1),
        entity="cfd",
    )
    cfd = parse_single_or_404(resp, entity="cfd")

    if cfd.get("is_finalized"):
        raise HTTPException(status_code=400, detail="CFD is already finalized")

    # Convert 0-100 percentage to 1-5 level
    percentage = payload.exam_percentage
    exam_level = _convert_percentage_to_level(percentage)

    # Recalculate CFD: annual × 70% + exam_level × 30%
    cif_grade = cfd.get("cif_grade", 0)
    cfd_raw = (_dec(cif_grade) * Decimal("70") + _dec(exam_level) * Decimal("30")) / Decimal("100")
    cfd_grade = _round_half_up(cfd_raw)

    update_data = {
        "exam_grade": exam_level,       # 1-5 level
        "exam_grade_raw": percentage,    # 0-100 raw percentage
        "exam_weight": "30.00",
        "cfd_raw": str(cfd_raw),
        "cfd_grade": cfd_grade,
    }
    resp = supabase_execute(
        db.table("student_subject_cfd")
        .update(update_data)
        .eq("id", cfd_id),
        entity="cfd",
    )
    return parse_single_or_404(resp, entity="cfd")


def create_cfs_snapshot(db: Client, student_id: str, academic_year: str) -> dict:
    """Finalize and snapshot the CFS."""
    dashboard = get_cfs_dashboard(db, student_id)

    settings = dashboard.get("settings")
    if not settings:
        raise HTTPException(status_code=400, detail="No grade settings found")

    cfds = dashboard.get("cfds", [])
    cfs_value = dashboard.get("computed_cfs")
    dges_value = dashboard.get("computed_dges")

    if cfs_value is None:
        raise HTTPException(status_code=400, detail="Cannot compute CFS — missing CFDs")

    cohort_year = settings.get("graduation_cohort_year", 2025)
    formula = "weighted_mean" if cohort_year >= 2025 else "simple_mean"

    # Build snapshot JSON
    cfd_snapshot = {
        "subjects": [
            {
                "subject_id": c.get("subject_id"),
                "name": c.get("subject_name"),
                "cfd_grade": c.get("cfd_grade"),
                "duration_years": c.get("duration_years"),
                "weight": c.get("duration_years"),
                "has_exam": c.get("exam_grade") is not None,
                "exam_grade": c.get("exam_grade"),
                "affects_cfs": c.get("affects_cfs", True),
            }
            for c in cfds
        ],
        "formula": formula,
        "cohort": cohort_year,
    }

    snapshot_data = {
        "student_id": student_id,
        "academic_year": academic_year,
        "graduation_cohort_year": cohort_year,
        "cfs_value": str(cfs_value),
        "dges_value": dges_value,
        "formula_used": formula,
        "cfd_snapshot": cfd_snapshot,
        "is_finalized": True,
    }

    # Upsert
    existing_resp = supabase_execute(
        db.table("student_cfs_snapshot")
        .select("id")
        .eq("student_id", student_id)
        .eq("academic_year", academic_year)
        .limit(1),
        entity="snapshot",
    )

    if existing_resp.data:
        resp = supabase_execute(
            db.table("student_cfs_snapshot")
            .update(snapshot_data)
            .eq("id", existing_resp.data[0]["id"]),
            entity="snapshot",
        )
    else:
        resp = supabase_execute(
            db.table("student_cfs_snapshot").insert(snapshot_data),
            entity="snapshot",
        )

    # Finalize all CFDs
    for c in cfds:
        if c.get("id"):
            try:
                db.table("student_subject_cfd").update(
                    {"is_finalized": True}
                ).eq("id", c["id"]).execute()
            except Exception:
                logger.warning("Failed to finalize CFD %s", c.get("id"))

    return parse_single_or_404(resp, entity="snapshot")
