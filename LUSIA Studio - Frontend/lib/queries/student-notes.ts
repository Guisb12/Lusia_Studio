"use client";

import { queryClient, useQuery } from "@/lib/query-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SharedTeacher {
    id: string;
    name: string | null;
    avatar_url: string | null;
}

export interface StudentNote {
    id: string;
    student_id: string;
    teacher_id: string;
    content: string;
    color: string;
    shared_with_ids: string[];
    created_at: string | null;
    updated_at: string | null;
    teacher_name: string | null;
    teacher_avatar_url: string | null;
    shared_with: SharedTeacher[];
}

export interface StudentNoteCreateData {
    content: string;
    color?: string;
    shared_with_ids?: string[];
}

export interface StudentNoteUpdateData {
    content?: string;
    color?: string;
    shared_with_ids?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STUDENT_NOTES_QUERY_PREFIX = "student-notes:";
const STUDENT_NOTES_STALE_TIME = 60_000;

// ---------------------------------------------------------------------------
// Key builders
// ---------------------------------------------------------------------------

export function buildStudentNotesKey(studentId: string): string {
    return `${STUDENT_NOTES_QUERY_PREFIX}${studentId}`;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchStudentNotes(studentId: string): Promise<StudentNote[]> {
    const res = await fetch(`/api/members/${studentId}/notes`);
    if (!res.ok) {
        throw new Error(`Failed to fetch student notes: ${res.status}`);
    }
    return res.json() as Promise<StudentNote[]>;
}

// ---------------------------------------------------------------------------
// Query hook
// ---------------------------------------------------------------------------

export function useStudentNotesQuery(studentId: string, enabled = true) {
    return useQuery<StudentNote[]>({
        key: buildStudentNotesKey(studentId),
        fetcher: () => fetchStudentNotes(studentId),
        staleTime: STUDENT_NOTES_STALE_TIME,
        enabled,
    });
}

// ---------------------------------------------------------------------------
// Snapshot / Restore (for optimistic rollback)
// ---------------------------------------------------------------------------

export interface StudentNotesSnapshot {
    key: string;
    data: StudentNote[] | undefined;
}

export function snapshotStudentNotesQuery(
    studentId: string,
): StudentNotesSnapshot {
    const key = buildStudentNotesKey(studentId);
    const data = queryClient.getQueryData<StudentNote[]>(key);
    return { key, data: data ? [...data] : undefined };
}

export function restoreStudentNotesQuery(snapshot: StudentNotesSnapshot): void {
    queryClient.setQueryData<StudentNote[]>(
        snapshot.key,
        snapshot.data ? [...snapshot.data] : undefined,
    );
}

// ---------------------------------------------------------------------------
// Cache sync helpers
// ---------------------------------------------------------------------------

export function addNoteToCache(studentId: string, note: StudentNote): void {
    const key = buildStudentNotesKey(studentId);
    queryClient.setQueryData<StudentNote[]>(key, (current) => {
        const next = [note, ...(current ?? [])];
        return next;
    });
}

export function replaceNoteInCache(
    studentId: string,
    oldId: string,
    newNote: StudentNote,
): void {
    const key = buildStudentNotesKey(studentId);
    queryClient.setQueryData<StudentNote[]>(key, (current) => {
        if (!current) return [newNote];
        return current.map((n) => (n.id === oldId ? newNote : n));
    });
}

export function updateNoteInCache(
    studentId: string,
    noteId: string,
    updater: (note: StudentNote) => StudentNote,
): void {
    const key = buildStudentNotesKey(studentId);
    queryClient.setQueryData<StudentNote[]>(key, (current) => {
        if (!current) return current;
        return current.map((n) => (n.id === noteId ? updater(n) : n));
    });
}

export function removeNoteFromCache(
    studentId: string,
    noteId: string,
): void {
    const key = buildStudentNotesKey(studentId);
    queryClient.setQueryData<StudentNote[]>(key, (current) => {
        if (!current) return current;
        return current.filter((n) => n.id !== noteId);
    });
}

export function syncNotesInCache(
    studentId: string,
    notes: StudentNote[],
): void {
    const key = buildStudentNotesKey(studentId);
    queryClient.setQueryData<StudentNote[]>(key, notes);
}

// ---------------------------------------------------------------------------
// Invalidation
// ---------------------------------------------------------------------------

export function invalidateStudentNotesQuery(studentId: string): void {
    queryClient.invalidateQueries(buildStudentNotesKey(studentId));
}

// ---------------------------------------------------------------------------
// API mutation functions
// ---------------------------------------------------------------------------

export async function createStudentNote(
    studentId: string,
    data: StudentNoteCreateData,
): Promise<StudentNote> {
    const res = await fetch(`/api/members/${studentId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        throw new Error(`Failed to create note: ${res.status}`);
    }
    return res.json() as Promise<StudentNote>;
}

export async function updateStudentNote(
    studentId: string,
    noteId: string,
    data: StudentNoteUpdateData,
): Promise<StudentNote> {
    const res = await fetch(`/api/members/${studentId}/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        throw new Error(`Failed to update note: ${res.status}`);
    }
    return res.json() as Promise<StudentNote>;
}

export async function deleteStudentNote(
    studentId: string,
    noteId: string,
): Promise<void> {
    const res = await fetch(`/api/members/${studentId}/notes/${noteId}`, {
        method: "DELETE",
    });
    if (!res.ok) {
        throw new Error(`Failed to delete note: ${res.status}`);
    }
}
