/**
 * Portuguese Secundário National Exam Configuration
 *
 * Maps IAVE exam codes to subject slugs from curriculum-secundario.ts.
 * Source: IAVE exam calendar + Portaria 226-A/2018 subject mapping.
 *
 * Post-2023 cohorts: exam weight is always 25% (Decreto-Lei 62/2023).
 */

import type { CourseKey } from "./curriculum-secundario";

// ── Types ──────────────────────────────────────────────────

export interface ExamDefinition {
  /** IAVE exam code (e.g. "639", "702") */
  iaveCode: string;
  /** Subject slug from curriculum-secundario.ts */
  subjectSlug: string;
  /** Display name: "Biologia e Geologia (702)" */
  examName: string;
  /** Year level when the exam is taken */
  yearLevel: "11" | "12";
  /** Only true for Português — cannot be toggled off */
  mandatory?: boolean;
}

// ── Constants ──────────────────────────────────────────────

/** Exam weight for post-2023 cohorts: always 25% */
export const EXAM_WEIGHT_POST_2023 = 25;

/** Minimum raw score (0-200) to count for the 3-exam graduation requirement */
export const EXAM_PASSING_RAW = 95; // 9.5 on 0-20 scale

/** Total exams needed to graduate */
export const EXAMS_REQUIRED = 3;

// ── Common exams (available to all courses) ────────────────

const COMMON_EXAMS_11: ExamDefinition[] = [
  { iaveCode: "714", subjectSlug: "secundario_fil", examName: "Filosofia (714)", yearLevel: "11" },
  { iaveCode: "550", subjectSlug: "secundario_ing", examName: "Inglês (550)", yearLevel: "11" },
  { iaveCode: "517", subjectSlug: "secundario_fra", examName: "Francês (517)", yearLevel: "11" },
  { iaveCode: "547", subjectSlug: "secundario_esp", examName: "Espanhol (547)", yearLevel: "11" },
  { iaveCode: "501", subjectSlug: "secundario_ale", examName: "Alemão (501)", yearLevel: "11" },
];

const COMMON_EXAMS_12: ExamDefinition[] = [
  { iaveCode: "639", subjectSlug: "secundario_port", examName: "Português (639)", yearLevel: "12", mandatory: true },
];

// ── Per-course exam registry ───────────────────────────────

export const EXAM_REGISTRY: Record<CourseKey, ExamDefinition[]> = {
  ciencias_tecnologias: [
    // 11º — biennial exams
    { iaveCode: "702", subjectSlug: "secundario_bg", examName: "Biologia e Geologia (702)", yearLevel: "11" },
    { iaveCode: "715", subjectSlug: "secundario_fqa", examName: "Física e Química A (715)", yearLevel: "11" },
    { iaveCode: "708", subjectSlug: "secundario_gda", examName: "Geometria Descritiva A (708)", yearLevel: "11" },
    ...COMMON_EXAMS_11,
    // 12º — triennial exam + Português
    { iaveCode: "635", subjectSlug: "secundario_mat_a", examName: "Matemática A (635)", yearLevel: "12" },
    ...COMMON_EXAMS_12,
  ],

  ciencias_socioeconomicas: [
    // 11º
    { iaveCode: "712", subjectSlug: "secundario_econ_a", examName: "Economia A (712)", yearLevel: "11" },
    { iaveCode: "719", subjectSlug: "secundario_geo_a", examName: "Geografia A (719)", yearLevel: "11" },
    { iaveCode: "723", subjectSlug: "secundario_hist_b", examName: "História B (723)", yearLevel: "11" },
    ...COMMON_EXAMS_11,
    // 12º
    { iaveCode: "635", subjectSlug: "secundario_mat_a", examName: "Matemática A (635)", yearLevel: "12" },
    ...COMMON_EXAMS_12,
  ],

  linguas_humanidades: [
    // 11º
    { iaveCode: "835", subjectSlug: "secundario_macs", examName: "MACS (835)", yearLevel: "11" },
    { iaveCode: "719", subjectSlug: "secundario_geo_a", examName: "Geografia A (719)", yearLevel: "11" },
    { iaveCode: "734", subjectSlug: "secundario_lit_pt", examName: "Literatura Portuguesa (734)", yearLevel: "11" },
    { iaveCode: "732", subjectSlug: "secundario_lat_a", examName: "Latim A (732)", yearLevel: "11" },
    ...COMMON_EXAMS_11,
    // 12º
    { iaveCode: "623", subjectSlug: "secundario_hist_a", examName: "História A (623)", yearLevel: "12" },
    ...COMMON_EXAMS_12,
  ],

  artes_visuais: [
    // 11º
    { iaveCode: "735", subjectSlug: "secundario_mat_b", examName: "Matemática B (735)", yearLevel: "11" },
    { iaveCode: "724", subjectSlug: "secundario_hca", examName: "História da Cultura e das Artes (724)", yearLevel: "11" },
    { iaveCode: "708", subjectSlug: "secundario_gda", examName: "Geometria Descritiva A (708)", yearLevel: "11" },
    ...COMMON_EXAMS_11,
    // 12º
    { iaveCode: "706", subjectSlug: "secundario_des_a", examName: "Desenho A (706)", yearLevel: "12" },
    ...COMMON_EXAMS_12,
  ],
};

// ── Helper Functions ───────────────────────────────────────

/**
 * Get exams available for a student based on their course, year level,
 * and enrolled subjects. Only returns exams for subjects the student
 * is actually taking.
 */
export function getAvailableExams(
  courseKey: CourseKey,
  yearLevel: string,
  enrolledSubjectSlugs: string[],
): ExamDefinition[] {
  const allExams = EXAM_REGISTRY[courseKey];
  if (!allExams) return [];

  const enrolledSet = new Set(enrolledSubjectSlugs);

  return allExams.filter(
    (e) => e.yearLevel === yearLevel && enrolledSet.has(e.subjectSlug),
  );
}

/**
 * Get all exams for a course (across all years). Useful for showing
 * the complete exam picture for a Secundário student.
 */
export function getAllCourseExams(courseKey: CourseKey): ExamDefinition[] {
  return EXAM_REGISTRY[courseKey] ?? [];
}

/**
 * Find exam definition by subject slug.
 */
export function findExamBySlug(
  courseKey: CourseKey,
  subjectSlug: string,
): ExamDefinition | undefined {
  return EXAM_REGISTRY[courseKey]?.find((e) => e.subjectSlug === subjectSlug);
}

/**
 * Calculate the minimum raw exam score (0-200) to maintain or improve CFD.
 * Safe minimum: CE >= CIF → raw >= CIF × 10
 */
export function getSafeMinimumRaw(cifGrade: number): number {
  return cifGrade * 10;
}

// ── Básico 3º Ciclo (9th grade) Provas Finais ─────────────

/** Exam weight for Básico 3º Ciclo: always 30% */
export const BASICO_EXAM_WEIGHT = 30;

/**
 * Convert a Prova Final percentage score (0-100) to level (1-5)
 * using standard Portuguese Básico thresholds.
 */
export function convertExamPercentageToLevel(score: number): number {
  if (score >= 90) return 5;
  if (score >= 70) return 4;
  if (score >= 50) return 3;
  if (score >= 20) return 2;
  return 1;
}
