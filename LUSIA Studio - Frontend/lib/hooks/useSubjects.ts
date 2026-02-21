"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Subject } from "@/types/subjects";

interface UseSubjectsOptions {
    /** Filter by education level */
    educationLevel?: string | null;
    /** Filter by grade */
    grade?: string | null;
    /** If true, fetches org-custom subjects alongside global ones (requires auth) */
    includeCustom?: boolean;
    /** If false, the hook won't fetch automatically on mount / param change */
    enabled?: boolean;
}

interface UseSubjectsReturn {
    subjects: Subject[];
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

export function useSubjects({
    educationLevel,
    grade,
    includeCustom = false,
    enabled = true,
}: UseSubjectsOptions = {}): UseSubjectsReturn {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Prevent duplicate fetches
    const abortRef = useRef<AbortController | null>(null);

    const fetchSubjects = useCallback(async () => {
        // Abort any in-flight request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();

            if (educationLevel) params.set("education_level", educationLevel);
            if (grade) params.set("grade", grade);
            if (includeCustom) params.set("scope", "me");

            const response = await fetch(`/api/subjects?${params.toString()}`, {
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch subjects (${response.status})`);
            }

            const data = await response.json();
            if (Array.isArray(data)) {
                setSubjects(data);
            } else {
                setSubjects([]);
            }
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Erro ao carregar disciplinas.");
            setSubjects([]);
        } finally {
            setLoading(false);
        }
    }, [educationLevel, grade, includeCustom]);

    useEffect(() => {
        if (enabled) {
            fetchSubjects();
        }

        return () => {
            abortRef.current?.abort();
        };
    }, [fetchSubjects, enabled]);

    return { subjects, loading, error, refetch: fetchSubjects };
}
