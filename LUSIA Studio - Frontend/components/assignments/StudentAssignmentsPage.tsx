"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ClipboardList, Calendar, Clock, CheckCircle2 } from "lucide-react";
import {
    StudentAssignment,
    fetchMyAssignments,
    STUDENT_STATUS_LABELS,
    STUDENT_STATUS_COLORS,
} from "@/lib/assignments";
import { StudentQuizAttemptDialog } from "@/components/assignments/StudentQuizAttemptDialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function StudentAssignmentsPage() {
    const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAssignment, setSelectedAssignment] = useState<StudentAssignment | null>(null);

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

    const formatDueDate = (date: string | null | undefined) => {
        if (!date) return null;
        const d = new Date(date);
        const now = new Date();
        const diff = d.getTime() - now.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

        if (days < 0) return { text: "Expirado", color: "text-red-500", urgent: true };
        if (days === 0) return { text: "Hoje", color: "text-amber-600", urgent: true };
        if (days === 1) return { text: "Amanhã", color: "text-amber-600", urgent: true };
        if (days <= 3) return { text: `${days} dias`, color: "text-amber-500", urgent: false };
        return {
            text: d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" }),
            color: "text-brand-primary/50",
            urgent: false,
        };
    };

    const pendingAssignments = assignments.filter(
        (a) => a.status === "not_started" || a.status === "in_progress"
    );
    const completedAssignments = assignments.filter(
        (a) => a.status === "submitted" || a.status === "graded"
    );

    return (
        <div className="max-w-full mx-auto w-full h-full flex flex-col">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col h-full"
            >
                {/* Header */}
                <header className="mb-6">
                    <h1 className="text-3xl font-normal font-instrument text-brand-primary">
                        Os meus TPC
                    </h1>
                    <p className="text-brand-primary/70 mt-1">
                        Acompanha os teus trabalhos de casa e entregas.
                    </p>
                </header>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="h-6 w-6 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                    </div>
                ) : assignments.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center py-20 text-center"
                    >
                        <div className="h-16 w-16 rounded-2xl bg-brand-primary/5 flex items-center justify-center mb-4">
                            <ClipboardList className="h-8 w-8 text-brand-primary/30" />
                        </div>
                        <h3 className="text-lg font-medium text-brand-primary/80 mb-1">
                            Sem TPC
                        </h3>
                        <p className="text-sm text-brand-primary/50 max-w-sm">
                            Ainda não tens trabalhos de casa atribuídos.
                        </p>
                    </motion.div>
                ) : (
                    <div className="space-y-6 flex-1 min-h-0 overflow-y-auto pb-4">
                        {/* Pending */}
                        {pendingAssignments.length > 0 && (
                            <section>
                                <h2 className="text-xs font-medium text-brand-primary/50 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5" />
                                    Pendentes ({pendingAssignments.length})
                                </h2>
                                <div className="grid gap-2">
                                    {pendingAssignments.map((sa, i) => {
                                        const due = formatDueDate(
                                            sa.assignment?.due_date
                                        );
                                        return (
                                            <motion.div
                                                key={sa.id}
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: i * 0.03 }}
                                                className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-white border border-brand-primary/5 hover:border-brand-primary/15 hover:shadow-sm transition-all cursor-pointer"
                                                onClick={() => setSelectedAssignment(sa)}
                                            >
                                                <div className="h-10 w-10 rounded-lg bg-brand-primary/5 flex items-center justify-center shrink-0">
                                                    <ClipboardList className="h-5 w-5 text-brand-primary/40" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-brand-primary truncate">
                                                        {sa.assignment?.title ||
                                                            "TPC sem título"}
                                                    </p>
                                                    {sa.assignment?.instructions && (
                                                        <p className="text-xs text-brand-primary/50 truncate mt-0.5">
                                                            {sa.assignment.instructions}
                                                        </p>
                                                    )}
                                                </div>
                                                {due && (
                                                    <span
                                                        className={cn(
                                                            "text-xs flex items-center gap-1 shrink-0",
                                                            due.color
                                                        )}
                                                    >
                                                        <Calendar className="h-3 w-3" />
                                                        {due.text}
                                                    </span>
                                                )}
                                                <Badge
                                                    className={cn(
                                                        "text-[10px] px-2 py-0.5 border-0 shrink-0",
                                                        STUDENT_STATUS_COLORS[sa.status]
                                                    )}
                                                >
                                                    {STUDENT_STATUS_LABELS[sa.status]}
                                                </Badge>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* Completed */}
                        {completedAssignments.length > 0 && (
                            <section>
                                <h2 className="text-xs font-medium text-brand-primary/50 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Concluídos ({completedAssignments.length})
                                </h2>
                                <div className="grid gap-2">
                                    {completedAssignments.map((sa, i) => (
                                        <motion.div
                                            key={sa.id}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.03 }}
                                            className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white border border-brand-primary/5 hover:border-brand-primary/10 transition-all cursor-pointer opacity-70"
                                            onClick={() => setSelectedAssignment(sa)}
                                        >
                                            <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-brand-primary truncate">
                                                    {sa.assignment?.title ||
                                                        "TPC sem título"}
                                                </p>
                                                {sa.submitted_at && (
                                                    <p className="text-[10px] text-brand-primary/40 mt-0.5">
                                                        Entregue{" "}
                                                        {new Date(
                                                            sa.submitted_at
                                                        ).toLocaleDateString("pt-PT", {
                                                            day: "numeric",
                                                            month: "short",
                                                        })}
                                                    </p>
                                                )}
                                            </div>
                                            <Badge
                                                className={cn(
                                                    "text-[10px] px-2 py-0.5 border-0 shrink-0",
                                                    STUDENT_STATUS_COLORS[sa.status]
                                                )}
                                            >
                                                {STUDENT_STATUS_LABELS[sa.status]}
                                            </Badge>
                                            {sa.grade !== null &&
                                                sa.grade !== undefined && (
                                                    <span className="text-sm font-medium text-brand-primary shrink-0">
                                                        {sa.grade.toFixed(2)}%
                                                    </span>
                                                )}
                                        </motion.div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </motion.div>

            <StudentQuizAttemptDialog
                open={Boolean(selectedAssignment)}
                onOpenChange={(next) => {
                    if (!next) setSelectedAssignment(null);
                }}
                studentAssignment={selectedAssignment}
                onUpdated={(updated) => {
                    setAssignments((prev) =>
                        prev.map((item) =>
                            item.id === updated.id
                                ? { ...item, ...updated, assignment: item.assignment }
                                : item
                        )
                    );
                    setSelectedAssignment((current) =>
                        current?.id === updated.id
                            ? { ...current, ...updated, assignment: current.assignment }
                            : current
                    );
                }}
            />
        </div>
    );
}
