"use client";

import React, { useState, useCallback } from "react";
import {
    ArrowLeft,
    Calendar,
    Check,
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
    ArtifactMeta,
    STUDENT_STATUS_COLORS,
    STUDENT_STATUS_LABELS,
    GRADABLE_ARTIFACT_TYPES,
    getTaskStatus,
    getTaskGrade,
    getTaskLabel,
    updateStudentAssignment,
} from "@/lib/assignments";
import { Badge } from "@/components/ui/badge";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
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
    onOpenQuiz: (artifactId: string) => void;
    onViewArtifact: (artifactId: string) => void;
    onUpdated: (sa: StudentAssignment) => void;
    /** When true, hides the panel's own back/close header row (used when embedded in a full-page view that already has navigation) */
    hideNavigation?: boolean;
    /** When true, hides the entire header section (title, icon, status — used when the parent renders it) */
    hideHeader?: boolean;
}

export function AssignmentPreviewPanel({
    studentAssignment: sa,
    onClose,
    onOpenQuiz,
    onViewArtifact,
    onUpdated,
    hideNavigation,
    hideHeader,
}: AssignmentPreviewPanelProps) {
    const [submittingTask, setSubmittingTask] = useState<string | null>(null);

    const assignment = sa.assignment;
    const artifacts = assignment?.artifacts ?? [];
    const hasMultiple = artifacts.length > 1;
    const isCompleted = sa.status === "submitted" || sa.status === "graded";
    const firstArtifactType = artifacts[0]?.artifact_type ?? null;

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

    // Count completed tasks
    const completedTasks = artifacts.filter((a) => {
        const status = getTaskStatus(sa.submission, sa.progress, a.id);
        return status === "completed" || status === "graded";
    }).length;

    const handleTaskClick = useCallback(
        (artifact: ArtifactMeta) => {
            const isGradable = GRADABLE_ARTIFACT_TYPES.has(artifact.artifact_type);
            if (isGradable) {
                onOpenQuiz(artifact.id);
            } else {
                // Auto-transition to in_progress if not_started
                if (sa.status === "not_started") {
                    onUpdated({
                        ...sa,
                        status: "in_progress",
                        started_at: sa.started_at ?? new Date().toISOString(),
                    });
                    updateStudentAssignment(sa.id, {
                        artifact_id: artifact.id,
                        status: "in_progress",
                    })
                        .then((updated) => onUpdated(updated))
                        .catch(() => onUpdated(sa));
                }
                onViewArtifact(artifact.id);
            }
        },
        [sa, onOpenQuiz, onViewArtifact, onUpdated],
    );

    const handleMarkTaskDone = useCallback(
        async (artifactId: string) => {
            setSubmittingTask(artifactId);
            try {
                const updated = await updateStudentAssignment(sa.id, {
                    artifact_id: artifactId,
                    submission: { type: "view", completed_at: new Date().toISOString() },
                    status: "submitted",
                });
                onUpdated(updated);
                toast.success("Tarefa concluída!");
            } catch {
                toast.error("Não foi possível marcar como concluída.");
            } finally {
                setSubmittingTask(null);
            }
        },
        [sa.id, onUpdated],
    );

    // Legacy single-artifact "mark all done"
    const handleMarkDone = useCallback(async () => {
        setSubmittingTask("__all__");
        const optimistic: StudentAssignment = {
            ...sa,
            submission: sa.submission ?? {},
            status: "submitted",
            submitted_at: sa.submitted_at ?? new Date().toISOString(),
        };
        onUpdated(optimistic);
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
            setSubmittingTask(null);
        }
    }, [sa, onUpdated]);

    return (
        <div className="flex flex-col h-full min-w-0">
            {/* Header */}
            {!hideHeader && <div className={cn("shrink-0 px-5 pb-4 border-b border-brand-primary/5", hideNavigation ? "pt-2" : "pt-4")}>
                {!hideNavigation && (
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
                )}

                <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-brand-primary/[0.04] flex items-center justify-center shrink-0 text-brand-primary/50">
                        <ArtifactTypeIcon type={firstArtifactType ?? undefined} />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                        <h2 className="text-base font-medium text-brand-primary leading-snug">
                            {assignment?.title || "TPC"}
                        </h2>
                        {hasMultiple && (
                            <p className="text-[11px] text-brand-primary/40 mt-0.5">
                                {completedTasks} de {artifacts.length} tarefas concluídas
                            </p>
                        )}
                    </div>
                </div>
            </div>}

            {/* Scrollable body */}
            <AppScrollArea className="flex-1" showFadeMasks desktopScrollbarOnly interactiveScrollbar>
                <div className={cn("py-4 space-y-5 min-w-0", hideHeader ? "px-4 pr-4" : "px-5")}>
                    {/* Back link (full-page mode) */}
                    {hideHeader && (
                        <button onClick={onClose}
                            className="flex items-center gap-1.5 text-brand-primary/40 hover:text-brand-primary transition-colors -mt-1">
                            <ArrowLeft className="h-3.5 w-3.5" />
                            <span className="text-[12px]">Voltar aos TPC</span>
                        </button>
                    )}

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

                    {/* ── Task list (multi-artifact) ────────────────── */}
                    {artifacts.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                {hasMultiple && (
                                    <p className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider">
                                        Tarefas
                                    </p>
                                )}
                                <Badge
                                    className={cn(
                                        "text-[10px] px-2 py-0.5 border-0 shrink-0",
                                        STUDENT_STATUS_COLORS[sa.status],
                                    )}
                                >
                                    {STUDENT_STATUS_LABELS[sa.status]}
                                </Badge>
                            </div>
                            <div className="space-y-1.5">
                                {artifacts.map((artifact, index) => {
                                    const taskStatus = getTaskStatus(sa.submission, sa.progress, artifact.id);
                                    const isDone = taskStatus === "completed" || taskStatus === "graded";
                                    const isGradable = GRADABLE_ARTIFACT_TYPES.has(artifact.artifact_type);
                                    const taskGrade = getTaskGrade(sa.submission, artifact.id);
                                    const label = getTaskLabel(artifact);

                                    return (
                                        <div
                                            key={artifact.id}
                                            className={cn(
                                                "flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 transition-colors overflow-hidden min-w-0",
                                                isDone
                                                    ? "border-emerald-200/60 bg-emerald-50/40"
                                                    : "border-brand-primary/8 bg-white hover:bg-brand-primary/[0.02] cursor-pointer",
                                            )}
                                            onClick={!isDone ? () => handleTaskClick(artifact) : undefined}
                                        >
                                            {/* Number / check */}
                                            {isDone ? (
                                                <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                                </div>
                                            ) : (
                                                <div className="h-6 w-6 rounded-full bg-brand-primary/[0.06] flex items-center justify-center shrink-0">
                                                    <span className="text-[11px] font-medium text-brand-primary/40">
                                                        {index + 1}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Icon */}
                                            <div className={cn(
                                                "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                                                isDone ? "bg-emerald-100/60 text-emerald-600" : "bg-brand-primary/[0.04] text-brand-primary/50",
                                            )}>
                                                <ArtifactTypeIcon type={artifact.artifact_type} size={14} />
                                            </div>

                                            {/* Label */}
                                            <div className="flex-1 min-w-0">
                                                <p className={cn(
                                                    "text-sm font-medium truncate",
                                                    isDone ? "text-emerald-700 line-through decoration-emerald-300" : "text-brand-primary",
                                                )}>
                                                    {label}
                                                </p>
                                            </div>

                                            {/* Grade (for graded quiz tasks) */}
                                            {isDone && isGradable && taskGrade !== null && (
                                                <span className="text-xs font-instrument font-medium text-emerald-700 tabular-nums shrink-0">
                                                    {taskGrade.toFixed(0)}%
                                                </span>
                                            )}

                                            {/* Action hint for pending tasks */}
                                            {!isDone && !isGradable && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleMarkTaskDone(artifact.id);
                                                    }}
                                                    disabled={submittingTask === artifact.id}
                                                    className="shrink-0 text-[10px] font-medium text-brand-primary/30 hover:text-brand-primary/60 px-2 py-1 rounded-md hover:bg-brand-primary/5 transition-colors"
                                                >
                                                    {submittingTask === artifact.id ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        "Concluir"
                                                    )}
                                                </button>
                                            )}

                                            {/* Re-open done tasks */}
                                            {isDone && (
                                                <button
                                                    onClick={() => handleTaskClick(artifact)}
                                                    className="shrink-0 text-[10px] font-medium text-emerald-500 hover:text-emerald-700 px-2 py-1 rounded-md hover:bg-emerald-50 transition-colors"
                                                >
                                                    {isGradable ? "Ver" : "Abrir"}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── No artifacts — just mark done ─────────────── */}
                    {artifacts.length === 0 && !isCompleted && (
                        <div className="pt-1">
                            <button
                                onClick={handleMarkDone}
                                disabled={submittingTask === "__all__"}
                                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary/90 transition-colors disabled:opacity-50"
                            >
                                {submittingTask === "__all__" ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Send className="h-3.5 w-3.5" />
                                )}
                                Marcar como concluído
                            </button>
                        </div>
                    )}

                    {/* ── Completion card ────────────────────────────── */}
                    {isCompleted && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3">
                                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-emerald-700">
                                        TPC concluído
                                    </p>
                                    {sa.submitted_at && (
                                        <p className="text-[10px] text-emerald-600/60 mt-0.5">
                                            Entregue{" "}
                                            {new Date(sa.submitted_at).toLocaleDateString("pt-PT", {
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
                                        <p className="text-[10px] text-emerald-600/60">Nota</p>
                                        <p className="text-base font-instrument text-emerald-700">
                                            {sa.grade.toFixed(1)}%
                                        </p>
                                    </div>
                                )}
                            </div>

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
                        </div>
                    )}
                </div>
            </AppScrollArea>
        </div>
    );
}
