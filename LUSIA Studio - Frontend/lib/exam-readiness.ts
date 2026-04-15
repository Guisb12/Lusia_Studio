/**
 * National exam readiness — types and client fetchers (teacher/admin dashboard).
 */

export interface ExamReadinessSubject {
  id: string;
  name: string;
  slug: string | null;
  education_level?: string | null;
  grade_levels?: string[] | null;
  has_national_exam: boolean;
}

export interface TopicSummaryL1Row {
  subject_slug: string;
  curriculum_code_l1: string;
  topic_label?: string | null;
  exam_count?: number | null;
  question_count?: number | null;
  total_points?: number | null;
  avg_points_per_question?: number | null;
  avg_points_per_exam?: number | null;
  first_year?: number | null;
  last_year?: number | null;
  years_present?: unknown;
  phase_counts?: Record<string, unknown> | null;
  question_type_counts?: Record<string, unknown> | null;
  structure_counts?: Record<string, unknown> | null;
}

export interface TopicYearMatrixRow {
  subject_slug: string;
  curriculum_code_l1: string;
  topic_label?: string | null;
  exam_year?: number | null;
  exam_count?: number | null;
  question_count?: number | null;
  total_points?: number | null;
  phase_counts?: Record<string, unknown> | null;
}

export interface ExamBlueprintRow {
  subject_slug: string;
  exam_id?: string | null;
  exam_year?: number | null;
  exam_phase?: string | null;
  question_count?: number | null;
  total_points?: number | null;
  question_type_counts?: Record<string, unknown> | null;
  scored_type_counts?: Record<string, unknown> | null;
  structure_counts?: Record<string, unknown> | null;
  distinct_l1_topics?: number | null;
  top_l1_topics?: unknown;
  top_l1_topic_labels?: unknown;
  /** String, or structured array from DB (e.g. label/points per slot). */
  question_order_signature?: unknown;
}

export interface ExamReadinessSubjectPayload {
  subject: ExamReadinessSubject;
  topic_summary: TopicSummaryL1Row[];
  topic_year_matrix: TopicYearMatrixRow[];
  blueprints: ExamBlueprintRow[];
}

export interface TopicSummaryL2Row {
  subject_slug: string;
  curriculum_code_l1: string;
  curriculum_code_l2: string;
  topic_l1_label?: string | null;
  topic_l2_label?: string | null;
  share_within_l1?: number | null;
  exam_count?: number | null;
  question_count?: number | null;
  total_points?: number | null;
  avg_points_per_question?: number | null;
  avg_points_per_exam?: number | null;
  first_year?: number | null;
  last_year?: number | null;
  years_present?: unknown;
  phase_counts?: Record<string, unknown> | null;
  question_type_counts?: Record<string, unknown> | null;
  structure_counts?: Record<string, unknown> | null;
}

export interface TopicYearMatrixL2Row {
  subject_slug: string;
  curriculum_code_l1: string;
  curriculum_code_l2: string;
  topic_l1_label?: string | null;
  topic_l2_label?: string | null;
  exam_year?: number | null;
  exam_count?: number | null;
  question_count?: number | null;
  total_points?: number | null;
  avg_points_per_exam?: number | null;
  phase_counts?: Record<string, unknown> | null;
}

export interface ExamReadinessL1DrilldownPayload {
  curriculum_code_l1: string;
  topic_summary_l2: TopicSummaryL2Row[];
  topic_year_matrix_l2: TopicYearMatrixL2Row[];
}

export interface ExamEvidenceItem {
  id: string;
  type: string;
  label?: string | null;
  exam_year?: number | null;
  exam_phase?: string | null;
  curriculum_codes?: string[] | null;
  question_preview?: string | null;
  criteria_preview?: string | null;
  points?: number | null;
}

export interface ExamEvidenceResponse {
  items: ExamEvidenceItem[];
}

export async function fetchExamReadinessSubjects(): Promise<ExamReadinessSubject[]> {
  const res = await fetch("/api/exam-readiness/subjects", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load exam subjects: ${res.status}`);
  return res.json();
}

export async function fetchExamReadinessSubject(
  subjectSlug: string,
  opts?: { blueprint_year_from?: number; blueprint_limit?: number },
): Promise<ExamReadinessSubjectPayload> {
  const q = new URLSearchParams();
  if (opts?.blueprint_year_from != null) {
    q.set("blueprint_year_from", String(opts.blueprint_year_from));
  }
  if (opts?.blueprint_limit != null) {
    q.set("blueprint_limit", String(opts.blueprint_limit));
  }
  const qs = q.toString();
  const suffix = qs ? `?${qs}` : "";
  const res = await fetch(`/api/exam-readiness/${encodeURIComponent(subjectSlug)}${suffix}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load exam readiness: ${res.status}`);
  return res.json();
}

export async function fetchExamEvidence(
  subjectSlug: string,
  curriculumCodeL1: string,
  opts?: { limit?: number; curriculumCodeL2?: string | null },
): Promise<ExamEvidenceResponse> {
  const q = new URLSearchParams({
    curriculum_code_l1: curriculumCodeL1,
    limit: String(opts?.limit ?? 20),
  });
  if (opts?.curriculumCodeL2) {
    q.set("curriculum_code_l2", opts.curriculumCodeL2);
  }
  const res = await fetch(
    `/api/exam-readiness/${encodeURIComponent(subjectSlug)}/evidence?${q.toString()}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Failed to load evidence: ${res.status}`);
  return res.json();
}

export async function fetchExamReadinessL2Insights(
  subjectSlug: string,
  curriculumCodeL1: string,
): Promise<ExamReadinessL1DrilldownPayload> {
  const q = new URLSearchParams({ curriculum_code_l1: curriculumCodeL1 });
  const res = await fetch(
    `/api/exam-readiness/${encodeURIComponent(subjectSlug)}/l2-insights?${q.toString()}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Failed to load L2 insights: ${res.status}`);
  return res.json();
}
