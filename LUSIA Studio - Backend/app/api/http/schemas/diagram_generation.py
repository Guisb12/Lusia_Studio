"""
Pydantic schemas for the diagram generation pipeline.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


DiagramType = Literal["mindmap", "flowchart", "sequence"]
DiagramKind = Literal["concept", "step", "outcome", "example", "question"]


class DiagramNode(BaseModel):
    id: str = Field(..., min_length=1, max_length=128)
    parent_id: Optional[str] = None
    label: str = Field(..., min_length=1, max_length=240)
    summary: str = Field(..., min_length=1, max_length=600)
    kind: DiagramKind = "concept"
    relation: Optional[str] = Field(default=None, max_length=200)
    order: int = Field(..., ge=0)


class DiagramContent(BaseModel):
    title: str = Field(..., min_length=1, max_length=240)
    diagram_type: DiagramType
    phase: str = "pending"
    generation_params: dict[str, Any] = Field(default_factory=dict)
    nodes: list[DiagramNode] = Field(default_factory=list)


class DiagramStartIn(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=20000)
    subject_id: Optional[str] = None
    year_level: Optional[str] = None
    subject_component: Optional[str] = None
    curriculum_codes: list[str] = Field(default_factory=list)
    upload_artifact_id: Optional[str] = None


class DiagramStartOut(BaseModel):
    artifact_id: str
    artifact_name: str
    artifact_type: str = "diagram"
    icon: Optional[str] = None
    source_type: str = "native"
    subject_id: Optional[str] = None
    subject_ids: Optional[list[str]] = None
    year_level: Optional[str] = None
    curriculum_codes: Optional[list[str]] = None
    is_processed: bool = False
    is_public: bool = False
    created_at: Optional[str] = None
