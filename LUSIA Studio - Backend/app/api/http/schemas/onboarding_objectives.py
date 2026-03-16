"""
Pydantic schemas for onboarding objectives (trial organizations).
"""

from pydantic import BaseModel


class ObjectiveOut(BaseModel):
    id: str
    title: str
    description: str
    current: int
    target: int
    completed: bool


class OnboardingObjectivesResponse(BaseModel):
    objectives: list[ObjectiveOut]
    all_completed: bool
