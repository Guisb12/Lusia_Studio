/**
 * Materials – TypeScript types & API client
 * Matches backend schemas from app/api/http/schemas/materials.py
 */

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export type SubjectStatus = "full" | "structure" | "viable" | "gpa_only";

export interface MaterialSubject {
    id: string;
    name: string;
    slug: string | null;
    color: string | null;
    icon: string | null;
    education_level: string;
    education_level_label: string;
    grade_levels: string[];
    status: SubjectStatus | null;
    is_custom: boolean;
    is_selected: boolean;
    selected_grade: string | null;
}

export interface ProfileMaterialsContext {
    role: string | null;
    grade_level_raw: string | null;
    grade_level: string | null;
    selected_subject_ids: string[];
    selected_subject_refs: string[];
}

export interface SubjectEducationGroup {
    education_level: string;
    education_level_label: string;
    subjects: MaterialSubject[];
}

export interface SubjectCatalog {
    profile_context: ProfileMaterialsContext;
    selected_subjects: MaterialSubject[];
    more_subjects: {
        custom: MaterialSubject[];
        by_education_level: SubjectEducationGroup[];
    };
}

export interface CurriculumNode {
    id: string;
    subject_slug: string | null;
    year_level: string | null;
    subject_component: string | null;
    code: string;
    parent_code: string | null;
    level: number | null;
    sequence_order: number | null;
    title: string;
    description: string | null;
    keywords: string[];
    has_children: boolean;
    exercise_ids: string[];
    full_path: string | null;
}

export interface CurriculumListResponse {
    subject_slug: string;
    year_level: string;
    parent_code: string | null;
    subject_component: string | null;
    available_components: string[];
    nodes: CurriculumNode[];
}

export interface ContentSection {
    section_title: string;
    content: string;
}

export interface ContentJson {
    curriculum_code: string;
    title: string;
    sections: ContentSection[];
}

export interface BaseContentNote {
    id: string | null;
    curriculum_id: string;
    content_json: ContentJson;
    word_count: number | null;
    average_read_time: number | null;
    created_at: string | null;
    updated_at: string | null;
}

export interface CurriculumNoteResponse {
    curriculum: CurriculumNode;
    note: BaseContentNote | null;
}

/* ═══════════════════════════════════════════════════════════════
   API CLIENT
   ═══════════════════════════════════════════════════════════════ */

export async function fetchSubjectCatalog(): Promise<SubjectCatalog> {
    const { cachedFetch } = await import("@/lib/cache");
    return cachedFetch("subjectCatalog", async () => {
        const res = await fetch("/api/materials/subjects", { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to fetch subjects: ${res.status}`);
        return res.json();
    });
}

export async function fetchCurriculumNodes(
    subjectId: string,
    yearLevel: string,
    parentId?: string | null,
    subjectComponent?: string | null,
): Promise<CurriculumListResponse> {
    const { cachedFetch } = await import("@/lib/cache");
    const key = `curriculum:${subjectId}:${yearLevel}:${parentId ?? ""}:${subjectComponent ?? ""}`;
    return cachedFetch(key, async () => {
        const params = new URLSearchParams({
            subject_id: subjectId,
            year_level: yearLevel,
        });
        if (parentId) params.set("parent_id", parentId);
        if (subjectComponent) params.set("subject_component", subjectComponent);

        const res = await fetch(`/api/materials/curriculum?${params.toString()}`, {
            cache: "no-store",
        });
        if (!res.ok) throw new Error(`Failed to fetch curriculum: ${res.status}`);
        return res.json();
    });
}

export async function fetchNoteByCode(
    curriculumCode: string,
): Promise<CurriculumNoteResponse> {
    const { cachedFetch } = await import("@/lib/cache");
    // Curriculum titles rarely change — cache for 5 minutes
    return cachedFetch(`noteByCode:${curriculumCode}`, async () => {
        const res = await fetch(
            `/api/materials/notes/by-code/${encodeURIComponent(curriculumCode)}`,
            { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`Failed to fetch note: ${res.status}`);
        return res.json();
    }, 300_000);
}

export async function fetchNoteByCurriculumId(
    curriculumId: string,
): Promise<CurriculumNoteResponse> {
    const { cachedFetch } = await import("@/lib/cache");
    return cachedFetch(`noteByCurriculum:${curriculumId}`, async () => {
        const res = await fetch(
            `/api/materials/notes/by-curriculum/${encodeURIComponent(curriculumId)}`,
            { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`Failed to fetch note: ${res.status}`);
        return res.json();
    }, 300_000);
}

/**
 * Batch resolve curriculum codes → human-readable titles in a single request.
 * Falls back to the code itself for any unrecognised codes.
 * Results are cached for 5 minutes.
 */
export async function fetchCurriculumTitlesBatch(
    codes: string[],
): Promise<Record<string, string>> {
    if (!codes.length) return {};
    const unique = [...new Set(codes)].sort();
    const { cachedFetch } = await import("@/lib/cache");
    const key = `curriculumTitlesBatch:${unique.join(",")}`;
    return cachedFetch(
        key,
        async () => {
            const res = await fetch(
                `/api/materials/curriculum/titles?codes=${encodeURIComponent(unique.join(","))}`,
                { cache: "no-store" },
            );
            if (!res.ok) return Object.fromEntries(unique.map((c) => [c, c]));
            return res.json() as Promise<Record<string, string>>;
        },
        300_000,
    );
}

export async function updateSubjectPreferences(
    subjectIds: string[],
): Promise<void> {
    const res = await fetch("/api/materials/subject-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_ids: subjectIds }),
    });
    if (!res.ok) throw new Error(`Failed to update subject preferences: ${res.status}`);
    const { cacheInvalidate } = await import("@/lib/cache");
    cacheInvalidate("subjectCatalog");
}
