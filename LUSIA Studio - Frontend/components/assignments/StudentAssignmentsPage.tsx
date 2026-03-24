"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import {
    ArrowLeft,
    CheckCircle2,
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
    getTaskStatus,
    updateStudentAssignment,
} from "@/lib/assignments";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { PillSwitch } from "@/components/ui/pill-switch";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import {
    mergeStudentAssignmentIntoQueries,
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

const ArtifactFullPageViewer = dynamic(
    () =>
        import("@/components/assignments/ArtifactFullPageViewer").then((m) => ({
            default: m.ArtifactFullPageViewer,
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

function getInitials(name: string | null | undefined): string {
    if (!name) return "?";
    return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function seededRandom(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return ((hash % 1000) + 1000) % 1000 / 1000;
}

// Student-specific accent colors: blue, yellow, green, red
const POST_IT_ACCENTS = {
    not_started: "#1e40af",  // blue — to do
    in_progress: "#ca8a04",  // yellow/gold — in progress
    completed:   "#16a34a",  // green — done
    expired:     "#dc2626",  // red — expired
};

function getPostItAccent(sa: StudentAssignment): string {
    if (sa.status === "submitted" || sa.status === "graded") return POST_IT_ACCENTS.completed;
    const dueDate = sa.assignment?.due_date;
    if (dueDate && new Date(dueDate) < new Date()) return POST_IT_ACCENTS.expired;
    if (sa.status === "in_progress") return POST_IT_ACCENTS.in_progress;
    return POST_IT_ACCENTS.not_started;
}

function accentToPastel(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.round(255 * 0.85 + r * 0.15)}, ${Math.round(255 * 0.85 + g * 0.15)}, ${Math.round(255 * 0.85 + b * 0.15)})`;
}

function accentToTagBg(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.round(255 * 0.72 + r * 0.28)}, ${Math.round(255 * 0.72 + g * 0.28)}, ${Math.round(255 * 0.72 + b * 0.28)})`;
}

function StudentPostItCard({
    sa,
    isSelected,
    onClick,
}: {
    sa: StudentAssignment;
    isSelected: boolean;
    onClick: () => void;
}) {
    const rotation = useMemo(() => seededRandom(sa.id) * 2.5 - 1.25, [sa.id]);
    const tapeRotation = useMemo(() => -1.5 + seededRandom(sa.id + "t") * 3, [sa.id]);
    const accentColor = getPostItAccent(sa);
    const cardBg = accentToPastel(accentColor);
    const tagBgColor = accentToTagBg(accentColor);
    const isCompleted = sa.status === "submitted" || sa.status === "graded";
    const due = sa.assignment?.due_date;
    const artifacts = sa.assignment?.artifacts ?? [];

    const formatDue = (date: string) => {
        const d = new Date(date);
        const now = new Date();
        const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
        const dueStart = new Date(d); dueStart.setHours(0, 0, 0, 0);
        const days = Math.round((dueStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
        const time = d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
        if (d < now) return { text: "Prazo expirado", color: "text-red-600" };
        if (days === 0) return { text: `Hoje, ${time}`, color: "text-amber-700" };
        if (days === 1) return { text: `Amanhã, ${time}`, color: "text-amber-700" };
        return { text: `${d.toLocaleDateString("pt-PT", { day: "numeric", month: "long" })}, ${time}`, color: "text-gray-600" };
    };

    const dueInfo = due ? formatDue(due) : null;
    const artifactTypes = new Set(artifacts.map((a) => a.artifact_type));
    const hasMixedTypes = artifactTypes.size > 1;
    const firstArtifactType = artifacts[0]?.artifact_type;


    // Task progress
    const completedTasks = artifacts.filter((a) => {
        const s = getTaskStatus(sa.submission, sa.progress, a.id);
        return s === "completed" || s === "graded";
    }).length;

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, rotate: isSelected ? 0 : rotation }}
            whileHover={{ scale: 1.01, rotate: 0, zIndex: 10 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            onClick={onClick}
            className={cn(
                "relative w-full min-h-[160px] rounded-2xl cursor-pointer select-none border-2 px-6 py-5 overflow-visible flex flex-col",
                isSelected && "ring-2 ring-brand-accent/40",
            )}
            style={{
                backgroundColor: cardBg,
                borderColor: isSelected ? `${accentColor}60` : "rgba(0,0,0,0.06)",
                boxShadow: isSelected
                    ? `0 0 0 1px ${accentColor}40, 0 4px 16px rgba(0,0,0,0.1)`
                    : "0 2px 12px rgba(0,0,0,0.08)",
            }}
        >
            {/* Tape */}
            <div
                className="absolute -top-[6px] left-1/2 w-[42px] h-[11px] rounded-sm pointer-events-none z-10"
                style={{
                    backgroundColor: "rgba(255,255,255,0.85)",
                    transform: `translateX(-50%) rotate(${tapeRotation}deg)`,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}
            />

            {/* Title + Grade */}
            <div className="flex items-start gap-3 mb-2">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: tagBgColor, color: accentColor }}>
                    {hasMixedTypes || !firstArtifactType
                        ? <ClipboardList className="h-4 w-4" />
                        : <ArtifactTypeIcon type={firstArtifactType} size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-gray-800 leading-snug line-clamp-2">
                        {sa.assignment?.title || "TPC"}
                    </p>
                </div>
                {isCompleted && sa.grade !== null && sa.grade !== undefined && (
                    <span className="text-2xl font-instrument font-medium text-gray-700 shrink-0 tabular-nums leading-none">
                        {sa.grade.toFixed(0)}%
                    </span>
                )}
            </div>

            {/* Docs + task progress */}
            {artifacts.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mb-auto">
                    {artifacts.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1 text-[10px] rounded-md px-2 py-1"
                            style={{ backgroundColor: tagBgColor, color: accentColor }}>
                            <span className="shrink-0 [&_svg]:h-[11px] [&_svg]:w-[11px]"><ArtifactTypeIcon type={a.artifact_type} size={11} /></span>
                            <span className="truncate max-w-[120px]">{a.artifact_name}</span>
                        </span>
                    ))}
                </div>
            )}

            {/* Bottom */}
            <div className="flex items-center gap-2 mt-3 pt-2">
                {/* Teacher avatar */}
                <div className="group/author relative shrink-0">
                    <Avatar className="h-[18px] w-[18px] ring-1 ring-black/[0.06]">
                        <AvatarImage src={sa.assignment?.teacher_avatar || undefined} />
                        <AvatarFallback className="text-[6px] font-bold text-white"
                            style={{ backgroundColor: "rgba(0,0,0,0.25)" }}>
                            {getInitials(sa.assignment?.teacher_name)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="absolute bottom-full left-0 mb-1 hidden group-hover/author:block z-20 pointer-events-none">
                        <div className="rounded-md bg-brand-primary px-2 py-1 text-[9px] text-white shadow-lg whitespace-nowrap">
                            {sa.assignment?.teacher_name ?? "Professor"}
                        </div>
                    </div>
                </div>

                {dueInfo && !isCompleted && (
                    <span className={cn("text-[11px] font-medium shrink-0", dueInfo.color)}>{dueInfo.text}</span>
                )}
                {isCompleted && sa.submitted_at && (
                    <span className="text-[11px] text-gray-500 shrink-0">
                        Entregue {new Date(sa.submitted_at).toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}
                    </span>
                )}
                {/* Progress bar */}
                {artifacts.length > 0 && (
                    <div className="flex-1 flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: tagBgColor }}>
                            <div className="h-full rounded-full transition-all"
                                style={{ width: `${(completedTasks / artifacts.length) * 100}%`, backgroundColor: `${accentColor}90` }} />
                        </div>
                        <span className="text-[9px] font-medium shrink-0" style={{ color: accentColor }}>{completedTasks}/{artifacts.length}</span>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

type StatusFilter = "all" | "pending" | "completed";

interface StudentAssignmentsPageProps {
    initialAssignments?: StudentAssignment[];
}

export function StudentAssignmentsPage({
    initialAssignments,
}: StudentAssignmentsPageProps) {
    const assignmentsQuery = useMyAssignmentsQuery(initialAssignments);
    const assignments = useMemo(
        () => assignmentsQuery.data ?? [],
        [assignmentsQuery.data],
    );
    const loading = assignmentsQuery.isLoading && !assignmentsQuery.data;

    const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
    const [quizOpen, setQuizOpen] = useState(false);
    const [quizArtifactId, setQuizArtifactId] = useState<string | null>(null);
    const [viewerArtifactId, setViewerArtifactId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const preload = () => {
            void import("@/components/assignments/AssignmentPreviewPanel");
            void import("@/components/assignments/StudentQuizFullPage");
            void import("@/components/assignments/ArtifactFullPageViewer");
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

    // Handle closing artifact viewer — mark the specific task as done
    const handleViewerClose = useCallback(
        (open: boolean) => {
            if (!open && viewerArtifactId && selectedAssignment) {
                const closedArtifactId = viewerArtifactId;
                setViewerArtifactId(null);
                // Only show toast if this specific task isn't already done
                const taskSub = selectedAssignment.submission?.[closedArtifactId];
                if (!taskSub) {
                    toast("Marcar tarefa como concluída?", {
                        duration: 8000,
                        action: {
                            label: "Confirmar",
                            onClick: async () => {
                                try {
                                    const updated =
                                        await updateStudentAssignment(
                                            selectedAssignment.id,
                                            {
                                                artifact_id: closedArtifactId,
                                                submission: { type: "view", completed_at: new Date().toISOString() },
                                                status: "submitted",
                                            },
                                        );
                                    handleUpdated(updated);
                                    toast.success("Tarefa concluída!");
                                } catch {
                                    toast.error("Não foi possível marcar como concluída.");
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

    // Filtered and sectioned assignments
    const now = useMemo(() => new Date(), []);
    const pendingAssignments = useMemo(
        () => {
            const pending = assignments.filter(
                (a) => (a.status === "not_started" || a.status === "in_progress")
                    && !(a.assignment?.due_date && new Date(a.assignment.due_date) < now),
            );
            // in_progress first, then not_started
            return pending.sort((a, b) => {
                if (a.status === "in_progress" && b.status !== "in_progress") return -1;
                if (a.status !== "in_progress" && b.status === "in_progress") return 1;
                return 0;
            });
        },
        [assignments, now],
    );
    const expiredAssignments = useMemo(
        () =>
            assignments.filter(
                (a) => (a.status === "not_started" || a.status === "in_progress")
                    && a.assignment?.due_date && new Date(a.assignment.due_date) < now,
            ),
        [assignments, now],
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
    const filteredExpired =
        statusFilter === "pending" ? [] : expiredAssignments;
    const filteredCompleted =
        statusFilter === "pending" ? [] : completedAssignments;

    return (
        <div className="max-w-full mx-auto w-full h-full flex flex-col">
            <div className="animate-fade-in-up flex flex-col h-full">
                <header className="mb-2 shrink-0">
                    <div className="-mt-12 lg:mt-0 pl-14 lg:pl-0 flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-normal font-instrument text-brand-primary leading-10">
                                TPC
                            </h1>
                        </div>
                        <PillSwitch
                            options={[
                                { value: "pending" as const, label: "Pendentes" },
                                { value: "completed" as const, label: "Concluídos" },
                            ]}
                            value={statusFilter}
                            onChange={setStatusFilter}
                        />
                    </div>
                </header>

                <div className="flex-1 min-h-0 overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="h-6 w-6 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                        </div>
                    ) : assignments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="h-16 w-16 rounded-2xl bg-brand-primary/5 flex items-center justify-center mb-4">
                                <ClipboardList className="h-8 w-8 text-brand-primary/30" />
                            </div>
                            <h3 className="text-lg font-medium text-brand-primary/80 mb-1">Sem TPC</h3>
                            <p className="text-sm text-brand-primary/50 max-w-sm">Ainda não tens trabalhos de casa atribuídos.</p>
                        </div>
                    ) : (
                        <AppScrollArea className="h-full" showFadeMasks desktopScrollbarOnly interactiveScrollbar>
                            <div className="flex flex-col gap-4 p-3 pt-4">
                                {filteredPending.length > 0 && (
                                    <>
                                        <div className="px-1">
                                            <span className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider flex items-center gap-1.5">
                                                <Clock className="h-3 w-3" />
                                                Pendentes ({filteredPending.length})
                                            </span>
                                        </div>
                                        {filteredPending.map((sa) => (
                                            <StudentPostItCard key={sa.id} sa={sa} isSelected={false}
                                                onClick={() => setSelectedAssignmentId(sa.id)} />
                                        ))}
                                    </>
                                )}
                                {filteredCompleted.length > 0 && (
                                    <>
                                        <div className="px-1 mt-2">
                                            <span className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider flex items-center gap-1.5">
                                                <CheckCircle2 className="h-3 w-3" />
                                                Concluídos ({filteredCompleted.length})
                                            </span>
                                        </div>
                                        {filteredCompleted.map((sa) => (
                                            <StudentPostItCard key={sa.id} sa={sa} isSelected={false}
                                                onClick={() => setSelectedAssignmentId(sa.id)} />
                                        ))}
                                    </>
                                )}
                                {filteredExpired.length > 0 && (
                                    <>
                                        <div className="px-1 mt-2">
                                            <span className="text-[11px] font-medium text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                                                <Clock className="h-3 w-3" />
                                                Expirados ({filteredExpired.length})
                                            </span>
                                        </div>
                                        {filteredExpired.map((sa) => (
                                            <StudentPostItCard key={sa.id} sa={sa} isSelected={false}
                                                onClick={() => setSelectedAssignmentId(sa.id)} />
                                        ))}
                                    </>
                                )}
                            </div>
                        </AppScrollArea>
                    )}
                </div>
            </div>

            {/* Post-it expanded dialog */}
            {selectedAssignment && (() => {
                const selRotation = seededRandom(selectedAssignment.id + "dialog") * 3 - 1.5;
                const selTapeRotation = -1.5 + seededRandom(selectedAssignment.id + "dt") * 3;
                const selAccent = getPostItAccent(selectedAssignment);
                return createPortal(
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-12"
                        onClick={() => setSelectedAssignmentId(null)}>
                        {/* Backdrop */}
                        <div className="absolute inset-0 bg-black/20" />

                        {/* Post-it card expanded */}
                        <motion.div
                            initial={{ scale: 0.85, opacity: 0, rotate: selRotation * 3 }}
                            animate={{ scale: 1, opacity: 1, rotate: selRotation }}
                            exit={{ scale: 0.85, opacity: 0, rotate: selRotation * 3 }}
                            transition={{ type: "spring", damping: 22, stiffness: 260 }}
                            onClick={(e) => e.stopPropagation()}
                            className="relative w-full max-w-md rounded-2xl border-2 flex flex-col z-10"
                            style={{
                                backgroundColor: accentToPastel(selAccent),
                                borderColor: "rgba(0,0,0,0.06)",
                                boxShadow: "0 24px 80px rgba(0,0,0,0.18), 0 8px 24px rgba(0,0,0,0.08)",
                                maxHeight: "min(80vh, 600px)",
                            }}
                        >
                            {/* Tape */}
                            <div className="absolute -top-[7px] left-1/2 w-[52px] h-[13px] rounded-sm pointer-events-none z-20"
                                style={{
                                    backgroundColor: "rgba(255,255,255,0.85)",
                                    transform: `translateX(-50%) rotate(${selTapeRotation}deg)`,
                                    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                                }}
                            />

                            {/* Content */}
                            <div className="flex-1 min-h-0 overflow-hidden rounded-2xl pt-2">
                                <AssignmentPreviewPanel
                                    studentAssignment={selectedAssignment}
                                    onClose={() => setSelectedAssignmentId(null)}
                                    onOpenQuiz={(artifactId) => {
                                        setQuizArtifactId(artifactId);
                                        setQuizOpen(true);
                                    }}
                                    onViewArtifact={(id) => setViewerArtifactId(id)}
                                    onUpdated={handleUpdated}
                                    hideNavigation
                                />
                            </div>
                        </motion.div>
                    </div>,
                    document.body,
                );
            })()}

            {/* Full-screen quiz overlay */}
            {quizOpen && selectedAssignment && createPortal(
                <StudentQuizFullPage
                    studentAssignment={selectedAssignment}
                    artifactId={quizArtifactId ?? undefined}
                    onClose={() => { setQuizOpen(false); setQuizArtifactId(null); }}
                    onUpdated={handleUpdated}
                />,
                document.body,
            )}

            {/* Note / PDF full-page viewer */}
            {viewerArtifactId && createPortal(
                <ArtifactFullPageViewer
                    artifactId={viewerArtifactId}
                    onClose={() => handleViewerClose(false)}
                />,
                document.body,
            )}
        </div>
    );
}
