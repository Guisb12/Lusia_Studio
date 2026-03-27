"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
    getProcessingDocuments,
    retryDocument,
    streamDocumentStatus,
    DocumentUploadResult,
} from "@/lib/document-upload";
import { Artifact, fetchArtifact } from "@/lib/artifacts";
import type { ProcessingStep } from "@/components/docs/ProcessingStepPill";
import { queryClient, useQuery } from "@/lib/query-client";
import {
    DOC_ARTIFACTS_QUERY_KEY,
    patchArtifactCaches,
    syncArtifactToCaches,
} from "@/lib/queries/docs";

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export interface ProcessingItem {
    id: string;               // artifact ID
    artifact_type: string;
    artifact_name: string;
    source_type: string;
    storage_path: string | null;
    current_step: ProcessingStep;
    failed: boolean;
    error_message: string | null;
    job_id: string | null;
    created_at: string;
    retryable: boolean;
}

export const DOCS_PROCESSING_QUERY_KEY = "docs:processing";

/* ═══════════════════════════════════════════════════════════════
   HOOK
   ═══════════════════════════════════════════════════════════════ */

interface UseProcessingDocumentsOptions {
    userId: string | undefined;
    onDocumentReady?: (artifact: Artifact) => void;
}

export function useProcessingDocuments({ userId, onDocumentReady }: UseProcessingDocumentsOptions) {
    const {
        data: processingData,
        mutate: mutateProcessingItems,
    } = useQuery<ProcessingItem[]>({
        key: DOCS_PROCESSING_QUERY_KEY,
        enabled: Boolean(userId),
        staleTime: 15_000,
        fetcher: async () => {
            const docs = await getProcessingDocuments();
            return docs.map((d) => ({
                id: d.id,
                artifact_type: d.artifact_type,
                artifact_name: d.artifact_name,
                source_type: d.source_type,
                storage_path: d.storage_path,
                current_step: (d.job_status || "pending") as ProcessingStep,
                failed: d.job_status === "failed" || d.processing_failed === true,
                error_message: d.error_message ?? null,
                job_id: d.job_id,
                created_at: d.created_at || new Date().toISOString(),
                retryable: d.artifact_type === "uploaded_file",
            }));
        },
    });
    const processingItems = processingData ?? [];
    const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
    const [retrying, setRetrying] = useState<Set<string>>(new Set());

    // Keep refs stable to avoid subscription churn
    const onDocumentReadyRef = useRef(onDocumentReady);
    onDocumentReadyRef.current = onDocumentReady;
    const processingItemsRef = useRef<ProcessingItem[]>([]);
    processingItemsRef.current = processingItems;
    const reconcilingArtifactIdsRef = useRef<Set<string>>(new Set());

    // ── SSE: real-time status updates ──
    useEffect(() => {
        if (!userId) return;

        let controller: AbortController | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let mounted = true;

        const connect = () => {
            controller = streamDocumentStatus(
                (event) => {
                    switch (event.type) {
                        case "hydrate": {
                            // Merge server-known active jobs with locally-added items
                            const serverIds = new Set(event.items.map((i) => i.artifact_id));
                            mutateProcessingItems((prev) => {
                                const current = prev ?? [];
                                const localOnly = current.filter((p) => !serverIds.has(p.id));
                                const serverItems: ProcessingItem[] = event.items.map((i) => {
                                    const existing = current.find((p) => p.id === i.artifact_id);
                                    return {
                                        id: i.artifact_id,
                                        artifact_type: existing?.artifact_type ?? "uploaded_file",
                                        artifact_name: existing?.artifact_name ?? "",
                                        source_type: existing?.source_type ?? "",
                                        storage_path: existing?.storage_path ?? null,
                                        current_step: (i.step || "pending") as ProcessingStep,
                                        failed: false,
                                        error_message: null,
                                        job_id: i.job_id,
                                        created_at: existing?.created_at ?? new Date().toISOString(),
                                        retryable: existing?.retryable ?? false,
                                    };
                                });
                                return [...serverItems, ...localOnly];
                            });

                            // Reconcile: local items NOT in server active jobs may have
                            // completed while SSE was disconnected — check sequentially
                            const staleLocal = processingItemsRef.current.filter(
                                (p) => !serverIds.has(p.id) && !p.failed,
                            );
                            if (staleLocal.length > 0) {
                                (async () => {
                                    for (const item of staleLocal) {
                                        try {
                                            const artifact = await fetchArtifact(item.id);
                                            if (artifact.is_processed) {
                                                mutateProcessingItems((prev) => (prev ?? []).filter((p) => p.id !== item.id));
                                                setCompletedIds((prev) => new Set([...prev, item.id]));
                                                syncArtifactToCaches(artifact);
                                                onDocumentReadyRef.current?.(artifact);
                                            } else if (artifact.processing_failed) {
                                                mutateProcessingItems((prev) =>
                                                    (prev ?? []).map((p) =>
                                                        p.id === item.id
                                                            ? { ...p, failed: true, error_message: artifact.processing_error ?? null, current_step: "pending" as ProcessingStep }
                                                            : p
                                                    )
                                                );
                                                patchArtifactCaches(item.id, {
                                                    processing_failed: true,
                                                    processing_error: artifact.processing_error ?? null,
                                                    is_processed: false,
                                                });
                                            }
                                        } catch {
                                            mutateProcessingItems((prev) => (prev ?? []).filter((p) => p.id !== item.id));
                                        }
                                    }
                                })();
                            }
                            break;
                        }
                        case "status":
                            mutateProcessingItems((prev) =>
                                (prev ?? []).map((p) =>
                                    p.id === event.artifact_id
                                        ? { ...p, current_step: (event.step || "pending") as ProcessingStep }
                                        : p
                                )
                            );
                            break;
                        case "completed":
                            mutateProcessingItems((prev) => (prev ?? []).filter((p) => p.id !== event.artifact_id));
                            setCompletedIds((prev) => new Set([...prev, event.artifact_id]));
                            fetchArtifact(event.artifact_id)
                                .then((artifact) => {
                                    syncArtifactToCaches(artifact);
                                    onDocumentReadyRef.current?.(artifact);
                                })
                                .catch((e) => console.error("Failed to fetch completed artifact:", e));
                            break;
                        case "failed":
                            mutateProcessingItems((prev) =>
                                (prev ?? []).map((p) =>
                                    p.id === event.artifact_id
                                        ? {
                                            ...p,
                                            failed: true,
                                            error_message: event.error_message,
                                            current_step: "pending" as ProcessingStep,
                                        }
                                        : p
                                )
                            );
                            patchArtifactCaches(event.artifact_id, {
                                processing_failed: true,
                                processing_error: event.error_message,
                                is_processed: false,
                            });
                            break;
                    }
                },
                (error) => {
                    console.error("SSE stream error:", error);
                    // Auto-reconnect after 3s
                    if (mounted) {
                        reconnectTimer = setTimeout(connect, 3000);
                    }
                },
            );
        };

        // Only connect when tab is visible; disconnect on hide
        const handleVisibilityChange = () => {
            if (document.hidden) {
                controller?.abort();
                controller = null;
                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                }
            } else {
                if (!controller) connect();
            }
        };

        if (!document.hidden) {
            connect();
        }

        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            mounted = false;
            controller?.abort();
            if (reconnectTimer) clearTimeout(reconnectTimer);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [mutateProcessingItems, userId]);

    // ── Reconcile optimistic uploaded artifacts after remount/navigation ──
    useEffect(() => {
        if (!userId || processingData === undefined) return;

        const activeProcessingIds = new Set(processingItems.map((item) => item.id));
        const stalePendingArtifacts = queryClient
            .getMatchingQueries<Artifact[]>((key) => key.startsWith(DOC_ARTIFACTS_QUERY_KEY))
            .flatMap((entry) => entry.snapshot.data ?? [])
            .filter((artifact) =>
                !artifact.is_processed
                && !artifact.processing_failed
                && !activeProcessingIds.has(artifact.id)
                && !reconcilingArtifactIdsRef.current.has(artifact.id),
            );

        if (stalePendingArtifacts.length === 0) {
            return;
        }

        stalePendingArtifacts.forEach((artifact) => {
            reconcilingArtifactIdsRef.current.add(artifact.id);
            fetchArtifact(artifact.id)
                .then((freshArtifact) => {
                    syncArtifactToCaches(freshArtifact);
                    if (freshArtifact.is_processed) {
                        onDocumentReadyRef.current?.(freshArtifact);
                    }
                })
                .catch(() => {
                    // Leave the current cache as-is; normal refetch paths can recover later.
                })
                .finally(() => {
                    reconcilingArtifactIdsRef.current.delete(artifact.id);
                });
        });
    }, [processingData, processingItems, userId]);

    // ── Periodic reconciliation — catches missed SSE events ──
    useEffect(() => {
        if (!userId) return;

        const reconcile = async () => {
            const items = processingItemsRef.current;
            if (items.length === 0) return;

            // Single API call: get IDs the server still considers processing
            try {
                const stillProcessing = await getProcessingDocuments();
                const stillIds = new Set(stillProcessing.map((d) => d.id));

                // Items we think are processing but the server says are done
                const finished = items.filter((p) => !p.failed && !stillIds.has(p.id));
                if (finished.length === 0) return;

                // Fetch each finished artifact sequentially to avoid update storms
                for (const item of finished) {
                    try {
                        const artifact = await fetchArtifact(item.id);
                        if (artifact.is_processed) {
                            mutateProcessingItems((prev) => (prev ?? []).filter((p) => p.id !== item.id));
                            setCompletedIds((prev) => new Set([...prev, item.id]));
                            syncArtifactToCaches(artifact);
                            onDocumentReadyRef.current?.(artifact);
                        }
                    } catch {
                        // Artifact deleted — remove stale item
                        mutateProcessingItems((prev) => (prev ?? []).filter((p) => p.id !== item.id));
                    }
                }
            } catch {
                // Network error — skip this cycle
            }
        };

        const interval = setInterval(reconcile, 10_000);
        return () => clearInterval(interval);
    }, [mutateProcessingItems, userId]);

    // ── Public methods ──

    const addProcessingItems = useCallback((results: DocumentUploadResult[]) => {
        const newItems: ProcessingItem[] = results.map((r) => ({
            id: r.id,
            artifact_type: r.artifact_type,
            artifact_name: r.artifact_name,
            source_type: r.source_type,
            storage_path: r.storage_path,
            current_step: "pending" as ProcessingStep,
            failed: false,
            error_message: null,
            job_id: r.job_id,
            created_at: r.created_at || new Date().toISOString(),
            retryable: r.artifact_type === "uploaded_file",
        }));
        mutateProcessingItems((prev) => [...newItems, ...(prev ?? [])]);
        queryClient.updateQueries<Artifact[]>(
            (key) => key.startsWith(DOC_ARTIFACTS_QUERY_KEY),
            (current) => {
                if (!current) {
                    return current;
                }

                const optimisticArtifacts = results.map((result) => ({
                    id: result.id,
                    organization_id: "",
                    user_id: userId ?? "",
                    artifact_type: "uploaded_file",
                    artifact_name: result.artifact_name,
                    icon: "📄",
                    subject_ids: [],
                    content: {},
                    source_type: result.source_type,
                    conversion_requested: result.source_type === "docx",
                    storage_path: result.storage_path,
                    tiptap_json: null,
                    markdown_content: null,
                    is_processed: false,
                    processing_failed: false,
                    processing_error: null,
                    subject_id: null,
                    year_level: null,
                    year_levels: null,
                    subject_component: null,
                    curriculum_codes: null,
                    is_public: false,
                    created_at: result.created_at,
                    updated_at: null,
                    subjects: [],
                }));

                const existingIds = new Set(current.map((artifact) => artifact.id));
                return [...optimisticArtifacts.filter((artifact) => !existingIds.has(artifact.id)), ...current];
            },
        );
    }, [mutateProcessingItems, userId]);

    const addProcessingArtifact = useCallback((item: ProcessingItem) => {
        mutateProcessingItems((prev) => {
            const current = prev ?? [];
            if (current.some((existing) => existing.id === item.id)) {
                return current.map((existing) => existing.id === item.id ? item : existing);
            }
            return [item, ...current];
        });
    }, [mutateProcessingItems]);

    const retryItem = useCallback(async (id: string) => {
        setRetrying((prev) => new Set([...prev, id]));
        try {
            const result = await retryDocument(id);
            mutateProcessingItems((prev) =>
                (prev ?? []).map((item) =>
                    item.id === id
                        ? {
                            ...item,
                            current_step: "pending" as ProcessingStep,
                            failed: false,
                            error_message: null,
                            job_id: result.id,
                        }
                        : item
                )
            );
            patchArtifactCaches(id, {
                is_processed: false,
                processing_failed: false,
                processing_error: null,
            });
        } catch (e) {
            console.error("Retry failed:", e);
        } finally {
            setRetrying((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    }, [mutateProcessingItems]);

    const clearCompleted = useCallback((id: string) => {
        setCompletedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, []);

    const removeProcessingItem = useCallback((id: string) => {
        mutateProcessingItems((prev) => (prev ?? []).filter((p) => p.id !== id));
    }, [mutateProcessingItems]);

    return {
        processingItems,
        completedIds,
        retrying,
        addProcessingItems,
        addProcessingArtifact,
        retryItem,
        clearCompleted,
        removeProcessingItem,
    };
}
