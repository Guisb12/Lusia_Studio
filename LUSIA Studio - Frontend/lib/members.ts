/**
 * Members — TypeScript types & API client
 */

import type { GradeBoardData, CFSDashboardData } from "@/lib/grades";

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export interface Member {
    id: string;
    full_name: string | null;
    display_name: string | null;
    email: string | null;
    role: string | null;
    status: string | null;
    avatar_url: string | null;
    grade_level: string | null;
    course: string | null;
    school_name: string | null;
    phone: string | null;
    subjects_taught: string[] | null;
    subject_ids: string[] | null;
    class_ids: string[] | null;
    parent_name: string | null;
    parent_email: string | null;
    parent_phone: string | null;
    hourly_rate: number | null;
    onboarding_completed: boolean;
    created_at: string | null;
}

export interface PaginatedMembers {
    data: Member[];
    page: number;
    per_page: number;
    total: number;
}

export interface MemberSession {
    id: string;
    title: string | null;
    starts_at: string;
    ends_at: string;
    teacher_id: string;
    subject_ids: string[] | null;
    student_ids: string[] | null;
    created_at: string | null;
    subjects?: { id: string; name: string; color: string | null }[];
}

export interface MemberAssignment {
    id: string;
    assignment_id: string;
    status: "not_started" | "in_progress" | "submitted" | "graded";
    grade: number | null;
    feedback: string | null;
    submitted_at: string | null;
    graded_at: string | null;
    created_at: string | null;
    assignment_title: string | null;
    due_date: string | null;
    assignment_status: string | null;
}

export interface MemberStats {
    total_sessions: number;
    sessions_this_month: number;
    total_assignments: number;
    completed_assignments: number;
    average_grade: number | null;
    completion_rate: number;
    weekly_sessions: { week: string; count: number }[];
    grade_list: { title: string; grade: number }[];
}

export interface TeacherStats {
    total_sessions: number;
    sessions_this_month: number;
    total_hours: number;
    hourly_rate: number | null;
    total_earnings: number | null;
    weekly_sessions: { week: string; count: number }[];
}

export const MEMBER_STATUS_LABELS: Record<string, string> = {
    active: "Ativo",
    pending_approval: "Pendente",
    suspended: "Suspenso",
};

export const MEMBER_STATUS_COLORS: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700",
    pending_approval: "bg-amber-50 text-amber-700",
    suspended: "bg-red-50 text-red-600",
};

/* ═══════════════════════════════════════════════════════════════
   API CLIENT
   ═══════════════════════════════════════════════════════════════ */

export async function fetchMembers(
    role?: string,
    status?: string,
    page?: number,
    perPage?: number,
): Promise<PaginatedMembers> {
    const params = new URLSearchParams();
    if (role) params.set("role", role);
    if (status) params.set("status", status);
    if (page) params.set("page", String(page));
    if (perPage) params.set("per_page", String(perPage));

    const res = await fetch(`/api/members?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch members: ${res.status}`);
    return res.json();
}

export async function fetchMember(id: string): Promise<Member> {
    const res = await fetch(`/api/members/${id}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch member: ${res.status}`);
    return res.json();
}

export async function fetchMyProfile(): Promise<Member> {
    const res = await fetch("/api/members/me", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch own profile: ${res.status}`);
    return res.json();
}

export async function fetchMemberSessions(id: string): Promise<MemberSession[]> {
    const res = await fetch(`/api/members/${id}/sessions`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch member sessions: ${res.status}`);
    return res.json();
}

export async function fetchMemberAssignments(id: string): Promise<MemberAssignment[]> {
    const res = await fetch(`/api/members/${id}/assignments`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch member assignments: ${res.status}`);
    return res.json();
}

export async function fetchMemberStats(id: string): Promise<MemberStats> {
    const res = await fetch(`/api/members/${id}/stats`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch member stats: ${res.status}`);
    return res.json();
}

export async function fetchTeacherSessions(
    id: string,
    dateFrom?: string,
    dateTo?: string,
): Promise<MemberSession[]> {
    const params = new URLSearchParams({ as_teacher: "true" });
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const res = await fetch(`/api/members/${id}/sessions?${params}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch teacher sessions: ${res.status}`);
    return res.json();
}

export async function fetchTeacherStats(id: string): Promise<TeacherStats> {
    const res = await fetch(`/api/members/${id}/teacher-stats`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch teacher stats: ${res.status}`);
    return res.json();
}

export async function fetchMemberGradeBoard(
    id: string,
    academicYear: string,
): Promise<GradeBoardData> {
    const res = await fetch(`/api/members/${id}/grades/${academicYear}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch member grades: ${res.status}`);
    return res.json();
}

export async function fetchMemberCFSDashboard(
    id: string,
): Promise<CFSDashboardData> {
    const res = await fetch(`/api/members/${id}/grades/cfs`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch member CFS: ${res.status}`);
    return res.json();
}

export async function updateMember(
    id: string,
    data: Record<string, unknown>,
): Promise<Member> {
    const res = await fetch(`/api/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Failed to update member: ${res.status}`);
    return res.json();
}
