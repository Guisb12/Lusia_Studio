"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
    X,
    Calendar,
    Users,
    FileText,
    Lock,
    Unlock,
    BarChart2,
} from "lucide-react";
import {
    Assignment,
    StudentAssignment,
    fetchStudentSubmissions,
    updateAssignmentStatus,
    gradeStudentAssignment,
    STUDENT_STATUS_LABELS,
    STUDENT_STATUS_COLORS,
} from "@/lib/assignments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StudentSubmissionDialog } from "@/components/assignments/StudentSubmissionDialog";
import { QuizStatsView } from "@/components/assignments/QuizStatsView";
import {
    extractQuizQuestionIds,
    fetchQuizQuestions,
    normalizeQuestionForEditor,
    QuizQuestion,
} from "@/lib/quiz";
import { fetchArtifact } from "@/lib/artifacts";
import type { AssignmentChange } from "@/components/assignments/AssignmentsPage";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type PanelTab = "students" | "stats";

interface AssignmentReviewPanelProps {
    assignment: Assignment;
    onClose: () => void;
    onAssignmentChanged: (id: string, change: AssignmentChange) => void;
}

export function AssignmentReviewPanel({
    assignment,
    onClose,
    onAssignmentChanged,
}: AssignmentReviewPanelProps) {
    const [panelTab, setPanelTab] = useState<PanelTab>("students");
    const [submissions, setSubmissions] = useState<StudentAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [reviewingSubmission, setReviewingSubmission] = useState<StudentAssignment | null>(null);
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const isQuizArtifact = assignment.artifact?.artifact_type === "quiz";

    const loadSubmissions = useCallback(() => {
        setLoading(true);
        fetchStudentSubmissions(assignment.id)
            .then(setSubmissions)
            .catch(() => setSubmissions([]))
            .finally(() => setLoading(false));
    }, [assignment.id]);

    useEffect(() => {
        loadSubmissions();
    }, [loadSubmissions]);

    // Load quiz questions for stats tab
    useEffect(() => {
        if (!isQuizArtifact || !assignment.artifact_id) return;
        let cancelled = false;
        const load = async () => {
            try {
                const artifact = await fetchArtifact(assignment.artifact_id as string);
                if (cancelled || artifact.artifact_type !== "quiz") return;
                const ids = extractQuizQuestionIds(artifact.content);
                if (!ids.length) return;
                const bank = await fetchQuizQuestions({ ids });
                if (cancelled) return;
                const map = new Map(bank.map((q) => [q.id, q]));
                setQuestions(
                    (ids.map((id) => map.get(id)).filter(Boolean) as QuizQuestion[]).map(
                        normalizeQuestionForEditor,
                    ),
                );
            } catch {
                // stats tab will just be empty
            }
        };
        load();
        return () => { cancelled = true; };
    }, [assignment.artifact_id, isQuizArtifact]);

    const handleStatusChange = async (newStatus: string) => {
        try {
            await updateAssignmentStatus(assignment.id, newStatus);
            onAssignmentChanged(assignment.id, { status: newStatus });
        } catch {
            toast.error("Erro ao actualizar o TPC");
        }
    };

    const handleMarkDelivered = async (sub: StudentAssignment, delivered: boolean) => {
        try {
            await gradeStudentAssignment(sub.id, { grade: delivered ? 100 : 0 });
            loadSubmissions();
        } catch {
            toast.error("Erro ao marcar entrega");
        }
    };

    const handleGraded = (updated: StudentAssignment) => {
        setSubmissions((prev) =>
            prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
        );
    };

    return (
        <div className="w-full">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-medium text-brand-primary truncate">
                        {assignment.title || "TPC sem título"}
                    </h2>
                    {assignment.instructions && (
                        <p className="text-sm text-brand-primary/60 mt-1 line-clamp-2">
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

            {/* Meta chips */}
            <div className="flex flex-wrap gap-2 mb-3">
                {assignment.due_date && (
                    <div className="flex items-center gap-1.5 text-xs text-brand-error bg-red-50 rounded-lg px-2.5 py-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        Prazo:{" "}
                        {new Date(assignment.due_date).toLocaleDateString("pt-PT", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
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

            {/* Actions */}
            <div className="flex gap-2 mb-4">
                {assignment.status === "published" && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusChange("closed")}
                        className="gap-1.5 text-xs"
                    >
                        <Lock className="h-3.5 w-3.5" />
                        Fechar TPC
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
            </div>

            {/* Sub-tabs */}
            <div className="flex items-center gap-1 mb-4 border-b border-brand-primary/5">
                <button
                    onClick={() => setPanelTab("students")}
                    className={cn(
                        "px-3 py-2 text-xs transition-all relative",
                        panelTab === "students"
                            ? "text-brand-primary font-medium"
                            : "text-brand-primary/50 hover:text-brand-primary/70",
                    )}
                >
                    Alunos
                    {panelTab === "students" && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-full" />
                    )}
                </button>
                {isQuizArtifact && (
                    <button
                        onClick={() => setPanelTab("stats")}
                        className={cn(
                            "px-3 py-2 text-xs transition-all relative flex items-center gap-1",
                            panelTab === "stats"
                                ? "text-brand-primary font-medium"
                                : "text-brand-primary/50 hover:text-brand-primary/70",
                        )}
                    >
                        <BarChart2 className="h-3 w-3" />
                        Estatísticas
                        {panelTab === "stats" && (
                            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-full" />
                        )}
                    </button>
                )}
            </div>

            {/* Tab content */}
            {panelTab === "students" && (
                <div>
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
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white border border-brand-primary/5 hover:border-brand-primary/10 transition-all"
                                >
                                    {/* Clickable area */}
                                    <div
                                        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                                        onClick={() => setReviewingSubmission(sub)}
                                    >
                                        {/* Avatar */}
                                        <div className="h-8 w-8 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0 text-xs font-medium text-brand-primary">
                                            {(sub.student_name || "?").charAt(0).toUpperCase()}
                                        </div>

                                        {/* Name + time */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-brand-primary truncate">
                                                {sub.student_name || "Aluno"}
                                            </p>
                                            {sub.submitted_at && (
                                                <p className="text-[10px] text-brand-primary/40">
                                                    {new Date(sub.submitted_at).toLocaleDateString("pt-PT", {
                                                        day: "numeric",
                                                        month: "short",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Grade badge */}
                                    {sub.grade !== null && sub.grade !== undefined && (
                                        <div className="shrink-0 text-right">
                                            <p className="text-[9px] text-brand-primary/35 leading-none">nota</p>
                                            <p className="text-sm font-instrument text-brand-primary leading-tight">
                                                {sub.grade.toFixed(1)}%
                                            </p>
                                        </div>
                                    )}

                                    {/* Status */}
                                    <Badge
                                        className={cn(
                                            "text-[10px] px-2 py-0.5 border-0 shrink-0",
                                            STUDENT_STATUS_COLORS[sub.status] || "bg-gray-100 text-gray-600",
                                        )}
                                    >
                                        {STUDENT_STATUS_LABELS[sub.status] || sub.status}
                                    </Badge>

                                    {/* Non-quiz delivered toggle */}
                                    {!isQuizArtifact && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleMarkDelivered(sub, sub.grade !== 100)
                                            }
                                            className={cn(
                                                "shrink-0 text-[10px] px-2 py-1 rounded-lg border transition-colors",
                                                sub.grade === 100
                                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                                    : "bg-brand-primary/[0.03] border-brand-primary/10 text-brand-primary/50 hover:text-brand-primary/70",
                                            )}
                                        >
                                            {sub.grade === 100 ? "Entregue" : "Marcar"}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {panelTab === "stats" && isQuizArtifact && (
                <QuizStatsView
                    submissions={submissions}
                    questions={questions}
                    totalStudents={assignment.student_count || 0}
                />
            )}

            {reviewingSubmission && (
                <StudentSubmissionDialog
                    onClose={() => setReviewingSubmission(null)}
                    assignment={assignment}
                    studentAssignment={reviewingSubmission}
                    canGrade
                    onGraded={handleGraded}
                />
            )}
        </div>
    );
}
