"use client";

import { queryClient, useQuery } from "@/lib/query-client";

export interface StudentDiaryEntry {
    id: string;
    student_id: string;
    teacher_id: string;
    subject_id: string | null;
    entry_date: string | null;
    content: string;
    created_at: string | null;
    updated_at: string | null;
    teacher_name: string | null;
    teacher_avatar_url: string | null;
    subject_name: string | null;
    subject_color: string | null;
    subject_icon: string | null;
}

export interface StudentDiaryListParams {
    dateFrom?: string;
    dateTo?: string;
    subjectId?: string;
    limit?: number;
    offset?: number;
}

export interface StudentDiaryCreateData {
    content: string;
    entry_date: string;
    subject_id?: string | null;
}

export interface StudentDiaryUpdateData {
    content?: string;
    entry_date?: string;
    subject_id?: string | null;
}

export const STUDENT_DIARY_QUERY_PREFIX = "student-diary:";
const STUDENT_DIARY_STALE_TIME = 60_000;

export function buildStudentDiaryKey(
    studentId: string,
    params: StudentDiaryListParams = {},
): string {
    const dateFrom = params.dateFrom ?? "*";
    const dateTo = params.dateTo ?? "*";
    const subjectId = params.subjectId ?? "*";
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;
    return `${STUDENT_DIARY_QUERY_PREFIX}${studentId}|${dateFrom}|${dateTo}|${subjectId}|${limit}|${offset}`;
}

async function fetchStudentDiary(
    studentId: string,
    params: StudentDiaryListParams = {},
): Promise<StudentDiaryEntry[]> {
    const sp = new URLSearchParams();
    if (params.dateFrom) sp.set("date_from", params.dateFrom);
    if (params.dateTo) sp.set("date_to", params.dateTo);
    if (params.subjectId) sp.set("subject_id", params.subjectId);
    if (params.limit != null) sp.set("limit", String(params.limit));
    if (params.offset != null) sp.set("offset", String(params.offset));
    const qs = sp.toString();

    const res = await fetch(`/api/members/${studentId}/diary${qs ? `?${qs}` : ""}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch student diary: ${res.status}`);
    }
    return res.json() as Promise<StudentDiaryEntry[]>;
}

export function useStudentDiaryQuery(
    studentId: string,
    params: StudentDiaryListParams,
    enabled = true,
) {
    return useQuery<StudentDiaryEntry[]>({
        key: buildStudentDiaryKey(studentId, params),
        fetcher: () => fetchStudentDiary(studentId, params),
        staleTime: STUDENT_DIARY_STALE_TIME,
        enabled: enabled && Boolean(studentId),
    });
}

export function invalidateStudentDiaryQueries(studentId: string): void {
    queryClient.invalidateQueries(`${STUDENT_DIARY_QUERY_PREFIX}${studentId}`);
}

export async function createStudentDiaryEntry(
    studentId: string,
    data: StudentDiaryCreateData,
): Promise<StudentDiaryEntry> {
    const res = await fetch(`/api/members/${studentId}/diary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        throw new Error(`Failed to create diary entry: ${res.status}`);
    }
    return res.json() as Promise<StudentDiaryEntry>;
}

export async function updateStudentDiaryEntry(
    studentId: string,
    entryId: string,
    data: StudentDiaryUpdateData,
): Promise<StudentDiaryEntry> {
    const res = await fetch(`/api/members/${studentId}/diary/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        throw new Error(`Failed to update diary entry: ${res.status}`);
    }
    return res.json() as Promise<StudentDiaryEntry>;
}

export async function deleteStudentDiaryEntry(
    studentId: string,
    entryId: string,
): Promise<void> {
    const res = await fetch(`/api/members/${studentId}/diary/${entryId}`, {
        method: "DELETE",
    });
    if (!res.ok) {
        throw new Error(`Failed to delete diary entry: ${res.status}`);
    }
}
