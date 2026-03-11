"""
Pydantic schemas for financial analytics.
"""

from typing import Optional

from pydantic import BaseModel


class FinancialSummary(BaseModel):
    total_revenue: float = 0
    total_cost: float = 0
    total_profit: float = 0
    total_sessions: int = 0
    total_hours: float = 0
    average_revenue_per_session: float = 0
    average_cost_per_session: float = 0


class TeacherFinancialDetail(BaseModel):
    teacher_id: str
    teacher_name: Optional[str] = None
    avatar_url: Optional[str] = None
    total_sessions: int = 0
    total_hours: float = 0
    total_cost: float = 0
    total_revenue_generated: float = 0


class StudentFinancialDetail(BaseModel):
    student_id: str
    student_name: Optional[str] = None
    avatar_url: Optional[str] = None
    total_sessions: int = 0
    total_hours: float = 0
    total_billed: float = 0


class SessionTypeBreakdown(BaseModel):
    session_type_id: Optional[str] = None
    session_type_name: Optional[str] = None
    color: Optional[str] = None
    total_sessions: int = 0
    total_revenue: float = 0
    total_cost: float = 0


class TimeSeriesPoint(BaseModel):
    period: str
    revenue: float = 0
    cost: float = 0
    profit: float = 0
    session_count: int = 0


class AdminDashboardData(BaseModel):
    summary: FinancialSummary
    by_teacher: list[TeacherFinancialDetail] = []
    by_student: list[StudentFinancialDetail] = []
    by_session_type: list[SessionTypeBreakdown] = []
    time_series: list[TimeSeriesPoint] = []


class TeacherDashboardData(BaseModel):
    total_earnings: float = 0
    total_sessions: int = 0
    total_hours: float = 0
    revenue_generated: float = 0
    by_student: list[StudentFinancialDetail] = []
    time_series: list[TimeSeriesPoint] = []


class StudentDashboardData(BaseModel):
    total_spent: float = 0
    total_sessions: int = 0
    total_hours: float = 0
    session_costs: list[dict] = []
    time_series: list[TimeSeriesPoint] = []
