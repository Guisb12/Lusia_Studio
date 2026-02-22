"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
    getProcessingDocuments,
    getJobStatus,
    retryDocument,
    DocumentUploadResult,
} from "@/lib/document-upload";
import { Artifact, fetchArtifact } from "@/lib/artifacts";
import type { ProcessingStep } from "@/components/docs/ProcessingStepPill";

const POLL_INTERVAL_MS = 2500;

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

    // Keep refs stable to avoid subscription/interval churn
    const onDocumentReadyRef = useRef(onDocumentReady);
    onDocumentReadyRef.current = onDocumentReady;
    const processingItemsRef = useRef<ProcessingItem[]>([]);
    processingItemsRef.current = processingItems;

    // ── Hydrate on mount ──
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
                        failed: d.job_status === "failed",
                        error_message: null,
                        job_id: d.job_id,
                        created_at: d.created_at || new Date().toISOString(),
                    }))
                );
            })
            .catch((e) => console.error("Failed to load processing documents:", e));
    }, [userId]);

    // ── Polling: update current_step via getJobStatus ──
    // Replaces Supabase Realtime on document_jobs, which requires specific
    // Realtime/replica-identity config and doesn't return current_step reliably.
    useEffect(() => {
        if (processingItems.length === 0) return;

        const poll = async () => {
            const items = processingItemsRef.current;
            if (items.length === 0) return;

            await Promise.all(
                items
                    .filter((item) => item.job_id && !item.failed)
                    .map(async (item) => {
                        try {
                            const job = await getJobStatus(item.job_id!);

                            // Job completed — transition to finished state
                            if (job.status === "completed") {
                                setProcessingItems((prev) => prev.filter((p) => p.id !== item.id));
                                setCompletedIds((prev) => new Set([...prev, item.id]));
                                try {
                                    const artifact = await fetchArtifact(item.id);
                                    onDocumentReadyRef.current?.(artifact);
                                } catch (e) {
                                    console.error("Failed to fetch completed artifact:", e);
                                }
                                return;
                            }

                            // Use job.status (enum key like "parsing")
                            // NOT job.current_step (which is the Portuguese label)
                            const step = (job.status || "pending") as ProcessingStep;
                            setProcessingItems((prev) =>
                                prev.map((p) =>
                                    p.id === item.id
                                        ? {
                                            ...p,
                                            current_step: step,
                                            failed: job.status === "failed",
                                            error_message: job.status === "failed" ? job.error_message : null,
                                        }
                                        : p
                                )
                            );
                        } catch {
                            // Ignore individual poll errors — will retry next interval
                        }
                    })
            );
        };

        const timer = setInterval(poll, POLL_INTERVAL_MS);
        // Kick off immediately so it doesn't wait 2.5s for first update
        poll();
        return () => clearInterval(timer);
    }, [processingItems.length]); // Only restart timer when count changes

    // ── Supabase Realtime: artifacts completion ──
    // Reliable because artifacts table is the primary table with simple flag updates.
    useEffect(() => {
        if (!userId) return;
        const supabase = createClient();

        const channel = supabase
            .channel("processing-artifacts-hook")
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "artifacts",
                    filter: `user_id=eq.${userId}`,
                },
                async (payload) => {
                    const updated = payload.new as Record<string, unknown>;
                    const id = updated.id as string;

                    if (updated.is_processed === true) {
                        // Move from processing → completed animation
                        setProcessingItems((prev) => prev.filter((item) => item.id !== id));
                        setCompletedIds((prev) => new Set([...prev, id]));

                        // Fetch the full artifact and notify parent
                        try {
                            const artifact = await fetchArtifact(id);
                            onDocumentReadyRef.current?.(artifact);
                        } catch (e) {
                            console.error("Failed to fetch completed artifact:", e);
                        }
                    }

                    if (updated.processing_failed === true) {
                        setProcessingItems((prev) =>
                            prev.map((item) =>
                                item.id === id
                                    ? {
                                        ...item,
                                        failed: true,
                                        error_message: (updated.processing_error as string) || null,
                                        current_step: "pending" as ProcessingStep,
                                    }
                                    : item
                            )
                        );
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
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

    return {
        processingItems,
        completedIds,
        retrying,
        addProcessingItems,
        retryItem,
        clearCompleted,
    };
}
