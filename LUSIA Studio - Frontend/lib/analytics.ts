/**
 * Analytics — TypeScript types & API client for financial dashboards
 */

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export interface FinancialSummary {
    total_revenue: number;
    total_cost: number;
    total_profit: number;
    total_sessions: number;
    total_hours: number;
    average_revenue_per_session: number;
    average_cost_per_session: number;
}

export interface TeacherFinancialDetail {
    teacher_id: string;
    teacher_name: string | null;
    avatar_url: string | null;
    total_sessions: number;
    total_hours: number;
    total_cost: number;
    total_revenue_generated: number;
}

export interface StudentFinancialDetail {
    student_id: string;
    student_name: string | null;
    avatar_url: string | null;
    total_sessions: number;
    total_hours: number;
    total_billed: number;
}

export interface SessionTypeBreakdown {
    session_type_id: string | null;
    session_type_name: string | null;
    color: string | null;
    total_sessions: number;
    total_revenue: number;
    total_cost: number;
}

export interface TimeSeriesPoint {
    period: string;
    revenue: number;
    cost: number;
    profit: number;
    session_count: number;
}

export interface AdminDashboardData {
    summary: FinancialSummary;
    by_teacher: TeacherFinancialDetail[];
    by_student: StudentFinancialDetail[];
    by_session_type: SessionTypeBreakdown[];
    time_series: TimeSeriesPoint[];
}

export interface TeacherDashboardData {
    total_earnings: number;
    total_sessions: number;
    total_hours: number;
    revenue_generated: number;
    by_student: StudentFinancialDetail[];
    time_series: TimeSeriesPoint[];
}

export interface StudentDashboardData {
    total_spent: number;
    total_sessions: number;
    total_hours: number;
    session_costs: {
        session_id: string;
        starts_at: string;
        ends_at: string;
        hours: number;
        cost: number;
        session_type_id: string | null;
    }[];
    time_series: TimeSeriesPoint[];
}

/* ═══════════════════════════════════════════════════════════════
   API CLIENT
   ═══════════════════════════════════════════════════════════════ */

export interface AnalyticsParams {
    date_from?: string;
    date_to?: string;
    granularity?: "monthly" | "weekly";
}

export interface AdminAnalyticsParams extends AnalyticsParams {
    teacher_id?: string;
    session_type_id?: string;
}

function buildParams(params: Record<string, string | undefined>): string {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) sp.set(k, v);
    }
    return sp.toString();
}

export async function fetchAdminDashboard(
    params: AdminAnalyticsParams = {},
): Promise<AdminDashboardData> {
    const qs = buildParams(params as Record<string, string | undefined>);
    const res = await fetch(`/api/analytics/admin?${qs}`);
    if (!res.ok) throw new Error(`Failed to fetch admin dashboard: ${res.status}`);
    return res.json();
}

export async function fetchTeacherDashboard(
    teacherId: string,
    params: AnalyticsParams = {},
): Promise<TeacherDashboardData> {
    const qs = buildParams(params as Record<string, string | undefined>);
    const res = await fetch(`/api/analytics/teacher/${teacherId}?${qs}`);
    if (!res.ok) throw new Error(`Failed to fetch teacher dashboard: ${res.status}`);
    return res.json();
}

export async function fetchStudentDashboard(
    studentId: string,
    params: AnalyticsParams = {},
): Promise<StudentDashboardData> {
    const qs = buildParams(params as Record<string, string | undefined>);
    const res = await fetch(`/api/analytics/student/${studentId}?${qs}`);
    if (!res.ok) throw new Error(`Failed to fetch student dashboard: ${res.status}`);
    return res.json();
}
