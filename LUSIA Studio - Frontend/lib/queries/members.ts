"use client";

import {
    fetchMember,
    fetchMembers,
    type Member,
    type PaginatedMembers,
} from "@/lib/members";
import { queryClient, useQuery } from "@/lib/query-client";

export const MEMBERS_QUERY_PREFIX = "members:list:";
const MEMBER_QUERY_PREFIX = "members:detail:";
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
        key: `${MEMBER_QUERY_PREFIX}${memberId ?? "none"}`,
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
        key: `${MEMBER_QUERY_PREFIX}${memberId}`,
        staleTime: MEMBERS_STALE_TIME,
        fetcher: () => fetchMember(memberId),
    });
}

export function updateMembersQueryData(
    key: string,
    updater: (current: PaginatedMembers | undefined) => PaginatedMembers | undefined,
) {
    queryClient.setQueryData<PaginatedMembers>(key, updater);
}

export function updateMemberDetailCache(member: Member) {
    queryClient.setQueryData<Member>(`${MEMBER_QUERY_PREFIX}${member.id}`, member);
}

export function invalidateMembersQueries() {
    queryClient.invalidateQueries(MEMBERS_QUERY_PREFIX);
}
