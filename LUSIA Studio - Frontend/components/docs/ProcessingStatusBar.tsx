"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
    getProcessingDocuments,
    retryDocument,
    DocumentUploadResult,
} from "@/lib/document-upload";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProcessingStatusBarProps {
    userId: string;
    onDocumentProcessed: () => void;
}

const STEP_LABELS: Record<string, string> = {
    pending: "Na fila...",
    parsing: "A extrair texto...",
    extracting_images: "A processar imagens...",
    categorizing: "A categorizar...",
    extracting_questions: "A extrair questões...",
    converting_tiptap: "A converter...",
    finalizing: "A finalizar...",
    completed: "Concluído",
    failed: "Falhou",
};

export function ProcessingStatusBar({ userId, onDocumentProcessed }: ProcessingStatusBarProps) {
    const [processingDocs, setProcessingDocs] = useState<DocumentUploadResult[]>([]);
    const [retrying, setRetrying] = useState<Set<string>>(new Set());

    const loadProcessing = useCallback(async () => {
        try {
            const docs = await getProcessingDocuments();
            setProcessingDocs(docs);
        } catch (e) {
            console.error("Failed to load processing documents:", e);
        }
    }, []);

    // Initial load
    useEffect(() => {
        loadProcessing();
    }, [loadProcessing]);

    // Supabase Realtime subscription on artifacts table
    useEffect(() => {
        const supabase = createClient();

        const channel = supabase
            .channel("processing-artifacts")
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "artifacts",
                    filter: `user_id=eq.${userId}`,
                },
                (payload) => {
                    const updated = payload.new as Record<string, unknown>;

                    if (updated.is_processed === true || updated.processing_failed === true) {
                        // Remove from processing list
                        setProcessingDocs((prev) =>
                            prev.filter((d) => d.id !== updated.id)
                        );

                        if (updated.is_processed === true) {
                            onDocumentProcessed();
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, onDocumentProcessed]);

    // Also subscribe to document_jobs for step updates
    useEffect(() => {
        const supabase = createClient();

        const channel = supabase
            .channel("processing-jobs")
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "document_jobs",
                    filter: `user_id=eq.${userId}`,
                },
                () => {
                    // Reload processing docs to get updated step info
                    loadProcessing();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, loadProcessing]);

    const handleRetry = async (artifactId: string) => {
        setRetrying((prev) => new Set([...prev, artifactId]));
        try {
            await retryDocument(artifactId);
            await loadProcessing();
        } catch (e) {
            console.error("Retry failed:", e);
        } finally {
            setRetrying((prev) => {
                const next = new Set(prev);
                next.delete(artifactId);
                return next;
            });
        }
    };

    if (processingDocs.length === 0) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 overflow-hidden"
            >
                <div className="rounded-xl border border-brand-accent/20 bg-brand-accent/[0.03] p-3 space-y-2">
                    <p className="text-xs font-medium text-brand-accent/70 uppercase tracking-wider">
                        A processar ({processingDocs.length})
                    </p>

                    {processingDocs.map((doc) => {
                        const isFailed = doc.is_processed === false && (doc as any).processing_failed === true;
                        const isRetrying = retrying.has(doc.id);

                        return (
                            <motion.div
                                key={doc.id}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -8 }}
                                className="flex items-center gap-3 py-1.5"
                            >
                                {/* Status icon */}
                                <div className="shrink-0">
                                    {isFailed ? (
                                        <AlertCircle className="h-4 w-4 text-red-400" />
                                    ) : (
                                        <Loader2 className="h-4 w-4 text-brand-accent animate-spin" />
                                    )}
                                </div>

                                {/* Name + step */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-brand-primary truncate">
                                        {doc.artifact_name}
                                    </p>
                                    <p
                                        className={cn(
                                            "text-xs",
                                            isFailed ? "text-red-500" : "text-brand-primary/40"
                                        )}
                                    >
                                        {isFailed
                                            ? "O processamento falhou"
                                            : STEP_LABELS[(doc as any).current_step || "pending"] ||
                                              "A processar..."}
                                    </p>
                                </div>

                                {/* Retry button for failed */}
                                {isFailed && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRetry(doc.id)}
                                        disabled={isRetrying}
                                        className="h-7 px-2 text-xs gap-1 text-brand-primary/50 hover:text-brand-primary"
                                    >
                                        {isRetrying ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            <RotateCcw className="h-3 w-3" />
                                        )}
                                        Tentar novamente
                                    </Button>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
