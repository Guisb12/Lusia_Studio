"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    X,
    Calendar,
    Users,
    FileText,
    Send,
    Lock,
    Unlock,
} from "lucide-react";
import {
    Assignment,
    StudentAssignment,
    fetchStudentSubmissions,
    updateAssignmentStatus,
    STUDENT_STATUS_LABELS,
    STUDENT_STATUS_COLORS,
} from "@/lib/assignments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { QuizArtifactEditorDialog } from "@/components/quiz/QuizArtifactEditorDialog";
import { StudentSubmissionDialog } from "@/components/assignments/StudentSubmissionDialog";
import { cn } from "@/lib/utils";

interface AssignmentDetailProps {
    assignment: Assignment;
    onClose: () => void;
    onRefresh: () => void;
}

export function AssignmentDetail({
    assignment,
    onClose,
    onRefresh,
}: AssignmentDetailProps) {
    const [submissions, setSubmissions] = useState<StudentAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [reviewingSubmission, setReviewingSubmission] = useState<StudentAssignment | null>(null);
    const [quizEditorOpen, setQuizEditorOpen] = useState(false);

    useEffect(() => {
        setLoading(true);
        fetchStudentSubmissions(assignment.id)
            .then(setSubmissions)
            .catch(() => setSubmissions([]))
            .finally(() => setLoading(false));
    }, [assignment.id]);

    const handleStatusChange = async (newStatus: string) => {
        try {
            await updateAssignmentStatus(assignment.id, newStatus);
            onRefresh();
        } catch (e) {
            console.error("Failed to update status:", e);
        }
    };

    const progress =
        assignment.student_count && assignment.student_count > 0
            ? Math.round(
                ((assignment.submitted_count || 0) / assignment.student_count) *
                100
            )
            : 0;
    const isQuizArtifact = assignment.artifact?.artifact_type === "quiz";

    const statusCounts = submissions.reduce(
        (acc, s) => {
            acc[s.status] = (acc[s.status] || 0) + 1;
            return acc;
        },
        {} as Record<string, number>
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
                            day: "numeric",
                            month: "short",
                            year: "numeric",
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
                        <span className="text-xs font-medium text-brand-primary">
                            {progress}%
                        </span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <div className="flex gap-3 mt-2">
                        {Object.entries(statusCounts).map(([status, count]) => (
                            <span
                                key={status}
                                className="text-[10px] text-brand-primary/40"
                            >
                                {STUDENT_STATUS_LABELS[status] || status}: {count}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 mb-5">
                {assignment.status === "draft" && (
                    <Button
                        size="sm"
                        onClick={() => handleStatusChange("published")}
                        className="gap-1.5 text-xs"
                    >
                        <Send className="h-3.5 w-3.5" />
                        Publicar
                    </Button>
                )}
                {assignment.status === "published" && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusChange("closed")}
                        className="gap-1.5 text-xs"
                    >
                        <Lock className="h-3.5 w-3.5" />
                        Fechar
                    </Button>
                )}
                {assignment.status === "closed" && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusChange("published")}
                        className="gap-1.5 text-xs"
                    >
                        <Unlock className="h-3.5 w-3.5" />
                        Reabrir
                    </Button>
                )}
                {isQuizArtifact && assignment.artifact_id && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setQuizEditorOpen(true)}
                        className="gap-1.5 text-xs"
                    >
                        Editar quiz
                    </Button>
                )}
            </div>

            {/* Student list */}
            <div>
                <h3 className="text-xs font-medium text-brand-primary/50 uppercase tracking-wider mb-3">
                    Alunos
                </h3>
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="h-5 w-5 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                    </div>
                ) : submissions.length === 0 ? (
                    <p className="text-sm text-brand-primary/40 text-center py-6">
                        Sem submissões
                    </p>
                ) : (
                    <div className="space-y-1.5">
                        {submissions.map((sub) => (
                            <div
                                key={sub.id}
                                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white border border-brand-primary/5 hover:border-brand-primary/10 transition-all cursor-pointer"
                                onClick={() => setReviewingSubmission(sub)}
                            >
                                {/* Avatar */}
                                <div className="h-8 w-8 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0 text-xs font-medium text-brand-primary">
                                    {(sub.student_name || "?").charAt(0).toUpperCase()}
                                </div>

                                {/* Name */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-brand-primary truncate">
                                        {sub.student_name || "Aluno"}
                                    </p>
                                    {sub.submitted_at && (
                                        <p className="text-[10px] text-brand-primary/40">
                                            Entregue{" "}
                                            {new Date(sub.submitted_at).toLocaleDateString(
                                                "pt-PT",
                                                {
                                                    day: "numeric",
                                                    month: "short",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                }
                                            )}
                                        </p>
                                    )}
                                </div>

                                {/* Status */}
                                <Badge
                                    className={cn(
                                        "text-[10px] px-2 py-0.5 border-0",
                                        STUDENT_STATUS_COLORS[sub.status] ||
                                        "bg-gray-100 text-gray-600"
                                    )}
                                >
                                    {STUDENT_STATUS_LABELS[sub.status] || sub.status}
                                </Badge>

                                {/* Grade */}
                                {sub.grade !== null && sub.grade !== undefined && (
                                    <span className="text-sm font-medium text-brand-primary shrink-0">
                                        {sub.grade.toFixed(2)}%
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <QuizArtifactEditorDialog
                open={quizEditorOpen}
                artifactId={assignment.artifact_id}
                onOpenChange={setQuizEditorOpen}
                onSaved={onRefresh}
            />

            <StudentSubmissionDialog
                open={Boolean(reviewingSubmission)}
                onOpenChange={(next) => {
                    if (!next) setReviewingSubmission(null);
                }}
                assignment={assignment}
                studentAssignment={reviewingSubmission}
            />
        </div>
    );
}
