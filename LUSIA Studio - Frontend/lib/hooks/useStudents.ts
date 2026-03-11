"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMembers, type Member } from "@/lib/members";

interface UseStudentsOptions {
    /**
     * Fetch students from this specific class.
     * Takes precedence over primaryClassId.
     */
    classId?: string;
    /**
     * The teacher's primary class ID.
     * When provided (and no classId override, and allStudents is false),
     * only students belonging to this class are returned.
     * Pass null explicitly to fetch all students.
     */
    primaryClassId?: string | null;
    /**
     * When true, bypass all class filtering and return all org students.
     * Used for admin "all students" mode.
     */
    allStudents?: boolean;
    /** Status filter. Defaults to "active". */
    status?: string;
    /** Set to false to skip automatic fetching on mount. Default: true. */
    enabled?: boolean;
}

interface UseStudentsReturn {
    students: Member[];
    total: number;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
    /**
     * The class_id that was actually used for filtering.
     * null means no filter was applied (all org students).
     */
    activeClassId: string | null;
}

/**
 * Common hook for fetching students across all features.
 *
 * Priority for scoping:
 *   1. `allStudents=true`  → no filter, all org students (admin mode)
 *   2. `classId`           → filter by this specific class (secondary class ops)
 *   3. `primaryClassId`    → filter by teacher's primary class (default teacher scope)
 *   4. neither             → no filter (all org students)
 *
 * Usage — teacher default scope:
 *   const { students } = useStudents({ primaryClassId: teacher.primaryClassId });
 *
 * Usage — admin, all students:
 *   const { students } = useStudents({ allStudents: true });
 *
 * Usage — specific class (e.g. batch homework):
 *   const { students } = useStudents({ classId: selectedClass.id });
 */
export function useStudents({
    classId,
    primaryClassId,
    allStudents = false,
    status = "active",
    enabled = true,
}: UseStudentsOptions = {}): UseStudentsReturn {
    const [students, setStudents] = useState<Member[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Resolve the effective class filter
    const activeClassId: string | null = allStudents
        ? null
        : (classId ?? primaryClassId ?? null);

    const load = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const result = await fetchMembers(
                "student",
                status,
                1,
                100,
                activeClassId ?? undefined,
            );

            if (controller.signal.aborted) return;
            setStudents(result.data);
            setTotal(result.total);
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Erro ao carregar alunos.");
            setStudents([]);
            setTotal(0);
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [activeClassId, status]);

    useEffect(() => {
        if (enabled) load();
        return () => { abortRef.current?.abort(); };
    }, [load, enabled]);

    return { students, total, loading, error, refetch: load, activeClassId };
}
