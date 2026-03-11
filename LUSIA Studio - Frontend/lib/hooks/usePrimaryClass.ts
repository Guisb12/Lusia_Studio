"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cachedFetch } from "@/lib/cache";
import { fetchClasses, type Classroom } from "@/lib/classes";

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
export function usePrimaryClass(): UsePrimaryClassReturn {
    const [primaryClass, setPrimaryClass] = useState<Classroom | null>(null);
    const [loading, setLoading] = useState(true);
    const mountedRef = useRef(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await cachedFetch(CACHE_KEY, () => fetchClasses(true, 1, 50), CACHE_TTL);
            if (!mountedRef.current) return;
            const primary = res.data.find((c) => c.is_primary) ?? null;
            setPrimaryClass(primary);
        } catch {
            if (mountedRef.current) setPrimaryClass(null);
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        load();
        return () => { mountedRef.current = false; };
    }, [load]);

    return {
        primaryClass,
        primaryClassId: primaryClass?.id ?? null,
        loading,
        refetch: load,
    };
}
