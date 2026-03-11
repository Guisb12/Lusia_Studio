"use client";

import { useCallback, useMemo } from "react";
import { fetchClasses, type Classroom } from "@/lib/classes";
import { useQuery } from "@/lib/query-client";

const CACHE_KEY = "primary-class";
const CACHE_TTL = 120_000; // 2 minutes

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
    const fetcher = useCallback(
        async () => {
            const res = await fetchClasses(true, 1, 50);
            return res.data.find((c) => c.is_primary) ?? null;
        },
        [],
    );

    const { data, isLoading, refetch } = useQuery<Classroom | null>({
        key: CACHE_KEY,
        enabled,
        staleTime: CACHE_TTL,
        fetcher,
    });

    const primaryClass = useMemo(() => data ?? null, [data]);

    return {
        primaryClass,
        primaryClassId: primaryClass?.id ?? null,
        loading: isLoading,
        refetch: async () => {
            await refetch();
        },
    };
}
