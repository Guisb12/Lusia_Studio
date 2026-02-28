"use client";

import React, { useState, useEffect } from "react";
import {
    Calendar,
    FileText,
    Send,
    Trash2,
    Unlock,
    Users,
    X,
} from "lucide-react";
import { toast } from "sonner";
import {
    Assignment,
    StudentAssignment,
    fetchStudentSubmissions,
    updateAssignmentStatus,
    deleteAssignment,
    STUDENT_STATUS_LABELS,
    STUDENT_STATUS_COLORS,
} from "@/lib/assignments";
import type { AssignmentChange } from "@/components/assignments/AssignmentsPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { QuizFullPageView } from "@/components/docs/quiz/QuizFullPageView";
import { StudentSubmissionDialog } from "@/components/assignments/StudentSubmissionDialog";
import { cn } from "@/lib/utils";

interface AssignmentDetailProps {
    assignment: Assignment;
    onClose: () => void;
    onAssignmentChanged: (id: string, change: AssignmentChange) => void;
}

export function AssignmentDetail({
    assignment,
    onClose,
    onAssignmentChanged,
}: AssignmentDetailProps) {
    const [submissions, setSubmissions] = useState<StudentAssignment[]>([]);
    const [loadingSubmissions, setLoadingSubmissions] = useState(true);
    const [reviewingSubmission, setReviewingSubmission] = useState<StudentAssignment | null>(null);
    const [quizEditorOpen, setQuizEditorOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        setLoadingSubmissions(true);
        fetchStudentSubmissions(assignment.id)
            .then(setSubmissions)
            .catch(() => setSubmissions([]))
            .finally(() => setLoadingSubmissions(false));
    }, [assignment.id]);

    const handleStatusChange = async (newStatus: string) => {
        try {
            await updateAssignmentStatus(assignment.id, newStatus);
            onAssignmentChanged(assignment.id, { status: newStatus });
        } catch {
            toast.error("Erro ao actualizar o TPC");
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await deleteAssignment(assignment.id);
            onAssignmentChanged(assignment.id, "deleted");
        } catch {
            toast.error("Erro ao eliminar o TPC");
            setDeleting(false);
            setConfirmDelete(false);
        }
    };

    const progress =
        (assignment.student_count ?? 0) > 0
            ? Math.round(((assignment.submitted_count || 0) / assignment.student_count!) * 100)
            : 0;
    const isQuizArtifact = assignment.artifact?.artifact_type === "quiz";

    const statusCounts = submissions.reduce(
        (acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; },
        {} as Record<string, number>,
    );

    return (
        <div className="w-full">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-medium text-brand-primary truncate">
                        {assignment.title || "TPC sem título"}
                    </h2>
                    {assignment.instructions && (
                        <p className="text-sm text-brand-primary/60 mt-1 line-clamp-3">
                            {assignment.instructions}
                        </p>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="p-1 rounded-lg hover:bg-brand-primary/5 transition-colors shrink-0 ml-2"
                >
                    <X className="h-4 w-4 text-brand-primary/40" />
                </button>
            </div>

            {/* Meta */}
            <div className="flex flex-wrap gap-2 mb-4">
                {assignment.due_date && (
                    <div className="flex items-center gap-1.5 text-xs text-brand-primary/60 bg-brand-primary/[0.03] rounded-lg px-2.5 py-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(assignment.due_date).toLocaleDateString("pt-PT", {
                            day: "numeric", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                        })}
                    </div>
                )}
                <div className="flex items-center gap-1.5 text-xs text-brand-primary/60 bg-brand-primary/[0.03] rounded-lg px-2.5 py-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {assignment.student_count || 0} alunos
                </div>
                {assignment.artifact && (
                    <div className="flex items-center gap-1.5 text-xs text-brand-primary/60 bg-brand-primary/[0.03] rounded-lg px-2.5 py-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        {assignment.artifact.artifact_name}
                    </div>
                )}
            </div>

            {/* Progress bar */}
            {assignment.status === "published" && (assignment.student_count || 0) > 0 && (
                <div className="mb-5">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-brand-primary/50">Progresso</span>
                        <span className="text-xs font-medium text-brand-primary">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <div className="flex gap-3 mt-2">
                        {Object.entries(statusCounts).map(([status, count]) => (
                            <span key={status} className="text-[10px] text-brand-primary/40">
                                {STUDENT_STATUS_LABELS[status] || status}: {count}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 mb-5">
                {assignment.status === "draft" && (
                    <Button size="sm" onClick={() => handleStatusChange("published")} className="gap-1.5 text-xs">
                        <Send className="h-3.5 w-3.5" />
                        Publicar
                    </Button>
                )}
                {assignment.status === "closed" && (
                    <Button size="sm" variant="outline" onClick={() => handleStatusChange("published")} className="gap-1.5 text-xs">
                        <Unlock className="h-3.5 w-3.5" />
                        Reabrir
                    </Button>
                )}
                {isQuizArtifact && assignment.artifact_id && (
                    <Button size="sm" variant="outline" onClick={() => setQuizEditorOpen(true)} className="gap-1.5 text-xs">
                        Editar quiz
                    </Button>
                )}
                {!confirmDelete ? (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmDelete(true)}
                        className="gap-1.5 text-xs text-brand-error border-brand-error/20 hover:bg-brand-error/5 ml-auto"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Eliminar
                    </Button>
                ) : (
                    <div className="ml-auto flex items-center gap-1.5">
                        <span className="text-xs text-brand-primary/60">Tens a certeza?</span>
                        <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)} className="text-xs h-7 px-2">
                            Cancelar
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleDelete}
                            disabled={deleting}
                            className="text-xs h-7 px-2 bg-brand-error hover:bg-brand-error/90 text-white border-0"
                        >
                            {deleting ? "..." : "Eliminar"}
                        </Button>
                    </div>
                )}
            </div>

            {/* Student list */}
            <div>
                <h3 className="text-xs font-medium text-brand-primary/50 uppercase tracking-wider mb-3">
                    Alunos
                </h3>
                {loadingSubmissions ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="h-5 w-5 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                    </div>
                ) : submissions.length === 0 ? (
                    <p className="text-sm text-brand-primary/40 text-center py-6">Sem submissões</p>
                ) : (
                    <div className="space-y-1.5">
                        {submissions.map((sub) => (
                            <div
                                key={sub.id}
                                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white border border-brand-primary/5 hover:border-brand-primary/10 transition-all cursor-pointer"
                                onClick={() => setReviewingSubmission(sub)}
                            >
                                <div className="h-8 w-8 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0 text-xs font-medium text-brand-primary">
                                    {(sub.student_name || "?").charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-brand-primary truncate">
                                        {sub.student_name || "Aluno"}
                                    </p>
                                    {sub.submitted_at && (
                                        <p className="text-[10px] text-brand-primary/40">
                                            Entregue{" "}
                                            {new Date(sub.submitted_at).toLocaleDateString("pt-PT", {
                                                day: "numeric", month: "short",
                                                hour: "2-digit", minute: "2-digit",
                                            })}
                                        </p>
                                    )}
                                </div>
                                <Badge className={cn("text-[10px] px-2 py-0.5 border-0", STUDENT_STATUS_COLORS[sub.status] || "bg-gray-100 text-gray-600")}>
                                    {STUDENT_STATUS_LABELS[sub.status] || sub.status}
                                </Badge>
                                {sub.grade !== null && sub.grade !== undefined && (
                                    <div className="shrink-0 text-right">
                                        <p className="text-[9px] text-brand-primary/35 leading-none">nota</p>
                                        <p className="text-sm font-instrument text-brand-primary leading-tight">
                                            {sub.grade.toFixed(1)}%
                                        </p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {quizEditorOpen && assignment.artifact_id && (
                <div className="fixed inset-0 z-50 bg-white">
                    <QuizFullPageView
                        artifactId={assignment.artifact_id}
                        onBack={() => setQuizEditorOpen(false)}
                    />
                </div>
            )}

            {reviewingSubmission && (
                <StudentSubmissionDialog
                    onClose={() => setReviewingSubmission(null)}
                    assignment={assignment}
                    studentAssignment={reviewingSubmission}
                />
            )}
        </div>
    );
}
