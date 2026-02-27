"use client";

import React, { useState } from "react";
import {
    ArrowLeft,
    Calendar,
    CheckCircle2,
    ClipboardList,
    FileText,
    Loader2,
    Send,
    Trophy,
    X,
} from "lucide-react";
import { toast } from "sonner";
import {
    StudentAssignment,
    STUDENT_STATUS_COLORS,
    STUDENT_STATUS_LABELS,
    updateStudentAssignment,
} from "@/lib/assignments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
        const diff = d.getTime() - now.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

        if (days < 0) return { text: "Expirado", color: "text-red-500" };
        if (days === 0) return { text: "Hoje", color: "text-amber-600" };
        if (days === 1) return { text: "Amanhã", color: "text-amber-600" };
        if (days <= 3) return { text: `${days} dias`, color: "text-amber-500" };
        return {
            text: d.toLocaleDateString("pt-PT", { day: "numeric", month: "long" }),
            color: "text-brand-primary/50",
        };
    };

    const due = formatDueDate(assignment?.due_date);

    const handleMarkDone = async () => {
        setSubmitting(true);
        try {
            const updated = await updateStudentAssignment(sa.id, {
                submission: {},
                status: "submitted",
            });
            onUpdated(updated);
            toast.success("TPC marcado como concluído!");
        } catch {
            toast.error("Não foi possível submeter.");
        } finally {
            setSubmitting(false);
        }
    };

    const artifactTypeLabel: Record<string, string> = {
        quiz: "Quiz",
        note: "Nota",
        exercise_sheet: "Ficha de exercícios",
        uploaded_file: "Ficheiro PDF",
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="shrink-0 pb-4">
                {/* Close button */}
                <div className="flex justify-between items-center mb-3">
                    {/* Back arrow — mobile only */}
                    <button
                        onClick={onClose}
                        className="lg:hidden h-7 w-7 rounded-lg bg-brand-primary/5 flex items-center justify-center text-brand-primary/40 hover:text-brand-primary hover:bg-brand-primary/10 transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <span className="lg:hidden text-xs text-brand-primary/40">Os meus TPC</span>
                    {/* X — desktop only */}
                    <button
                        onClick={onClose}
                        className="hidden lg:flex ml-auto h-7 w-7 rounded-lg bg-brand-primary/5 items-center justify-center text-brand-primary/40 hover:text-brand-primary hover:bg-brand-primary/10 transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Assignment icon + title */}
                <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-brand-primary/5 flex items-center justify-center shrink-0 text-xl">
                        {artifact?.icon ?? <ClipboardList className="h-5 w-5 text-brand-primary/30" />}
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                        <h2 className="text-base font-instrument text-brand-primary leading-snug">
                            {assignment?.title || "TPC"}
                        </h2>
                        {artifact?.artifact_name && (
                            <p className="text-[11px] text-brand-primary/40 mt-0.5 truncate">
                                {artifactTypeLabel[artifactType ?? ""] ?? artifactType} · {artifact.artifact_name}
                            </p>
                        )}
                    </div>
                    <Badge className={cn("text-[10px] px-2 py-0.5 border-0 shrink-0 mt-0.5", STUDENT_STATUS_COLORS[sa.status])}>
                        {STUDENT_STATUS_LABELS[sa.status]}
                    </Badge>
                </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto space-y-5 pr-0.5">
                {/* Due date */}
                {due && (
                    <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-3.5 w-3.5 text-brand-primary/30 shrink-0" />
                        <span className="text-brand-primary/50 text-xs">Entrega:</span>
                        <span className={cn("text-xs font-medium", due.color)}>{due.text}</span>
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

                {/* ── Action section ── */}
                <div className="pt-1 space-y-2">
                    {isCompleted ? (
                        <>
                            {/* Completed card */}
                            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3">
                                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-emerald-700">TPC concluído</p>
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

                            {/* Re-open quiz results */}
                            {isQuiz && artifact?.id && (
                                <Button variant="outline" onClick={onOpenQuiz} className="gap-1.5 w-full">
                                    <Trophy className="h-3.5 w-3.5" />
                                    Ver resultados
                                </Button>
                            )}

                            {/* Re-read note/sheet/PDF */}
                            {(artifactType === "note" || artifactType === "exercise_sheet") && artifact?.id && (
                                <Button variant="outline" onClick={() => onViewArtifact(artifact.id)} className="gap-1.5 w-full">
                                    <FileText className="h-3.5 w-3.5" />
                                    {artifactType === "note" ? "Ler nota" : "Ver ficha"}
                                </Button>
                            )}

                            {artifactType === "uploaded_file" && artifact?.id && (
                                <Button variant="outline" onClick={() => onViewArtifact(artifact.id)} className="gap-1.5 w-full">
                                    <FileText className="h-3.5 w-3.5" />
                                    Ver PDF
                                </Button>
                            )}
                        </>
                    ) : (
                        <>
                            {/* No artifact — just mark done */}
                            {!artifact && (
                                <Button onClick={handleMarkDone} disabled={submitting} className="gap-1.5 w-full">
                                    {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                    Marcar como concluído
                                </Button>
                            )}

                            {/* Quiz */}
                            {isQuiz && artifact?.id && (
                                <Button onClick={onOpenQuiz} className="gap-1.5 w-full">
                                    <ClipboardList className="h-3.5 w-3.5" />
                                    Fazer quiz
                                </Button>
                            )}

                            {/* Note / exercise sheet */}
                            {(artifactType === "note" || artifactType === "exercise_sheet") && artifact?.id && (
                                <>
                                    <Button variant="outline" onClick={() => onViewArtifact(artifact.id)} className="gap-1.5 w-full">
                                        <FileText className="h-3.5 w-3.5" />
                                        {artifactType === "note" ? "Ler nota" : "Ver ficha"}
                                    </Button>
                                    <Button onClick={handleMarkDone} disabled={submitting} className="gap-1.5 w-full">
                                        {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                        Marcar como concluído
                                    </Button>
                                </>
                            )}

                            {/* PDF */}
                            {artifactType === "uploaded_file" && artifact?.id && (
                                <>
                                    <Button variant="outline" onClick={() => onViewArtifact(artifact.id)} className="gap-1.5 w-full">
                                        <FileText className="h-3.5 w-3.5" />
                                        Ver PDF
                                    </Button>
                                    <Button onClick={handleMarkDone} disabled={submitting} className="gap-1.5 w-full">
                                        {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                        Marcar como concluído
                                    </Button>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
