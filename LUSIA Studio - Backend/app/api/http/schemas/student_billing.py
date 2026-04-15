"""Pydantic schemas for student monthly billing settings and status."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

PaymentMethod = Literal["variable", "fixed"]


class StudentBillingSettingUpsert(BaseModel):
    student_id: str
    effective_month: str = Field(
        ..., description="YYYY-MM month to start applying this setting"
    )
    payment_method: PaymentMethod
    fixed_monthly_amount: float = Field(0, ge=0)


class StudentBillingSettingOut(BaseModel):
    id: str
    organization_id: str
    student_id: str
    effective_month: str
    payment_method: PaymentMethod
    fixed_monthly_amount: float
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class StudentMonthlyAdjustmentCreate(BaseModel):
    student_id: str
    month: str = Field(..., description="YYYY-MM month for this adjustment")
    label: str = Field(..., min_length=1, max_length=120)
    amount: float
    category: Optional[str] = Field(None, max_length=60)


class StudentMonthlyAdjustmentUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=120)
    amount: Optional[float] = None
    category: Optional[str] = Field(None, max_length=60)


class StudentMonthlyAdjustmentOut(BaseModel):
    id: str
    organization_id: str
    student_id: str
    month: str
    label: str
    amount: float
    category: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class StudentMonthlyPaymentStatusUpsert(BaseModel):
    student_id: str
    month: str = Field(..., description="YYYY-MM month for paid status")
    is_paid: bool
    paid_note: Optional[str] = None


class StudentMonthlyPaymentStatusOut(BaseModel):
    id: str
    organization_id: str
    student_id: str
    month: str
    is_paid: bool
    paid_at: Optional[datetime] = None
    paid_note: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
