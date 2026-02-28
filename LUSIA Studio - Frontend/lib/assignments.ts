/**
 * Assignments (TPC) — TypeScript types & API client
 */

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export interface Assignment {
    id: string;
    organization_id: string;
    teacher_id: string;
    class_id: string | null;
    student_ids: string[] | null;
    artifact_id: string | null;
    title: string | null;
    instructions: string | null;
    due_date: string | null;
    status: "draft" | "published" | "closed";
    grades_released_at: string | null;
    created_at: string | null;
    updated_at: string | null;
    // Hydrated
    teacher_name?: string | null;
    artifact?: { id: string; artifact_type: string; artifact_name: string; icon: string | null } | null;
    students?: { id: string; full_name: string | null; display_name: string | null; avatar_url: string | null }[];
    student_count?: number;
    submitted_count?: number;
}

export interface AssignmentCreate {
    title?: string;
    instructions?: string;
    artifact_id?: string;
    class_id?: string;
    student_ids?: string[];
    due_date?: string;
    status?: "draft" | "published";
}

export interface StudentAssignment {
    id: string;
    assignment_id: string;
    student_id: string;
    organization_id: string;
    progress: Record<string, any>;
    submission: Record<string, any> | null;
    grade: number | null;
    feedback: string | null;
    status: "not_started" | "in_progress" | "submitted" | "graded";
    auto_graded: boolean;
    started_at: string | null;
    submitted_at: string | null;
    graded_at: string | null;
    created_at: string | null;
    updated_at: string | null;
    // Hydrated
    student_name?: string | null;
    student_avatar?: string | null;
    assignment?: Assignment;
}

export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
    draft: "Rascunho",
    published: "Ativo",
    closed: "Fechado",
};

export const STUDENT_STATUS_LABELS: Record<string, string> = {
    not_started: "Não iniciado",
    in_progress: "Em progresso",
    submitted: "Entregue",
    graded: "Avaliado",
};

export const STUDENT_STATUS_COLORS: Record<string, string> = {
    not_started: "bg-gray-100 text-gray-600",
    in_progress: "bg-amber-50 text-amber-700",
    submitted: "bg-blue-50 text-blue-700",
    graded: "bg-emerald-50 text-emerald-700",
};

/* ═══════════════════════════════════════════════════════════════
   API CLIENT
   ═══════════════════════════════════════════════════════════════ */

export async function fetchAssignments(status?: string): Promise<Assignment[]> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const res = await fetch(`/api/assignments?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch assignments: ${res.status}`);
    return res.json();
}

export async function fetchAssignment(id: string): Promise<Assignment> {
    const res = await fetch(`/api/assignments/${id}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch assignment: ${res.status}`);
    return res.json();
}

export async function createAssignment(data: AssignmentCreate): Promise<Assignment> {
    const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to create assignment: ${res.status}`);
    return res.json();
}

export async function updateAssignmentStatus(
    id: string,
    status: string,
): Promise<Assignment> {
    const res = await fetch(`/api/assignments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error(`Failed to update assignment: ${res.status}`);
    return res.json();
}

export async function fetchStudentSubmissions(
    assignmentId: string,
): Promise<StudentAssignment[]> {
    const res = await fetch(`/api/assignments/${assignmentId}/students`, {
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Failed to fetch submissions: ${res.status}`);
    return res.json();
}

export async function fetchMyAssignments(): Promise<StudentAssignment[]> {
    const res = await fetch("/api/assignments/mine", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch my assignments: ${res.status}`);
    return res.json();
}

export async function updateStudentAssignment(
    saId: string,
    data: { progress?: Record<string, any>; submission?: Record<string, any>; status?: string },
): Promise<StudentAssignment> {
    const res = await fetch(`/api/student-assignments/${saId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to update student assignment: ${res.status}`);
    return res.json();
}

export async function deleteAssignment(id: string): Promise<void> {
    const res = await fetch(`/api/assignments/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Failed to delete assignment: ${res.status}`);
}

export async function gradeStudentAssignment(
    saId: string,
    data: { grade?: number; feedback?: string; question_overrides?: Record<string, boolean> },
): Promise<StudentAssignment> {
    const res = await fetch(`/api/student-assignments/${saId}/grade`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to grade student assignment: ${res.status}`);
    return res.json();
}
