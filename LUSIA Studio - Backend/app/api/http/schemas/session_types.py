"""
Pydantic schemas for session types (tipos de sessao).
"""

from typing import Optional

from pydantic import BaseModel, Field


class SessionTypeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    student_price_per_hour: float = Field(..., ge=0)
    teacher_cost_per_hour: float = Field(..., ge=0)
    color: Optional[str] = None
    icon: Optional[str] = None
    is_default: bool = False


class SessionTypeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    student_price_per_hour: Optional[float] = Field(None, ge=0)
    teacher_cost_per_hour: Optional[float] = Field(None, ge=0)
    color: Optional[str] = None
    icon: Optional[str] = None
    is_default: Optional[bool] = None
    active: Optional[bool] = None


class SessionTypeOut(BaseModel):
    id: str
    organization_id: str
    name: str
    description: Optional[str] = None
    student_price_per_hour: float
    teacher_cost_per_hour: float
    color: Optional[str] = None
    icon: Optional[str] = None
    is_default: bool = False
    active: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
