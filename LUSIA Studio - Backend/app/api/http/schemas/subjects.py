from typing import Optional

from pydantic import BaseModel, Field


class SubjectOut(BaseModel):
    id: str
    name: str
    slug: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    education_level: str
    grade_levels: Optional[list[str]] = None
    is_custom: bool = False


class SubjectCreateRequest(BaseModel):
    education_level: str = Field(
        ...,
        description="One of: basico_1_ciclo, basico_2_ciclo, basico_3_ciclo, secundario, superior",
    )
    name: str = Field(..., min_length=1, max_length=200)
    slug: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    grade_levels: Optional[list[str]] = None
