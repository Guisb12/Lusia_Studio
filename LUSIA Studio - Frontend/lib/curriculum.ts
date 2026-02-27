/**
 * Portuguese National Curriculum - Static Reference Data
 * Used client-side to drive onboarding step logic.
 */

/* ═══════════════════════════════════════════════════════════════
   EDUCATION LEVELS
   ═══════════════════════════════════════════════════════════════ */

export type EducationLevel =
    | "basico_1_ciclo"
    | "basico_2_ciclo"
    | "basico_3_ciclo"
    | "secundario";

export interface EducationLevelInfo {
    key: EducationLevel;
    label: string;
    shortLabel: string;
    grades: string[];
}

export const EDUCATION_LEVELS: EducationLevelInfo[] = [
    {
        key: "basico_1_ciclo",
        label: "1º Ciclo do Ensino Básico",
        shortLabel: "1º Ciclo",
        grades: ["1", "2", "3", "4"],
    },
    {
        key: "basico_2_ciclo",
        label: "2º Ciclo do Ensino Básico",
        shortLabel: "2º Ciclo",
        grades: ["5", "6"],
    },
    {
        key: "basico_3_ciclo",
        label: "3º Ciclo do Ensino Básico",
        shortLabel: "3º Ciclo",
        grades: ["7", "8", "9"],
    },
    {
        key: "secundario",
        label: "Ensino Secundário",
        shortLabel: "Secundário",
        grades: ["10", "11", "12"],
    },
];

export function getGradeLabel(grade: string): string {
    return `${grade}º ano`;
}

export function getEducationLevel(key: EducationLevel): EducationLevelInfo | undefined {
    return EDUCATION_LEVELS.find((l) => l.key === key);
}

/** Get education level (e.g. 1º Ciclo, Secundário) from a grade string (e.g. "10", "7"). */
export function getEducationLevelByGrade(grade: string): EducationLevelInfo | undefined {
    return EDUCATION_LEVELS.find((l) => l.grades.includes(grade));
}

/* ═══════════════════════════════════════════════════════════════
   COURSES (Secundário only)
   ═══════════════════════════════════════════════════════════════ */

export type CourseKey =
    | "ciencias_tecnologias"
    | "ciencias_socioeconomicas"
    | "linguas_humanidades"
    | "artes_visuais";

export interface CourseInfo {
    key: CourseKey;
    label: string;
    icon: string;
    description: string;
}

export const SECUNDARIO_COURSES: CourseInfo[] = [
    { key: "ciencias_tecnologias", label: "Ciências e Tecnologias", icon: "atom", description: "Medicina, Engenharia, Ciências, Informática" },
    { key: "ciencias_socioeconomicas", label: "Ciências Socioeconómicas", icon: "trending-up", description: "Economia, Gestão, Finanças, Marketing" },
    { key: "linguas_humanidades", label: "Línguas e Humanidades", icon: "book-open", description: "Direito, Jornalismo, Línguas, Psicologia" },
    { key: "artes_visuais", label: "Artes Visuais", icon: "palette", description: "Arquitetura, Design, Belas-Artes, Cinema" },
];

/* ═══════════════════════════════════════════════════════════════
   PT DISTRICTS
   ═══════════════════════════════════════════════════════════════ */

export const PT_DISTRICTS: string[] = [
    "Aveiro",
    "Beja",
    "Braga",
    "Bragança",
    "Castelo Branco",
    "Coimbra",
    "Évora",
    "Faro",
    "Guarda",
    "Leiria",
    "Lisboa",
    "Portalegre",
    "Porto",
    "Santarém",
    "Setúbal",
    "Viana do Castelo",
    "Vila Real",
    "Viseu",
    "Região Autónoma dos Açores",
    "Região Autónoma da Madeira",
];
