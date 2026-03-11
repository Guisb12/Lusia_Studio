"use client";

import { fetchMembers } from "@/lib/members";
import { queryClient, useQuery } from "@/lib/query-client";

export interface TeacherOption {
    id: string;
    name: string;
    avatar_url?: string | null;
}

export const TEACHERS_QUERY_KEY = "reference:teachers";
const TEACHERS_STALE_TIME = 5 * 60_000;

async function fetchTeachers(): Promise<TeacherOption[]> {
    const res = await fetchMembers(undefined, "active", 1, 100);
    return res.data
        .filter((member) => member.role === "teacher" || member.role === "admin")
        .map((member) => ({
            id: member.id,
            name: member.display_name || member.full_name || "Sem nome",
            avatar_url: member.avatar_url,
        }));
}

export function useTeachersQuery(enabled = true) {
    return useQuery<TeacherOption[]>({
        key: TEACHERS_QUERY_KEY,
        enabled,
        staleTime: TEACHERS_STALE_TIME,
        fetcher: fetchTeachers,
    });
}

export function prefetchTeachersQuery() {
    return queryClient.fetchQuery<TeacherOption[]>({
        key: TEACHERS_QUERY_KEY,
        staleTime: TEACHERS_STALE_TIME,
        fetcher: fetchTeachers,
    });
}
