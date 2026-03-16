"""
Grades service — business logic for the grade calculator (Calculadora de Médias).

All grade calculations use Python Decimal for precision, matching
PostgreSQL NUMERIC columns. This avoids floating-point errors that
could cause incorrect rounding at critical thresholds (e.g. 9.5 → 10 vs 9.4 → 9).
"""

from __future__ import annotations

import json
import logging
import math
from collections import defaultdict
from decimal import InvalidOperation, ROUND_HALF_UP, Decimal
from typing import Optional

from fastapi import HTTPException, status
from supabase import Client

from app.api.http.schemas.grades import (
    BasicoExamGradeUpdateIn,
    CumulativeWeightsUpdateIn,
    DomainsReplaceIn,
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

BASICO_EXAM_SUBJECT_SLUGS = {
    "basico_3_ciclo_mat",
    "basico_3_ciclo_port",
}
_CFD_EXTENDED_COLUMNS_SUPPORTED: bool | None = None
_VIRTUAL_CFD_PREFIX = "virtual-cfd--"

# ── Summary / Detail SELECT constants (calendar pattern) ────
# Grades follows the progressive-loading convention: the board endpoint
# returns summary data only (enrollments + period summaries). Full detail
# data is loaded on demand via dedicated endpoints:
#   GET /periods/{id}/elements  → _batch_hydrate not needed (flat rows)
#   GET /enrollments/{id}/domains → _batch_hydrate not needed (flat rows)
# This replaces the traditional _batch_hydrate_details() with per-entity
# detail endpoints, which is a valid alternative for complex nested data.
#
# Board list view: enrollments with subject join
ENROLLMENT_BOARD_SELECT = (
    "id,student_id,subject_id,academic_year,year_level,settings_id,"
    "is_active,is_exam_candidate,cumulative_weights,created_at,updated_at,"
    "subjects(name,slug,color,icon,affects_cfs,has_national_exam)"
)

# Board list view: period summary (no elements)
PERIOD_BOARD_SELECT = (
    "id,enrollment_id,period_number,raw_calculated,calculated_grade,"
    "pauta_grade,is_overridden,override_reason,qualitative_grade,is_locked,"
    "own_raw,own_grade,cumulative_raw,cumulative_grade"
)


# ── Helpers ──────────────────────────────────────────────────


def _dec(value) -> Decimal:
    """Convert any numeric value to Decimal safely."""
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def _normalize_cumulative_weights(
    value,
    *,
    enrollment_id: str | None = None,
) -> list[list[Decimal]] | None:
    """Parse and validate cumulative weights loaded from the database.

    Malformed legacy data should not crash grade recalculation; when invalid,
    we log and fall back to the non-cumulative path.
    """
    if value is None:
        return None

    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            logger.warning(
                "Ignoring malformed cumulative_weights JSON for enrollment %s: %r",
                enrollment_id,
                value,
            )
            return None

    if not isinstance(value, list):
        logger.warning(
            "Ignoring malformed cumulative_weights type for enrollment %s: %r",
            enrollment_id,
            type(value).__name__,
        )
        return None

    normalized: list[list[Decimal]] = []
    for i, row in enumerate(value):
        if not isinstance(row, list) or len(row) != i + 1:
            logger.warning(
                "Ignoring malformed cumulative_weights row for enrollment %s at row %s: %r",
                enrollment_id,
                i,
                row,
            )
            return None

        normalized_row: list[Decimal] = []
        for cell in row:
            try:
                normalized_row.append(_dec(cell))
            except (InvalidOperation, TypeError, ValueError):
                logger.warning(
                    "Ignoring malformed cumulative_weights value for enrollment %s: %r",
                    enrollment_id,
                    cell,
                )
                return None

        if sum(normalized_row) != Decimal("100"):
            logger.warning(
                "Ignoring cumulative_weights row that does not sum to 100 for enrollment %s at row %s: %r",
                enrollment_id,
                i,
                row,
            )
            return None

        normalized.append(normalized_row)

    return normalized


def _round_half_up(value: Decimal) -> int:
    """Standard arithmetic rounding (half-up) to integer."""
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _truncate_one_decimal(value: Decimal) -> float:
    """Truncate to 1 decimal place (never round up). 14.68 → 14.6."""
    shifted = value * 10
    truncated = Decimal(math.floor(shifted))
    return float(truncated / 10)


def _is_mandatory_portuguese_enrollment(subject_slug: str | None, year_level: str | None) -> bool:
    return subject_slug == "secundario_port" and str(year_level or "") == "12"


def _is_basico_exam_subject(subject_slug: str | None, subject_name: str | None) -> bool:
    return str(subject_slug or "") in BASICO_EXAM_SUBJECT_SLUGS


def _enrollment_has_edit_data(db: Client, enrollment: dict) -> bool:
    periods_resp = supabase_execute(
        db.table("student_subject_periods")
        .select("id, pauta_grade, qualitative_grade")
        .eq("enrollment_id", enrollment["id"]),
        entity="periods",
    )
    periods = periods_resp.data or []
    period_ids = [period["id"] for period in periods]

    if any(
        period.get("pauta_grade") is not None or period.get("qualitative_grade") is not None
        for period in periods
    ):
        return True

    if period_ids:
        elements_resp = supabase_execute(
            db.table("subject_evaluation_elements")
            .select("id, raw_grade")
            .in_("period_id", period_ids),
            entity="elements",
        )
        elements = elements_resp.data or []
        if elements:
            return True

    annual_resp = supabase_execute(
        db.table("student_annual_subject_grades")
        .select("id, annual_grade, raw_annual")
        .eq("enrollment_id", enrollment["id"])
        .limit(1),
        entity="annual_grade",
    )
    annual = annual_resp.data[0] if annual_resp.data else None
    if annual and (
        annual.get("annual_grade") is not None or annual.get("raw_annual") is not None
    ):
        return True

    cfd_select = "id, exam_grade, exam_grade_raw, exam_weight" if _supports_extended_cfd_columns(db) else "id, exam_grade"
    cfd_resp = supabase_execute(
        db.table("student_subject_cfd")
        .select(cfd_select)
        .eq("student_id", enrollment["student_id"])
        .eq("subject_id", enrollment["subject_id"])
        .eq("academic_year", enrollment["academic_year"])
        .limit(1),
        entity="cfd",
    )
    cfd = cfd_resp.data[0] if cfd_resp.data else None
    if cfd and (
        cfd.get("exam_grade") is not None
        or cfd.get("exam_grade_raw") is not None
        or cfd.get("exam_weight") is not None
    ):
        return True

    if enrollment.get("is_exam_candidate"):
        return True

    return False


def _fetch_subject_map(db: Client, subject_ids: list[str]) -> dict[str, dict]:
    if not subject_ids:
        return {}

    resp = supabase_execute(
        db.table("subjects")
        .select("id, slug, name, color, icon, affects_cfs, has_national_exam")
        .in_("id", subject_ids),
        entity="subjects",
    )
    return {row["id"]: row for row in (resp.data or [])}


def _build_virtual_cfd_id(subject_id: str, academic_year: str) -> str:
    return f"{_VIRTUAL_CFD_PREFIX}{subject_id}--{academic_year}"


def _parse_virtual_cfd_id(cfd_id: str) -> tuple[str, str] | None:
    if not cfd_id.startswith(_VIRTUAL_CFD_PREFIX):
        return None

    payload = cfd_id[len(_VIRTUAL_CFD_PREFIX) :]
    subject_id, separator, academic_year = payload.partition("--")
    if not separator or not subject_id or not academic_year:
        return None
    return subject_id, academic_year


def _hydrate_enrollment_subjects(enrollments: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for enrollment in enrollments:
        row = dict(enrollment)
        subject = row.pop("subjects", {}) or {}
        row["subject_name"] = subject.get("name")
        row["subject_slug"] = subject.get("slug")
        row["subject_color"] = subject.get("color")
        row["subject_icon"] = subject.get("icon")
        row["affects_cfs"] = subject.get("affects_cfs")
        row["has_national_exam"] = subject.get("has_national_exam")
        row["is_exam_candidate"] = _resolve_exam_candidate(row, subject)
        rows.append(row)
    return rows


def _list_enrollment_rows(
    db: Client,
    student_id: str,
    *,
    academic_year: str | None = None,
    active_only: bool | None = None,
) -> list[dict]:
    query = (
        db.table("student_subject_enrollments")
        .select("*, subjects(name, slug, color, icon, affects_cfs, has_national_exam)")
        .eq("student_id", student_id)
    )
    if academic_year is not None:
        query = query.eq("academic_year", academic_year)
    if active_only is not None:
        query = query.eq("is_active", active_only)

    resp = supabase_execute(
        query.order("academic_year", desc=False).order("created_at", desc=False),
        entity="enrollments",
    )
    return _hydrate_enrollment_subjects(resp.data or [])


def _resolve_exam_candidate(enrollment: dict, subject: dict | None = None) -> bool:
    subject_slug = enrollment.get("subject_slug")
    if subject_slug is None and subject:
        subject_slug = subject.get("slug")

    if _is_mandatory_portuguese_enrollment(subject_slug, enrollment.get("year_level")):
        return True
    return bool(enrollment.get("is_exam_candidate"))


def _get_settings_by_id(db: Client, settings_id: str) -> dict:
    resp = supabase_execute(
        db.table("student_grade_settings")
        .select("*")
        .eq("id", settings_id)
        .limit(1),
        entity="grade_settings",
    )
    return parse_single_or_404(resp, entity="grade_settings")


def _assert_settings_unlocked(db: Client, settings_id: str) -> dict:
    settings = _get_settings_by_id(db, settings_id)
    if settings.get("is_locked"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This academic year is locked",
        )
    return settings


def _get_enrollment_with_subject(db: Client, enrollment_id: str, student_id: str) -> dict:
    resp = supabase_execute(
        db.table("student_subject_enrollments")
        .select("*, subjects(slug)")
        .eq("id", enrollment_id)
        .eq("student_id", student_id)
        .limit(1),
        entity="enrollment",
    )
    enrollment = parse_single_or_404(resp, entity="enrollment")
    subject = enrollment.pop("subjects", {}) or {}
    enrollment["subject_slug"] = subject.get("slug")
    return enrollment


def _assert_enrollment_writable(db: Client, enrollment_id: str, student_id: str) -> dict:
    enrollment = _get_enrollment_with_subject(db, enrollment_id, student_id)
    _assert_settings_unlocked(db, enrollment["settings_id"])
    return enrollment


def _supports_extended_cfd_columns(db: Client) -> bool:
    global _CFD_EXTENDED_COLUMNS_SUPPORTED
    if _CFD_EXTENDED_COLUMNS_SUPPORTED is not None:
        return _CFD_EXTENDED_COLUMNS_SUPPORTED

    try:
        supabase_execute(
            db.table("student_subject_cfd").select("exam_grade_raw, exam_weight").limit(1),
            entity="cfd",
        )
        _CFD_EXTENDED_COLUMNS_SUPPORTED = True
    except HTTPException as exc:
        if "exam_grade_raw" in str(exc.detail) or "exam_weight" in str(exc.detail):
            _CFD_EXTENDED_COLUMNS_SUPPORTED = False
        else:
            raise
    return _CFD_EXTENDED_COLUMNS_SUPPORTED


def _normalize_existing_cfd(db: Client, cfd: dict) -> dict:
    if _supports_extended_cfd_columns(db):
        return cfd

    normalized = dict(cfd)
    exam_grade = normalized.get("exam_grade")
    normalized.setdefault("exam_grade_raw", exam_grade * 10 if exam_grade is not None else None)
    normalized.setdefault("exam_weight", None)
    return normalized


def _cfd_write_payload(db: Client, data: dict) -> dict:
    if _supports_extended_cfd_columns(db):
        return data

    trimmed = dict(data)
    trimmed.pop("exam_grade_raw", None)
    trimmed.pop("exam_weight", None)
    return trimmed


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
    """Verify an element belongs to the student, return the element row.

    Supports both legacy (period_id-based) and domain-based elements.
    """
    # First try: plain fetch without joins (works for both paths)
    resp = supabase_execute(
        db.table("subject_evaluation_elements")
        .select("*")
        .eq("id", element_id)
        .limit(1),
        entity="element",
    )
    element = parse_single_or_404(resp, entity="element")

    # Verify ownership via period_id path
    if element.get("period_id"):
        period_resp = supabase_execute(
            db.table("student_subject_periods")
            .select("id, enrollment_id, student_subject_enrollments!inner(student_id)")
            .eq("id", element["period_id"])
            .limit(1),
            entity="period",
        )
        period = parse_single_or_404(period_resp, entity="period")
        enrollment = period.get("student_subject_enrollments", {})
        if enrollment.get("student_id") != student_id:
            raise HTTPException(status_code=403, detail="Not your element")
        element["_enrollment_id"] = period.get("enrollment_id")
        return element

    # Verify ownership via domain_id path
    if element.get("domain_id"):
        domain_resp = supabase_execute(
            db.table("subject_evaluation_domains")
            .select("id, enrollment_id, student_subject_enrollments!inner(student_id)")
            .eq("id", element["domain_id"])
            .limit(1),
            entity="domain",
        )
        domain = parse_single_or_404(domain_resp, entity="domain")
        enrollment = domain.get("student_subject_enrollments", {})
        if enrollment.get("student_id") != student_id:
            raise HTTPException(status_code=403, detail="Not your element")
        element["_enrollment_id"] = domain.get("enrollment_id")
        return element

    raise HTTPException(status_code=404, detail="Element has no owner")


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
    subject_map = _fetch_subject_map(db, payload.subject_ids)

    # Create enrollments + periods for each subject
    for subject_id in payload.subject_ids:
        subject = subject_map.get(subject_id, {})
        enrollment_data = {
            "student_id": student_id,
            "subject_id": subject_id,
            "academic_year": payload.academic_year,
            "year_level": payload.year_level,
            "settings_id": settings_id,
            "is_active": True,
            "is_exam_candidate": _resolve_exam_candidate(
                {
                    "year_level": payload.year_level,
                    "is_exam_candidate": subject_id in exam_ids,
                },
                subject,
            ),
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

    # Create enrollments + annual grades
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
    return _list_enrollment_rows(db, student_id, academic_year=academic_year)


def create_enrollment(
    db: Client, student_id: str, payload: EnrollmentCreateIn, settings_id: str
) -> dict:
    """Add a single subject enrollment."""
    settings = _get_settings_by_id(db, settings_id)
    subject_map = _fetch_subject_map(db, [payload.subject_id])
    subject = subject_map.get(payload.subject_id, {})
    data = {
        "student_id": student_id,
        "subject_id": payload.subject_id,
        "academic_year": payload.academic_year,
        "year_level": payload.year_level,
        "settings_id": settings_id,
        "is_active": True,
        "is_exam_candidate": _resolve_exam_candidate(
            {
                "year_level": payload.year_level,
                "is_exam_candidate": payload.is_exam_candidate,
            },
            subject,
        ),
    }
    resp = supabase_execute(
        db.table("student_subject_enrollments").insert(data),
        entity="enrollment",
    )
    enrollment = parse_single_or_404(resp, entity="enrollment")

    if not settings.get("is_locked"):
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
    enrollment = _get_enrollment_with_subject(db, enrollment_id, student_id)
    settings = _get_settings_by_id(db, enrollment["settings_id"])
    update_data = {}
    if payload.is_active is not None:
        if (
            not settings.get("is_locked")
            and payload.is_active is False
            and enrollment.get("is_active") is not False
        ):
            if _enrollment_has_edit_data(db, enrollment):
                raise HTTPException(
                    status_code=400,
                    detail="Esta disciplina já tem dados e não pode ser removida.",
                )
        update_data["is_active"] = payload.is_active
    if payload.is_exam_candidate is not None:
        update_data["is_exam_candidate"] = _resolve_exam_candidate(
            {
                **enrollment,
                "is_exam_candidate": payload.is_exam_candidate,
            }
        )
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    resp = supabase_execute(
        db.table("student_subject_enrollments")
        .update(update_data)
        .eq("id", enrollment_id)
        .eq("student_id", student_id),
        entity="enrollment",
    )
    updated = parse_single_or_404(resp, entity="enrollment")
    return _build_enrollment_mutation_result(db, student_id, updated)


# ── Period Grades ────────────────────────────────────────────


def update_period_grade(
    db: Client, student_id: str, period_id: str, payload: PeriodGradeUpdateIn
) -> dict:
    """Direct pauta grade entry (Mode A)."""
    period_owner = _verify_period_ownership(db, period_id, student_id)
    _assert_enrollment_writable(db, period_owner["enrollment_id"], student_id)

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
    saved_period = parse_single_or_404(resp, entity="period")

    # Trigger annual grade recalculation
    _try_recalculate_annual(db, saved_period["enrollment_id"])

    return {
        "period": _get_period_with_summary(db, period_id),
        "annual_grade": _get_annual_grade_for_enrollment(db, saved_period["enrollment_id"]),
    }


def override_period_grade(
    db: Client, student_id: str, period_id: str, payload: PeriodGradeOverrideIn
) -> dict:
    """Override calculated grade with manual pauta + reason."""
    period_owner = _verify_period_ownership(db, period_id, student_id)
    _assert_enrollment_writable(db, period_owner["enrollment_id"], student_id)

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
    saved_period = parse_single_or_404(resp, entity="period")

    _try_recalculate_annual(db, saved_period["enrollment_id"])

    return {
        "period": _get_period_with_summary(db, period_id),
        "annual_grade": _get_annual_grade_for_enrollment(db, saved_period["enrollment_id"]),
    }


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
) -> dict:
    """Replace all elements for a period (bulk set)."""
    period_owner = _verify_period_ownership(db, period_id, student_id)
    _assert_enrollment_writable(db, period_owner["enrollment_id"], student_id)

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
    return {
        "elements": resp.data or [],
        "period": _get_period_with_summary(db, period_id),
        "annual_grade": _get_annual_grade_for_enrollment(db, period_owner["enrollment_id"]),
    }


def update_element_grade(
    db: Client, student_id: str, element_id: str, raw_grade: Optional[float],
    label: Optional[str] = None,
) -> dict:
    """Update a single element's grade and/or label. Supports both legacy and domain-based elements."""
    element = _verify_element_ownership(db, element_id, student_id)
    enrollment_id = element.get("_enrollment_id")
    if enrollment_id:
        _assert_enrollment_writable(db, enrollment_id, student_id)

    update_data: dict = {
        "raw_grade": str(raw_grade) if raw_grade is not None else None,
    }
    if label is not None:
        update_data["label"] = label
    resp = supabase_execute(
        db.table("subject_evaluation_elements")
        .update(update_data)
        .eq("id", element_id),
        entity="element",
    )
    updated = parse_single_or_404(resp, entity="element")

    # Domain-based element: find the period by enrollment + period_number
    if element.get("domain_id") and element.get("period_number") and enrollment_id:
        periods_resp = supabase_execute(
            db.table("student_subject_periods")
            .select("id")
            .eq("enrollment_id", enrollment_id)
            .eq("period_number", element["period_number"])
            .limit(1),
            entity="period",
        )
        period_row = (periods_resp.data or [None])[0]
        if period_row:
            recalculate_period_grade(db, period_row["id"])
            return {
                "element": updated,
                "period": _get_period_with_summary(db, period_row["id"]),
                "annual_grade": _get_annual_grade_for_enrollment(db, enrollment_id),
            }

    # Legacy path: period_id is on the element
    if element.get("period_id"):
        recalculate_period_grade(db, element["period_id"])
        return {
            "element": updated,
            "period": _get_period_with_summary(db, element["period_id"]),
            "annual_grade": _get_annual_grade_for_enrollment(db, enrollment_id),
        }

    return {
        "element": updated,
        "period": {},
        "annual_grade": None,
    }


def copy_elements_to_other_periods(
    db: Client, student_id: str, period_id: str
) -> int:
    """Copy element types/weights from one period to all other periods of the same enrollment."""
    period = _verify_period_ownership(db, period_id, student_id)
    _assert_enrollment_writable(db, period["enrollment_id"], student_id)

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

    If the enrollment uses domain-based evaluation, the domain-weighted
    calculation takes precedence and produces own_raw / own_grade, then
    triggers the cumulative cascade.
    """
    # Fetch period info first (needed for domain check)
    period_resp = supabase_execute(
        db.table("student_subject_periods")
        .select("is_overridden, enrollment_id, period_number")
        .eq("id", period_id)
        .limit(1),
        entity="period",
    )
    period = period_resp.data[0] if period_resp.data else {}
    enrollment_id = period.get("enrollment_id")

    # ── Legacy flat-element path ──
    resp = supabase_execute(
        db.table("subject_evaluation_elements")
        .select("weight_percentage, raw_grade")
        .eq("period_id", period_id),
        entity="elements",
    )
    elements = resp.data or []

    # Check if enrollment has domains
    has_domains = False
    if enrollment_id:
        domain_check_resp = supabase_execute(
            db.table("subject_evaluation_domains")
            .select("id")
            .eq("enrollment_id", enrollment_id)
            .limit(1),
            entity="domains",
        )
        has_domains = bool(domain_check_resp.data)

    if has_domains:
        # ── Domain-based calculation path ──
        return _recalculate_period_grade_domains(db, period_id, period)

    # ── Legacy flat-element path (unchanged) ──
    if not elements:
        supabase_execute(
            db.table("student_subject_periods")
            .update({
                "raw_calculated": None,
                "calculated_grade": None,
                "own_raw": None,
                "own_grade": None,
            })
            .eq("id", period_id),
            entity="period",
        )
        return {}

    graded = [e for e in elements if e.get("raw_grade") is not None]
    if not graded:
        supabase_execute(
            db.table("student_subject_periods")
            .update({
                "raw_calculated": None,
                "calculated_grade": None,
                "own_raw": None,
                "own_grade": None,
            })
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

    if not period.get("is_overridden"):
        update_data["pauta_grade"] = calculated_grade

    supabase_execute(
        db.table("student_subject_periods")
        .update(update_data)
        .eq("id", period_id),
        entity="period",
    )

    # Cascade: try to recalculate annual
    if enrollment_id:
        _try_recalculate_annual(db, enrollment_id)

    return update_data


def _recalculate_period_grade_domains(
    db: Client, period_id: str, period: dict
) -> dict:
    """Domain-weighted period grade calculation.

    For each domain with period_weights[period_number-1] > 0:
      - Fetch elements for this domain + period_number with raw_grade IS NOT NULL
      - If all elements have weight_percentage NULL → simple average
      - Else → weighted average SUM(raw_grade * weight_percentage / 100)
      - Multiply by domain.period_weights[period_number-1] / 100
    Sum all domain contributions → own_raw.
    """
    enrollment_id = period["enrollment_id"]
    period_number = period["period_number"]

    # Fetch all domains for this enrollment
    domains_resp = supabase_execute(
        db.table("subject_evaluation_domains")
        .select("id, period_weights")
        .eq("enrollment_id", enrollment_id)
        .order("sort_order", desc=False),
        entity="domains",
    )
    domains = domains_resp.data or []

    own_raw = Decimal("0")
    has_any_graded = False

    for domain in domains:
        weights_arr = domain.get("period_weights", [])
        idx = period_number - 1
        if idx >= len(weights_arr):
            continue
        domain_weight = _dec(weights_arr[idx])
        if domain_weight <= Decimal("0"):
            continue

        # Fetch elements for this domain + period_number with a grade
        elems_resp = supabase_execute(
            db.table("subject_evaluation_elements")
            .select("raw_grade, weight_percentage")
            .eq("domain_id", domain["id"])
            .eq("period_number", period_number),
            entity="elements",
        )
        all_elems = elems_resp.data or []
        graded = [e for e in all_elems if e.get("raw_grade") is not None]
        if not graded:
            continue

        has_any_graded = True

        # Check if all elements have weight_percentage NULL → simple average
        all_null_weights = all(
            e.get("weight_percentage") is None for e in graded
        )

        if all_null_weights:
            domain_avg = sum(_dec(e["raw_grade"]) for e in graded) / Decimal(str(len(graded)))
        else:
            domain_avg = sum(
                _dec(e["raw_grade"]) * _dec(e.get("weight_percentage", 0)) / Decimal("100")
                for e in graded
            )

        own_raw += domain_avg * domain_weight / Decimal("100")

    if not has_any_graded:
        supabase_execute(
            db.table("student_subject_periods")
            .update({
                "raw_calculated": None,
                "calculated_grade": None,
                "own_raw": None,
                "own_grade": None,
            })
            .eq("id", period_id),
            entity="period",
        )
        if enrollment_id:
            _recalculate_cumulative_cascade(db, enrollment_id)
        return {}

    own_grade = _round_half_up(own_raw)

    update_data = {
        "own_raw": str(own_raw),
        "own_grade": own_grade,
        "raw_calculated": str(own_raw),
        "calculated_grade": own_grade,
    }
    if not period.get("is_overridden"):
        update_data["pauta_grade"] = own_grade

    supabase_execute(
        db.table("student_subject_periods")
        .update(update_data)
        .eq("id", period_id),
        entity="period",
    )

    # Trigger cumulative cascade
    if enrollment_id:
        _recalculate_cumulative_cascade(db, enrollment_id)

    return update_data


# ── Algorithm B: Annual Grade (CAF) ─────────────────────────


def _recalculate_cumulative_cascade(db: Client, enrollment_id: str) -> None:
    """Compute cumulative grades for all periods of an enrollment.

    If cumulative_weights is NULL, cumulative = own for each period.
    Otherwise, apply the blending matrix:
      P1: cumulative = own
      P2: cumulative = cw[1][0]/100 * P1_cumul + cw[1][1]/100 * P2_own
      P3: cumulative = cw[2][0]/100 * P1_cumul + cw[2][1]/100 * P2_cumul + cw[2][2]/100 * P3_own
    """
    enrollment_resp = supabase_execute(
        db.table("student_subject_enrollments")
        .select("cumulative_weights")
        .eq("id", enrollment_id)
        .limit(1),
        entity="enrollment",
    )
    if not enrollment_resp.data:
        return
    cumulative_weights = _normalize_cumulative_weights(
        enrollment_resp.data[0].get("cumulative_weights"),
        enrollment_id=enrollment_id,
    )

    # Fetch all periods ordered by period_number
    periods_resp = supabase_execute(
        db.table("student_subject_periods")
        .select("id, period_number, own_raw, own_grade, is_overridden")
        .eq("enrollment_id", enrollment_id)
        .order("period_number", desc=False),
        entity="periods",
    )
    periods = periods_resp.data or []

    if cumulative_weights is None:
        # No cumulative blending: cumulative = own
        for period in periods:
            update_data = {
                "cumulative_raw": period.get("own_raw"),
                "cumulative_grade": period.get("own_grade"),
            }
            # Also update calculated_grade and pauta_grade from own
            if period.get("own_grade") is not None:
                update_data["calculated_grade"] = period["own_grade"]
                if not period.get("is_overridden"):
                    update_data["pauta_grade"] = period["own_grade"]
            supabase_execute(
                db.table("student_subject_periods")
                .update(update_data)
                .eq("id", period["id"]),
                entity="period",
            )
        _try_recalculate_annual(db, enrollment_id)
        return

    # Build cumulative grades using the weight matrix
    cumulative_values: list[Decimal | None] = []  # cumulative_raw per period index
    for i, period in enumerate(periods):
        own_raw = period.get("own_raw")
        if own_raw is None:
            cumulative_values.append(None)
            supabase_execute(
                db.table("student_subject_periods")
                .update({
                    "cumulative_raw": None,
                    "cumulative_grade": None,
                })
                .eq("id", period["id"]),
                entity="period",
            )
            continue

        if i == 0:
            # P1: cumulative = own
            cumul_raw = _dec(own_raw)
        else:
            # Apply weight row: cw[i][0]*P1_cumul + cw[i][1]*P2_cumul + ... + cw[i][i]*Pi_own
            if i >= len(cumulative_weights):
                cumul_raw = _dec(own_raw)
            else:
                row = cumulative_weights[i]
                cumul_raw = Decimal("0")
                for j in range(len(row)):
                    weight_j = row[j] / Decimal("100")
                    if j < i:
                        # Previous period's cumulative
                        prev_cumul = cumulative_values[j] if j < len(cumulative_values) else None
                        if prev_cumul is not None:
                            cumul_raw += prev_cumul * weight_j
                    elif j == i:
                        # Current period's own
                        cumul_raw += _dec(own_raw) * weight_j

        cumulative_values.append(cumul_raw)
        cumul_grade = _round_half_up(cumul_raw)

        update_data = {
            "cumulative_raw": str(cumul_raw),
            "cumulative_grade": cumul_grade,
            "calculated_grade": cumul_grade,
        }
        if not period.get("is_overridden"):
            update_data["pauta_grade"] = cumul_grade

        supabase_execute(
            db.table("student_subject_periods")
            .update(update_data)
            .eq("id", period["id"]),
            entity="period",
        )

    # Annual grade = last period's cumulative_grade (when cumulative_weights is set)
    last_cumul = cumulative_values[-1] if cumulative_values else None
    if last_cumul is not None:
        annual_grade = _round_half_up(last_cumul)
        _upsert_annual_grade(db, enrollment_id, last_cumul, annual_grade)
    else:
        # Not all periods graded — delete existing annual
        supabase_execute(
            db.table("student_annual_subject_grades")
            .delete()
            .eq("enrollment_id", enrollment_id),
            entity="annual_grade",
        )


def _upsert_annual_grade(
    db: Client, enrollment_id: str, raw_annual: Decimal, annual_grade: int
) -> dict:
    """Upsert an annual grade row for an enrollment."""
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


def _try_recalculate_annual(db: Client, enrollment_id: str) -> Optional[dict]:
    """Recalculate the annual grade from the latest final period grade.

    If a teacher manually overrides the final period `pauta_grade`, that value
    must become the annual grade. In cumulative mode we only fall back to the
    calculated cumulative grade when the latest period has no visible final
    grade yet.
    """
    # Get enrollment to find settings + cumulative_weights
    enrollment_resp = supabase_execute(
        db.table("student_subject_enrollments")
        .select("settings_id, cumulative_weights")
        .eq("id", enrollment_id)
        .limit(1),
        entity="enrollment",
    )
    if not enrollment_resp.data:
        return None
    enrollment_row = enrollment_resp.data[0]
    cumulative_weights = _normalize_cumulative_weights(
        enrollment_row.get("cumulative_weights"),
        enrollment_id=enrollment_id,
    )

    # Get all periods for this enrollment
    periods_resp = supabase_execute(
        db.table("student_subject_periods")
        .select("period_number, pauta_grade, cumulative_grade, cumulative_raw")
        .eq("enrollment_id", enrollment_id)
        .order("period_number", desc=False),
        entity="periods",
    )
    periods = periods_resp.data or []

    # In cumulative mode, annual should match the latest visible/final period grade.
    # If a teacher manually overrides pauta_grade, that must win over calculated cumulative.
    if cumulative_weights is not None:
        graded = [
            p
            for p in periods
            if p.get("pauta_grade") is not None or p.get("cumulative_grade") is not None
        ]
        if graded:
            latest = graded[-1]
            if latest.get("pauta_grade") is not None:
                raw = _dec(latest["pauta_grade"])
                grade = latest["pauta_grade"]
            else:
                raw = _dec(latest["cumulative_raw"])
                grade = latest["cumulative_grade"]
            return _upsert_annual_grade(db, enrollment_id, raw, grade)
        else:
            supabase_execute(
                db.table("student_annual_subject_grades")
                .delete()
                .eq("enrollment_id", enrollment_id),
                entity="annual_grade",
            )
            return None

    final_period = periods[-1] if periods else None
    if not final_period or final_period.get("pauta_grade") is None:
        supabase_execute(
            db.table("student_annual_subject_grades")
            .delete()
            .eq("enrollment_id", enrollment_id),
            entity="annual_grade",
        )
        return None

    raw_annual = _dec(final_period["pauta_grade"])
    annual_grade = final_period["pauta_grade"]
    return _upsert_annual_grade(db, enrollment_id, raw_annual, annual_grade)


def _get_period_with_summary(db: Client, period_id: str) -> dict:
    resp = supabase_execute(
        db.table("student_subject_periods")
        .select("*")
        .eq("id", period_id)
        .limit(1),
        entity="period",
    )
    period = parse_single_or_404(resp, entity="period")
    element_count_resp = supabase_execute(
        db.table("subject_evaluation_elements")
        .select("id")
        .eq("period_id", period_id),
        entity="elements",
    )
    period["has_elements"] = bool(element_count_resp.data)
    return period


def _get_annual_grade_for_enrollment(db: Client, enrollment_id: str) -> Optional[dict]:
    resp = supabase_execute(
        db.table("student_annual_subject_grades")
        .select("*")
        .eq("enrollment_id", enrollment_id)
        .limit(1),
        entity="annual_grade",
    )
    if not resp.data:
        return None
    return resp.data[0]


# ── Board Data ───────────────────────────────────────────────


def _batch_hydrate_board_summaries(
    db: Client,
    enrollments: list[dict],
    settings: dict,
) -> list[dict]:
    """Batch hydration for the board list view (calendar pattern).

    Collects all enrollment IDs, then batch-fetches periods, element presence,
    annual grades, and domain presence in O(1) queries per type. Full domain
    and element data is loaded on demand via the dedicated per-enrollment and
    per-period endpoints.
    """
    enrollment_ids = [e["id"] for e in enrollments]
    if not enrollment_ids:
        return []

    is_locked = settings.get("is_locked")

    # ── Batch 1: periods (summary columns only) ──
    periods_by_enrollment: dict[str, list[dict]] = defaultdict(list)
    if not is_locked:
        periods_resp = supabase_execute(
            db.table("student_subject_periods")
            .select(PERIOD_BOARD_SELECT)
            .in_("enrollment_id", enrollment_ids)
            .order("period_number", desc=False),
            entity="periods",
        )
        periods = periods_resp.data or []
        period_ids = [p["id"] for p in periods]

        # Element presence check (lightweight — just period_id, not full rows)
        periods_with_elements: set[str] = set()
        if period_ids:
            elements_resp = supabase_execute(
                db.table("subject_evaluation_elements")
                .select("period_id")
                .in_("period_id", period_ids),
                entity="elements",
            )
            periods_with_elements = {
                row["period_id"]
                for row in (elements_resp.data or [])
                if row.get("period_id")
            }

        for period in periods:
            period["has_elements"] = period["id"] in periods_with_elements
            periods_by_enrollment[period["enrollment_id"]].append(period)

    # ── Batch 2: annual grades ──
    annual_by_enrollment: dict[str, dict] = {}
    if enrollment_ids:
        annual_resp = supabase_execute(
            db.table("student_annual_subject_grades")
            .select("*")
            .in_("enrollment_id", enrollment_ids),
            entity="annual_grades",
        )
        annual_by_enrollment = {
            row["enrollment_id"]: row for row in (annual_resp.data or [])
        }

    # ── Batch 3: domain presence check (lightweight — enrollment_id only) ──
    enrollments_with_domains: set[str] = set()
    if not is_locked:
        domains_resp = supabase_execute(
            db.table("subject_evaluation_domains")
            .select("enrollment_id")
            .in_("enrollment_id", enrollment_ids),
            entity="domains",
        )
        enrollments_with_domains = {
            row["enrollment_id"] for row in (domains_resp.data or [])
        }

    # ── Backfill: recalculate missing annual grades ──
    # Ensures data consistency for enrollments that have period grades
    # but were created before automatic annual-grade recalculation.
    if not is_locked:
        for enrollment in enrollments:
            eid = enrollment["id"]
            if eid not in annual_by_enrollment:
                periods_for = periods_by_enrollment.get(eid, [])
                has_any_grade = any(
                    p.get("pauta_grade") is not None
                    or p.get("cumulative_grade") is not None
                    for p in periods_for
                )
                if has_any_grade:
                    result = _try_recalculate_annual(db, eid)
                    if result:
                        annual_by_enrollment[eid] = result

    # ── Assemble subjects ──
    return [
        {
            "enrollment": enrollment,
            "periods": periods_by_enrollment.get(enrollment["id"], []),
            "annual_grade": annual_by_enrollment.get(enrollment["id"]),
            "has_domains": enrollment["id"] in enrollments_with_domains,
        }
        for enrollment in enrollments
    ]


def get_board_data(db: Client, student_id: str, academic_year: str) -> dict:
    """Get board data: settings + subjects with period summaries + annual grades.

    Follows the progressive loading pattern: this endpoint returns summary-level
    data only. Full domain data and element details are fetched on demand via
    GET /enrollments/{id}/domains and GET /periods/{id}/elements.
    """
    settings = get_settings(db, student_id, academic_year)
    if not settings:
        return {"settings": None, "subjects": []}

    enrollments = list_enrollments(db, student_id, academic_year)
    subjects = _batch_hydrate_board_summaries(db, enrollments, settings)

    return {"settings": settings, "subjects": subjects}


# ── Annual Grades List ───────────────────────────────────────


def get_annual_grades(db: Client, student_id: str, academic_year: str) -> list[dict]:
    """Get all annual grades for a year."""
    enrollments = list_enrollments(db, student_id, academic_year)
    enrollment_ids = [enrollment["id"] for enrollment in enrollments]
    if not enrollment_ids:
        return []

    resp = supabase_execute(
        db.table("student_annual_subject_grades")
        .select("*")
        .in_("enrollment_id", enrollment_ids),
        entity="annual_grades",
    )
    enrollment_map = {enrollment["id"]: enrollment for enrollment in enrollments}
    results = []
    for grade in resp.data or []:
        enrollment = enrollment_map.get(grade["enrollment_id"])
        if not enrollment:
            continue
        results.append(
            {
                **grade,
                "subject_name": enrollment.get("subject_name"),
                "subject_id": enrollment.get("subject_id"),
            }
        )
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

    updated = parse_single_or_404(resp, entity="annual_grade")
    return _build_annual_grade_mutation_result(
        db,
        student_id,
        updated,
        subject_id=subject_id,
        academic_year=academic_year,
    )


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


def _resolve_default_exam_weight(
    *,
    education_level: str,
) -> Decimal:
    if education_level == "basico_3_ciclo":
        return Decimal("30")
    return Decimal("25")


# ── CFS Dashboard ────────────────────────────────────────────


def get_cfs_dashboard(db: Client, student_id: str) -> dict:
    """Get CFS dashboard data: all CFDs across all years."""
    settings_resp = supabase_execute(
        db.table("student_grade_settings")
        .select("*")
        .eq("student_id", student_id)
        .order("academic_year", desc=True)
        .limit(1),
        entity="settings",
    )
    settings = settings_resp.data[0] if settings_resp.data else None

    enrollments = _list_enrollment_rows(db, student_id, active_only=True)
    enrollment_ids = [enrollment["id"] for enrollment in enrollments]

    annual_grade_map: dict[str, dict] = {}
    if enrollment_ids:
        annual_resp = supabase_execute(
            db.table("student_annual_subject_grades")
            .select("*")
            .in_("enrollment_id", enrollment_ids),
            entity="annual_grades",
        )
        annual_grade_map = {
            row["enrollment_id"]: row for row in (annual_resp.data or [])
        }

    # For enrollments without annual grades, get latest period grade.
    # The last period (3º período / 2º semestre) IS the definitive internal grade.
    # Earlier periods are provisional.
    num_periods = 3 if (not settings or settings.get("regime") != "semestral") else 2
    missing_annual_ids = [eid for eid in enrollment_ids if eid not in annual_grade_map]
    period_grade_map: dict[str, dict] = {}  # eid -> {grade, is_provisional}
    if missing_annual_ids:
        periods_resp = supabase_execute(
            db.table("student_subject_periods")
            .select("enrollment_id, period_number, pauta_grade, calculated_grade")
            .in_("enrollment_id", missing_annual_ids)
            .order("period_number", desc=True),
            entity="periods",
        )
        for row in (periods_resp.data or []):
            eid = row["enrollment_id"]
            if eid in period_grade_map:
                continue
            grade = row.get("pauta_grade") or row.get("calculated_grade")
            if grade is not None:
                is_last_period = row["period_number"] == num_periods
                period_grade_map[eid] = {
                    "grade": grade,
                    "is_provisional": not is_last_period,
                }

    existing_cfds_map: dict[tuple[str, str], dict] = {}
    if enrollments:
        terminal_years = {enrollment["academic_year"] for enrollment in enrollments}
        existing_cfds_resp = supabase_execute(
            db.table("student_subject_cfd")
            .select("*")
            .eq("student_id", student_id),
            entity="cfds",
        )
        existing_cfds_map = {
            (row["subject_id"], row["academic_year"]): _normalize_existing_cfd(db, row)
            for row in (existing_cfds_resp.data or [])
            if row.get("academic_year") in terminal_years
        }

    subject_enrollments: dict[str, list[dict]] = defaultdict(list)
    for enrollment in enrollments:
        subject_enrollments[enrollment["subject_id"]].append(enrollment)

    cfds = []
    for subject_id, enrs in subject_enrollments.items():
        enrs = sorted(enrs, key=lambda row: row["academic_year"])
        terminal_enrollment = enrs[-1]
        terminal_year = terminal_enrollment["academic_year"]
        info = {
            "name": terminal_enrollment.get("subject_name"),
            "slug": terminal_enrollment.get("subject_slug"),
            "affects_cfs": terminal_enrollment.get("affects_cfs", True),
            "has_national_exam": terminal_enrollment.get("has_national_exam", False),
        }
        duration_years = len(enrs)

        annual_grades_list = []
        annual_grades_detail = []
        has_provisional = False
        for enr in enrs:
            annual_grade_row = annual_grade_map.get(enr["id"])
            period_fallback = period_grade_map.get(enr["id"])
            grade_value = annual_grade_row["annual_grade"] if annual_grade_row else (period_fallback["grade"] if period_fallback else None)
            if not annual_grade_row and period_fallback and period_fallback.get("is_provisional"):
                has_provisional = True
            annual_grades_list.append(grade_value)
            annual_grades_detail.append(
                {
                    "year_level": enr["year_level"],
                    "academic_year": enr["academic_year"],
                    "annual_grade": grade_value,
                }
            )

        # Include subjects even without annual grades (current year not finished)
        non_null_grades = [g for g in annual_grades_list if g is not None]
        cif_raw, cif_grade = _compute_cif(non_null_grades) if non_null_grades else (None, None)
        existing_cfd = existing_cfds_map.get((subject_id, terminal_year))
        is_candidate = _resolve_exam_candidate(terminal_enrollment)

        exam_grade_raw = None
        exam_grade = None
        exam_weight = None
        education_level = settings.get("education_level", "") if settings else ""
        is_basico_3 = education_level == "basico_3_ciclo"

        if existing_cfd and is_candidate:
            exam_grade_raw = existing_cfd.get("exam_grade_raw")
            exam_grade = existing_cfd.get("exam_grade")
            stored_exam_weight = existing_cfd.get("exam_weight")
            if stored_exam_weight is not None:
                exam_weight = _dec(stored_exam_weight)
            if not is_basico_3 and exam_grade_raw is None:
                stored_grade = existing_cfd.get("exam_grade")
                exam_grade_raw = stored_grade * 10 if stored_grade is not None else None

        cfd_raw, cfd_grade = None, None
        if cif_grade is not None:
            if is_basico_3:
                if exam_weight is None and is_candidate:
                    exam_weight = _resolve_default_exam_weight(
                        education_level=education_level
                    )
                if exam_grade_raw is not None and _is_basico_exam_subject(
                    info.get("slug"), info.get("name")
                ):
                    exam_level = _convert_percentage_to_level(exam_grade_raw)
                    weight = exam_weight or _resolve_default_exam_weight(
                        education_level=education_level
                    )
                    internal_weight = Decimal("100") - weight
                    cfd_raw = (_dec(cif_grade) * internal_weight + _dec(exam_level) * weight) / Decimal("100")
                    cfd_grade = _round_half_up(cfd_raw)
                else:
                    cfd_raw, cfd_grade = _dec(cif_grade), cif_grade
            else:
                if exam_weight is None and is_candidate:
                    exam_weight = _resolve_default_exam_weight(
                        education_level=education_level
                    )
                cfd_raw, cfd_grade = _compute_cfd(cif_grade, exam_grade_raw, exam_weight)
        else:
            if exam_weight is None and is_candidate:
                exam_weight = _resolve_default_exam_weight(
                    education_level=education_level
                )

        cfd_data = {
            "id": existing_cfd["id"] if existing_cfd else _build_virtual_cfd_id(subject_id, terminal_year),
            "student_id": student_id,
            "subject_id": subject_id,
            "academic_year": terminal_year,
            "cif_raw": str(cif_raw) if cif_raw is not None else None,
            "cif_grade": cif_grade,
            "exam_grade": exam_grade,
            "exam_grade_raw": exam_grade_raw,
            "exam_weight": str(float(exam_weight)) if exam_weight is not None else None,
            "cfd_raw": str(cfd_raw) if cfd_raw is not None else None,
            "cfd_grade": cfd_grade,
            "is_finalized": bool(existing_cfd.get("is_finalized")) if existing_cfd else False,
            "subject_name": info.get("name"),
            "subject_slug": info.get("slug"),
            "affects_cfs": info.get("affects_cfs", True),
            "has_national_exam": info.get("has_national_exam", False),
            "is_exam_candidate": is_candidate,
            "duration_years": duration_years,
            "annual_grades": annual_grades_detail,
            "is_provisional": has_provisional,
        }

        if existing_cfd and existing_cfd.get("is_finalized"):
            cfd_data = {
                **existing_cfd,
                "subject_name": info.get("name"),
                "subject_slug": info.get("slug"),
                "affects_cfs": info.get("affects_cfs", True),
                "has_national_exam": info.get("has_national_exam", False),
                "is_exam_candidate": is_candidate,
                "duration_years": duration_years,
                "annual_grades": annual_grades_detail,
            }

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


def _find_dashboard_cfd(
    dashboard: dict,
    *,
    subject_id: str,
    academic_year: str,
) -> Optional[dict]:
    return next(
        (
            cfd
            for cfd in dashboard.get("cfds", [])
            if cfd.get("subject_id") == subject_id
            and cfd.get("academic_year") == academic_year
        ),
        None,
    )


def _build_enrollment_mutation_result(
    db: Client,
    student_id: str,
    enrollment: dict,
) -> dict:
    dashboard = get_cfs_dashboard(db, student_id)
    cfd = _find_dashboard_cfd(
        dashboard,
        subject_id=enrollment["subject_id"],
        academic_year=enrollment["academic_year"],
    )
    return {
        "enrollment": _hydrate_enrollment_subjects([enrollment])[0],
        "cfd": cfd,
        "computed_cfs": dashboard.get("computed_cfs"),
        "computed_dges": dashboard.get("computed_dges"),
    }


def _build_annual_grade_mutation_result(
    db: Client,
    student_id: str,
    annual_grade: dict,
    *,
    subject_id: str,
    academic_year: str,
) -> dict:
    dashboard = get_cfs_dashboard(db, student_id)
    return {
        "annual_grade": annual_grade,
        "cfd": _find_dashboard_cfd(
            dashboard,
            subject_id=subject_id,
            academic_year=academic_year,
        ),
        "computed_cfs": dashboard.get("computed_cfs"),
        "computed_dges": dashboard.get("computed_dges"),
    }


def _build_exam_mutation_result(
    db: Client,
    student_id: str,
    *,
    subject_id: str,
    academic_year: str,
) -> dict:
    dashboard = get_cfs_dashboard(db, student_id)
    cfd = _find_dashboard_cfd(
        dashboard,
        subject_id=subject_id,
        academic_year=academic_year,
    )
    if not cfd:
        raise HTTPException(status_code=404, detail="CFD not found")
    return {
        "cfd": cfd,
        "computed_cfs": dashboard.get("computed_cfs"),
        "computed_dges": dashboard.get("computed_dges"),
    }


def _ensure_cfd_record(
    db: Client,
    student_id: str,
    *,
    subject_id: str,
    academic_year: str,
) -> dict:
    existing_resp = supabase_execute(
        db.table("student_subject_cfd")
        .select("*")
        .eq("student_id", student_id)
        .eq("subject_id", subject_id)
        .eq("academic_year", academic_year)
        .limit(1),
        entity="cfd",
    )
    if existing_resp.data:
        return _normalize_existing_cfd(db, existing_resp.data[0])

    dashboard = get_cfs_dashboard(db, student_id)
    computed_cfd = _find_dashboard_cfd(
        dashboard,
        subject_id=subject_id,
        academic_year=academic_year,
    )
    if not computed_cfd:
        raise HTTPException(status_code=404, detail="CFD not found")

    insert_payload = {
        "student_id": student_id,
        "subject_id": subject_id,
        "academic_year": academic_year,
        "cif_raw": computed_cfd.get("cif_raw"),
        "cif_grade": computed_cfd.get("cif_grade"),
        "exam_grade": computed_cfd.get("exam_grade"),
        "exam_grade_raw": computed_cfd.get("exam_grade_raw"),
        "exam_weight": computed_cfd.get("exam_weight"),
        "cfd_raw": computed_cfd.get("cfd_raw"),
        "cfd_grade": computed_cfd.get("cfd_grade"),
        "is_finalized": False,
    }
    resp = supabase_execute(
        db.table("student_subject_cfd").insert(_cfd_write_payload(db, insert_payload)),
        entity="cfd",
    )
    return _normalize_existing_cfd(db, parse_single_or_404(resp, entity="cfd"))


def _resolve_cfd_for_mutation(db: Client, student_id: str, cfd_id: str) -> dict:
    virtual = _parse_virtual_cfd_id(cfd_id)
    if virtual:
        subject_id, academic_year = virtual
        return _ensure_cfd_record(
            db,
            student_id,
            subject_id=subject_id,
            academic_year=academic_year,
        )

    resp = supabase_execute(
        db.table("student_subject_cfd")
        .select("*")
        .eq("id", cfd_id)
        .eq("student_id", student_id)
        .limit(1),
        entity="cfd",
    )
    return _normalize_existing_cfd(db, parse_single_or_404(resp, entity="cfd"))


# ── Algorithm E: CFS (The GPA) ──────────────────────────────


def _compute_cfs_value(
    cfds: list[dict], cohort_year: Optional[int]
) -> tuple[Optional[float], Optional[int]]:
    """
    Compute CFS from all CFDs.
    Up to the 2025 graduation cohort: simple mean of all CFDs.
    From the 2026 graduation cohort onward: weighted mean
    (triennial ×3, biennial ×2, annual ×1).
    """
    eligible = [c for c in cfds if c.get("affects_cfs", True) and c.get("cfd_grade") is not None]
    if not eligible:
        return None, None

    use_weighted = cohort_year is not None and cohort_year >= 2026

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
    cfd = _resolve_cfd_for_mutation(db, student_id, cfd_id)

    if cfd.get("is_finalized"):
        raise HTTPException(status_code=400, detail="CFD is already finalized")

    if payload.exam_grade_raw is None and payload.exam_weight is None:
        raise HTTPException(status_code=400, detail="No exam fields to update")

    raw_200 = payload.exam_grade_raw if payload.exam_grade_raw is not None else cfd.get("exam_grade_raw")
    exam_weight = payload.exam_weight if payload.exam_weight is not None else cfd.get("exam_weight")
    if exam_weight is None:
        exam_weight = float(_resolve_default_exam_weight(education_level="secundario"))

    exam_grade_20 = (
        _round_half_up(_dec(raw_200) / Decimal("10"))
        if raw_200 is not None
        else cfd.get("exam_grade")
    )

    update_data = {
        "exam_grade": exam_grade_20,
        "exam_grade_raw": raw_200,
        "exam_weight": str(exam_weight),
    }
    resp = supabase_execute(
        db.table("student_subject_cfd")
        .update(_cfd_write_payload(db, update_data))
        .eq("id", cfd["id"]),
        entity="cfd",
    )
    parse_single_or_404(resp, entity="cfd")
    return _build_exam_mutation_result(
        db,
        student_id,
        subject_id=cfd["subject_id"],
        academic_year=cfd["academic_year"],
    )


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
    cfd = _resolve_cfd_for_mutation(db, student_id, cfd_id)

    if cfd.get("is_finalized"):
        raise HTTPException(status_code=400, detail="CFD is already finalized")

    if payload.exam_percentage is None and payload.exam_weight is None:
        raise HTTPException(status_code=400, detail="No exam fields to update")

    percentage = payload.exam_percentage if payload.exam_percentage is not None else cfd.get("exam_grade_raw")
    exam_weight = payload.exam_weight if payload.exam_weight is not None else cfd.get("exam_weight")
    if exam_weight is None:
        exam_weight = float(_resolve_default_exam_weight(education_level="basico_3_ciclo"))

    exam_level = (
        _convert_percentage_to_level(percentage)
        if percentage is not None
        else cfd.get("exam_grade")
    )

    # Recalculate CFD with editable exam weight
    cif_grade = cfd.get("cif_grade", 0)
    weight = _dec(exam_weight)
    internal_weight = Decimal("100") - weight
    cfd_raw = (_dec(cif_grade) * internal_weight + _dec(exam_level) * weight) / Decimal("100")
    cfd_grade = _round_half_up(cfd_raw)

    update_data = {
        "exam_grade": exam_level,
        "exam_grade_raw": percentage,
        "exam_weight": str(exam_weight),
        "cfd_raw": str(cfd_raw),
        "cfd_grade": cfd_grade,
    }
    resp = supabase_execute(
        db.table("student_subject_cfd")
        .update(_cfd_write_payload(db, update_data))
        .eq("id", cfd["id"]),
        entity="cfd",
    )
    parse_single_or_404(resp, entity="cfd")
    return _build_exam_mutation_result(
        db,
        student_id,
        subject_id=cfd["subject_id"],
        academic_year=cfd["academic_year"],
    )


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
    formula = "weighted_mean" if cohort_year >= 2026 else "simple_mean"

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


# ── Domain-Based Evaluation ──────────────────────────────────


def get_domains(db: Client, student_id: str, enrollment_id: str) -> list[dict]:
    """Fetch all evaluation domains (with nested elements) for an enrollment."""
    # Verify enrollment belongs to student
    _get_enrollment_with_subject(db, enrollment_id, student_id)

    domains_resp = supabase_execute(
        db.table("subject_evaluation_domains")
        .select("*")
        .eq("enrollment_id", enrollment_id)
        .order("sort_order", desc=False),
        entity="domains",
    )
    domains = domains_resp.data or []

    domain_ids = [d["id"] for d in domains]
    elements_by_domain: dict[str, list[dict]] = defaultdict(list)
    if domain_ids:
        elems_resp = supabase_execute(
            db.table("subject_evaluation_elements")
            .select("*")
            .in_("domain_id", domain_ids)
            .order("period_number", desc=False)
            .order("created_at", desc=False),
            entity="domain_elements",
        )
        for elem in (elems_resp.data or []):
            if elem.get("domain_id"):
                elements_by_domain[elem["domain_id"]].append(elem)

    for domain in domains:
        domain["elements"] = elements_by_domain.get(domain["id"], [])

    return domains


def replace_domains(
    db: Client,
    student_id: str,
    enrollment_id: str,
    payload: DomainsReplaceIn,
) -> dict:
    """Replace all domains + elements for an enrollment, then recalculate."""
    enrollment = _assert_enrollment_writable(db, enrollment_id, student_id)
    settings = _get_settings_by_id(db, enrollment["settings_id"])

    # Determine num_periods from settings
    regime = settings.get("regime")
    if regime == "semestral":
        num_periods = 2
    elif regime == "trimestral":
        num_periods = 3
    else:
        num_periods = len(settings.get("period_weights", []))

    # ── Validate domains ──
    for domain_in in payload.domains:
        if len(domain_in.period_weights) != num_periods:
            raise HTTPException(
                status_code=400,
                detail=f"Domain '{domain_in.label}' period_weights length must be {num_periods}, "
                f"got {len(domain_in.period_weights)}",
            )

    # Validate column sums: for each period, sum of period_weights across
    # domains with weight > 0 must equal 100
    for period_idx in range(num_periods):
        col_sum = Decimal("0")
        for domain_in in payload.domains:
            w = _dec(domain_in.period_weights[period_idx])
            if w > Decimal("0"):
                col_sum += w
        if col_sum != Decimal("100"):
            raise HTTPException(
                status_code=400,
                detail=f"Period {period_idx + 1}: domain weights must sum to 100, got {float(col_sum)}",
            )

    # Validate element weights within each domain+period_number group
    for domain_in in payload.domains:
        # Group elements by period_number
        by_period: dict[int, list] = defaultdict(list)
        for elem in domain_in.elements:
            if elem.period_number < 1 or elem.period_number > num_periods:
                raise HTTPException(
                    status_code=400,
                    detail=f"Element period_number {elem.period_number} out of range [1..{num_periods}]",
                )
            by_period[elem.period_number].append(elem)

        for pn, elems in by_period.items():
            custom_weight_elems = [e for e in elems if e.weight_percentage is not None]
            if custom_weight_elems:
                wp_sum = sum(_dec(e.weight_percentage) for e in custom_weight_elems)
                if wp_sum != Decimal("100"):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Domain '{domain_in.label}', period {pn}: element weight_percentages "
                        f"must sum to 100, got {float(wp_sum)}",
                    )

    # ── Delete existing domains (CASCADE deletes elements) ──
    supabase_execute(
        db.table("subject_evaluation_domains")
        .delete()
        .eq("enrollment_id", enrollment_id),
        entity="domains",
    )

    # ── Insert new domains + elements ──
    for sort_order, domain_in in enumerate(payload.domains):
        domain_data = {
            "enrollment_id": enrollment_id,
            "domain_type": domain_in.domain_type,
            "label": domain_in.label,
            "icon": domain_in.icon,
            "period_weights": [str(w) for w in domain_in.period_weights],
            "sort_order": sort_order,
        }
        domain_resp = supabase_execute(
            db.table("subject_evaluation_domains").insert(domain_data),
            entity="domain",
        )
        domain = parse_single_or_404(domain_resp, entity="domain")

        if domain_in.elements:
            elem_rows = [
                {
                    "domain_id": domain["id"],
                    "period_number": e.period_number,
                    "element_type": domain_in.domain_type,
                    "label": e.label,
                    "weight_percentage": str(e.weight_percentage) if e.weight_percentage is not None else None,
                    "raw_grade": str(e.raw_grade) if e.raw_grade is not None else None,
                }
                for e in domain_in.elements
            ]
            supabase_execute(
                db.table("subject_evaluation_elements").insert(elem_rows),
                entity="elements",
            )

    # ── Recalculate all periods ──
    periods_resp = supabase_execute(
        db.table("student_subject_periods")
        .select("id")
        .eq("enrollment_id", enrollment_id)
        .order("period_number", desc=False),
        entity="periods",
    )
    for p in (periods_resp.data or []):
        recalculate_period_grade(db, p["id"])

    # ── Build response ──
    domains_out = get_domains(db, student_id, enrollment_id)

    # Fetch updated periods
    updated_periods_resp = supabase_execute(
        db.table("student_subject_periods")
        .select("*")
        .eq("enrollment_id", enrollment_id)
        .order("period_number", desc=False),
        entity="periods",
    )
    updated_periods = updated_periods_resp.data or []
    for p in updated_periods:
        p["has_elements"] = False  # domain-based enrollments use domains, not flat elements

    annual = _get_annual_grade_for_enrollment(db, enrollment_id)

    return {
        "domains": domains_out,
        "periods": updated_periods,
        "annual_grade": annual,
    }


def update_cumulative_weights(
    db: Client,
    student_id: str,
    enrollment_id: str,
    payload: CumulativeWeightsUpdateIn,
) -> dict:
    """Update cumulative period blending weights for an enrollment."""
    enrollment = _get_enrollment_with_subject(db, enrollment_id, student_id)
    settings = _get_settings_by_id(db, enrollment["settings_id"])

    regime = settings.get("regime")
    if regime == "semestral":
        num_periods = 2
    elif regime == "trimestral":
        num_periods = 3
    else:
        num_periods = len(settings.get("period_weights", []))

    weights = payload.cumulative_weights
    if weights is not None:
        # Validate matrix shape
        if len(weights) != num_periods:
            raise HTTPException(
                status_code=400,
                detail=f"cumulative_weights must have {num_periods} rows, got {len(weights)}",
            )

        # Row 0 must be [100]
        if len(weights[0]) != 1 or _dec(weights[0][0]) != Decimal("100"):
            raise HTTPException(
                status_code=400,
                detail="Row 0 must be [100]",
            )

        for i, row in enumerate(weights):
            if len(row) != i + 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"Row {i} must have {i + 1} values, got {len(row)}",
                )
            row_sum = sum(_dec(v) for v in row)
            if row_sum != Decimal("100"):
                raise HTTPException(
                    status_code=400,
                    detail=f"Row {i} must sum to 100, got {float(row_sum)}",
                )

    # Update enrollment
    supabase_execute(
        db.table("student_subject_enrollments")
        .update({"cumulative_weights": json.dumps(weights) if weights is not None else None})
        .eq("id", enrollment_id)
        .eq("student_id", student_id),
        entity="enrollment",
    )

    # Trigger recalculation cascade for all periods
    periods_resp = supabase_execute(
        db.table("student_subject_periods")
        .select("id")
        .eq("enrollment_id", enrollment_id)
        .order("period_number", desc=False),
        entity="periods",
    )
    for p in (periods_resp.data or []):
        recalculate_period_grade(db, p["id"])

    # Return hydrated enrollment
    rows = _list_enrollment_rows(db, student_id)
    for row in rows:
        if row["id"] == enrollment_id:
            return row

    # Fallback
    return _get_enrollment_with_subject(db, enrollment_id, student_id)


def copy_domains_to_subjects(
    db: Client,
    student_id: str,
    source_enrollment_id: str,
    target_enrollment_ids: list[str],
) -> int:
    """Copy domain structure from one enrollment to others."""
    # Verify source belongs to student
    source_enrollment = _get_enrollment_with_subject(db, source_enrollment_id, student_id)

    # Verify all targets belong to student
    for target_id in target_enrollment_ids:
        _get_enrollment_with_subject(db, target_id, student_id)

    # Get source domains + elements
    source_domains = get_domains(db, student_id, source_enrollment_id)
    source_cumulative_weights = source_enrollment.get("cumulative_weights")

    copied = 0
    for target_id in target_enrollment_ids:
        # Delete existing domains in target (CASCADE deletes elements)
        supabase_execute(
            db.table("subject_evaluation_domains")
            .delete()
            .eq("enrollment_id", target_id),
            entity="domains",
        )

        # Copy cumulative_weights
        supabase_execute(
            db.table("student_subject_enrollments")
            .update({
                "cumulative_weights": (
                    json.dumps(source_cumulative_weights)
                    if source_cumulative_weights is not None
                    else None
                )
            })
            .eq("id", target_id),
            entity="enrollment",
        )

        # Insert copied domains + elements (new UUIDs generated by DB)
        for domain in source_domains:
            domain_data = {
                "enrollment_id": target_id,
                "domain_type": domain["domain_type"],
                "label": domain["label"],
                "icon": domain.get("icon"),
                "period_weights": domain["period_weights"],
                "sort_order": domain["sort_order"],
            }
            domain_resp = supabase_execute(
                db.table("subject_evaluation_domains").insert(domain_data),
                entity="domain",
            )
            new_domain = parse_single_or_404(domain_resp, entity="domain")

            elements = domain.get("elements", [])
            if elements:
                elem_rows = [
                    {
                        "domain_id": new_domain["id"],
                        "period_number": e.get("period_number"),
                        "element_type": e.get("element_type"),
                        "label": e.get("label"),
                        "weight_percentage": e.get("weight_percentage"),
                        "raw_grade": None,  # Don't copy grades
                    }
                    for e in elements
                ]
                supabase_execute(
                    db.table("subject_evaluation_elements").insert(elem_rows),
                    entity="elements",
                )

        # Trigger recalculation for target
        periods_resp = supabase_execute(
            db.table("student_subject_periods")
            .select("id")
            .eq("enrollment_id", target_id)
            .order("period_number", desc=False),
            entity="periods",
        )
        for p in (periods_resp.data or []):
            recalculate_period_grade(db, p["id"])

        copied += 1

    return copied
