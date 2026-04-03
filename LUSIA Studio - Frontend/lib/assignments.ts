/**
 * Assignments (TPC) — TypeScript types & API client
 */

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export interface ArtifactMeta {
    id: string;
    artifact_type: string;
    artifact_name: string;
    icon: string | null;
    source_type?: string | null;
    storage_path?: string | null;
}

export interface Assignment {
    id: string;
    organization_id: string;
    teacher_id: string;
    class_id: string | null;
    student_ids: string[] | null;
    artifact_ids: string[];
    title: string | null;
    instructions: string | null;
    due_date: string | null;
    status: "draft" | "published" | "closed";
    grades_released_at: string | null;
    created_at: string | null;
    updated_at: string | null;
    // Hydrated
    teacher_name?: string | null;
    teacher_avatar?: string | null;
    artifacts?: ArtifactMeta[];
    students?: { id: string; full_name: string | null; display_name: string | null; avatar_url: string | null }[];
    student_count?: number;
    submitted_count?: number;
    student_preview?: { id: string; full_name: string | null; display_name: string | null; avatar_url: string | null }[];
}

export interface AssignmentArchivePage {
    items: Assignment[];
    next_offset: number | null;
    has_more: boolean;
    error?: string | null;
}

export interface AssignmentCreate {
    title?: string;
    instructions?: string;
    artifact_ids?: string[];
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

/** Artifact types that support numeric grading */
export const GRADABLE_ARTIFACT_TYPES = new Set(["quiz"]);

/* ═══════════════════════════════════════════════════════════════
   PER-TASK HELPERS (multi-attachment)
   ═══════════════════════════════════════════════════════════════ */

export type TaskStatus = "not_started" | "in_progress" | "completed" | "graded";

/** Get the completion status of a specific artifact task */
export function getTaskStatus(
    submission: Record<string, any> | null,
    progress: Record<string, any> | null,
    artifactId: string,
): TaskStatus {
    const taskSub = submission?.[artifactId];
    if (taskSub) {
        if (taskSub.grading) return "graded";
        return "completed";
    }
    const taskProg = progress?.[artifactId];
    if (taskProg) return "in_progress";
    return "not_started";
}

/** Get the grade for a specific quiz task (null if not graded or not a quiz) */
export function getTaskGrade(
    submission: Record<string, any> | null,
    artifactId: string,
): number | null {
    const taskSub = submission?.[artifactId];
    if (!taskSub) return null;
    if (typeof taskSub.grade === "number") return taskSub.grade;
    if (taskSub.grading?.score != null) return taskSub.grading.score;
    return null;
}

/** Check if all tasks in the assignment are completed */
export function isAssignmentFullyCompleted(
    submission: Record<string, any> | null,
    artifactIds: string[],
): boolean {
    if (!artifactIds.length) return false;
    return artifactIds.every((aid) => submission?.[aid]);
}

/** Check if an assignment has any gradable (quiz) artifacts */
export function hasGradableArtifacts(artifacts?: ArtifactMeta[]): boolean {
    return (artifacts ?? []).some((a) => GRADABLE_ARTIFACT_TYPES.has(a.artifact_type));
}

/** Get task label for student view */
export function getTaskLabel(artifact: ArtifactMeta): string {
    if (GRADABLE_ARTIFACT_TYPES.has(artifact.artifact_type)) {
        return `Resolver ${artifact.artifact_name}`;
    }
    return `Abrir ${artifact.artifact_name}`;
}

/* ═══════════════════════════════════════════════════════════════
   API CLIENT
   ═══════════════════════════════════════════════════════════════ */

export async function fetchAssignments(
    status?: string,
    teacherId?: string,
    statuses?: string[],
): Promise<Assignment[]> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (teacherId) params.set("teacher_id", teacherId);
    if (statuses?.length) params.set("statuses", statuses.join(","));
    const res = await fetch(`/api/assignments?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch assignments: ${res.status}`);
    return res.json();
}

export async function fetchAssignmentArchive(params: {
    teacherId?: string;
    closedAfter?: string;
    offset?: number;
    limit?: number;
}): Promise<AssignmentArchivePage> {
    const searchParams = new URLSearchParams();
    if (params.teacherId) searchParams.set("teacher_id", params.teacherId);
    if (params.closedAfter) searchParams.set("closed_after", params.closedAfter);
    if (params.offset !== undefined) searchParams.set("offset", String(params.offset));
    if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
    const res = await fetch(`/api/assignments/archive?${searchParams.toString()}`, {
        cache: "no-store",
    });
    if (!res.ok) {
        return {
            items: [],
            next_offset: null,
            has_more: false,
            error: `Failed to fetch assignment archive: ${res.status}`,
        };
    }
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
    data: {
        artifact_id?: string;
        progress?: Record<string, any>;
        submission?: Record<string, any>;
        status?: string;
    },
): Promise<StudentAssignment> {
    const res = await fetch(`/api/student-assignments/${saId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to update student assignment: ${res.status}`);
    return res.json();
}

export async function addStudentsToAssignment(
    id: string,
    studentIds: string[],
): Promise<Assignment> {
    const res = await fetch(`/api/assignments/${id}/students`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_ids: studentIds }),
    });
    if (!res.ok) throw new Error(`Failed to add students: ${res.status}`);
    return res.json();
}

export async function removeStudentsFromAssignment(
    id: string,
    studentIds: string[],
): Promise<Assignment> {
    const res = await fetch(`/api/assignments/${id}/students`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_ids: studentIds }),
    });
    if (!res.ok) throw new Error(`Failed to remove students: ${res.status}`);
    return res.json();
}

export async function deleteAssignment(id: string): Promise<void> {
    const res = await fetch(`/api/assignments/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Failed to delete assignment: ${res.status}`);
}

export async function gradeStudentAssignment(
    saId: string,
    data: {
        artifact_id?: string;
        grade?: number;
        feedback?: string;
        question_overrides?: Record<string, boolean>;
    },
): Promise<StudentAssignment> {
    const res = await fetch(`/api/student-assignments/${saId}/grade`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to grade student assignment: ${res.status}`);
    return res.json();
}
