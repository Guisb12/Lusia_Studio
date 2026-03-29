/**
 * Client-side API fetcher functions and TypeScript types for the grade calculator.
 */

import { cacheInvalidate } from "@/lib/cache";
import {
  ClipboardCheck,
  FileText,
  Mic,
  Heart,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────

export interface GradeSettings {
  id: string;
  student_id: string;
  academic_year: string;
  education_level: string;
  grade_scale: string | null;
  graduation_cohort_year: number | null;
  regime: "trimestral" | "semestral" | null;
  course?: string | null;
  period_weights: number[];
  is_locked: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface SubjectEnrollment {
  id: string;
  student_id: string;
  subject_id: string;
  academic_year: string;
  year_level: string;
  settings_id: string;
  is_active: boolean;
  is_exam_candidate: boolean;
  cumulative_weights: number[][] | null;
  created_at: string | null;
  updated_at: string | null;
  // Hydrated
  subject_name: string | null;
  subject_slug: string | null;
  subject_color: string | null;
  subject_icon: string | null;
  affects_cfs: boolean | null;
  has_national_exam: boolean | null;
}

export interface EvaluationElement {
  id: string;
  period_id: string | null;
  element_type: string;
  label: string;
  icon: string | null;
  weight_percentage: number | null;
  raw_grade: number | null;
  // Domain-based fields
  domain_id?: string | null;
  period_number?: number | null;
}

export interface DomainElement {
  id: string;
  domain_id: string;
  period_number: number;
  element_type: string;
  label: string;
  weight_percentage: number | null;
  raw_grade: number | null;
}

export interface EvaluationDomain {
  id: string;
  enrollment_id: string;
  domain_type: string;
  label: string;
  icon: string | null;
  period_weights: number[];
  sort_order: number;
  elements: DomainElement[];
}

export interface SubjectPeriod {
  id: string;
  enrollment_id: string;
  period_number: number;
  raw_calculated: number | null;
  calculated_grade: number | null;
  pauta_grade: number | null;
  is_overridden: boolean;
  override_reason: string | null;
  qualitative_grade: string | null;
  is_locked: boolean;
  has_elements?: boolean;
  elements?: EvaluationElement[];
  // Domain-based cumulative fields
  own_raw?: number | null;
  own_grade?: number | null;
  cumulative_raw?: number | null;
  cumulative_grade?: number | null;
}

export interface AnnualGrade {
  id: string;
  enrollment_id: string;
  raw_annual: number | null;
  annual_grade: number;
  is_locked: boolean;
}

export interface BoardSubject {
  enrollment: SubjectEnrollment;
  periods: SubjectPeriod[];
  annual_grade: AnnualGrade | null;
  domains?: EvaluationDomain[] | null;
  has_domains?: boolean;
}

export interface GradeBoardData {
  settings: GradeSettings | null;
  subjects: BoardSubject[];
}

export interface SubjectCFD {
  id: string;
  student_id: string;
  subject_id: string;
  academic_year: string;
  cif_raw: number | null;
  cif_grade: number;
  exam_grade: number | null;
  exam_grade_raw: number | null;
  exam_weight: number | null;
  cfd_raw: number | null;
  cfd_grade: number;
  is_finalized: boolean;
  // Hydrated
  subject_name: string | null;
  subject_slug: string | null;
  affects_cfs: boolean | null;
  has_national_exam: boolean | null;
  is_exam_candidate: boolean | null;
  duration_years: number | null;
  annual_grades: { year_level: string; academic_year: string; annual_grade: number }[] | null;
}

export interface CFSSnapshot {
  id: string;
  student_id: string;
  academic_year: string;
  graduation_cohort_year: number;
  cfs_value: number;
  dges_value: number | null;
  formula_used: string | null;
  cfd_snapshot: Record<string, unknown>;
  is_finalized: boolean;
  created_at: string | null;
}

export interface CFSDashboardData {
  settings: GradeSettings | null;
  cfds: SubjectCFD[];
  snapshot: CFSSnapshot | null;
  computed_cfs: number | null;
  computed_dges: number | null;
}

export interface PeriodMutationResult {
  period: SubjectPeriod;
  annual_grade: AnnualGrade | null;
}

export interface ElementsReplaceResult {
  elements: EvaluationElement[];
  period: SubjectPeriod;
  annual_grade: AnnualGrade | null;
}

export interface ElementMutationResult {
  element: EvaluationElement;
  period: SubjectPeriod;
  annual_grade: AnnualGrade | null;
}

export interface EnrollmentMutationResult {
  enrollment: SubjectEnrollment;
  cfd: SubjectCFD | null;
  computed_cfs: number | null;
  computed_dges: number | null;
}

export interface AnnualGradeMutationResult {
  annual_grade: AnnualGrade;
  cfd: SubjectCFD | null;
  computed_cfs: number | null;
  computed_dges: number | null;
}

export interface ExamGradeMutationResult {
  cfd: SubjectCFD;
  computed_cfs: number | null;
  computed_dges: number | null;
}

export interface DomainsReplaceResult {
  domains: EvaluationDomain[];
  periods: SubjectPeriod[];
  annual_grade: AnnualGrade | null;
}

export interface CopyDomainsResult {
  copied: number;
}

// ── Element Types ───────────────────────────────────────────

export const ELEMENT_TYPES: readonly { key: string; label: string; icon: LucideIcon }[] = [
  { key: "teste", label: "Teste", icon: ClipboardCheck },
  { key: "trabalho", label: "Trabalho", icon: FileText },
  { key: "apresentacao_oral", label: "Apresentação Oral", icon: Mic },
  { key: "atitudes_valores", label: "Atitudes e Valores", icon: Heart },
  { key: "outro", label: "Outro", icon: MoreHorizontal },
];

export function getElementTypeInfo(key: string) {
  return ELEMENT_TYPES.find((t) => t.key === key) ?? ELEMENT_TYPES[4];
}

// ── Weight Presets ──────────────────────────────────────────

export const TRIMESTRAL_PRESETS = [
  { label: "Igual", weights: [33.33, 33.33, 33.34] },
  { label: "Progressivo", weights: [25, 35, 40] },
  { label: "Final Forte", weights: [20, 30, 50] },
] as const;

export const SEMESTRAL_PRESETS = [
  { label: "Igual", weights: [50, 50] },
  { label: "Progressivo", weights: [40, 60] },
] as const;

// ── Cumulative Weight Presets ───────────────────────────────

export const TRIMESTRAL_CUMULATIVE_PRESETS = [
  { label: "Sem cumulativo", weights: [[100], [0, 100], [0, 0, 100]] },
  { label: "Progressivo", weights: [[100], [40, 60], [25, 30, 45]] },
  { label: "Final Forte", weights: [[100], [30, 70], [15, 25, 60]] },
] as const;

export const SEMESTRAL_CUMULATIVE_PRESETS = [
  { label: "Sem cumulativo", weights: [[100], [0, 100]] },
  { label: "Progressivo", weights: [[100], [40, 60]] },
] as const;

// ── API Functions ───────────────────────────────────────────

const CACHE_KEY_PREFIX = "grades:";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export function invalidateGradesCache() {
  cacheInvalidate(CACHE_KEY_PREFIX);
}

// Settings
export async function fetchGradeSettings(
  academicYear: string,
): Promise<GradeSettings | null> {
  try {
    return await fetchJSON<GradeSettings>(`/api/grades/settings/${academicYear}`);
  } catch {
    return null;
  }
}

export interface PastYearGrade {
  subject_id: string;
  year_level: string;
  academic_year: string;
  annual_grade?: number | null;
}

export async function createGradeSettings(payload: {
  academic_year: string;
  education_level: string;
  grade_scale?: string | null;
  graduation_cohort_year?: number | null;
  regime?: string | null;
  period_weights: number[];
  subject_ids: string[];
  year_level: string;
  course?: string | null;
  exam_candidate_subject_ids?: string[];
  past_year_grades?: PastYearGrade[];
}): Promise<GradeSettings> {
  invalidateGradesCache();
  return fetchJSON<GradeSettings>("/api/grades/settings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateGradeSettings(
  settingsId: string,
  payload: {
    grade_scale?: string | null;
    regime?: string | null;
    period_weights?: number[];
    confirm_reset?: boolean;
  },
): Promise<GradeSettings> {
  invalidateGradesCache();
  return fetchJSON<GradeSettings>(`/api/grades/settings/id/${settingsId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// Board
export async function fetchGradeBoard(
  academicYear: string,
): Promise<GradeBoardData> {
  return fetchJSON<GradeBoardData>(`/api/grades/board/${academicYear}`);
}

// Period grades
export async function updatePeriodGrade(
  periodId: string,
  payload: { pauta_grade?: number | null; qualitative_grade?: string | null },
): Promise<PeriodMutationResult> {
  invalidateGradesCache();
  return fetchJSON<PeriodMutationResult>(`/api/grades/periods/${periodId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function overridePeriodGrade(
  periodId: string,
  payload: { pauta_grade: number; override_reason: string },
): Promise<PeriodMutationResult> {
  invalidateGradesCache();
  return fetchJSON<PeriodMutationResult>(`/api/grades/periods/${periodId}/override`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// Evaluation elements
export async function fetchElements(
  periodId: string,
): Promise<EvaluationElement[]> {
  return fetchJSON<EvaluationElement[]>(
    `/api/grades/periods/${periodId}/elements`,
  );
}

export async function replaceElements(
  periodId: string,
  elements: {
    element_type: string;
    label: string;
    icon?: string | null;
    weight_percentage: number | null;
    raw_grade?: number | null;
  }[],
): Promise<ElementsReplaceResult> {
  invalidateGradesCache();
  return fetchJSON<ElementsReplaceResult>(
    `/api/grades/periods/${periodId}/elements`,
    {
      method: "PUT",
      body: JSON.stringify({ elements }),
    },
  );
}

export async function updateElementGrade(
  elementId: string,
  rawGrade: number | null,
  label?: string,
): Promise<ElementMutationResult> {
  invalidateGradesCache();
  const body: Record<string, unknown> = { raw_grade: rawGrade };
  if (label !== undefined) body.label = label;
  return fetchJSON<ElementMutationResult>(`/api/grades/elements/${elementId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function updateElementLabel(
  elementId: string,
  label: string,
): Promise<ElementMutationResult> {
  invalidateGradesCache();
  return fetchJSON<ElementMutationResult>(`/api/grades/elements/${elementId}`, {
    method: "PATCH",
    body: JSON.stringify({ label }),
  });
}

export async function copyElementsToOtherPeriods(
  periodId: string,
): Promise<{ copied_to_periods: number }> {
  invalidateGradesCache();
  return fetchJSON(`/api/grades/periods/${periodId}/copy-elements`, {
    method: "POST",
  });
}

// Evaluation domains
export async function fetchDomains(
  enrollmentId: string,
): Promise<EvaluationDomain[]> {
  return fetchJSON<EvaluationDomain[]>(
    `/api/grades/enrollments/${enrollmentId}/domains`,
  );
}

export async function replaceDomains(
  enrollmentId: string,
  domains: {
    domain_type: string;
    label: string;
    icon?: string | null;
    period_weights: number[];
    elements: {
      period_number: number;
      label: string;
      weight_percentage?: number | null;
      raw_grade?: number | null;
    }[];
  }[],
): Promise<DomainsReplaceResult> {
  invalidateGradesCache();
  return fetchJSON<DomainsReplaceResult>(
    `/api/grades/enrollments/${enrollmentId}/domains`,
    {
      method: "PUT",
      body: JSON.stringify({ domains }),
    },
  );
}

export async function updateCumulativeWeights(
  enrollmentId: string,
  cumulativeWeights: number[][] | null,
): Promise<SubjectEnrollment> {
  invalidateGradesCache();
  return fetchJSON<SubjectEnrollment>(
    `/api/grades/enrollments/${enrollmentId}/cumulative-weights`,
    {
      method: "PATCH",
      body: JSON.stringify({ cumulative_weights: cumulativeWeights }),
    },
  );
}

export async function copyDomainsToSubjects(
  enrollmentId: string,
  targetEnrollmentIds: string[],
): Promise<CopyDomainsResult> {
  invalidateGradesCache();
  return fetchJSON<CopyDomainsResult>(
    `/api/grades/enrollments/${enrollmentId}/copy-domains`,
    {
      method: "POST",
      body: JSON.stringify({ target_enrollment_ids: targetEnrollmentIds }),
    },
  );
}

// Enrollments
export async function createEnrollment(payload: {
  subject_id: string;
  academic_year: string;
  year_level: string;
  is_exam_candidate?: boolean;
}): Promise<SubjectEnrollment> {
  invalidateGradesCache();
  return fetchJSON<SubjectEnrollment>("/api/grades/enrollments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateEnrollment(
  enrollmentId: string,
  payload: { is_active?: boolean; is_exam_candidate?: boolean },
): Promise<EnrollmentMutationResult> {
  invalidateGradesCache();
  return fetchJSON<EnrollmentMutationResult>(
    `/api/grades/enrollments/${enrollmentId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

// Annual grades
export async function updateAnnualGrade(
  subjectId: string,
  academicYear: string,
  annualGrade: number,
): Promise<AnnualGradeMutationResult> {
  invalidateGradesCache();
  return fetchJSON<AnnualGradeMutationResult>("/api/grades/annual-grade", {
    method: "PATCH",
    body: JSON.stringify({
      subject_id: subjectId,
      academic_year: academicYear,
      annual_grade: annualGrade,
    }),
  });
}

// Past year setup (for students who skipped it during wizard)
export async function setupPastYear(payload: {
  academic_year: string;
  year_level: string;
  subjects: { subject_id: string; annual_grade?: number | null }[];
}): Promise<GradeBoardData> {
  invalidateGradesCache();
  return fetchJSON<GradeBoardData>("/api/grades/past-year", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// CFS Dashboard
export async function fetchCFSDashboard(): Promise<CFSDashboardData> {
  return fetchJSON<CFSDashboardData>("/api/grades/cfs");
}

export async function updateExamGrade(
  cfdId: string,
  payload: { exam_grade_raw?: number | null; exam_weight?: number | null },
): Promise<ExamGradeMutationResult> {
  return fetchJSON<ExamGradeMutationResult>(`/api/grades/cfd/${cfdId}/exam`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function updateBasicoExamGrade(
  cfdId: string,
  payload: { exam_percentage?: number | null; exam_weight?: number | null },
): Promise<ExamGradeMutationResult> {
  return fetchJSON<ExamGradeMutationResult>(`/api/grades/cfd/${cfdId}/basico-exam`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function createCFSSnapshot(
  academicYear: string,
): Promise<CFSSnapshot> {
  invalidateGradesCache();
  return fetchJSON<CFSSnapshot>("/api/grades/cfs/snapshot", {
    method: "POST",
    body: JSON.stringify({ academic_year: academicYear }),
  });
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Get the current academic year string (e.g. "2025-2026").
 * Academic year starts in September.
 */
export function getCurrentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  // If August or earlier, we're in the year that started last September
  if (month < 8) {
    return `${year - 1}-${year}`;
  }
  return `${year}-${year + 1}`;
}
