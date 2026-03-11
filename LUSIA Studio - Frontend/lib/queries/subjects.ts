"use client";

import type { SubjectCatalog } from "@/lib/materials";
import { queryClient, useQuery } from "@/lib/query-client";

export const SUBJECT_CATALOG_QUERY_KEY = "reference:subject-catalog";
const SUBJECT_CATALOG_STALE_TIME = 5 * 60_000;

async function fetchSubjectCatalog(): Promise<SubjectCatalog> {
    const res = await fetch("/api/materials/subjects");
    if (!res.ok) {
        throw new Error(`Failed to fetch subject catalog: ${res.status}`);
    }
    return res.json();
}

export function useSubjectCatalogQuery(enabled = true) {
    return useQuery<SubjectCatalog>({
        key: SUBJECT_CATALOG_QUERY_KEY,
        enabled,
        staleTime: SUBJECT_CATALOG_STALE_TIME,
        fetcher: fetchSubjectCatalog,
    });
}

export function prefetchSubjectCatalogQuery() {
    return queryClient.fetchQuery<SubjectCatalog>({
        key: SUBJECT_CATALOG_QUERY_KEY,
        staleTime: SUBJECT_CATALOG_STALE_TIME,
        fetcher: fetchSubjectCatalog,
    });
}
