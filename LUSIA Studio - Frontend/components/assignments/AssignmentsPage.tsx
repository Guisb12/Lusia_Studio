"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ClipboardList, Calendar, Users, ChevronRight } from "lucide-react";
import {
    Assignment,
    fetchAssignments,
    ASSIGNMENT_STATUS_LABELS,
} from "@/lib/assignments";
import { CreateAssignmentDialog } from "@/components/assignments/CreateAssignmentDialog";
import { AssignmentDetail } from "@/components/assignments/AssignmentDetail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type Tab = "published" | "draft" | "closed";

const TABS: { value: Tab; label: string }[] = [
    { value: "published", label: "Ativos" },
    { value: "draft", label: "Rascunhos" },
    { value: "closed", label: "Fechados" },
];

export function AssignmentsPage() {
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>("published");
    const [createOpen, setCreateOpen] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const loadAssignments = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchAssignments(activeTab);
            setAssignments(data);
        } catch (e) {
            console.error("Failed to fetch assignments:", e);
        } finally {
            setLoading(false);
        }
    }, [activeTab]);

    useEffect(() => {
        loadAssignments();
    }, [loadAssignments]);

    const selectedAssignment = assignments.find((a) => a.id === selectedId);

    const formatDueDate = (date: string | null) => {
        if (!date) return null;
        const d = new Date(date);
        const now = new Date();
        const diff = d.getTime() - now.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

        if (days < 0) return { text: "Expirado", color: "text-brand-error" };
        if (days === 0) return { text: "Hoje", color: "text-brand-warning" };
        if (days === 1) return { text: "Amanhã", color: "text-brand-warning" };
        return {
            text: d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" }),
            color: "text-brand-primary/50",
        };
    };

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
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-normal font-instrument text-brand-primary">
                                TPC
                            </h1>
                            <p className="text-brand-primary/70 mt-1">
                                Gere e acompanha os trabalhos de casa dos teus alunos.
                            </p>
                        </div>
                        <Button
                            onClick={() => setCreateOpen(true)}
                            className="gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            Novo TPC
                        </Button>
                    </div>
                </header>

                {/* Tabs */}
                <div className="flex items-center gap-1 mb-5 border-b border-brand-primary/5">
                    {TABS.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => {
                                setActiveTab(tab.value);
                                setSelectedId(null);
                            }}
                            className={cn(
                                "px-4 py-2.5 text-sm transition-all relative",
                                activeTab === tab.value
                                    ? "text-brand-primary font-medium"
                                    : "text-brand-primary/50 hover:text-brand-primary/70"
                            )}
                        >
                            {tab.label}
                            {activeTab === tab.value && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-full"
                                />
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 flex gap-0">
                    {/* List */}
                    <div
                        className={cn(
                            "flex-1 min-w-0 transition-all",
                            selectedId ? "pr-4" : ""
                        )}
                    >
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
                                    {activeTab === "published"
                                        ? "Sem TPC ativos"
                                        : activeTab === "draft"
                                            ? "Sem rascunhos"
                                            : "Sem TPC fechados"}
                                </h3>
                                <p className="text-sm text-brand-primary/50 max-w-sm">
                                    Cria um novo TPC para começar a acompanhar o progresso dos teus alunos.
                                </p>
                                {activeTab !== "closed" && (
                                    <Button
                                        variant="outline"
                                        className="mt-4 gap-2"
                                        onClick={() => setCreateOpen(true)}
                                    >
                                        <Plus className="h-4 w-4" />
                                        Criar TPC
                                    </Button>
                                )}
                            </motion.div>
                        ) : (
                            <div className="grid gap-2">
                                {assignments.map((assignment, i) => {
                                    const due = formatDueDate(assignment.due_date);
                                    const progress =
                                        assignment.student_count && assignment.student_count > 0
                                            ? Math.round(
                                                ((assignment.submitted_count || 0) /
                                                    assignment.student_count) *
                                                100
                                            )
                                            : 0;

                                    return (
                                        <motion.div
                                            key={assignment.id}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.03 }}
                                            onClick={() =>
                                                setSelectedId(
                                                    selectedId === assignment.id
                                                        ? null
                                                        : assignment.id
                                                )
                                            }
                                            className={cn(
                                                "group flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all cursor-pointer",
                                                selectedId === assignment.id
                                                    ? "bg-brand-primary/[0.03] border-brand-primary/15 shadow-sm"
                                                    : "bg-white border-brand-primary/5 hover:border-brand-primary/15 hover:shadow-sm"
                                            )}
                                        >
                                            {/* Icon */}
                                            <div className="h-10 w-10 rounded-lg bg-brand-primary/5 flex items-center justify-center shrink-0">
                                                {assignment.artifact?.icon || (
                                                    <ClipboardList className="h-5 w-5 text-brand-primary/40" />
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-brand-primary truncate">
                                                    {assignment.title || "TPC sem título"}
                                                </p>
                                                <div className="flex items-center gap-3 mt-1">
                                                    {assignment.artifact && (
                                                        <span className="text-[10px] text-brand-primary/40 flex items-center gap-1">
                                                            {assignment.artifact.artifact_name}
                                                        </span>
                                                    )}
                                                    {due && (
                                                        <span
                                                            className={cn(
                                                                "text-[10px] flex items-center gap-1",
                                                                due.color
                                                            )}
                                                        >
                                                            <Calendar className="h-3 w-3" />
                                                            {due.text}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] text-brand-primary/40 flex items-center gap-1">
                                                        <Users className="h-3 w-3" />
                                                        {assignment.student_count || 0}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Progress */}
                                            {activeTab === "published" &&
                                                assignment.student_count &&
                                                assignment.student_count > 0 && (
                                                    <div className="w-24 shrink-0">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="text-[10px] text-brand-primary/40">
                                                                {assignment.submitted_count || 0}/
                                                                {assignment.student_count}
                                                            </span>
                                                        </div>
                                                        <Progress
                                                            value={progress}
                                                            className="h-1.5"
                                                        />
                                                    </div>
                                                )}

                                            <ChevronRight className="h-4 w-4 text-brand-primary/20 group-hover:text-brand-primary/40 transition-colors shrink-0" />
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Detail Panel */}
                    <AnimatePresence>
                        {selectedId && selectedAssignment && (
                            <motion.div
                                initial={{ opacity: 0, x: 20, width: 0 }}
                                animate={{ opacity: 1, x: 0, width: 400 }}
                                exit={{ opacity: 0, x: 20, width: 0 }}
                                transition={{ duration: 0.2 }}
                                className="shrink-0 border-l border-brand-primary/5 pl-4 overflow-y-auto"
                            >
                                <AssignmentDetail
                                    assignment={selectedAssignment}
                                    onClose={() => setSelectedId(null)}
                                    onRefresh={loadAssignments}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>

            <CreateAssignmentDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                onCreated={loadAssignments}
            />
        </div>
    );
}
