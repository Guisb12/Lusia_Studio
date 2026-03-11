"use client";

import {
    createArtifact,
    deleteArtifact,
    fetchArtifact,
    fetchArtifacts,
    type Artifact,
    type ArtifactCreate,
    type ArtifactUpdate,
    updateArtifact,
} from "@/lib/artifacts";
import type { SubjectCatalog } from "@/lib/materials";
import { fetchSubjectCatalog, updateSubjectPreferences } from "@/lib/materials";
import { queryClient, useQuery } from "@/lib/query-client";

export const DOC_ARTIFACTS_QUERY_KEY = "docs:artifacts";
export const DOC_ARTIFACT_DETAIL_PREFIX = "docs:artifact:";
export const DOC_SUBJECT_CATALOG_QUERY_KEY = "docs:subject-catalog";
const DOCS_STALE_TIME = 60_000;
const DOCS_REFERENCE_STALE_TIME = 5 * 60_000;

function buildArtifactsQueryKey(artifactType?: string | null) {
    return artifactType
        ? `${DOC_ARTIFACTS_QUERY_KEY}?type=${artifactType}`
        : DOC_ARTIFACTS_QUERY_KEY;
}

export function buildArtifactDetailKey(artifactId: string | null | undefined) {
    return `${DOC_ARTIFACT_DETAIL_PREFIX}${artifactId ?? "none"}`;
}

function mergeArtifact(current: Artifact, patch: Partial<Artifact>): Artifact {
    return {
        ...current,
        ...patch,
        subjects: patch.subjects ?? current.subjects,
    };
}

export function syncArtifactToCaches(updated: Artifact) {
    queryClient.setQueryData<Artifact>(buildArtifactDetailKey(updated.id), updated);
    queryClient.updateQueries<Artifact[]>(
        (key) => key.startsWith(DOC_ARTIFACTS_QUERY_KEY),
        (current) => {
            if (!current) {
                return current;
            }

            const exists = current.some((artifact) => artifact.id === updated.id);
            const next = exists
                ? current.map((artifact) => (artifact.id === updated.id ? mergeArtifact(artifact, updated) : artifact))
                : [updated, ...current];

            return next.toSorted((a, b) => {
                const aDate = new Date(a.created_at ?? 0).getTime();
                const bDate = new Date(b.created_at ?? 0).getTime();
                return bDate - aDate;
            });
        },
    );
}

export function removeArtifactFromCaches(artifactId: string) {
    queryClient.setQueryData<Artifact>(buildArtifactDetailKey(artifactId), undefined);
    queryClient.updateQueries<Artifact[]>(
        (key) => key.startsWith(DOC_ARTIFACTS_QUERY_KEY),
        (current) => current?.filter((artifact) => artifact.id !== artifactId),
    );
}

export function insertArtifactIntoCaches(artifact: Artifact) {
    syncArtifactToCaches(artifact);
}

export function patchArtifactCaches(
    artifactId: string,
    patch: Partial<Artifact>,
) {
    queryClient.setQueryData<Artifact>(buildArtifactDetailKey(artifactId), (current) =>
        current ? mergeArtifact(current, patch) : current,
    );
    queryClient.updateQueries<Artifact[]>(
        (key) => key.startsWith(DOC_ARTIFACTS_QUERY_KEY),
        (current) =>
            current?.map((artifact) =>
                artifact.id === artifactId ? mergeArtifact(artifact, patch) : artifact,
            ),
    );
}

export function useDocArtifactsQuery(
    artifactType?: string | null,
    initialData?: Artifact[],
) {
    return useQuery<Artifact[]>({
        key: buildArtifactsQueryKey(artifactType),
        staleTime: DOCS_STALE_TIME,
        initialData,
        fetcher: () => fetchArtifacts(artifactType ?? undefined),
    });
}

export function prefetchDocArtifactsQuery(artifactType?: string | null) {
    return queryClient.fetchQuery<Artifact[]>({
        key: buildArtifactsQueryKey(artifactType),
        staleTime: DOCS_STALE_TIME,
        fetcher: () => fetchArtifacts(artifactType ?? undefined),
    });
}

export function useArtifactDetailQuery(
    artifactId: string | null | undefined,
    enabled = true,
    initialData?: Artifact,
) {
    return useQuery<Artifact>({
        key: buildArtifactDetailKey(artifactId),
        enabled: enabled && Boolean(artifactId),
        staleTime: DOCS_STALE_TIME,
        initialData,
        fetcher: async () => {
            if (!artifactId) {
                throw new Error("Artifact id is required");
            }
            return fetchArtifact(artifactId);
        },
    });
}

export function prefetchArtifactDetailQuery(artifactId: string) {
    return queryClient.fetchQuery<Artifact>({
        key: buildArtifactDetailKey(artifactId),
        staleTime: DOCS_STALE_TIME,
        fetcher: () => fetchArtifact(artifactId),
    });
}

export function useDocsSubjectCatalogQuery(initialData?: SubjectCatalog | null) {
    return useQuery<SubjectCatalog | null>({
        key: DOC_SUBJECT_CATALOG_QUERY_KEY,
        staleTime: DOCS_REFERENCE_STALE_TIME,
        initialData,
        fetcher: async () => fetchSubjectCatalog(),
    });
}

export function patchDocsSubjectCatalog(
    updater: (current: SubjectCatalog | null | undefined) => SubjectCatalog | null | undefined,
) {
    queryClient.setQueryData<SubjectCatalog | null>(DOC_SUBJECT_CATALOG_QUERY_KEY, updater);
}

export function prefetchDocsSubjectCatalogQuery() {
    return queryClient.fetchQuery<SubjectCatalog | null>({
        key: DOC_SUBJECT_CATALOG_QUERY_KEY,
        staleTime: DOCS_REFERENCE_STALE_TIME,
        fetcher: () => fetchSubjectCatalog(),
    });
}

export async function createDocArtifact(payload: ArtifactCreate) {
    const created = await createArtifact(payload);
    insertArtifactIntoCaches(created);
    return created;
}

export async function updateDocArtifact(artifactId: string, payload: ArtifactUpdate) {
    const updated = await updateArtifact(artifactId, payload);
    syncArtifactToCaches(updated);
    return updated;
}

export async function deleteDocArtifact(artifactId: string) {
    const existingArtifact = queryClient.getQueryData<Artifact>(buildArtifactDetailKey(artifactId))
        ?? queryClient
            .getMatchingQueries<Artifact[]>((key) => key.startsWith(DOC_ARTIFACTS_QUERY_KEY))
            .flatMap((entry) => entry.snapshot.data ?? [])
            .find((artifact) => artifact.id === artifactId);
    removeArtifactFromCaches(artifactId);
    try {
        await deleteArtifact(artifactId);
    } catch (error) {
        if (existingArtifact) {
            syncArtifactToCaches(existingArtifact);
        }
        queryClient.invalidateQueries(DOC_ARTIFACTS_QUERY_KEY);
        throw error;
    }
}

export async function updateDocsSubjectPreferences(subjectIds: string[]) {
    await updateSubjectPreferences(subjectIds);
    queryClient.invalidateQueries(DOC_SUBJECT_CATALOG_QUERY_KEY);
}
