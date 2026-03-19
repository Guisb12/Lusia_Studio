"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { useUser } from "@/components/providers/UserProvider";
import {
    useStudentNotesQuery,
    snapshotStudentNotesQuery,
    restoreStudentNotesQuery,
    addNoteToCache,
    updateNoteInCache,
    removeNoteFromCache,
    invalidateStudentNotesQuery,
    createStudentNote,
    updateStudentNote,
    deleteStudentNote,
    type StudentNote,
    type StudentNoteCreateData,
    type StudentNoteUpdateData,
} from "@/lib/queries/student-notes";
import { PostItBoard } from "../notes/PostItBoard";

const NOTE_COLORS = [
    "#FFF9B1",
    "#FFD1D1",
    "#D1FFD7",
    "#D1E8FF",
    "#FFDFD1",
    "#E2D1FF",
];

interface StudentNotesTabProps {
    studentId: string;
}

export function StudentNotesTab({ studentId }: StudentNotesTabProps) {
    const { user } = useUser();
    const currentTeacherId = user?.id ?? "";
    const { data: notes, isLoading } = useStudentNotesQuery(
        studentId,
        Boolean(studentId),
    );

    // Track deleted note IDs to prevent stale updates from re-adding them
    const deletedIdsRef = useRef<Set<string>>(new Set());

    // Map temp IDs → real server IDs so we can resolve for API calls
    const idMapRef = useRef<Map<string, string>>(new Map());

    // Resolve a note ID: if it's a temp ID with a known server ID, use the server ID
    const resolveId = useCallback((noteId: string) => {
        return idMapRef.current.get(noteId) ?? noteId;
    }, []);

    const handleCreate = useCallback(
        (data: StudentNoteCreateData) => {
            const color =
                data.color ??
                NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)];

            const tempId = `temp-${Date.now()}`;
            const optimistic: StudentNote = {
                id: tempId,
                student_id: studentId,
                teacher_id: currentTeacherId,
                content: data.content,
                color,
                shared_with_ids: data.shared_with_ids ?? [],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                teacher_name: user?.display_name ?? user?.full_name ?? null,
                teacher_avatar_url: user?.avatar_url ?? null,
                shared_with: [],
            };

            const snapshot = snapshotStudentNotesQuery(studentId);
            addNoteToCache(studentId, optimistic);

            createStudentNote(studentId, { ...data, color })
                .then((created) => {
                    // Store mapping so future edit/delete calls use the real server ID
                    idMapRef.current.set(tempId, created.id);
                    // Update in-place keeping the temp ID as the cache key (no React key change = no flash)
                    updateNoteInCache(studentId, tempId, () => ({
                        ...created,
                        id: tempId,
                    }));
                })
                .catch(() => {
                    restoreStudentNotesQuery(snapshot);
                    invalidateStudentNotesQuery(studentId);
                    toast.error("Erro ao criar anotação");
                });
        },
        [studentId, currentTeacherId, user],
    );

    const handleUpdate = useCallback(
        (noteId: string, data: StudentNoteUpdateData) => {
            if (deletedIdsRef.current.has(noteId)) return;

            const snapshot = snapshotStudentNotesQuery(studentId);
            updateNoteInCache(studentId, noteId, (prev) => ({
                ...prev,
                ...data,
                updated_at: new Date().toISOString(),
            }));

            const serverId = resolveId(noteId);
            updateStudentNote(studentId, serverId, data)
                .then((updated) => {
                    if (deletedIdsRef.current.has(noteId)) return;
                    // Keep the cache ID stable (might be a temp ID)
                    updateNoteInCache(studentId, noteId, () => ({
                        ...updated,
                        id: noteId,
                    }));
                })
                .catch(() => {
                    if (deletedIdsRef.current.has(noteId)) return;
                    restoreStudentNotesQuery(snapshot);
                    invalidateStudentNotesQuery(studentId);
                    toast.error("Erro ao atualizar anotação");
                });
        },
        [studentId, resolveId],
    );

    const handleDelete = useCallback(
        (noteId: string) => {
            deletedIdsRef.current.add(noteId);
            const snapshot = snapshotStudentNotesQuery(studentId);
            removeNoteFromCache(studentId, noteId);

            const serverId = resolveId(noteId);
            deleteStudentNote(studentId, serverId)
                .then(() => {
                    // Clean up the mapping
                    idMapRef.current.delete(noteId);
                })
                .catch(() => {
                    deletedIdsRef.current.delete(noteId);
                    restoreStudentNotesQuery(snapshot);
                    invalidateStudentNotesQuery(studentId);
                    toast.error("Erro ao apagar anotação");
                });
        },
        [studentId, resolveId],
    );

    return (
        <PostItBoard
            notes={notes ?? []}
            isLoading={isLoading}
            currentTeacherId={currentTeacherId}
            onCreate={handleCreate}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
        />
    );
}
