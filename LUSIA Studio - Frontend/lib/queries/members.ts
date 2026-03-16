"use client";

import {
    fetchMemberAssignments,
    fetchMemberCFSDashboard,
    fetchMemberEnrollmentDomains,
    fetchMemberGradeBoard,
    fetchMember,
    fetchMemberPeriodElements,
    fetchMemberSessions,
    fetchMemberStats,
    fetchMembers,
    fetchTeacherSessions,
    fetchTeacherStats,
    type Member,
    type MemberAssignment,
    type MemberSession,
    type MemberStats,
    type PaginatedMembers,
    type TeacherStats,
} from "@/lib/members";
import type { CFSDashboardData, EvaluationDomain, EvaluationElement, GradeBoardData } from "@/lib/grades";
import { queryClient, useQuery, type QueryEntry } from "@/lib/query-client";

export const MEMBERS_QUERY_PREFIX = "members:list:";
const MEMBER_QUERY_PREFIX = "members:detail:";
const MEMBER_STATS_QUERY_PREFIX = "members:stats:";
const MEMBER_SESSIONS_QUERY_PREFIX = "members:sessions:";
const MEMBER_ASSIGNMENTS_QUERY_PREFIX = "members:assignments:";
const TEACHER_SESSIONS_QUERY_PREFIX = "members:teacher-sessions:";
const TEACHER_STATS_QUERY_PREFIX = "members:teacher-stats:";
const MEMBER_GRADE_BOARD_QUERY_PREFIX = "members:grade-board:";
const MEMBER_CFS_QUERY_PREFIX = "members:cfs:";
const MEMBERS_STALE_TIME = 60_000;

interface MembersQueryParams {
    role?: string;
    status?: string;
    page?: number;
    perPage?: number;
    classId?: string | null;
    enabled?: boolean;
    initialData?: PaginatedMembers;
}

export function buildMembersQueryKey({
    role,
    status,
    page = 1,
    perPage = 100,
    classId,
}: Omit<MembersQueryParams, "enabled" | "initialData">): string {
    return `${MEMBERS_QUERY_PREFIX}${role ?? "*"}|${status ?? "*"}|${page}|${perPage}|${classId ?? "*"}`;
}

export function buildMemberDetailKey(memberId: string | null | undefined): string {
    return `${MEMBER_QUERY_PREFIX}${memberId ?? "none"}`;
}

async function fetchMembersQuery({
    role,
    status,
    page = 1,
    perPage = 100,
    classId,
}: Omit<MembersQueryParams, "enabled" | "initialData">): Promise<PaginatedMembers> {
    return fetchMembers(role, status, page, perPage, classId ?? undefined);
}

export function useMembersQuery({
    role,
    status,
    page = 1,
    perPage = 100,
    classId,
    enabled = true,
    initialData,
}: MembersQueryParams) {
    return useQuery<PaginatedMembers>({
        key: buildMembersQueryKey({ role, status, page, perPage, classId }),
        enabled,
        staleTime: MEMBERS_STALE_TIME,
        initialData,
        fetcher: () => fetchMembersQuery({ role, status, page, perPage, classId }),
    });
}

export function prefetchMembersQuery(params: Omit<MembersQueryParams, "enabled" | "initialData">) {
    return queryClient.fetchQuery<PaginatedMembers>({
        key: buildMembersQueryKey(params),
        staleTime: MEMBERS_STALE_TIME,
        fetcher: () => fetchMembersQuery(params),
    });
}

export function useMemberQuery(memberId: string | null | undefined, enabled = true) {
    return useQuery<Member>({
        key: buildMemberDetailKey(memberId),
        enabled: enabled && Boolean(memberId),
        staleTime: MEMBERS_STALE_TIME,
        fetcher: async () => {
            if (!memberId) {
                throw new Error("Member id is required");
            }
            return fetchMember(memberId);
        },
    });
}

export function prefetchMemberQuery(memberId: string) {
    return queryClient.fetchQuery<Member>({
        key: buildMemberDetailKey(memberId),
        staleTime: MEMBERS_STALE_TIME,
        fetcher: () => fetchMember(memberId),
    });
}

export function useMemberStatsQuery(
    memberId: string | null | undefined,
    enabled = true,
    initialData?: MemberStats,
) {
    return useQuery<MemberStats | null>({
        key: `${MEMBER_STATS_QUERY_PREFIX}${memberId ?? "none"}`,
        enabled: enabled && Boolean(memberId),
        staleTime: MEMBERS_STALE_TIME,
        initialData,
        fetcher: async () => {
            if (!memberId) {
                throw new Error("Member id is required");
            }
            return fetchMemberStats(memberId);
        },
    });
}

export function prefetchMemberStatsQuery(memberId: string) {
    return queryClient.fetchQuery<MemberStats | null>({
        key: `${MEMBER_STATS_QUERY_PREFIX}${memberId}`,
        staleTime: MEMBERS_STALE_TIME,
        fetcher: () => fetchMemberStats(memberId),
    });
}

export function updateMembersQueryData(
    key: string,
    updater: (current: PaginatedMembers | undefined) => PaginatedMembers | undefined,
) {
    queryClient.setQueryData<PaginatedMembers>(key, updater);
}

export function updateMemberDetailCache(member: Member) {
    queryClient.setQueryData<Member>(buildMemberDetailKey(member.id), member);
}

export function snapshotMembersQueries() {
    return queryClient.getMatchingQueries<PaginatedMembers>(MEMBERS_QUERY_PREFIX);
}

export function restoreMembersQueries(snapshots: QueryEntry<PaginatedMembers>[]) {
    for (const { key, snapshot } of snapshots) {
        queryClient.setQueryData(key, snapshot.data);
    }
}

export function invalidateMembersQueries() {
    queryClient.invalidateQueries(MEMBERS_QUERY_PREFIX);
}

export function useMemberSessionsQuery(
    memberId: string | null | undefined,
    enabled = true,
) {
    return useQuery<MemberSession[]>({
        key: `${MEMBER_SESSIONS_QUERY_PREFIX}${memberId ?? "none"}`,
        enabled: enabled && Boolean(memberId),
        staleTime: MEMBERS_STALE_TIME,
        fetcher: async () => {
            if (!memberId) {
                return [];
            }
            return fetchMemberSessions(memberId);
        },
    });
}

export function useMemberAssignmentsQuery(
    memberId: string | null | undefined,
    enabled = true,
) {
    return useQuery<MemberAssignment[]>({
        key: `${MEMBER_ASSIGNMENTS_QUERY_PREFIX}${memberId ?? "none"}`,
        enabled: enabled && Boolean(memberId),
        staleTime: MEMBERS_STALE_TIME,
        fetcher: async () => {
            if (!memberId) {
                return [];
            }
            return fetchMemberAssignments(memberId);
        },
    });
}

function buildTeacherSessionsQueryKey(
    memberId: string | null | undefined,
    dateFrom?: string,
    dateTo?: string,
) {
    return `${TEACHER_SESSIONS_QUERY_PREFIX}${memberId ?? "none"}|${dateFrom ?? "*"}|${dateTo ?? "*"}`;
}

export function useTeacherSessionsQuery(
    memberId: string | null | undefined,
    dateFrom?: string,
    dateTo?: string,
    enabled = true,
) {
    return useQuery<MemberSession[]>({
        key: buildTeacherSessionsQueryKey(memberId, dateFrom, dateTo),
        enabled: enabled && Boolean(memberId),
        staleTime: MEMBERS_STALE_TIME,
        fetcher: async () => {
            if (!memberId) {
                return [];
            }
            return fetchTeacherSessions(memberId, dateFrom, dateTo);
        },
    });
}

export function useTeacherStatsQuery(
    memberId: string | null | undefined,
    enabled = true,
) {
    return useQuery<TeacherStats | null>({
        key: `${TEACHER_STATS_QUERY_PREFIX}${memberId ?? "none"}`,
        enabled: enabled && Boolean(memberId),
        staleTime: MEMBERS_STALE_TIME,
        fetcher: async () => {
            if (!memberId) {
                return null;
            }
            return fetchTeacherStats(memberId);
        },
    });
}

function buildMemberGradeBoardQueryKey(
    memberId: string | null | undefined,
    academicYear: string | null | undefined,
) {
    return `${MEMBER_GRADE_BOARD_QUERY_PREFIX}${memberId ?? "none"}|${academicYear ?? "none"}`;
}

export function useMemberGradeBoardQuery(
    memberId: string | null | undefined,
    academicYear: string | null | undefined,
    enabled = true,
) {
    return useQuery<GradeBoardData | null>({
        key: buildMemberGradeBoardQueryKey(memberId, academicYear),
        enabled: enabled && Boolean(memberId) && Boolean(academicYear),
        staleTime: MEMBERS_STALE_TIME,
        fetcher: async () => {
            if (!memberId || !academicYear) {
                return null;
            }
            return fetchMemberGradeBoard(memberId, academicYear);
        },
    });
}

export function useMemberCFSDashboardQuery(
    memberId: string | null | undefined,
    enabled = true,
) {
    return useQuery<CFSDashboardData | null>({
        key: `${MEMBER_CFS_QUERY_PREFIX}${memberId ?? "none"}`,
        enabled: enabled && Boolean(memberId),
        staleTime: MEMBERS_STALE_TIME,
        fetcher: async () => {
            if (!memberId) {
                return null;
            }
            return fetchMemberCFSDashboard(memberId);
        },
    });
}

const MEMBER_ELEMENTS_QUERY_PREFIX = "members:elements:";
const MEMBER_DOMAINS_QUERY_PREFIX = "members:domains:";

export function useMemberPeriodElementsQuery(
    memberId: string | null | undefined,
    periodId: string | null | undefined,
    enabled = true,
) {
    return useQuery<EvaluationElement[]>({
        key: `${MEMBER_ELEMENTS_QUERY_PREFIX}${memberId ?? "none"}|${periodId ?? "none"}`,
        enabled: enabled && Boolean(memberId) && Boolean(periodId),
        staleTime: MEMBERS_STALE_TIME,
        fetcher: async () => {
            if (!memberId || !periodId) return [];
            return fetchMemberPeriodElements(memberId, periodId);
        },
    });
}

export function useMemberEnrollmentDomainsQuery(
    memberId: string | null | undefined,
    enrollmentId: string | null | undefined,
    enabled = true,
) {
    return useQuery<EvaluationDomain[]>({
        key: `${MEMBER_DOMAINS_QUERY_PREFIX}${memberId ?? "none"}|${enrollmentId ?? "none"}`,
        enabled: enabled && Boolean(memberId) && Boolean(enrollmentId),
        staleTime: MEMBERS_STALE_TIME,
        fetcher: async () => {
            if (!memberId || !enrollmentId) return [];
            return fetchMemberEnrollmentDomains(memberId, enrollmentId);
        },
    });
}
