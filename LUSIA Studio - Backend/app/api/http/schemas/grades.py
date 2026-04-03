"""
Pydantic schemas for the grade calculator (Calculadora de Médias).
"""

from typing import Optional

from pydantic import BaseModel, Field, field_validator


# ── Request schemas ──────────────────────────────────────────


class PastYearGradeIn(BaseModel):
    """A single subject enrollment from a previous year, with optional grade."""

    subject_id: str
    year_level: str = Field(..., description="e.g. '10' or '11'")
    academic_year: str = Field(..., description="e.g. '2024-2025'")
    annual_grade: Optional[int] = Field(None, ge=0, le=20)
    is_exam_candidate: Optional[bool] = Field(
        default=False,
        description="Whether the student is an exam candidate for this historical enrollment",
    )
    exam_grade_raw: Optional[int] = Field(
        default=None,
        ge=0,
        le=200,
        description="Historical exam score on the 0-200 scale",
    )


class GradeSettingsCreateIn(BaseModel):
    """Create initial grade settings + enrollments for an academic year."""

    academic_year: str = Field(..., description="e.g. '2025-2026'")
    education_level: str
    grade_scale: Optional[str] = Field(
        default=None,
        pattern="^(scale_0_20|scale_0_100)$",
    )
    graduation_cohort_year: Optional[int] = None
    regime: Optional[str] = Field(
        None, pattern="^(trimestral|semestral)$"
    )
    period_weights: list[float] = Field(
        ..., description="Must sum to 100"
    )
    subject_ids: list[str] = Field(
        ..., description="Subjects to enroll"
    )
    year_level: str = Field(
        ..., description="Current year level, e.g. '10'"
    )
    course: Optional[str] = Field(
        default=None,
        description="Secundário course key, e.g. 'ciencias_tecnologias'",
    )
    exam_candidate_subject_ids: Optional[list[str]] = Field(
        default=None, description="Subjects where student is exam candidate"
    )
    past_year_grades: Optional[list[PastYearGradeIn]] = Field(
        default=None,
        description="Annual grades from previous years (for 11º/12º students)",
    )


class PeriodGradeUpdateIn(BaseModel):
    """Direct pauta grade entry (Mode A)."""

    pauta_grade: Optional[int] = None
    qualitative_grade: Optional[str] = None


class PeriodGradeOverrideIn(BaseModel):
    """Override calculated grade with manual pauta."""

    pauta_grade: int
    override_reason: Optional[str] = Field(
        default=None,
        description="Optional reason for override",
    )


class EvaluationElementIn(BaseModel):
    """A single evaluation element within a period."""

    id: Optional[str] = None
    element_type: str
    label: str
    icon: Optional[str] = None
    weight_percentage: float
    raw_grade: Optional[float] = None


class EvaluationElementsReplaceIn(BaseModel):
    """Replace all elements for a period (bulk)."""

    elements: list[EvaluationElementIn]


class ElementGradeUpdateIn(BaseModel):
    """Update a single element's grade and/or label."""

    raw_grade: Optional[float] = None
    label: Optional[str] = None


class EnrollmentCreateIn(BaseModel):
    """Add a subject enrollment mid-year."""

    subject_id: str
    academic_year: str
    year_level: str
    is_exam_candidate: bool = False


class EnrollmentUpdateIn(BaseModel):
    """Update enrollment flags."""

    is_active: Optional[bool] = None
    is_exam_candidate: Optional[bool] = None


class AnnualGradeUpdateIn(BaseModel):
    """Update a past-year annual grade directly."""

    subject_id: str
    academic_year: str = Field(..., description="The past academic year, e.g. '2024-2025'")
    annual_grade: int = Field(..., ge=0, le=20)


class PastYearSubjectIn(BaseModel):
    """A subject to enroll for a past year, with optional grade."""

    subject_id: str
    annual_grade: Optional[int] = Field(None, ge=0, le=20)


class PastYearSetupIn(BaseModel):
    """Initialize a past year: create settings + enrollments + optional grades."""

    academic_year: str = Field(..., description="e.g. '2024-2025'")
    year_level: str = Field(..., description="e.g. '10'")
    subjects: list[PastYearSubjectIn]


class ExamGradeUpdateIn(BaseModel):
    """Enter/update national exam grade for a CFD."""

    exam_grade_raw: Optional[int] = Field(
        default=None, ge=0, le=200, description="Score on the 0-200 scale"
    )
    exam_weight: Optional[float] = Field(
        default=None, ge=0, le=100, description="Exam weight percentage"
    )


class BasicoExamGradeUpdateIn(BaseModel):
    """Enter/update Prova Final grade for a Básico 3º Ciclo CFD."""

    exam_percentage: Optional[int] = Field(
        default=None, ge=0, le=100, description="Exam score as percentage (0-100)"
    )
    exam_weight: Optional[float] = Field(
        default=None, ge=0, le=100, description="Exam weight percentage"
    )


class CFSSnapshotCreateIn(BaseModel):
    """Finalize and snapshot the CFS."""

    academic_year: str


# ── Domain-based evaluation schemas ─────────────────────────


class DomainElementIn(BaseModel):
    """A single element within a domain, assigned to a period."""

    period_number: int = Field(..., ge=1, le=3)
    label: str
    weight_percentage: Optional[float] = Field(
        default=None,
        ge=0,
        le=100,
        description="NULL = equal weight within domain+period; set = custom weight",
    )
    raw_grade: Optional[float] = None


class EvaluationDomainIn(BaseModel):
    """A domain (e.g. Testes, Apresentações) with per-period weights."""

    domain_type: str
    label: str
    icon: Optional[str] = None
    period_weights: list[float] = Field(
        ..., description="Weight per period; length must match num_periods"
    )
    elements: list[DomainElementIn] = Field(
        default_factory=list,
        description="Elements within this domain across all periods",
    )


class DomainsReplaceIn(BaseModel):
    """Replace all domains + elements for an enrollment."""

    domains: list[EvaluationDomainIn]
    cumulative_weights: Optional[list[list[float]]] = Field(
        default=None,
        description="Optional cumulative matrix to persist together with domains during initial setup.",
    )


class CumulativeWeightsUpdateIn(BaseModel):
    """Update cumulative period blending weights for an enrollment."""

    cumulative_weights: Optional[list[list[float]]] = Field(
        default=None,
        description="Matrix e.g. [[100],[40,60],[25,30,45]]; null = disable cumulative",
    )


class CopyDomainsIn(BaseModel):
    """Copy domain structure to other subject enrollments."""

    target_enrollment_ids: list[str]


# ── Response schemas ─────────────────────────────────────────


class GradeSettingsOut(BaseModel):
    id: str
    student_id: str
    academic_year: str
    education_level: str
    grade_scale: Optional[str] = None
    graduation_cohort_year: Optional[int] = None
    regime: Optional[str] = None
    course: Optional[str] = None
    period_weights: list[float]
    is_locked: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class GradeSettingsUpdateIn(BaseModel):
    """Update mutable grading settings for an unlocked academic year."""

    grade_scale: Optional[str] = Field(
        default=None,
        pattern="^(scale_0_20|scale_0_100)$",
    )
    regime: Optional[str] = Field(
        default=None,
        pattern="^(trimestral|semestral)$",
    )
    period_weights: Optional[list[float]] = Field(
        default=None,
        description="Must sum to 100 and match the selected regime",
    )
    confirm_reset: bool = Field(
        default=False,
        description="Required when changing settings would clear grading data",
    )


class SubjectEnrollmentOut(BaseModel):
    id: str
    student_id: str
    subject_id: str
    academic_year: str
    year_level: str
    settings_id: str
    is_active: bool
    is_exam_candidate: bool
    cumulative_weights: Optional[list[list[float]]] = None

    @field_validator("cumulative_weights", mode="before")
    @classmethod
    def _parse_cumulative_weights(cls, v):  # noqa: N805
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    # Hydrated
    subject_name: Optional[str] = None
    subject_slug: Optional[str] = None
    subject_color: Optional[str] = None
    subject_icon: Optional[str] = None
    affects_cfs: Optional[bool] = None
    has_national_exam: Optional[bool] = None


class EvaluationElementOut(BaseModel):
    id: str
    period_id: Optional[str] = None
    element_type: str
    label: str
    icon: Optional[str] = None
    weight_percentage: Optional[float] = None
    raw_grade: Optional[float] = None
    # Domain-based fields
    domain_id: Optional[str] = None
    period_number: Optional[int] = None


class SubjectPeriodOut(BaseModel):
    id: str
    enrollment_id: str
    period_number: int
    raw_calculated: Optional[float] = None
    calculated_grade: Optional[int] = None
    pauta_grade: Optional[int] = None
    is_overridden: bool
    override_reason: Optional[str] = None
    qualitative_grade: Optional[str] = None
    is_locked: bool
    has_elements: bool = False
    elements: Optional[list[EvaluationElementOut]] = None
    # Domain-based cumulative fields
    own_raw: Optional[float] = None
    own_grade: Optional[int] = None
    cumulative_raw: Optional[float] = None
    cumulative_grade: Optional[int] = None


class AnnualGradeOut(BaseModel):
    id: str
    enrollment_id: str
    raw_annual: Optional[float] = None
    annual_grade: int
    is_locked: bool


class EvaluationDomainOut(BaseModel):
    """Response schema for an evaluation domain with its elements."""

    id: str
    enrollment_id: str
    domain_type: str
    label: str
    icon: Optional[str] = None
    period_weights: list[float]
    sort_order: int
    elements: list[EvaluationElementOut] = Field(default_factory=list)


class BoardSubjectOut(BaseModel):
    """A single subject in the kanban board view."""

    enrollment: SubjectEnrollmentOut
    periods: list[SubjectPeriodOut]
    annual_grade: Optional[AnnualGradeOut] = None
    domains: Optional[list[EvaluationDomainOut]] = None
    has_domains: bool = False


class GradeBoardOut(BaseModel):
    """Full kanban board response."""

    settings: Optional[GradeSettingsOut] = None
    subjects: list[BoardSubjectOut]


class SubjectCFDOut(BaseModel):
    id: str
    student_id: str
    subject_id: str
    academic_year: str
    cif_raw: Optional[float] = None
    cif_grade: Optional[int] = None
    exam_grade: Optional[int] = None
    exam_grade_raw: Optional[int] = None
    exam_weight: Optional[float] = None
    cfd_raw: Optional[float] = None
    cfd_grade: Optional[int] = None
    is_finalized: bool
    # Hydrated
    subject_name: Optional[str] = None
    subject_slug: Optional[str] = None
    affects_cfs: Optional[bool] = None
    has_national_exam: Optional[bool] = None
    is_exam_candidate: Optional[bool] = None
    duration_years: Optional[int] = None
    annual_grades: Optional[list[dict]] = None


class CFSSnapshotOut(BaseModel):
    id: str
    student_id: str
    academic_year: str
    graduation_cohort_year: int
    cfs_value: float
    dges_value: Optional[int] = None
    formula_used: Optional[str] = None
    cfd_snapshot: dict
    is_finalized: bool
    created_at: Optional[str] = None


class CFSDashboardOut(BaseModel):
    """Full CFS dashboard response."""

    settings: Optional[GradeSettingsOut] = None
    cfds: list[SubjectCFDOut]
    snapshot: Optional[CFSSnapshotOut] = None
    computed_cfs: Optional[float] = None
    computed_dges: Optional[int] = None


class PeriodMutationOut(BaseModel):
    period: SubjectPeriodOut
    annual_grade: Optional[AnnualGradeOut] = None


class ElementsReplaceOut(BaseModel):
    elements: list[EvaluationElementOut]
    period: SubjectPeriodOut
    annual_grade: Optional[AnnualGradeOut] = None


class ElementMutationOut(BaseModel):
    element: EvaluationElementOut
    period: SubjectPeriodOut
    annual_grade: Optional[AnnualGradeOut] = None


class EnrollmentMutationOut(BaseModel):
    enrollment: SubjectEnrollmentOut
    cfd: Optional[SubjectCFDOut] = None
    computed_cfs: Optional[float] = None
    computed_dges: Optional[int] = None


class AnnualGradeMutationOut(BaseModel):
    annual_grade: AnnualGradeOut
    cfd: Optional[SubjectCFDOut] = None
    computed_cfs: Optional[float] = None
    computed_dges: Optional[int] = None


class ExamGradeMutationOut(BaseModel):
    cfd: SubjectCFDOut
    computed_cfs: Optional[float] = None
    computed_dges: Optional[int] = None


class DomainsReplaceOut(BaseModel):
    """Response after replacing all domains for an enrollment."""

    domains: list[EvaluationDomainOut]
    periods: list[SubjectPeriodOut]
    annual_grade: Optional[AnnualGradeOut] = None


class CopyDomainsOut(BaseModel):
    """Response after copying domains to other enrollments."""

    copied: int
