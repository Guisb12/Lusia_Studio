"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, CheckCircle2, ChevronRight, ClipboardList, Clock } from "lucide-react";
import {
    StudentAssignment,
    fetchMyAssignments,
    STUDENT_STATUS_COLORS,
    STUDENT_STATUS_LABELS,
} from "@/lib/assignments";
import { AssignmentPreviewPanel } from "@/components/assignments/AssignmentPreviewPanel";
import { StudentQuizFullPage } from "@/components/assignments/StudentQuizFullPage";
import { ArtifactViewerDialog } from "@/components/docs/ArtifactViewerDialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function StudentAssignmentsPage() {
    const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAssignment, setSelectedAssignment] = useState<StudentAssignment | null>(null);
    const [quizOpen, setQuizOpen] = useState(false);
    const [viewerArtifactId, setViewerArtifactId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchMyAssignments();
            setAssignments(data);
        } catch (e) {
            console.error("Failed to fetch assignments:", e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const handleUpdated = useCallback((updated: StudentAssignment) => {
        setAssignments((prev) =>
            prev.map((item) =>
                item.id === updated.id
                    ? { ...item, ...updated, assignment: item.assignment }
                    : item,
            ),
        );
        setSelectedAssignment((current) =>
            current?.id === updated.id
                ? { ...current, ...updated, assignment: current.assignment }
                : current,
        );
    }, []);

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
            text: d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" }),
            color: "text-brand-primary/40",
        };
    };

    const pendingAssignments = assignments.filter(
        (a) => a.status === "not_started" || a.status === "in_progress",
    );
    const completedAssignments = assignments.filter(
        (a) => a.status === "submitted" || a.status === "graded",
    );

    return (
        <div className="max-w-full mx-auto w-full h-full flex gap-0">
            {/* Left column */}
            <div
                className={cn(
                    "min-w-0 transition-all duration-300 flex flex-col h-full",
                    selectedAssignment ? "hidden lg:flex lg:w-[60%] lg:pr-4" : "w-full",
                )}
            >
                {/* Header */}
                <header className="mb-4 shrink-0">
                    <h1 className="text-3xl font-normal font-instrument text-brand-primary">
                        Os meus TPC
                    </h1>
                    <p className="text-brand-primary/70 mt-1">
                        Acompanha os teus trabalhos de casa e entregas.
                    </p>
                </header>

                {/* List container */}
                <div className="flex-1 min-h-0 rounded-xl border border-brand-primary/8 bg-white overflow-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="h-6 w-6 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                        </div>
                    ) : assignments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="h-16 w-16 rounded-2xl bg-brand-primary/5 flex items-center justify-center mb-4">
                                <ClipboardList className="h-8 w-8 text-brand-primary/30" />
                            </div>
                            <h3 className="text-lg font-medium text-brand-primary/80 mb-1">
                                Sem TPC
                            </h3>
                            <p className="text-sm text-brand-primary/50 max-w-sm">
                                Ainda não tens trabalhos de casa atribuídos.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-brand-primary/5">
                            {/* Pending section */}
                            {pendingAssignments.length > 0 && (
                                <>
                                    <div className="px-4 py-2 bg-brand-primary/[0.02]">
                                        <span className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider flex items-center gap-1.5">
                                            <Clock className="h-3 w-3" />
                                            Pendentes ({pendingAssignments.length})
                                        </span>
                                    </div>
                                    {pendingAssignments.map((sa, i) => {
                                        const due = formatDueDate(sa.assignment?.due_date);
                                        const isSelected = selectedAssignment?.id === sa.id;
                                        const artifactIcon = sa.assignment?.artifact?.icon;
                                        return (
                                            <motion.div
                                                key={sa.id}
                                                initial={{ opacity: 0, y: 4 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: i * 0.02 }}
                                                onClick={() => setSelectedAssignment(sa)}
                                                className={cn(
                                                    "group/row flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                                                    isSelected
                                                        ? "bg-brand-primary/5"
                                                        : "hover:bg-brand-primary/[0.02]",
                                                )}
                                            >
                                                {/* Icon */}
                                                <div className="h-8 w-8 rounded-lg bg-brand-primary/5 flex items-center justify-center shrink-0 text-base">
                                                    {artifactIcon ?? <ClipboardList className="h-4 w-4 text-brand-primary/30" />}
                                                </div>

                                                {/* Title + instructions */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-brand-primary truncate">
                                                        {sa.assignment?.title || "TPC sem título"}
                                                    </p>
                                                    {sa.assignment?.instructions && (
                                                        <p className="text-[11px] text-brand-primary/35 truncate mt-0.5">
                                                            {sa.assignment.instructions}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Due date */}
                                                {due && (
                                                    <span className={cn("text-[11px] flex items-center gap-1 shrink-0", due.color)}>
                                                        <Calendar className="h-3 w-3" />
                                                        {due.text}
                                                    </span>
                                                )}

                                                {/* Status badge */}
                                                <Badge className={cn("text-[10px] px-2 py-0.5 border-0 shrink-0", STUDENT_STATUS_COLORS[sa.status])}>
                                                    {STUDENT_STATUS_LABELS[sa.status]}
                                                </Badge>

                                                <ChevronRight className="h-4 w-4 text-brand-primary/15 group-hover/row:text-brand-primary/30 transition-colors shrink-0" />
                                            </motion.div>
                                        );
                                    })}
                                </>
                            )}

                            {/* Completed section */}
                            {completedAssignments.length > 0 && (
                                <>
                                    <div className="px-4 py-2 bg-brand-primary/[0.02]">
                                        <span className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider flex items-center gap-1.5">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Concluídos ({completedAssignments.length})
                                        </span>
                                    </div>
                                    {completedAssignments.map((sa, i) => {
                                        const isSelected = selectedAssignment?.id === sa.id;
                                        const artifactIcon = sa.assignment?.artifact?.icon;
                                        return (
                                            <motion.div
                                                key={sa.id}
                                                initial={{ opacity: 0, y: 4 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: i * 0.02 }}
                                                onClick={() => setSelectedAssignment(sa)}
                                                className={cn(
                                                    "group/row flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                                                    isSelected
                                                        ? "bg-brand-primary/5"
                                                        : "hover:bg-brand-primary/[0.02]",
                                                )}
                                            >
                                                {/* Icon */}
                                                <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 text-base">
                                                    {artifactIcon ?? <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                                                </div>

                                                {/* Title + submitted date */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-brand-primary truncate">
                                                        {sa.assignment?.title || "TPC sem título"}
                                                    </p>
                                                    {sa.submitted_at && (
                                                        <p className="text-[11px] text-brand-primary/35 mt-0.5">
                                                            Entregue{" "}
                                                            {new Date(sa.submitted_at).toLocaleDateString("pt-PT", {
                                                                day: "numeric",
                                                                month: "short",
                                                            })}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Grade */}
                                                {sa.grade !== null && sa.grade !== undefined && (
                                                    <span className="text-sm font-medium text-brand-primary shrink-0 tabular-nums">
                                                        {sa.grade.toFixed(0)}%
                                                    </span>
                                                )}

                                                {/* Status badge */}
                                                <Badge className={cn("text-[10px] px-2 py-0.5 border-0 shrink-0", STUDENT_STATUS_COLORS[sa.status])}>
                                                    {STUDENT_STATUS_LABELS[sa.status]}
                                                </Badge>

                                                <ChevronRight className="h-4 w-4 text-brand-primary/15 group-hover/row:text-brand-primary/30 transition-colors shrink-0" />
                                            </motion.div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Right column: Preview panel */}
            <AnimatePresence>
                {selectedAssignment && (
                    <motion.div
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 16 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="flex-1 lg:flex-none lg:w-[40%] shrink-0 lg:border-l lg:border-brand-primary/5 lg:pl-4 overflow-hidden h-full"
                    >
                        <AssignmentPreviewPanel
                            studentAssignment={selectedAssignment}
                            onClose={() => setSelectedAssignment(null)}
                            onOpenQuiz={() => setQuizOpen(true)}
                            onViewArtifact={(id) => setViewerArtifactId(id)}
                            onUpdated={handleUpdated}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Full-screen quiz overlay — portalled to body to escape stacking contexts */}
            {quizOpen && selectedAssignment && createPortal(
                <StudentQuizFullPage
                    studentAssignment={selectedAssignment}
                    onClose={() => setQuizOpen(false)}
                    onUpdated={handleUpdated}
                />,
                document.body,
            )}

            {/* Note / PDF viewer */}
            <ArtifactViewerDialog
                open={!!viewerArtifactId}
                onOpenChange={(open) => { if (!open) setViewerArtifactId(null); }}
                artifactId={viewerArtifactId}
            />
        </div>
    );
}
