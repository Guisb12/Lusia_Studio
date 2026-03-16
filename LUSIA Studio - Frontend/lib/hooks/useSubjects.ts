"use client";

import { useMemo } from "react";
import { queryClient, useQuery } from "@/lib/query-client";
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

const SUBJECTS_STALE_TIME = 10 * 60_000;

function buildSubjectsQueryKey({
    educationLevel,
    grade,
    includeCustom,
}: {
    educationLevel: string | null;
    grade: string | null;
    includeCustom: boolean;
}) {
    const params = new URLSearchParams();

    if (educationLevel) params.set("education_level", educationLevel);
    if (grade) params.set("grade", grade);
    if (includeCustom) params.set("scope", "me");

    const query = params.toString();
    return query ? `reference:subjects?${query}` : "reference:subjects";
}

async function fetchSubjects({
    educationLevel,
    grade,
    includeCustom,
}: {
    educationLevel: string | null;
    grade: string | null;
    includeCustom: boolean;
}): Promise<Subject[]> {
    const params = new URLSearchParams();

    if (educationLevel) params.set("education_level", educationLevel);
    if (grade) params.set("grade", grade);
    if (includeCustom) params.set("scope", "me");

    const response = await fetch(`/api/subjects?${params.toString()}`);

    if (!response.ok) {
        throw new Error(`Failed to fetch subjects (${response.status})`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

export function prefetchSubjectsQuery(options: UseSubjectsOptions = {}) {
    const educationLevel = options.educationLevel ?? null;
    const grade = options.grade ?? null;
    const includeCustom = options.includeCustom ?? false;

    return queryClient.fetchQuery<Subject[]>({
        key: buildSubjectsQueryKey({ educationLevel, grade, includeCustom }),
        staleTime: SUBJECTS_STALE_TIME,
        fetcher: () => fetchSubjects({ educationLevel, grade, includeCustom }),
    });
}

export function useSubjects({
    educationLevel,
    grade,
    includeCustom = false,
    enabled = true,
}: UseSubjectsOptions = {}): UseSubjectsReturn {
    const queryKey = useMemo(
        () =>
            buildSubjectsQueryKey({
                educationLevel: educationLevel ?? null,
                grade: grade ?? null,
                includeCustom,
            }),
        [educationLevel, grade, includeCustom],
    );

    const query = useQuery<Subject[]>({
        key: queryKey,
        enabled,
        staleTime: SUBJECTS_STALE_TIME,
        fetcher: () =>
            fetchSubjects({
                educationLevel: educationLevel ?? null,
                grade: grade ?? null,
                includeCustom,
            }),
    });

    return {
        subjects: query.data ?? [],
        loading: query.isLoading || query.isFetching,
        error: query.error instanceof Error ? query.error.message : query.error ? "Erro ao carregar disciplinas." : null,
        refetch: async () => {
            await query.refetch();
        },
    };
}
