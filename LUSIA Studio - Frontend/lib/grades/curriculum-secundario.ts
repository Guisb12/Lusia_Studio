/**
 * Portuguese Secundário Curriculum — Course-to-Subject Mapping
 *
 * Source: Portaria 226-A/2018 (amended by Portaria 278/2023)
 * Defines the 4 Cursos Científico-Humanísticos and their subject pools.
 * Slugs reference the `subjects.slug` column in the database.
 */

// ── Types ──────────────────────────────────────────────────

export type CourseKey =
  | "ciencias_tecnologias"
  | "ciencias_socioeconomicas"
  | "linguas_humanidades"
  | "artes_visuais";

export type SubjectDuration = "trienal" | "bienal" | "anual";

export interface CurriculumSubjectRef {
  slug: string;
  duration: SubjectDuration;
  grades: string[]; // which year levels: ["10","11","12"] for trienal, etc.
}

export interface ForeignLangOption {
  slug: string;
  label: string;
}

export interface CourseSubjectMap {
  trienal: CurriculumSubjectRef;
  bienal_pool: CurriculumSubjectRef[];
  anual_opcao_d: CurriculumSubjectRef[];
  anual_opcao_e: CurriculumSubjectRef[];
}

export interface ResolvedSubject {
  id: string;
  slug: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  has_national_exam?: boolean;
  status?: string | null;
}

// ── Formação Geral (common to ALL courses) ─────────────────

export const FORMACAO_GERAL: CurriculumSubjectRef[] = [
  { slug: "secundario_port", duration: "trienal", grades: ["10", "11", "12"] },
  { slug: "secundario_fil", duration: "bienal", grades: ["10", "11"] },
  { slug: "secundario_ef", duration: "trienal", grades: ["10", "11", "12"] },
  { slug: "secundario_cid", duration: "trienal", grades: ["10", "11", "12"] },
];

export const FORMACAO_GERAL_OPTIONAL: CurriculumSubjectRef[] = [
  { slug: "secundario_emrc", duration: "trienal", grades: ["10", "11", "12"] },
];

export const FOREIGN_LANGUAGES: ForeignLangOption[] = [
  { slug: "secundario_ing", label: "Inglês" },
  { slug: "secundario_fra", label: "Francês" },
  { slug: "secundario_esp", label: "Espanhol" },
  { slug: "secundario_ale", label: "Alemão" },
];

// Foreign languages as CurriculumSubjectRef (bienal, 10–11)
const FL_REFS: Record<string, CurriculumSubjectRef> = {
  secundario_ing: { slug: "secundario_ing", duration: "bienal", grades: ["10", "11"] },
  secundario_fra: { slug: "secundario_fra", duration: "bienal", grades: ["10", "11"] },
  secundario_esp: { slug: "secundario_esp", duration: "bienal", grades: ["10", "11"] },
  secundario_ale: { slug: "secundario_ale", duration: "bienal", grades: ["10", "11"] },
};

// ── Course Subject Maps ────────────────────────────────────

export const COURSE_SUBJECT_MAP: Record<CourseKey, CourseSubjectMap> = {
  ciencias_tecnologias: {
    trienal: { slug: "secundario_mat_a", duration: "trienal", grades: ["10", "11", "12"] },
    bienal_pool: [
      { slug: "secundario_bg", duration: "bienal", grades: ["10", "11"] },
      { slug: "secundario_fqa", duration: "bienal", grades: ["10", "11"] },
      { slug: "secundario_gda", duration: "bienal", grades: ["10", "11"] },
      { slug: "secundario_econ_a", duration: "bienal", grades: ["10", "11"] },
    ],
    anual_opcao_d: [
      { slug: "secundario_bio12", duration: "anual", grades: ["12"] },
      { slug: "secundario_fis12", duration: "anual", grades: ["12"] },
      { slug: "secundario_qui12", duration: "anual", grades: ["12"] },
      { slug: "secundario_geo12", duration: "anual", grades: ["12"] },
      { slug: "secundario_mat_tec", duration: "anual", grades: ["12"] },
    ],
    anual_opcao_e: [
      { slug: "secundario_aib", duration: "anual", grades: ["12"] },
      { slug: "secundario_antrop", duration: "anual", grades: ["12"] },
      { slug: "secundario_cp", duration: "anual", grades: ["12"] },
      { slug: "secundario_class_lit", duration: "anual", grades: ["12"] },
      { slug: "secundario_dir", duration: "anual", grades: ["12"] },
      { slug: "secundario_econ_c", duration: "anual", grades: ["12"] },
      { slug: "secundario_fil_a", duration: "anual", grades: ["12"] },
      { slug: "secundario_geo_c", duration: "anual", grades: ["12"] },
      { slug: "secundario_psi_b", duration: "anual", grades: ["12"] },
      { slug: "secundario_soc", duration: "anual", grades: ["12"] },
      { slug: "secundario_teatro", duration: "anual", grades: ["12"] },
    ],
  },

  ciencias_socioeconomicas: {
    trienal: { slug: "secundario_mat_a", duration: "trienal", grades: ["10", "11", "12"] },
    bienal_pool: [
      { slug: "secundario_econ_a", duration: "bienal", grades: ["10", "11"] },
      { slug: "secundario_geo_a", duration: "bienal", grades: ["10", "11"] },
      { slug: "secundario_hist_b", duration: "bienal", grades: ["10", "11"] },
    ],
    anual_opcao_d: [
      { slug: "secundario_econ_c", duration: "anual", grades: ["12"] },
      { slug: "secundario_geo_c", duration: "anual", grades: ["12"] },
      { slug: "secundario_soc", duration: "anual", grades: ["12"] },
    ],
    anual_opcao_e: [
      { slug: "secundario_aib", duration: "anual", grades: ["12"] },
      { slug: "secundario_antrop", duration: "anual", grades: ["12"] },
      { slug: "secundario_cp", duration: "anual", grades: ["12"] },
      { slug: "secundario_class_lit", duration: "anual", grades: ["12"] },
      { slug: "secundario_dir", duration: "anual", grades: ["12"] },
      { slug: "secundario_fil_a", duration: "anual", grades: ["12"] },
      { slug: "secundario_psi_b", duration: "anual", grades: ["12"] },
      { slug: "secundario_teatro", duration: "anual", grades: ["12"] },
    ],
  },

  linguas_humanidades: {
    trienal: { slug: "secundario_hist_a", duration: "trienal", grades: ["10", "11", "12"] },
    bienal_pool: [
      { slug: "secundario_macs", duration: "bienal", grades: ["10", "11"] },
      { slug: "secundario_geo_a", duration: "bienal", grades: ["10", "11"] },
      { slug: "secundario_lat_a", duration: "bienal", grades: ["10", "11"] },
      { slug: "secundario_lit_pt", duration: "bienal", grades: ["10", "11"] },
      { slug: "secundario_econ_a", duration: "bienal", grades: ["10", "11"] },
      // Note: LE II/III can also be a bienal for L&H — handled separately
    ],
    anual_opcao_d: [
      { slug: "secundario_fil_a", duration: "anual", grades: ["12"] },
      { slug: "secundario_geo_c", duration: "anual", grades: ["12"] },
      { slug: "secundario_lit_port", duration: "anual", grades: ["12"] },
      { slug: "secundario_psi_b", duration: "anual", grades: ["12"] },
      { slug: "secundario_soc", duration: "anual", grades: ["12"] },
    ],
    anual_opcao_e: [
      { slug: "secundario_aib", duration: "anual", grades: ["12"] },
      { slug: "secundario_antrop", duration: "anual", grades: ["12"] },
      { slug: "secundario_cp", duration: "anual", grades: ["12"] },
      { slug: "secundario_class_lit", duration: "anual", grades: ["12"] },
      { slug: "secundario_dir", duration: "anual", grades: ["12"] },
      { slug: "secundario_econ_c", duration: "anual", grades: ["12"] },
      { slug: "secundario_teatro", duration: "anual", grades: ["12"] },
    ],
  },

  artes_visuais: {
    trienal: { slug: "secundario_des_a", duration: "trienal", grades: ["10", "11", "12"] },
    bienal_pool: [
      { slug: "secundario_gda", duration: "bienal", grades: ["10", "11"] },
      { slug: "secundario_mat_b", duration: "bienal", grades: ["10", "11"] },
      { slug: "secundario_hca", duration: "bienal", grades: ["10", "11"] },
    ],
    anual_opcao_d: [
      { slug: "secundario_mat_tec", duration: "anual", grades: ["12"] },
      { slug: "secundario_of_artes", duration: "anual", grades: ["12"] },
      { slug: "secundario_of_design", duration: "anual", grades: ["12"] },
      { slug: "secundario_of_mult", duration: "anual", grades: ["12"] },
    ],
    anual_opcao_e: [
      { slug: "secundario_aib", duration: "anual", grades: ["12"] },
      { slug: "secundario_antrop", duration: "anual", grades: ["12"] },
      { slug: "secundario_cp", duration: "anual", grades: ["12"] },
      { slug: "secundario_class_lit", duration: "anual", grades: ["12"] },
      { slug: "secundario_dir", duration: "anual", grades: ["12"] },
      { slug: "secundario_econ_c", duration: "anual", grades: ["12"] },
      { slug: "secundario_fil_a", duration: "anual", grades: ["12"] },
      { slug: "secundario_geo_c", duration: "anual", grades: ["12"] },
      { slug: "secundario_soc", duration: "anual", grades: ["12"] },
      { slug: "secundario_teatro", duration: "anual", grades: ["12"] },
    ],
  },
};

// ── Course metadata ────────────────────────────────────────

export const COURSE_DESCRIPTIONS: Record<CourseKey, string> = {
  ciencias_tecnologias: "Medicina, Engenharia, Ciências, Informática",
  ciencias_socioeconomicas: "Economia, Gestão, Finanças, Marketing",
  linguas_humanidades: "Direito, Jornalismo, Línguas, Psicologia",
  artes_visuais: "Arquitetura, Design, Belas-Artes, Cinema",
};

// ── Helper Functions ───────────────────────────────────────

/**
 * Get all auto-selected slugs for a given course and grade.
 * These are subjects the student doesn't choose — they're mandatory.
 */
export function getAutoSlugs(
  courseKey: CourseKey,
  grade: string,
  foreignLangSlug: string,
): string[] {
  const courseMap = COURSE_SUBJECT_MAP[courseKey];
  const slugs: string[] = [];

  // Formação Geral subjects that apply to this grade
  for (const ref of FORMACAO_GERAL) {
    if (ref.grades.includes(grade)) {
      slugs.push(ref.slug);
    }
  }

  // Foreign language (if it applies to this grade)
  const flRef = FL_REFS[foreignLangSlug];
  if (flRef && flRef.grades.includes(grade)) {
    slugs.push(foreignLangSlug);
  }

  // Course trienal (if it applies to this grade)
  if (courseMap.trienal.grades.includes(grade)) {
    slugs.push(courseMap.trienal.slug);
  }

  return slugs;
}

/**
 * Combine all user choices into a final list of slugs for a given grade.
 */
export function resolveSelectedSlugs(
  courseKey: CourseKey,
  grade: string,
  foreignLangSlug: string,
  bienalSlugs: string[],
  anualSlugs: string[] = [],
  includeEmrc: boolean = false,
): string[] {
  const slugs = new Set(getAutoSlugs(courseKey, grade, foreignLangSlug));

  // Bienais (apply to grades 10 and 11)
  for (const slug of bienalSlugs) {
    const ref = COURSE_SUBJECT_MAP[courseKey].bienal_pool.find((b) => b.slug === slug);
    if (ref && ref.grades.includes(grade)) {
      slugs.add(slug);
    }
  }

  // Anuais (apply to grade 12 only)
  if (grade === "12") {
    for (const slug of anualSlugs) {
      slugs.add(slug);
    }
  }

  // Optional EMRC
  if (includeEmrc) {
    for (const ref of FORMACAO_GERAL_OPTIONAL) {
      if (ref.grades.includes(grade)) {
        slugs.add(ref.slug);
      }
    }
  }

  return Array.from(slugs);
}

/**
 * Get all subjects for a specific grade level, organized by category.
 */
export function getSubjectsForGrade(
  courseKey: CourseKey,
  grade: string,
): {
  auto: CurriculumSubjectRef[];
  bienais: CurriculumSubjectRef[];
  anuais_d: CurriculumSubjectRef[];
  anuais_e: CurriculumSubjectRef[];
} {
  const courseMap = COURSE_SUBJECT_MAP[courseKey];

  const auto: CurriculumSubjectRef[] = [];

  // Formação Geral
  for (const ref of FORMACAO_GERAL) {
    if (ref.grades.includes(grade)) auto.push(ref);
  }

  // Course trienal
  if (courseMap.trienal.grades.includes(grade)) {
    auto.push(courseMap.trienal);
  }

  // Bienais for this grade
  const bienais = courseMap.bienal_pool.filter((b) => b.grades.includes(grade));

  // Anuais for this grade (12 only)
  const anuais_d = courseMap.anual_opcao_d.filter((a) => a.grades.includes(grade));
  const anuais_e = courseMap.anual_opcao_e.filter((a) => a.grades.includes(grade));

  return { auto, bienais, anuais_d, anuais_e };
}

/**
 * Given an array of slugs and a slug-to-subject lookup map,
 * return the resolved subject objects.
 */
export function resolveSlugsToSubjects(
  slugs: string[],
  slugMap: Map<string, ResolvedSubject>,
): ResolvedSubject[] {
  const result: ResolvedSubject[] = [];
  for (const slug of slugs) {
    const subject = slugMap.get(slug);
    if (subject) {
      result.push(subject);
    }
  }
  return result;
}

/**
 * Build a slug → subject lookup map from an array of fetched subjects.
 */
export function buildSlugMap(
  subjects: { id: string; slug?: string | null; name: string; color?: string | null; icon?: string | null; has_national_exam?: boolean; status?: string | null }[],
): Map<string, ResolvedSubject> {
  const map = new Map<string, ResolvedSubject>();
  for (const s of subjects) {
    if (s.slug) {
      map.set(s.slug, {
        id: s.id,
        slug: s.slug,
        name: s.name,
        color: s.color,
        icon: s.icon,
        has_national_exam: s.has_national_exam,
        status: s.status,
      });
    }
  }
  return map;
}

/**
 * Validate anuais selection: at least 1 from opções (d).
 */
export function validateAnuaisSelection(
  courseKey: CourseKey,
  anualSlugs: string[],
): { valid: boolean; countFromD: number } {
  const dSlugs = new Set(COURSE_SUBJECT_MAP[courseKey].anual_opcao_d.map((a) => a.slug));
  const countFromD = anualSlugs.filter((s) => dSlugs.has(s)).length;
  return {
    valid: anualSlugs.length === 2 && countFromD >= 1,
    countFromD,
  };
}
