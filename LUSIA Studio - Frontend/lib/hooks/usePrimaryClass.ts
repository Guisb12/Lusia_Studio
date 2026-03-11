"use client";

import { useMemo } from "react";
import type { Classroom } from "@/lib/classes";
import { prefetchOwnClassesQuery, useOwnClassesQuery } from "@/lib/queries/classes";

interface UsePrimaryClassReturn {
    primaryClass: Classroom | null;
    primaryClassId: string | null;
    loading: boolean;
    refetch: () => Promise<void>;
}

/**
 * Resolves the current teacher's primary class (is_primary=true).
 * Cached for 2 minutes. Returns null if no primary class exists.
 */
export function usePrimaryClass(enabled = true): UsePrimaryClassReturn {
    const { data, isLoading } = useOwnClassesQuery(enabled);
    const primaryClass = useMemo<Classroom | null>(
        () => data?.data.find((classroom) => classroom.is_primary) ?? null,
        [data],
    );

    return {
        primaryClass,
        primaryClassId: primaryClass?.id ?? null,
        loading: isLoading,
        refetch: async () => {
            await prefetchOwnClassesQuery();
        },
    };
}
