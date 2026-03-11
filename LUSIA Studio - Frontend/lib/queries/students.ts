"use client";

import type { StudentInfo } from "@/components/calendar/StudentHoverCard";
import { useQuery } from "@/lib/query-client";

const STUDENT_SEARCH_QUERY_PREFIX = "students:search:";
const STUDENT_SEARCH_STALE_TIME = 60_000;

interface StudentSearchQueryParams {
    query: string;
    limit?: number;
    enabled?: boolean;
}

function buildStudentSearchQueryKey(query: string, limit: number): string {
    return `${STUDENT_SEARCH_QUERY_PREFIX}${query.trim()}|${limit}`;
}

async function fetchStudentSearch(query: string, limit: number): Promise<StudentInfo[]> {
    const params = new URLSearchParams({
        limit: String(limit),
    });

    if (query.trim()) {
        params.set("q", query.trim());
    }

    const res = await fetch(`/api/calendar/students/search?${params.toString()}`);
    if (!res.ok) {
        throw new Error(`Failed to search students: ${res.status}`);
    }

    return res.json();
}

export function useStudentSearchQuery({
    query,
    limit = 100,
    enabled = true,
}: StudentSearchQueryParams) {
    return useQuery<StudentInfo[]>({
        key: buildStudentSearchQueryKey(query, limit),
        enabled,
        staleTime: STUDENT_SEARCH_STALE_TIME,
        fetcher: () => fetchStudentSearch(query, limit),
    });
}
