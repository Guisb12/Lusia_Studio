"""
Pydantic schemas for document upload pipeline.
"""

from typing import Optional

from pydantic import BaseModel, Field, model_validator


class DocumentUploadMeta(BaseModel):
    """Metadata sent alongside the file upload via x-upload-metadata header."""
    artifact_name: str = Field(..., min_length=1, max_length=200)
    document_category: str = Field(
        ..., pattern="^(study|exercises|study_exercises)$"
    )
    subject_id: str = Field(..., min_length=1)
    year_level: Optional[str] = None
    year_levels: Optional[list[str]] = None
    subject_component: Optional[str] = None
    icon: Optional[str] = None
    is_public: bool = False

    @model_validator(mode="after")
    def validate_year_fields(self) -> "DocumentUploadMeta":
        if self.document_category in ("study", "study_exercises"):
            if not self.year_level:
                raise ValueError(
                    "year_level é obrigatório para documentos do tipo "
                    f"'{self.document_category}'."
                )
            if self.year_levels:
                raise ValueError(
                    "year_levels não é permitido para documentos do tipo "
                    f"'{self.document_category}'. Usa year_level."
                )
        elif self.document_category == "exercises":
            if not self.year_levels or len(self.year_levels) < 1:
                raise ValueError(
                    "year_levels é obrigatório (pelo menos 1 ano) para "
                    "documentos do tipo 'exercises'."
                )
            if self.year_level:
                raise ValueError(
                    "year_level não é permitido para documentos do tipo "
                    "'exercises'. Usa year_levels."
                )
        return self


class DocumentUploadOut(BaseModel):
    """Response after a successful upload + enqueue."""
    id: str
    artifact_name: str
    artifact_type: str
    source_type: str
    storage_path: Optional[str] = None
    is_processed: bool = False
    processing_failed: Optional[bool] = False
    created_at: Optional[str] = None
    job_id: Optional[str] = None
    job_status: Optional[str] = None
    error_message: Optional[str] = None


class DocumentJobStatusOut(BaseModel):
    """Polling endpoint response for job status."""
    id: str
    artifact_id: str
    status: str
    current_step: Optional[str] = None
    error_message: Optional[str] = None
    retry_count: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    completed_at: Optional[str] = None
