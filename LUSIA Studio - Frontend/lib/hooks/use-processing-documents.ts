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

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export interface ProcessingItem {
    id: string;               // artifact ID
    artifact_name: string;
    source_type: string;
    storage_path: string | null;
    current_step: ProcessingStep;
    failed: boolean;
    error_message: string | null;
    job_id: string | null;
    created_at: string;
}

/* ═══════════════════════════════════════════════════════════════
   HOOK
   ═══════════════════════════════════════════════════════════════ */

interface UseProcessingDocumentsOptions {
    userId: string | undefined;
    onDocumentReady?: (artifact: Artifact) => void;
}

export function useProcessingDocuments({ userId, onDocumentReady }: UseProcessingDocumentsOptions) {
    const [processingItems, setProcessingItems] = useState<ProcessingItem[]>([]);
    const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
    const [retrying, setRetrying] = useState<Set<string>>(new Set());

    // Keep refs stable to avoid subscription churn
    const onDocumentReadyRef = useRef(onDocumentReady);
    onDocumentReadyRef.current = onDocumentReady;
    const processingItemsRef = useRef<ProcessingItem[]>([]);
    processingItemsRef.current = processingItems;

    // ── Hydrate on mount (DB read — covers state before SSE connects) ──
    useEffect(() => {
        if (!userId) return;
        getProcessingDocuments()
            .then((docs) => {
                setProcessingItems(
                    docs.map((d) => ({
                        id: d.id,
                        artifact_name: d.artifact_name,
                        source_type: d.source_type,
                        storage_path: d.storage_path,
                        current_step: (d.job_status || "pending") as ProcessingStep,
                        failed: d.job_status === "failed" || d.processing_failed === true,
                        error_message: d.error_message ?? null,
                        job_id: d.job_id,
                        created_at: d.created_at || new Date().toISOString(),
                    }))
                );
            })
            .catch((e) => console.error("Failed to load processing documents:", e));
    }, [userId]);

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
                            setProcessingItems((prev) => {
                                const localOnly = prev.filter((p) => !serverIds.has(p.id));
                                const serverItems: ProcessingItem[] = event.items.map((i) => {
                                    const existing = prev.find((p) => p.id === i.artifact_id);
                                    return {
                                        id: i.artifact_id,
                                        artifact_name: existing?.artifact_name ?? "",
                                        source_type: existing?.source_type ?? "",
                                        storage_path: existing?.storage_path ?? null,
                                        current_step: (i.step || "pending") as ProcessingStep,
                                        failed: false,
                                        error_message: null,
                                        job_id: i.job_id,
                                        created_at: existing?.created_at ?? new Date().toISOString(),
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
                                                setProcessingItems((prev) => prev.filter((p) => p.id !== item.id));
                                                setCompletedIds((prev) => new Set([...prev, item.id]));
                                                onDocumentReadyRef.current?.(artifact);
                                            } else if (artifact.processing_failed) {
                                                setProcessingItems((prev) =>
                                                    prev.map((p) =>
                                                        p.id === item.id
                                                            ? { ...p, failed: true, error_message: artifact.processing_error ?? null, current_step: "pending" as ProcessingStep }
                                                            : p
                                                    )
                                                );
                                            }
                                        } catch {
                                            setProcessingItems((prev) => prev.filter((p) => p.id !== item.id));
                                        }
                                    }
                                })();
                            }
                            break;
                        }
                        case "status":
                            setProcessingItems((prev) =>
                                prev.map((p) =>
                                    p.id === event.artifact_id
                                        ? { ...p, current_step: (event.step || "pending") as ProcessingStep }
                                        : p
                                )
                            );
                            break;
                        case "completed":
                            setProcessingItems((prev) => prev.filter((p) => p.id !== event.artifact_id));
                            setCompletedIds((prev) => new Set([...prev, event.artifact_id]));
                            fetchArtifact(event.artifact_id)
                                .then((artifact) => onDocumentReadyRef.current?.(artifact))
                                .catch((e) => console.error("Failed to fetch completed artifact:", e));
                            break;
                        case "failed":
                            setProcessingItems((prev) =>
                                prev.map((p) =>
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
    }, [userId]);

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
                            setProcessingItems((prev) => prev.filter((p) => p.id !== item.id));
                            setCompletedIds((prev) => new Set([...prev, item.id]));
                            onDocumentReadyRef.current?.(artifact);
                        }
                    } catch {
                        // Artifact deleted — remove stale item
                        setProcessingItems((prev) => prev.filter((p) => p.id !== item.id));
                    }
                }
            } catch {
                // Network error — skip this cycle
            }
        };

        const interval = setInterval(reconcile, 10_000);
        return () => clearInterval(interval);
    }, [userId]);

    // ── Public methods ──

    const addProcessingItems = useCallback((results: DocumentUploadResult[]) => {
        const newItems: ProcessingItem[] = results.map((r) => ({
            id: r.id,
            artifact_name: r.artifact_name,
            source_type: r.source_type,
            storage_path: r.storage_path,
            current_step: "pending" as ProcessingStep,
            failed: false,
            error_message: null,
            job_id: r.job_id,
            created_at: r.created_at || new Date().toISOString(),
        }));
        setProcessingItems((prev) => [...newItems, ...prev]);
    }, []);

    const retryItem = useCallback(async (id: string) => {
        setRetrying((prev) => new Set([...prev, id]));
        try {
            const result = await retryDocument(id);
            setProcessingItems((prev) =>
                prev.map((item) =>
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
        } catch (e) {
            console.error("Retry failed:", e);
        } finally {
            setRetrying((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    }, []);

    const clearCompleted = useCallback((id: string) => {
        setCompletedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    }, []);

    const removeProcessingItem = useCallback((id: string) => {
        setProcessingItems((prev) => prev.filter((p) => p.id !== id));
    }, []);

    return {
        processingItems,
        completedIds,
        retrying,
        addProcessingItems,
        retryItem,
        clearCompleted,
        removeProcessingItem,
    };
}
