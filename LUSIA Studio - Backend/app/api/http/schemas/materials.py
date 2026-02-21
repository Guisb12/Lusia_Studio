from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class ProfileMaterialsContextOut(BaseModel):
    role: Optional[str] = None
    grade_level_raw: Optional[str] = None
    grade_level: Optional[str] = None
    selected_subject_ids: list[str] = Field(default_factory=list)
    selected_subject_refs: list[str] = Field(default_factory=list)


class MaterialSubjectOut(BaseModel):
    id: str
    name: str
    slug: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    education_level: str
    education_level_label: str
    grade_levels: list[str] = Field(default_factory=list)
    is_custom: bool = False
    is_selected: bool = False
    selected_grade: Optional[str] = None


class MaterialSubjectEducationGroupOut(BaseModel):
    education_level: str
    education_level_label: str
    subjects: list[MaterialSubjectOut] = Field(default_factory=list)


class MaterialSubjectMoreOut(BaseModel):
    custom: list[MaterialSubjectOut] = Field(default_factory=list)
    by_education_level: list[MaterialSubjectEducationGroupOut] = Field(default_factory=list)


class MaterialsSubjectCatalogOut(BaseModel):
    profile_context: ProfileMaterialsContextOut
    selected_subjects: list[MaterialSubjectOut] = Field(default_factory=list)
    more_subjects: MaterialSubjectMoreOut


class CurriculumNodeOut(BaseModel):
    id: str
    subject_slug: Optional[str] = None
    year_level: Optional[str] = None
    subject_component: Optional[str] = None
    code: str
    parent_code: Optional[str] = None
    level: Optional[int] = None
    sequence_order: Optional[int] = None
    title: str
    description: Optional[str] = None
    keywords: list[str] = Field(default_factory=list)
    has_children: bool = False
    exercise_ids: list[str] = Field(default_factory=list)
    full_path: Optional[str] = None


class CurriculumListOut(BaseModel):
    subject_slug: Optional[str] = None
    year_level: str
    parent_code: Optional[str] = None
    subject_component: Optional[str] = None
    available_components: list[str] = Field(default_factory=list)
    nodes: list[CurriculumNodeOut] = Field(default_factory=list)


class BaseContentNoteOut(BaseModel):
    id: Optional[str] = None
    curriculum_id: str
    content_json: dict[str, Any]
    word_count: Optional[int] = None
    average_read_time: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class CurriculumNoteOut(BaseModel):
    curriculum: CurriculumNodeOut
    note: Optional[BaseContentNoteOut] = None


class UpdateSubjectPreferencesIn(BaseModel):
    subject_ids: list[str] = Field(
        ...,
        description="List of subject IDs to save as user preferences"
    )
