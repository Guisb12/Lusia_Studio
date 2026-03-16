import { fetchBackendJsonServer } from "@/lib/backend.server";
import type { Member, MemberStats, PaginatedMembers } from "@/lib/members";

/**
 * Fetch members directly from the backend (server-side only).
 * Avoids the loopback through the Next.js API route.
 */
export async function fetchMembersServer(
    role?: string,
    status?: string,
    perPage?: number,
    classId?: string,
): Promise<PaginatedMembers> {
    const empty: PaginatedMembers = { data: [], page: 1, per_page: 20, total: 0 };
    const params = new URLSearchParams();
    if (role) params.set("role", role);
    if (status) params.set("status", status);
    if (perPage) params.set("per_page", String(perPage));
    if (classId) params.set("class_id", classId);

    return fetchBackendJsonServer<PaginatedMembers>(
        `/api/v1/members?${params.toString()}`,
        { fallback: empty },
    );
}

export async function fetchMyProfileServer(): Promise<Member | null> {
    return fetchBackendJsonServer<Member | null>("/api/v1/members/me", {
        fallback: null,
    });
}

export async function fetchMemberStatsServer(memberId: string): Promise<MemberStats | null> {
    return fetchBackendJsonServer<MemberStats | null>(`/api/v1/members/${memberId}/stats`, {
        fallback: null,
    });
}
