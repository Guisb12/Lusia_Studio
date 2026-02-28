"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ClipboardList, Calendar, Users, ChevronRight } from "lucide-react";
import { Assignment, fetchAssignments } from "@/lib/assignments";
import { AssignmentDetail } from "@/components/assignments/AssignmentDetail";
import { AssignmentReviewPanel } from "@/components/assignments/AssignmentReviewPanel";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const CreateAssignmentDialog = dynamic(
    () => import("@/components/assignments/CreateAssignmentDialog").then(m => ({ default: m.CreateAssignmentDialog })),
    { ssr: false }
);

type Tab = "published" | "review" | "closed";

// Shared type for optimistic mutation callbacks — used by child panels
export type AssignmentChange = "deleted" | { status: string };

const TABS: { value: Tab; label: string }[] = [
    { value: "published", label: "Ativos" },
    { value: "review", label: "Corrigir" },
    { value: "closed", label: "Fechados" },
];

// Stable predicate — extracted so it doesn't cause useMemo deps issues
function isReadyToReview(a: Assignment): boolean {
    const now = new Date();
    const deadlinePassed = !!a.due_date && new Date(a.due_date) < now;
    const allSubmitted =
        (a.student_count ?? 0) > 0 &&
        (a.submitted_count ?? 0) >= (a.student_count ?? 0);
    return deadlinePassed || allSubmitted;
}

interface AssignmentsPageProps {
    initialAssignments?: Assignment[];
}

export function AssignmentsPage({ initialAssignments }: AssignmentsPageProps) {
    // ── Data caches ──────────────────────────────────────────────────────────
    // All published assignments live here. Tab switching just filters — no fetch.
    const [publishedData, setPublishedData] = useState<Assignment[]>(initialAssignments ?? []);
    const [closedData, setClosedData] = useState<Assignment[]>([]);
    // Only true the very first render when we have no data at all
    const [initialLoading, setInitialLoading] = useState(!initialAssignments);

    // ── UI state ─────────────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<Tab>("published");
    const [createOpen, setCreateOpen] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // ── Resizable panel ──────────────────────────────────────────────────────
    const [panelWidth, setPanelWidth] = useState(400);
    const dragStartXRef = useRef(0);
    const dragStartWidthRef = useRef(0);

    // ── Derived lists — instant, no fetch needed ─────────────────────────────
    const activeAssignments = useMemo(
        () => publishedData.filter((a) => !isReadyToReview(a)),
        [publishedData],
    );
    const reviewAssignments = useMemo(
        () => publishedData.filter(isReadyToReview),
        [publishedData],
    );
    const reviewCount = reviewAssignments.length;

    const displayedAssignments =
        activeTab === "published" ? activeAssignments :
        activeTab === "review"   ? reviewAssignments :
        closedData;

    // Keep the panel visible even if the assignment temporarily disappears from
    // the current list during an optimistic update (it's still in the other cache)
    const selectedAssignment =
        displayedAssignments.find((a) => a.id === selectedId) ??
        (selectedId
            ? [...publishedData, ...closedData].find((a) => a.id === selectedId)
            : undefined);

    // ── Silent background refresh — never shows a loading state ──────────────
    const refresh = useCallback(() => {
        Promise.all([fetchAssignments("published"), fetchAssignments("closed")])
            .then(([pub, clo]) => {
                setPublishedData(pub);
                setClosedData(clo);
            })
            .catch(console.error);
    }, []);

    // ── Initial load ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (initialAssignments) {
            // Server already gave us published — fetch closed silently
            fetchAssignments("closed").then(setClosedData).catch(() => {});
        } else {
            Promise.all([fetchAssignments("published"), fetchAssignments("closed")])
                .then(([pub, clo]) => {
                    setPublishedData(pub);
                    setClosedData(clo);
                })
                .catch(console.error)
                .finally(() => setInitialLoading(false));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Optimistic mutation handler ───────────────────────────────────────────
    // Child panels call this instead of triggering a blocking reload.
    const handleAssignmentChanged = useCallback(
        (id: string, change: AssignmentChange) => {
            if (change === "deleted") {
                setPublishedData((prev) => prev.filter((a) => a.id !== id));
                setClosedData((prev) => prev.filter((a) => a.id !== id));
                setSelectedId(null);
            } else {
                const newStatus = (change as { status: string }).status;
                // Remove from the current cache immediately; bg refresh puts it in the right one
                if (newStatus === "closed") setPublishedData((prev) => prev.filter((a) => a.id !== id));
                else if (newStatus === "published") setClosedData((prev) => prev.filter((a) => a.id !== id));
                setSelectedId(null);
                refresh();
            }
        },
        [refresh],
    );

    // ── Drag-to-resize ────────────────────────────────────────────────────────
    const onDragStart = useCallback(
        (e: React.MouseEvent) => {
            dragStartXRef.current = e.clientX;
            dragStartWidthRef.current = panelWidth;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";

            const onMove = (ev: MouseEvent) => {
                const delta = dragStartXRef.current - ev.clientX;
                setPanelWidth(Math.min(600, Math.max(280, dragStartWidthRef.current + delta)));
            };
            const onUp = () => {
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
        },
        [panelWidth],
    );

    // ── Helpers ───────────────────────────────────────────────────────────────
    const formatDueDate = (date: string | null) => {
        if (!date) return null;
        const d = new Date(date);
        const now = new Date();
        const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
        const dueStart = new Date(d); dueStart.setHours(0, 0, 0, 0);
        const days = Math.round((dueStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
        const time = d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
        if (d < now) return { text: "Expirado", color: "text-brand-error" };
        if (days === 0) return { text: `Hoje, ${time}`, color: "text-brand-warning" };
        if (days === 1) return { text: `Amanhã, ${time}`, color: "text-brand-warning" };
        return {
            text: `${d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}, ${time}`,
            color: "text-brand-primary/50",
        };
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="max-w-full mx-auto w-full h-full flex flex-col">
            <div className="animate-fade-in-up flex flex-col h-full">

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
                        <Button onClick={() => setCreateOpen(true)} className="gap-2">
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
                            onClick={() => { setActiveTab(tab.value); setSelectedId(null); }}
                            className={cn(
                                "px-4 py-2.5 text-sm transition-all relative flex items-center gap-1.5",
                                activeTab === tab.value
                                    ? "text-brand-primary font-medium"
                                    : "text-brand-primary/50 hover:text-brand-primary/70",
                            )}
                        >
                            {tab.label}
                            {tab.value === "review" && reviewCount > 0 && (
                                <span className={cn(
                                    "inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-semibold",
                                    activeTab === "review"
                                        ? "bg-brand-primary/20 text-brand-primary"
                                        : "bg-brand-error text-white",
                                )}>
                                    {reviewCount}
                                </span>
                            )}
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
                    <div className={cn("flex-1 min-w-0 transition-all", selectedId ? "pr-1" : "")}>
                        {initialLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="h-6 w-6 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                            </div>
                        ) : displayedAssignments.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in-up">
                                <div className="h-16 w-16 rounded-2xl bg-brand-primary/5 flex items-center justify-center mb-4">
                                    <ClipboardList className="h-8 w-8 text-brand-primary/30" />
                                </div>
                                <h3 className="text-lg font-medium text-brand-primary/80 mb-1">
                                    {activeTab === "published"
                                        ? "Sem TPC ativos"
                                        : activeTab === "review"
                                        ? "Nenhum TPC para corrigir"
                                        : "Sem TPC fechados"}
                                </h3>
                                <p className="text-sm text-brand-primary/50 max-w-sm">
                                    Cria um novo TPC para começar a acompanhar o progresso dos teus alunos.
                                </p>
                                {activeTab === "published" && (
                                    <Button variant="outline" className="mt-4 gap-2" onClick={() => setCreateOpen(true)}>
                                        <Plus className="h-4 w-4" />
                                        Criar TPC
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className="grid gap-2">
                                {displayedAssignments.map((assignment, i) => {
                                    const due = formatDueDate(assignment.due_date);
                                    const progress = (assignment.student_count ?? 0) > 0
                                        ? Math.round(((assignment.submitted_count || 0) / assignment.student_count!) * 100)
                                        : 0;
                                    return (
                                        <motion.div
                                            key={assignment.id}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.03 }}
                                            onClick={() =>
                                                setSelectedId(selectedId === assignment.id ? null : assignment.id)
                                            }
                                            className={cn(
                                                "group flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all cursor-pointer",
                                                selectedId === assignment.id
                                                    ? "bg-brand-primary/[0.03] border-brand-primary/15 shadow-sm"
                                                    : "bg-white border-brand-primary/5 hover:border-brand-primary/15 hover:shadow-sm",
                                            )}
                                        >
                                            <div className="h-10 w-10 rounded-lg bg-brand-primary/5 flex items-center justify-center shrink-0">
                                                {assignment.artifact?.icon || <ClipboardList className="h-5 w-5 text-brand-primary/40" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-brand-primary truncate">
                                                    {assignment.title || "TPC sem título"}
                                                </p>
                                                <div className="flex items-center gap-3 mt-1">
                                                    {assignment.artifact && (
                                                        <span className="text-[10px] text-brand-primary/40">
                                                            {assignment.artifact.artifact_name}
                                                        </span>
                                                    )}
                                                    {due && (
                                                        <span className={cn("text-[10px] flex items-center gap-1", due.color)}>
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
                                            {(activeTab === "published" || activeTab === "review") &&
                                                (assignment.student_count ?? 0) > 0 && (
                                                <div className="w-24 shrink-0">
                                                    <span className="text-[10px] text-brand-primary/40 block mb-1">
                                                        {assignment.submitted_count || 0}/{assignment.student_count}
                                                    </span>
                                                    <Progress value={progress} className="h-1.5" />
                                                </div>
                                            )}
                                            <ChevronRight className="h-4 w-4 text-brand-primary/20 group-hover:text-brand-primary/40 transition-colors shrink-0" />
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Detail panel — resizable */}
                    <AnimatePresence>
                        {selectedId && selectedAssignment && (
                            <motion.div
                                initial={{ opacity: 0, x: 20, width: 0 }}
                                animate={{ opacity: 1, x: 0, width: panelWidth }}
                                exit={{ opacity: 0, x: 20, width: 0 }}
                                transition={{ duration: 0.2 }}
                                style={{ width: panelWidth }}
                                className="shrink-0 flex min-h-0"
                            >
                                {/* Drag handle */}
                                <div
                                    onMouseDown={onDragStart}
                                    className="w-3 shrink-0 cursor-col-resize flex items-center justify-center group"
                                >
                                    <div className="w-px h-full bg-brand-primary/8 group-hover:bg-brand-primary/25 transition-colors" />
                                </div>
                                <div className="flex-1 min-w-0 overflow-y-auto">
                                    {activeTab === "review" ? (
                                        <AssignmentReviewPanel
                                            assignment={selectedAssignment}
                                            onClose={() => setSelectedId(null)}
                                            onAssignmentChanged={handleAssignmentChanged}
                                        />
                                    ) : (
                                        <AssignmentDetail
                                            assignment={selectedAssignment}
                                            onClose={() => setSelectedId(null)}
                                            onAssignmentChanged={handleAssignmentChanged}
                                        />
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {createOpen && (
                <CreateAssignmentDialog
                    open={createOpen}
                    onOpenChange={setCreateOpen}
                    onCreated={(a) => {
                        setPublishedData((prev) => [a, ...prev]);
                        refresh();
                    }}
                />
            )}
        </div>
    );
}
