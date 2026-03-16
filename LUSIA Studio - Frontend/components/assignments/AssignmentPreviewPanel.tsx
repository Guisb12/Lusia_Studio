"use client";

import React, { useState, useCallback } from "react";
import {
    ArrowLeft,
    Calendar,
    CheckCircle2,
    FileText,
    Loader2,
    Send,
    Trophy,
    X,
} from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Pdf01Icon,
    Note01Icon,
    Quiz02Icon,
    LicenseDraftIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import {
    StudentAssignment,
    STUDENT_STATUS_COLORS,
    STUDENT_STATUS_LABELS,
    updateStudentAssignment,
} from "@/lib/assignments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

function ArtifactTypeIcon({ type, size = 18 }: { type?: string; size?: number }) {
    switch (type) {
        case "quiz":
            return <HugeiconsIcon icon={Quiz02Icon} size={size} color="currentColor" strokeWidth={1.5} />;
        case "note":
            return <HugeiconsIcon icon={Note01Icon} size={size} color="currentColor" strokeWidth={1.5} />;
        case "exercise_sheet":
            return <HugeiconsIcon icon={LicenseDraftIcon} size={size} color="currentColor" strokeWidth={1.5} />;
        case "uploaded_file":
            return <HugeiconsIcon icon={Pdf01Icon} size={size} color="currentColor" strokeWidth={1.5} />;
        default:
            return <HugeiconsIcon icon={Note01Icon} size={size} color="currentColor" strokeWidth={1.5} />;
    }
}

interface AssignmentPreviewPanelProps {
    studentAssignment: StudentAssignment;
    onClose: () => void;
    onOpenQuiz: () => void;
    onViewArtifact: (artifactId: string) => void;
    onUpdated: (sa: StudentAssignment) => void;
}

export function AssignmentPreviewPanel({
    studentAssignment: sa,
    onClose,
    onOpenQuiz,
    onViewArtifact,
    onUpdated,
}: AssignmentPreviewPanelProps) {
    const [submitting, setSubmitting] = useState(false);

    const assignment = sa.assignment;
    const artifact = assignment?.artifact;
    const isCompleted = sa.status === "submitted" || sa.status === "graded";
    const isQuiz = artifact?.artifact_type === "quiz";
    const artifactType = artifact?.artifact_type ?? null;

    const formatDueDate = (date: string | null | undefined) => {
        if (!date) return null;
        const d = new Date(date);
        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const dueStart = new Date(d);
        dueStart.setHours(0, 0, 0, 0);
        const days = Math.round(
            (dueStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24),
        );
        const time = d.toLocaleTimeString("pt-PT", {
            hour: "2-digit",
            minute: "2-digit",
        });
        if (d < now) return { text: "Expirado", color: "text-brand-error" };
        if (days === 0) return { text: `Hoje, ${time}`, color: "text-amber-600" };
        if (days === 1)
            return { text: `Amanhã, ${time}`, color: "text-amber-600" };
        if (days <= 3)
            return { text: `${days} dias, ${time}`, color: "text-amber-500" };
        return {
            text: `${d.toLocaleDateString("pt-PT", { day: "numeric", month: "long" })}, ${time}`,
            color: "text-brand-primary/50",
        };
    };

    const due = formatDueDate(assignment?.due_date);

    const handleMarkDone = async () => {
        const optimistic: StudentAssignment = {
            ...sa,
            submission: sa.submission ?? {},
            status: "submitted",
            submitted_at: sa.submitted_at ?? new Date().toISOString(),
        };
        onUpdated(optimistic);
        setSubmitting(true);
        try {
            const updated = await updateStudentAssignment(sa.id, {
                submission: {},
                status: "submitted",
            });
            onUpdated(updated);
            toast.success("TPC marcado como concluído!");
        } catch {
            onUpdated(sa);
            toast.error("Não foi possível submeter.");
        } finally {
            setSubmitting(false);
        }
    };

    // Auto-set in_progress when viewing artifact
    const handleViewArtifact = useCallback(
        (artifactId: string) => {
            // Auto-transition to in_progress if not_started
            if (sa.status === "not_started") {
                onUpdated({
                    ...sa,
                    status: "in_progress",
                    started_at: sa.started_at ?? new Date().toISOString(),
                });
                updateStudentAssignment(sa.id, { status: "in_progress" })
                    .then((updated) => onUpdated(updated))
                    .catch(() => {
                        onUpdated(sa);
                    });
            }
            onViewArtifact(artifactId);
        },
        [sa.id, sa.status, onUpdated, onViewArtifact],
    );

    // Show mark-as-complete toast when closing artifact viewer
    const handleViewArtifactWithToast = useCallback(
        (artifactId: string) => {
            handleViewArtifact(artifactId);
            // The toast will be shown when the viewer closes
            // We set a flag that the parent page can check
        },
        [handleViewArtifact],
    );

    const artifactTypeLabel: Record<string, string> = {
        quiz: "Quiz",
        note: "Nota",
        exercise_sheet: "Ficha de exercícios",
        uploaded_file: "Ficheiro PDF",
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="shrink-0 px-5 pt-4 pb-4 border-b border-brand-primary/5">
                {/* Close button */}
                <div className="flex justify-between items-center mb-3">
                    <button
                        onClick={onClose}
                        className="lg:hidden h-7 w-7 rounded-lg bg-brand-primary/5 flex items-center justify-center text-brand-primary/40 hover:text-brand-primary hover:bg-brand-primary/10 transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <span className="lg:hidden text-xs text-brand-primary/40">
                        Os meus TPC
                    </span>
                    <button
                        onClick={onClose}
                        className="hidden lg:flex ml-auto h-7 w-7 rounded-lg hover:bg-brand-primary/5 items-center justify-center text-brand-primary/40 hover:text-brand-primary transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Assignment icon + title */}
                <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-brand-primary/[0.04] flex items-center justify-center shrink-0 text-brand-primary/50">
                        <ArtifactTypeIcon type={artifactType ?? undefined} />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                        <h2 className="text-base font-medium text-brand-primary leading-snug">
                            {assignment?.title || "TPC"}
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                            {artifact?.artifact_name && (
                                <span className="text-[11px] text-brand-primary/40 truncate">
                                    {artifactTypeLabel[artifactType ?? ""] ??
                                        artifactType}{" "}
                                    · {artifact.artifact_name}
                                </span>
                            )}
                        </div>
                    </div>
                    <Badge
                        className={cn(
                            "text-[10px] px-2 py-0.5 border-0 shrink-0 mt-0.5",
                            STUDENT_STATUS_COLORS[sa.status],
                        )}
                    >
                        {STUDENT_STATUS_LABELS[sa.status]}
                    </Badge>
                </div>
            </div>

            {/* Scrollable body */}
            <ScrollArea className="flex-1 min-h-0">
                <div className="px-5 py-4 space-y-5">
                    {/* Due date */}
                    {due && (
                        <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 text-brand-primary/30 shrink-0" />
                            <span className="text-brand-primary/50 text-xs">
                                Entrega:
                            </span>
                            <span className={cn("text-xs font-medium", due.color)}>
                                {due.text}
                            </span>
                        </div>
                    )}

                    {/* Instructions */}
                    {assignment?.instructions && (
                        <div>
                            <p className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider mb-1.5">
                                Instruções
                            </p>
                            <p className="text-sm text-brand-primary/70 whitespace-pre-wrap leading-relaxed">
                                {assignment.instructions}
                            </p>
                        </div>
                    )}

                    {/* Action section */}
                    <div className="pt-1 space-y-2">
                        {isCompleted ? (
                            <>
                                {/* Completed card */}
                                <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3">
                                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-emerald-700">
                                            TPC concluído
                                        </p>
                                        {sa.submitted_at && (
                                            <p className="text-[10px] text-emerald-600/60 mt-0.5">
                                                Entregue{" "}
                                                {new Date(
                                                    sa.submitted_at,
                                                ).toLocaleDateString("pt-PT", {
                                                    day: "numeric",
                                                    month: "short",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })}
                                            </p>
                                        )}
                                    </div>
                                    {sa.grade !== null && sa.grade !== undefined && (
                                        <div className="text-right shrink-0">
                                            <p className="text-[10px] text-emerald-600/60">
                                                Nota
                                            </p>
                                            <p className="text-base font-instrument text-emerald-700">
                                                {sa.grade.toFixed(1)}%
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Feedback */}
                                {sa.feedback && (
                                    <div className="rounded-xl border border-brand-primary/5 p-3">
                                        <p className="text-[10px] text-brand-primary/40 uppercase tracking-wider mb-1">
                                            Feedback do professor
                                        </p>
                                        <p className="text-sm text-brand-primary/70">
                                            {sa.feedback}
                                        </p>
                                    </div>
                                )}

                                {/* Re-open buttons */}
                                {isQuiz && artifact?.id && (
                                    <Button
                                        variant="outline"
                                        onClick={onOpenQuiz}
                                        className="gap-1.5 w-full"
                                    >
                                        <Trophy className="h-3.5 w-3.5" />
                                        Ver resultados
                                    </Button>
                                )}
                                {(artifactType === "note" ||
                                    artifactType === "exercise_sheet" ||
                                    artifactType === "uploaded_file") &&
                                    artifact?.id && (
                                        <Button
                                            variant="outline"
                                            onClick={() =>
                                                handleViewArtifactWithToast(
                                                    artifact.id,
                                                )
                                            }
                                            className="gap-1.5 w-full"
                                        >
                                            <FileText className="h-3.5 w-3.5" />
                                            {artifactType === "note"
                                                ? "Ler nota"
                                                : artifactType ===
                                                    "exercise_sheet"
                                                ? "Ver ficha"
                                                : "Ver PDF"}
                                        </Button>
                                    )}
                            </>
                        ) : (
                            <>
                                {/* No artifact — just mark done */}
                                {!artifact && (
                                    <Button
                                        onClick={handleMarkDone}
                                        disabled={submitting}
                                        className="gap-1.5 w-full"
                                    >
                                        {submitting ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Send className="h-3.5 w-3.5" />
                                        )}
                                        Marcar como concluído
                                    </Button>
                                )}

                                {/* Quiz */}
                                {isQuiz && artifact?.id && (
                                    <Button
                                        onClick={onOpenQuiz}
                                        className="gap-1.5 w-full"
                                    >
                                        <HugeiconsIcon
                                            icon={Quiz02Icon}
                                            size={14}
                                            color="currentColor"
                                            strokeWidth={1.5}
                                        />
                                        Fazer quiz
                                    </Button>
                                )}

                                {/* Note / exercise sheet / PDF */}
                                {(artifactType === "note" ||
                                    artifactType === "exercise_sheet" ||
                                    artifactType === "uploaded_file") &&
                                    artifact?.id && (
                                        <>
                                            <Button
                                                variant="outline"
                                                onClick={() =>
                                                    handleViewArtifactWithToast(
                                                        artifact.id,
                                                    )
                                                }
                                                className="gap-1.5 w-full"
                                            >
                                                <FileText className="h-3.5 w-3.5" />
                                                {artifactType === "note"
                                                    ? "Ler nota"
                                                    : artifactType ===
                                                        "exercise_sheet"
                                                    ? "Ver ficha"
                                                    : "Ver PDF"}
                                            </Button>
                                            <Button
                                                onClick={handleMarkDone}
                                                disabled={submitting}
                                                className="gap-1.5 w-full"
                                            >
                                                {submitting ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Send className="h-3.5 w-3.5" />
                                                )}
                                                Marcar como concluído
                                            </Button>
                                        </>
                                    )}
                            </>
                        )}
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
}
