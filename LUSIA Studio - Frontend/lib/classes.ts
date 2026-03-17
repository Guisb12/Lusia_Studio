/**
 * Classes (Turmas) — TypeScript types & API client
 */

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export interface Classroom {
    id: string;
    organization_id: string;
    teacher_id: string;
    name: string;
    description: string | null;
    subject_ids: string[];
    grade_levels: string[];
    courses: string[];
    active: boolean;
    is_primary: boolean;
    created_at: string | null;
    updated_at: string | null;
}

export interface ClassMember {
    id: string;
    full_name: string | null;
    display_name: string | null;
    avatar_url: string | null;
    grade_level: string | null;
    course: string | null;
    subject_ids: string[] | null;
}

export interface SmartRecommendation {
    student_id: string;
    full_name: string | null;
    display_name: string | null;
    avatar_url: string | null;
    grade_level: string | null;
    course: string | null;
    subject_ids: string[];
    matching_subject_ids: string[];
    score: number;
}

export interface PaginatedClassrooms {
    data: Classroom[];
    page: number;
    per_page: number;
    total: number;
}

export interface ClassroomCreatePayload {
    name: string;
    description?: string;
    subject_ids?: string[];
    grade_levels?: string[];
    courses?: string[];
    teacher_id?: string;
    is_primary?: boolean;
}

/* ═══════════════════════════════════════════════════════════════
   API CLIENT
   ═══════════════════════════════════════════════════════════════ */

export async function fetchClasses(
    active?: boolean,
    page?: number,
    perPage?: number,
    own?: boolean,
): Promise<PaginatedClassrooms> {
    const params = new URLSearchParams();
    if (active !== undefined) params.set("active", String(active));
    if (page) params.set("page", String(page));
    if (perPage) params.set("per_page", String(perPage));
    if (own) params.set("own", "true");

    const res = await fetch(`/api/classes?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch classes: ${res.status}`);
    return res.json();
}

export async function fetchClass(id: string): Promise<Classroom> {
    const res = await fetch(`/api/classes/${id}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch class: ${res.status}`);
    return res.json();
}

export async function createClass(data: ClassroomCreatePayload): Promise<Classroom> {
    const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Failed to create class: ${res.status}`);
    return res.json();
}

export async function updateClass(
    id: string,
    data: Partial<ClassroomCreatePayload> & { active?: boolean },
): Promise<Classroom> {
    const res = await fetch(`/api/classes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Failed to update class: ${res.status}`);
    return res.json();
}

export async function deleteClass(id: string): Promise<Classroom> {
    const res = await fetch(`/api/classes/${id}`, {
        method: "DELETE",
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Failed to delete class: ${res.status}`);
    return res.json();
}

export async function fetchClassMembers(id: string): Promise<ClassMember[]> {
    const res = await fetch(`/api/classes/${id}/members`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch class members: ${res.status}`);
    return res.json();
}

/**
 * Add students to a class.
 * When `primaryClassId` is provided and differs from `id`, students are
 * automatically added to the primary class first (best-effort, silent failure).
 * This ensures every student in a non-primary class is also linked to the
 * teacher via the primary class.
 */
export async function addClassMembers(
    id: string,
    studentIds: string[],
    primaryClassId?: string | null,
): Promise<{ added: number }> {
    // Auto-sync to primary class if adding to a non-primary class
    if (primaryClassId && primaryClassId !== id) {
        try {
            await fetch(`/api/classes/${primaryClassId}/members`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ student_ids: studentIds }),
                cache: "no-store",
            });
        } catch {
            // Best-effort — students may already be in primary class
        }
    }

    const res = await fetch(`/api/classes/${id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_ids: studentIds }),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Failed to add class members: ${res.status}`);
    return res.json();
}

export async function removeClassMembers(
    id: string,
    studentIds: string[],
): Promise<{ removed: number }> {
    const res = await fetch(`/api/classes/${id}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_ids: studentIds }),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Failed to remove class members: ${res.status}`);
    return res.json();
}

export async function fetchRecommendations(): Promise<SmartRecommendation[]> {
    const res = await fetch("/api/classes/recommendations", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch recommendations: ${res.status}`);
    return res.json();
}

/**
 * Given a list of classrooms, resolve unique teacher_ids to display names.
 * Returns a map of { teacher_id: displayName }.
 */
export async function hydrateTeacherNames(
    classes: Classroom[],
): Promise<Record<string, string>> {
    const { fetchMembers } = await import("@/lib/members");
    const { cachedFetch } = await import("@/lib/cache");

    const teacherIds = [...new Set(classes.map((c) => c.teacher_id))];
    if (teacherIds.length === 0) return {};

    const cacheKey = `teachers:names:${teacherIds.sort().join(",")}`;
    const members = await cachedFetch(cacheKey, async () => {
        const [admins, teachers] = await Promise.all([
            fetchMembers("admin", "active", 1, 200),
            fetchMembers("teacher", "active", 1, 200),
        ]);
        return [...admins.data, ...teachers.data].filter((member, index, allMembers) =>
            allMembers.findIndex((candidate) => candidate.id === member.id) === index,
        );
    }, 120_000);

    const map: Record<string, string> = {};
    for (const id of teacherIds) {
        const m = members.find((mem) => mem.id === id);
        map[id] = m?.display_name || m?.full_name || "Professor";
    }
    return map;
}
