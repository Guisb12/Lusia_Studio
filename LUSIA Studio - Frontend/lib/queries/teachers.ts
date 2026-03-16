"use client";

import {
    fetchMember,
    fetchMembers,
    fetchTeacherSessions,
    fetchTeacherStats,
    type Member,
    type MemberSession,
    type PaginatedMembers,
    type TeacherStats,
    updateMember,
} from "@/lib/members";
import { fetchTeacherDashboard, type AnalyticsParams, type TeacherDashboardData } from "@/lib/analytics";
import { queryClient, useQuery } from "@/lib/query-client";

export interface TeacherOption {
    id: string;
    name: string;
    avatar_url?: string | null;
}

export const TEACHERS_QUERY_KEY = "reference:teachers";
const TEACHERS_LIST_QUERY_KEY = "teachers:list";
const TEACHER_DETAIL_QUERY_PREFIX = "teachers:detail:";
const TEACHER_SESSIONS_QUERY_PREFIX = "teachers:sessions:";
const TEACHER_STATS_QUERY_PREFIX = "teachers:stats:";
const TEACHERS_STALE_TIME = 10 * 60_000;

function mapTeacherOption(member: Member): TeacherOption {
    return {
        id: member.id,
        name: member.display_name || member.full_name || "Sem nome",
        avatar_url: member.avatar_url,
    };
}

function sortTeachers(members: Member[]): Member[] {
    return [...members].sort((a, b) => {
        const roleRank = a.role === b.role ? 0 : a.role === "admin" ? -1 : 1;
        if (roleRank !== 0) {
            return roleRank;
        }

        const nameA = a.display_name || a.full_name || a.email || "Sem nome";
        const nameB = b.display_name || b.full_name || b.email || "Sem nome";
        return nameA.localeCompare(nameB, "pt", { sensitivity: "base" });
    });
}

function mergeTeacherPages(responses: PaginatedMembers[]): PaginatedMembers {
    const merged = sortTeachers(
        responses.flatMap((response) => response.data).filter((member, index, members) =>
            members.findIndex((candidate) => candidate.id === member.id) === index,
        ),
    );

    return {
        data: merged,
        page: 1,
        per_page: merged.length,
        total: merged.length,
    };
}

async function fetchTeachersList(): Promise<PaginatedMembers> {
    const [admins, teachers] = await Promise.all([
        fetchMembers("admin", "active", 1, 100),
        fetchMembers("teacher", "active", 1, 100),
    ]);
    return mergeTeacherPages([admins, teachers]);
}

export function buildTeacherDetailKey(teacherId: string | null | undefined) {
    return `${TEACHER_DETAIL_QUERY_PREFIX}${teacherId ?? "none"}`;
}

function buildTeacherSessionsKey(teacherId: string, dateFrom?: string, dateTo?: string, limit?: number) {
    return `${TEACHER_SESSIONS_QUERY_PREFIX}${teacherId}|${dateFrom ?? "*"}|${dateTo ?? "*"}|${limit ?? "*"}`;
}

function buildTeacherStatsKey(teacherId: string) {
    return `${TEACHER_STATS_QUERY_PREFIX}${teacherId}`;
}

export function useTeacherListQuery(initialData?: PaginatedMembers) {
    return useQuery<PaginatedMembers>({
        key: TEACHERS_LIST_QUERY_KEY,
        staleTime: TEACHERS_STALE_TIME,
        initialData,
        fetcher: fetchTeachersList,
    });
}

export function prefetchTeacherListQuery() {
    return queryClient.fetchQuery<PaginatedMembers>({
        key: TEACHERS_LIST_QUERY_KEY,
        staleTime: TEACHERS_STALE_TIME,
        fetcher: fetchTeachersList,
    });
}

export function useTeachersQuery(enabled = true) {
    return useQuery<TeacherOption[]>({
        key: TEACHERS_QUERY_KEY,
        enabled,
        staleTime: TEACHERS_STALE_TIME,
        fetcher: async () => {
            const teachers = await prefetchTeacherListQuery();
            return teachers.data.map(mapTeacherOption);
        },
    });
}

export function prefetchTeachersQuery() {
    return queryClient.fetchQuery<TeacherOption[]>({
        key: TEACHERS_QUERY_KEY,
        staleTime: TEACHERS_STALE_TIME,
        fetcher: async () => {
            const teachers = await prefetchTeacherListQuery();
            return teachers.data.map(mapTeacherOption);
        },
    });
}

export function useTeacherDetailQuery(
    teacherId: string | null | undefined,
    enabled = true,
    initialData?: Member,
) {
    return useQuery<Member>({
        key: buildTeacherDetailKey(teacherId),
        enabled: enabled && Boolean(teacherId),
        staleTime: TEACHERS_STALE_TIME,
        initialData,
        fetcher: async () => {
            if (!teacherId) {
                throw new Error("Teacher id is required");
            }
            return fetchMember(teacherId);
        },
    });
}

export function useTeacherSessionsQuery(
    teacherId: string,
    {
        dateFrom,
        dateTo,
        limit,
        initialData,
    }: {
        dateFrom?: string;
        dateTo?: string;
        limit?: number;
        initialData?: MemberSession[];
    } = {},
) {
    return useQuery<MemberSession[]>({
        key: buildTeacherSessionsKey(teacherId, dateFrom, dateTo, limit),
        staleTime: TEACHERS_STALE_TIME,
        initialData,
        fetcher: () => fetchTeacherSessions(teacherId, dateFrom, dateTo, limit),
    });
}

export function useTeacherStatsQuery(teacherId: string, initialData?: TeacherStats) {
    return useQuery<TeacherStats>({
        key: buildTeacherStatsKey(teacherId),
        staleTime: TEACHERS_STALE_TIME,
        initialData,
        fetcher: () => fetchTeacherStats(teacherId),
    });
}

const TEACHER_ANALYTICS_QUERY_PREFIX = "teachers:analytics:";

function buildTeacherAnalyticsKey(teacherId: string, params: AnalyticsParams = {}) {
    const sp = new URLSearchParams();
    Object.entries(params as Record<string, string | undefined>).forEach(([k, v]) => {
        if (v !== undefined && v !== "") sp.set(k, v);
    });
    return `${TEACHER_ANALYTICS_QUERY_PREFIX}${teacherId}|${sp.toString()}`;
}

export function useTeacherAnalyticsQuery(
    teacherId: string | null | undefined,
    params: AnalyticsParams = {},
    enabled = true,
) {
    return useQuery<TeacherDashboardData | null>({
        key: buildTeacherAnalyticsKey(teacherId ?? "none", params),
        enabled: enabled && Boolean(teacherId),
        staleTime: TEACHERS_STALE_TIME,
        fetcher: async () => {
            if (!teacherId) return null;
            return fetchTeacherDashboard(teacherId, params);
        },
    });
}

export function invalidateTeachersQueries() {
    queryClient.invalidateQueries(TEACHERS_LIST_QUERY_KEY);
    queryClient.invalidateQueries(TEACHERS_QUERY_KEY);
}

export function updateTeacherCaches(updated: Member) {
    queryClient.setQueryData<Member>(buildTeacherDetailKey(updated.id), updated);

    queryClient.setQueryData<PaginatedMembers>(TEACHERS_LIST_QUERY_KEY, (current) => {
        if (!current) {
            return current;
        }

        const nextData = sortTeachers(
            current.data.some((teacher) => teacher.id === updated.id)
                ? current.data.map((teacher) => (teacher.id === updated.id ? updated : teacher))
                : [...current.data, updated],
        );

        return {
            ...current,
            data: nextData,
            total: Math.max(current.total, nextData.length),
        };
    });

    queryClient.setQueryData<TeacherOption[]>(TEACHERS_QUERY_KEY, (current) => {
        if (!current) {
            return current;
        }

        const next = current.some((teacher) => teacher.id === updated.id)
            ? current.map((teacher) =>
                teacher.id === updated.id ? mapTeacherOption(updated) : teacher,
            )
            : [...current, mapTeacherOption(updated)];

        return next.sort((a, b) => a.name.localeCompare(b.name, "pt", { sensitivity: "base" }));
    });
}

export async function updateTeacher(
    teacherId: string,
    data: Record<string, unknown>,
): Promise<Member> {
    const updated = await updateMember(teacherId, data);
    updateTeacherCaches(updated);
    return updated;
}
