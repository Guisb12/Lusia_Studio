"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
    Calendar,
    CheckCircle2,
    ChevronRight,
    ClipboardList,
    Clock,
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
import { cn } from "@/lib/utils";
import { PillSwitch } from "@/components/ui/pill-switch";
import {
    mergeStudentAssignmentIntoQueries,
    patchMyAssignmentsQuery,
    useMyAssignmentsQuery,
} from "@/lib/queries/assignments";

const AssignmentPreviewPanel = dynamic(
    () =>
        import("@/components/assignments/AssignmentPreviewPanel").then((m) => ({
            default: m.AssignmentPreviewPanel,
        })),
    { ssr: false },
);

const StudentQuizFullPage = dynamic(
    () =>
        import("@/components/assignments/StudentQuizFullPage").then((m) => ({
            default: m.StudentQuizFullPage,
        })),
    { ssr: false },
);

const ArtifactViewerDialog = dynamic(
    () =>
        import("@/components/docs/ArtifactViewerDialog").then((m) => ({
            default: m.ArtifactViewerDialog,
        })),
    { ssr: false },
);

function ArtifactTypeIcon({ type, size = 16 }: { type?: string; size?: number }) {
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

type StatusFilter = "all" | "pending" | "completed";

interface StudentAssignmentsPageProps {
    initialAssignments?: StudentAssignment[];
}

export function StudentAssignmentsPage({
    initialAssignments,
}: StudentAssignmentsPageProps) {
    const assignmentsQuery = useMyAssignmentsQuery(initialAssignments);
    const assignments = assignmentsQuery.data ?? [];
    const loading = assignmentsQuery.isLoading && !assignmentsQuery.data;

    const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
    const [quizOpen, setQuizOpen] = useState(false);
    const [viewerArtifactId, setViewerArtifactId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const preload = () => {
            void import("@/components/assignments/AssignmentPreviewPanel");
            void import("@/components/assignments/StudentQuizFullPage");
            void import("@/components/docs/ArtifactViewerDialog");
        };
        const browserWindow = window as Window &
            typeof globalThis & {
                requestIdleCallback?: (
                    callback: IdleRequestCallback,
                    options?: IdleRequestOptions,
                ) => number;
                cancelIdleCallback?: (handle: number) => void;
            };

        if (browserWindow.requestIdleCallback) {
            const idleId = browserWindow.requestIdleCallback(preload, { timeout: 1200 });
            return () => browserWindow.cancelIdleCallback?.(idleId);
        }

        const timeoutId = window.setTimeout(preload, 300);
        return () => window.clearTimeout(timeoutId);
    }, []);

    const selectedAssignment =
        assignments.find((item) => item.id === selectedAssignmentId) ?? null;

    const handleUpdated = useCallback((updated: StudentAssignment) => {
        mergeStudentAssignmentIntoQueries(updated);
    }, []);

    // Handle closing artifact viewer — show "mark as complete" toast
    const handleViewerClose = useCallback(
        (open: boolean) => {
            if (!open && viewerArtifactId && selectedAssignment) {
                setViewerArtifactId(null);
                // Only show toast if assignment is not already completed
                if (
                    selectedAssignment.status === "not_started" ||
                    selectedAssignment.status === "in_progress"
                ) {
                    toast("Marcar TPC como concluído?", {
                        duration: 8000,
                        action: {
                            label: "Confirmar",
                            onClick: async () => {
                                const previousAssignments = assignments;
                                const optimistic = {
                                    ...selectedAssignment,
                                    submission: {},
                                    status: "submitted" as const,
                                    submitted_at: new Date().toISOString(),
                                };
                                handleUpdated(optimistic);
                                try {
                                    const updated =
                                        await updateStudentAssignment(
                                            selectedAssignment.id,
                                            {
                                                submission: {},
                                                status: "submitted",
                                            },
                                        );
                                    handleUpdated(updated);
                                    toast.success("TPC marcado como concluído!");
                                } catch {
                                    patchMyAssignmentsQuery(previousAssignments);
                                    toast.error("Não foi possível submeter.");
                                }
                            },
                        },
                    });
                }
            } else if (!open) {
                setViewerArtifactId(null);
            }
        },
        [viewerArtifactId, selectedAssignment, handleUpdated],
    );

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
            text: `${d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}, ${time}`,
            color: "text-brand-primary/40",
        };
    };

    // Filtered and sectioned assignments
    const pendingAssignments = useMemo(
        () =>
            assignments.filter(
                (a) => a.status === "not_started" || a.status === "in_progress",
            ),
        [assignments],
    );
    const completedAssignments = useMemo(
        () =>
            assignments.filter(
                (a) => a.status === "submitted" || a.status === "graded",
            ),
        [assignments],
    );

    const filteredPending =
        statusFilter === "completed" ? [] : pendingAssignments;
    const filteredCompleted =
        statusFilter === "pending" ? [] : completedAssignments;

    return (
        <div className="max-w-full mx-auto w-full h-full flex flex-col">
            <div className="animate-fade-in-up flex flex-col h-full">
                {/* Header */}
                <header className="mb-4 shrink-0">
                    <div className="-mt-12 lg:mt-0 pl-14 lg:pl-0 flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-normal font-instrument text-brand-primary leading-10">
                                Os meus TPC
                            </h1>
                        </div>

                        {/* Status filter pills */}
                        <PillSwitch
                            options={[
                                { value: "all" as const, label: "Todos" },
                                { value: "pending" as const, label: "Pendentes" },
                                { value: "completed" as const, label: "Concluídos" },
                            ]}
                            value={statusFilter}
                            onChange={setStatusFilter}
                        />
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 min-h-0 flex gap-0">
                    {/* Task list */}
                    <div
                        className={cn(
                            "min-w-0 transition-all duration-300 flex flex-col h-full",
                            selectedAssignment
                                ? "hidden lg:flex lg:flex-[6]"
                                : "w-full",
                        )}
                    >
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
                                        Ainda não tens trabalhos de casa
                                        atribuídos.
                                    </p>
                                </div>
                            ) : (
                                <div className="divide-y divide-brand-primary/5">
                                    {/* Pending section */}
                                    {filteredPending.length > 0 && (
                                        <>
                                            <div className="px-4 py-2 bg-brand-primary/[0.02] sticky top-0 z-10">
                                                <span className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider flex items-center gap-1.5">
                                                    <Clock className="h-3 w-3" />
                                                    Pendentes (
                                                    {filteredPending.length})
                                                </span>
                                            </div>
                                            {filteredPending.map((sa, i) => {
                                                const due = formatDueDate(
                                                    sa.assignment?.due_date,
                                                );
                                                const isExpired =
                                                    due?.text === "Expirado";
                                                const isSelected =
                                                    selectedAssignmentId ===
                                                    sa.id;
                                                return (
                                                    <motion.div
                                                        key={sa.id}
                                                        initial={{
                                                            opacity: 0,
                                                            y: 4,
                                                        }}
                                                        animate={{
                                                            opacity: 1,
                                                            y: 0,
                                                        }}
                                                        transition={{
                                                            delay: i * 0.02,
                                                        }}
                                                        onClick={() =>
                                                            setSelectedAssignmentId(
                                                                sa.id,
                                                            )
                                                        }
                                                        className={cn(
                                                            "group/row flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                                                            isExpired &&
                                                                "opacity-60",
                                                            isSelected
                                                                ? "bg-brand-primary/5"
                                                                : "hover:bg-brand-primary/[0.02]",
                                                        )}
                                                    >
                                                        <div
                                                            className={cn(
                                                                "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 text-brand-primary/40",
                                                                isExpired
                                                                    ? "bg-red-50"
                                                                    : "bg-brand-primary/[0.04]",
                                                            )}
                                                        >
                                                            <ArtifactTypeIcon
                                                                type={sa.assignment?.artifact?.artifact_type}
                                                            />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium text-brand-primary truncate">
                                                                {sa.assignment
                                                                    ?.title ||
                                                                    "TPC sem título"}
                                                            </p>
                                                            {isExpired ? (
                                                                <p className="text-[11px] text-red-400 mt-0.5">
                                                                    Prazo
                                                                    expirado
                                                                </p>
                                                            ) : sa.assignment
                                                                    ?.instructions ? (
                                                                <p className="text-[11px] text-brand-primary/35 truncate mt-0.5">
                                                                    {
                                                                        sa
                                                                            .assignment
                                                                            .instructions
                                                                    }
                                                                </p>
                                                            ) : null}
                                                        </div>
                                                        {due && !isExpired && (
                                                            <span
                                                                className={cn(
                                                                    "text-[11px] flex items-center gap-1 shrink-0",
                                                                    due.color,
                                                                )}
                                                            >
                                                                <Calendar className="h-3 w-3" />
                                                                {due.text}
                                                            </span>
                                                        )}
                                                        <Badge
                                                            className={cn(
                                                                "text-[10px] px-2 py-0.5 border-0 shrink-0",
                                                                STUDENT_STATUS_COLORS[
                                                                    sa.status
                                                                ],
                                                            )}
                                                        >
                                                            {
                                                                STUDENT_STATUS_LABELS[
                                                                    sa.status
                                                                ]
                                                            }
                                                        </Badge>
                                                        <ChevronRight className="h-4 w-4 text-brand-primary/15 group-hover/row:text-brand-primary/30 transition-colors shrink-0" />
                                                    </motion.div>
                                                );
                                            })}
                                        </>
                                    )}

                                    {/* Completed section */}
                                    {filteredCompleted.length > 0 && (
                                        <>
                                            <div className="px-4 py-2 bg-brand-primary/[0.02] sticky top-0 z-10">
                                                <span className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider flex items-center gap-1.5">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    Concluídos (
                                                    {filteredCompleted.length})
                                                </span>
                                            </div>
                                            {filteredCompleted.map((sa, i) => {
                                                const isSelected =
                                                    selectedAssignmentId ===
                                                    sa.id;
                                                return (
                                                    <motion.div
                                                        key={sa.id}
                                                        initial={{
                                                            opacity: 0,
                                                            y: 4,
                                                        }}
                                                        animate={{
                                                            opacity: 1,
                                                            y: 0,
                                                        }}
                                                        transition={{
                                                            delay: i * 0.02,
                                                        }}
                                                        onClick={() =>
                                                            setSelectedAssignmentId(
                                                                sa.id,
                                                            )
                                                        }
                                                        className={cn(
                                                            "group/row flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                                                            isSelected
                                                                ? "bg-brand-primary/5"
                                                                : "hover:bg-brand-primary/[0.02]",
                                                        )}
                                                    >
                                                        <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 text-emerald-500">
                                                            <ArtifactTypeIcon
                                                                type={sa.assignment?.artifact?.artifact_type}
                                                            />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium text-brand-primary truncate">
                                                                {sa.assignment
                                                                    ?.title ||
                                                                    "TPC sem título"}
                                                            </p>
                                                            {sa.submitted_at && (
                                                                <p className="text-[11px] text-brand-primary/35 mt-0.5">
                                                                    Entregue{" "}
                                                                    {new Date(
                                                                        sa.submitted_at,
                                                                    ).toLocaleDateString(
                                                                        "pt-PT",
                                                                        {
                                                                            day: "numeric",
                                                                            month: "short",
                                                                        },
                                                                    )}
                                                                </p>
                                                            )}
                                                        </div>
                                                        {sa.grade !== null &&
                                                            sa.grade !==
                                                                undefined && (
                                                                <span className="text-sm font-instrument text-brand-primary shrink-0 tabular-nums">
                                                                    {sa.grade.toFixed(
                                                                        0,
                                                                    )}
                                                                    %
                                                                </span>
                                                            )}
                                                        <Badge
                                                            className={cn(
                                                                "text-[10px] px-2 py-0.5 border-0 shrink-0",
                                                                STUDENT_STATUS_COLORS[
                                                                    sa.status
                                                                ],
                                                            )}
                                                        >
                                                            {
                                                                STUDENT_STATUS_LABELS[
                                                                    sa.status
                                                                ]
                                                            }
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

                    {/* Detail panel */}
                    <AnimatePresence>
                        {selectedAssignment && (
                            <motion.div
                                initial={{ opacity: 0, x: 16 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 16 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                                className="flex-1 lg:flex-none lg:flex-[4] shrink-0 lg:border-l lg:border-brand-primary/5 overflow-hidden h-full"
                            >
                                <AssignmentPreviewPanel
                                    studentAssignment={selectedAssignment}
                                    onClose={() =>
                                        setSelectedAssignmentId(null)
                                    }
                                    onOpenQuiz={() => setQuizOpen(true)}
                                    onViewArtifact={(id) =>
                                        setViewerArtifactId(id)
                                    }
                                    onUpdated={handleUpdated}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Full-screen quiz overlay */}
            {quizOpen &&
                selectedAssignment &&
                createPortal(
                    <StudentQuizFullPage
                        studentAssignment={selectedAssignment}
                        onClose={() => setQuizOpen(false)}
                        onUpdated={handleUpdated}
                    />,
                    document.body,
                )}

            {/* Note / PDF viewer with mark-as-complete toast on close */}
            <ArtifactViewerDialog
                open={!!viewerArtifactId}
                onOpenChange={handleViewerClose}
                artifactId={viewerArtifactId}
            />
        </div>
    );
}
