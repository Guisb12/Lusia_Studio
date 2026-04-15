"""Student billing service for monthly fixed/variable settings and payment status."""

from __future__ import annotations

from datetime import datetime, timezone

from supabase import Client

from app.api.http.schemas.student_billing import (
    StudentBillingSettingUpsert,
    StudentMonthlyAdjustmentCreate,
    StudentMonthlyAdjustmentUpdate,
    StudentMonthlyPaymentStatusUpsert,
)
from app.utils.db import parse_single_or_404, supabase_execute


def _parse_month(value: str) -> str:
    """Normalize YYYY-MM month into YYYY-MM-01 date string."""
    try:
        dt = datetime.strptime(value, "%Y-%m")
    except ValueError as exc:
        raise ValueError("month must be in YYYY-MM format") from exc
    return f"{dt.year:04d}-{dt.month:02d}-01"


def upsert_student_billing_setting(
    db: Client,
    org_id: str,
    actor_id: str,
    payload: StudentBillingSettingUpsert,
) -> dict:
    effective_month = _parse_month(payload.effective_month)
    row = {
        "organization_id": org_id,
        "student_id": payload.student_id,
        "effective_month": effective_month,
        "payment_method": payload.payment_method,
        "fixed_monthly_amount": payload.fixed_monthly_amount,
        "created_by": actor_id,
    }
    response = supabase_execute(
        db.table("student_billing_settings").upsert(
            row,
            on_conflict="organization_id,student_id,effective_month",
        ),
        entity="student_billing_setting",
    )
    return parse_single_or_404(response, entity="student_billing_setting")


def create_monthly_adjustment(
    db: Client,
    org_id: str,
    actor_id: str,
    payload: StudentMonthlyAdjustmentCreate,
) -> dict:
    month = _parse_month(payload.month)
    response = supabase_execute(
        db.table("student_monthly_adjustments").insert(
            {
                "organization_id": org_id,
                "student_id": payload.student_id,
                "month": month,
                "label": payload.label,
                "amount": payload.amount,
                "category": payload.category,
                "created_by": actor_id,
            }
        ),
        entity="student_monthly_adjustment",
    )
    return parse_single_or_404(response, entity="student_monthly_adjustment")


def update_monthly_adjustment(
    db: Client,
    org_id: str,
    adjustment_id: str,
    payload: StudentMonthlyAdjustmentUpdate,
) -> dict:
    update_data: dict = {}
    provided = payload.model_fields_set

    if "label" in provided and payload.label is not None:
        update_data["label"] = payload.label
    if "amount" in provided and payload.amount is not None:
        update_data["amount"] = payload.amount
    if "category" in provided:
        update_data["category"] = payload.category

    if not update_data:
        response = supabase_execute(
            db.table("student_monthly_adjustments")
            .select("*")
            .eq("organization_id", org_id)
            .eq("id", adjustment_id)
            .limit(1),
            entity="student_monthly_adjustment",
        )
        return parse_single_or_404(response, entity="student_monthly_adjustment")

    response = supabase_execute(
        db.table("student_monthly_adjustments")
        .update(update_data)
        .eq("organization_id", org_id)
        .eq("id", adjustment_id),
        entity="student_monthly_adjustment",
    )
    return parse_single_or_404(response, entity="student_monthly_adjustment")


def delete_monthly_adjustment(db: Client, org_id: str, adjustment_id: str) -> dict:
    response = supabase_execute(
        db.table("student_monthly_adjustments")
        .delete()
        .eq("organization_id", org_id)
        .eq("id", adjustment_id),
        entity="student_monthly_adjustment",
    )
    return parse_single_or_404(response, entity="student_monthly_adjustment")


def upsert_monthly_payment_status(
    db: Client,
    org_id: str,
    actor_id: str,
    payload: StudentMonthlyPaymentStatusUpsert,
) -> dict:
    month = _parse_month(payload.month)
    now = datetime.now(timezone.utc)
    row = {
        "organization_id": org_id,
        "student_id": payload.student_id,
        "month": month,
        "is_paid": payload.is_paid,
        "paid_at": now.isoformat() if payload.is_paid else None,
        "paid_note": payload.paid_note,
        "updated_by": actor_id,
    }
    response = supabase_execute(
        db.table("student_monthly_payment_status").upsert(
            row,
            on_conflict="organization_id,student_id,month",
        ),
        entity="student_monthly_payment_status",
    )
    return parse_single_or_404(response, entity="student_monthly_payment_status")
