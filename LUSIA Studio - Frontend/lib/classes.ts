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
    is_primary?: boolean;
}

/* ═══════════════════════════════════════════════════════════════
   API CLIENT
   ═══════════════════════════════════════════════════════════════ */

export async function fetchClasses(
    active?: boolean,
    page?: number,
    perPage?: number,
): Promise<PaginatedClassrooms> {
    const params = new URLSearchParams();
    if (active !== undefined) params.set("active", String(active));
    if (page) params.set("page", String(page));
    if (perPage) params.set("per_page", String(perPage));

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

export async function addClassMembers(
    id: string,
    studentIds: string[],
): Promise<{ added: number }> {
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
