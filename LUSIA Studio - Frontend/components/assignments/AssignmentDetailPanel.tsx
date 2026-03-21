"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    X,
    Calendar,
    Send,
    Trash2,
    Lock,
    Unlock,
    Trophy,
    Clock,
    AlertTriangle,
    Check,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    UserPlus,
    Loader2,
} from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Pdf01Icon,
    Note01Icon,
    Quiz02Icon,
    LicenseDraftIcon,
} from "@hugeicons/core-free-icons";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    Cell,
} from "recharts";
import {
    Assignment,
    ArtifactMeta,
    StudentAssignment,
    updateAssignmentStatus,
    deleteAssignment,
    gradeStudentAssignment,
    addStudentsToAssignment,
    removeStudentsFromAssignment,
    hasGradableArtifacts,
    getTaskStatus,
    getTaskGrade,
    GRADABLE_ARTIFACT_TYPES,
    STUDENT_STATUS_LABELS,
    STUDENT_STATUS_COLORS,
} from "@/lib/assignments";
import {
    extractQuizQuestionIds,
    fetchQuizQuestions,
    normalizeQuestionForEditor,
    type QuizQuestion,
} from "@/lib/quiz";
import { fetchArtifact } from "@/lib/artifacts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StudentPicker } from "@/components/calendar/StudentPicker";
import type { StudentInfo } from "@/components/calendar/StudentHoverCard";
import { usePrimaryClass } from "@/lib/hooks/usePrimaryClass";
import { StudentSubmissionDialog } from "@/components/assignments/StudentSubmissionDialog";
import { QuizQuestionRenderer } from "@/components/quiz/QuizQuestionRenderer";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    snapshotAssignmentsQueries,
    mergeStudentAssignmentIntoQueries,
    patchAssignmentSubmissionsQuery,
    restoreAssignmentsQueries,
    upsertAssignmentInQueries,
    useAssignmentSubmissionsQuery,
} from "@/lib/queries/assignments";

type PanelTab = "students" | "insights" | "questions";
type StudentView = "leaderboard" | "status";

export type AssignmentChange = "deleted" | { status: string };

function ArtifactTypeIcon({ type }: { type?: string }) {
    switch (type) {
        case "quiz":
            return <HugeiconsIcon icon={Quiz02Icon} size={16} color="currentColor" strokeWidth={1.5} />;
        case "note":
            return <HugeiconsIcon icon={Note01Icon} size={16} color="currentColor" strokeWidth={1.5} />;
        case "exercise_sheet":
            return <HugeiconsIcon icon={LicenseDraftIcon} size={16} color="currentColor" strokeWidth={1.5} />;
        default:
            return <HugeiconsIcon icon={Pdf01Icon} size={16} color="currentColor" strokeWidth={1.5} />;
    }
}

function formatRelativeDue(date: string | null) {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const days = Math.round(diff / (1000 * 60 * 60 * 24));
    if (diff < 0) {
        const absDays = Math.abs(days);
        if (absDays === 0) return { text: "Expirou hoje", color: "text-brand-error" };
        return { text: `Expirado há ${absDays} dia${absDays > 1 ? "s" : ""}`, color: "text-brand-error" };
    }
    if (days === 0) return { text: "Expira hoje", color: "text-amber-600" };
    if (days === 1) return { text: "Expira amanhã", color: "text-amber-600" };
    return { text: `Em ${days} dias`, color: "text-brand-primary/50" };
}

function AddStudentsPanel({
    existingIds,
    onAdd,
    adding,
    primaryClassId,
}: {
    existingIds: Set<string>;
    onAdd: (ids: string[]) => void;
    adding: boolean;
    primaryClassId: string | null;
}) {
    const [selected, setSelected] = useState<StudentInfo[]>([]);

    return (
        <div className="p-3 space-y-3">
            <p className="text-[11px] font-medium text-brand-primary/60">Adicionar alunos</p>
            <StudentPicker
                value={selected}
                onChange={setSelected}
                enableClassFilter
                primaryClassId={primaryClassId}
                excludeIds={existingIds}
            />
            <button
                onClick={() => onAdd(selected.map((s) => s.id))}
                disabled={adding || selected.length === 0}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-primary text-white text-[11px] font-medium disabled:opacity-40 hover:bg-brand-primary/90 transition-colors"
            >
                {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                Adicionar {selected.length > 0 ? `(${selected.length})` : ""}
            </button>
        </div>
    );
}

interface AssignmentDetailPanelProps {
    assignment: Assignment;
    onClose: () => void;
    onAssignmentChanged: (id: string, change: AssignmentChange) => void;
}

export function AssignmentDetailPanel({
    assignment,
    onClose,
    onAssignmentChanged,
}: AssignmentDetailPanelProps) {
    const [panelTab, setPanelTab] = useState<PanelTab>("students");
    const [studentView, setStudentView] = useState<StudentView>("status");
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [reviewingSubmission, setReviewingSubmission] = useState<StudentAssignment | null>(null);
    const [reviewingQuizArtifactId, setReviewingQuizArtifactId] = useState<string | null>(null);
    const [selectedQuestionIdx, setSelectedQuestionIdx] = useState<number | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const { primaryClassId } = usePrimaryClass();
    const submissionsQuery = useAssignmentSubmissionsQuery(assignment.id);
    const submissions = submissionsQuery.data ?? [];
    const loading = submissionsQuery.isLoading && !submissionsQuery.data;

    // All quiz artifacts in this assignment
    const quizArtifacts = useMemo(
        () => (assignment.artifacts ?? []).filter((a) => GRADABLE_ARTIFACT_TYPES.has(a.artifact_type)),
        [assignment.artifacts],
    );
    const hasQuizzes = quizArtifacts.length > 0;
    const hasMultipleQuizzes = quizArtifacts.length > 1;
    const hasGradable = hasGradableArtifacts(assignment.artifacts);
    const studentCount = assignment.student_count ?? 0;
    const submittedCount = assignment.submitted_count ?? 0;
    const completionPct = studentCount > 0 ? Math.round((submittedCount / studentCount) * 100) : 0;

    // Selected quiz for insights/questions tabs — defaults to first quiz
    const [selectedQuizId, setSelectedQuizId] = useState<string | null>(quizArtifacts[0]?.id ?? null);
    // Keep selectedQuizId in sync if assignment changes
    useEffect(() => {
        if (quizArtifacts.length > 0 && !quizArtifacts.some((a) => a.id === selectedQuizId)) {
            setSelectedQuizId(quizArtifacts[0].id);
        }
    }, [quizArtifacts, selectedQuizId]);

    const activeQuizArtifactId = selectedQuizId ?? quizArtifacts[0]?.id ?? null;

    // Load quiz questions for the selected quiz
    useEffect(() => {
        if (!activeQuizArtifactId) { setQuestions([]); return; }
        let cancelled = false;
        const load = async () => {
            try {
                const artifact = await fetchArtifact(activeQuizArtifactId);
                if (cancelled || !GRADABLE_ARTIFACT_TYPES.has(artifact.artifact_type)) { setQuestions([]); return; }
                const ids = extractQuizQuestionIds(artifact.content);
                if (!ids.length) { setQuestions([]); return; }
                const bank = await fetchQuizQuestions({ ids });
                if (cancelled) return;
                const map = new Map(bank.map((q) => [q.id, q]));
                setQuestions(
                    (ids.map((id) => map.get(id)).filter(Boolean) as QuizQuestion[]).map(
                        normalizeQuestionForEditor,
                    ),
                );
            } catch {
                if (!cancelled) setQuestions([]);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [activeQuizArtifactId]);

    // Handlers
    const handleStatusChange = async (newStatus: string) => {
        const snapshots = snapshotAssignmentsQueries();
        upsertAssignmentInQueries({
            ...assignment,
            status: newStatus as Assignment["status"],
        });
        try {
            const updated = await updateAssignmentStatus(assignment.id, newStatus);
            upsertAssignmentInQueries(updated);
            onAssignmentChanged(assignment.id, { status: newStatus });
        } catch {
            restoreAssignmentsQueries(snapshots);
            toast.error("Erro ao atualizar o TPC");
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

    const handleMarkDelivered = async (sub: StudentAssignment, delivered: boolean) => {
        const previous = submissions;
        const optimisticStatus = delivered ? "graded" : "not_started";
        const optimisticGrade = delivered ? 100 : 0;
        patchAssignmentSubmissionsQuery(assignment.id, (current) =>
            current?.map((item) =>
                item.id === sub.id
                    ? {
                          ...item,
                          grade: optimisticGrade,
                          status: optimisticStatus,
                          graded_at: new Date().toISOString(),
                      }
                    : item,
            ),
        );
        try {
            const updated = await gradeStudentAssignment(sub.id, { grade: optimisticGrade });
            patchAssignmentSubmissionsQuery(assignment.id, (current) =>
                current?.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
            );
            mergeStudentAssignmentIntoQueries(updated);
        } catch {
            patchAssignmentSubmissionsQuery(assignment.id, previous);
            toast.error("Erro ao marcar entrega");
        }
    };

    const [quizPickerFor, setQuizPickerFor] = useState<StudentAssignment | null>(null);

    const [addStudentsOpen, setAddStudentsOpen] = useState(false);
    const [addingStudents, setAddingStudents] = useState(false);

    const handleAddStudents = useCallback(async (newStudentIds: string[]) => {
        if (!newStudentIds.length) return;
        setAddingStudents(true);
        try {
            const updated = await addStudentsToAssignment(assignment.id, newStudentIds);
            upsertAssignmentInQueries(updated);
            onAssignmentChanged(assignment.id, { status: updated.status });
            submissionsQuery.refetch();
            setAddStudentsOpen(false);
            toast.success(`${newStudentIds.length} aluno${newStudentIds.length > 1 ? "s" : ""} adicionado${newStudentIds.length > 1 ? "s" : ""}`);
        } catch {
            toast.error("Erro ao adicionar alunos");
        } finally {
            setAddingStudents(false);
        }
    }, [assignment.id, onAssignmentChanged, submissionsQuery]);

    const [confirmRemoveStudentId, setConfirmRemoveStudentId] = useState<string | null>(null);
    const [removingStudent, setRemovingStudent] = useState(false);

    const handleRemoveStudent = useCallback(async (studentId: string) => {
        setRemovingStudent(true);
        try {
            const updated = await removeStudentsFromAssignment(assignment.id, [studentId]);
            upsertAssignmentInQueries(updated);
            onAssignmentChanged(assignment.id, { status: updated.status });
            patchAssignmentSubmissionsQuery(assignment.id, (current) =>
                current?.filter((s) => s.student_id !== studentId),
            );
            submissionsQuery.refetch();
            toast.success("Aluno removido");
        } catch {
            toast.error("Erro ao remover aluno");
        } finally {
            setRemovingStudent(false);
            setConfirmRemoveStudentId(null);
        }
    }, [assignment.id, onAssignmentChanged, submissionsQuery]);

    const handleStudentClick = useCallback((sub: StudentAssignment) => {
        if (hasMultipleQuizzes) {
            setQuizPickerFor(sub);
        } else {
            setReviewingSubmission(sub);
        }
    }, [hasMultipleQuizzes]);

    const handleGraded = (updated: StudentAssignment) => {
        patchAssignmentSubmissionsQuery(assignment.id, (current) =>
            current?.map((item) =>
                item.id === updated.id
                    ? { ...item, ...updated, assignment: updated.assignment ?? item.assignment }
                    : item,
            ),
        );
        mergeStudentAssignmentIntoQueries(updated);
    };

    // Helper: get grading results scoped to the active quiz artifact
    const getSubmissionGrading = useCallback((sub: StudentAssignment) => {
        if (!activeQuizArtifactId) return (sub.submission as Record<string, any>)?.grading ?? null;
        // Try per-artifact keyed format first
        const taskSub = (sub.submission as Record<string, any>)?.[activeQuizArtifactId];
        if (taskSub?.grading) return taskSub.grading;
        // Fall back to legacy flat format
        return (sub.submission as Record<string, any>)?.grading ?? null;
    }, [activeQuizArtifactId]);

    // Computed stats
    const gradedSubmissions = useMemo(
        () => submissions.filter((s) => s.grade !== null && s.grade !== undefined),
        [submissions],
    );

    const avgGrade = useMemo(() => {
        if (!gradedSubmissions.length) return null;
        const sum = gradedSubmissions.reduce((acc, s) => acc + (s.grade ?? 0), 0);
        return sum / gradedSubmissions.length;
    }, [gradedSubmissions]);

    const questionStats = useMemo(() => {
        return questions.map((q, idx) => {
            let total = 0;
            let wrong = 0;
            for (const sub of submissions) {
                const grading = getSubmissionGrading(sub);
                if (!grading?.results) continue;
                const result = (grading.results as { question_id: string; is_correct: boolean }[]).find(
                    (r) => r.question_id === q.id,
                );
                if (!result) continue;
                total++;
                if (!result.is_correct) wrong++;
            }
            const failRate = total > 0 ? Math.round((wrong / total) * 100) : 0;
            return { name: `P${idx + 1}`, failRate, total, question: q };
        });
    }, [questions, submissions, getSubmissionGrading]);

    const hardestQuestions = useMemo(
        () => [...questionStats].sort((a, b) => b.failRate - a.failRate).slice(0, 3),
        [questionStats],
    );

    // Leaderboard: "global" uses overall grade, quiz ID uses per-task grade
    const [leaderboardQuizId, setLeaderboardQuizId] = useState<string | null>(null);

    const leaderboard = useMemo(() => {
        if (leaderboardQuizId) {
            // Per-quiz leaderboard
            return [...submissions]
                .map((s) => ({ ...s, _lbGrade: getTaskGrade(s.submission, leaderboardQuizId) }))
                .filter((s) => s._lbGrade !== null)
                .sort((a, b) => (b._lbGrade ?? 0) - (a._lbGrade ?? 0));
        }
        // Global leaderboard (overall grade = avg of quiz grades)
        return [...submissions]
            .filter((s) => s.grade !== null && s.grade !== undefined)
            .sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0));
    }, [submissions, leaderboardQuizId],
    );

    // Status grouped
    const statusGroups = useMemo(() => {
        const groups: Record<string, StudentAssignment[]> = {};
        for (const sub of submissions) {
            if (!groups[sub.status]) groups[sub.status] = [];
            groups[sub.status].push(sub);
        }
        return groups;
    }, [submissions]);

    const due = formatRelativeDue(assignment.due_date);

    const hasMultipleArtifacts = (assignment.artifacts?.length ?? 0) > 1;
    const TABS: { value: PanelTab; label: string; show?: boolean }[] = [
        { value: "students", label: "Alunos" },
        { value: "insights", label: "Análise", show: hasMultipleArtifacts || hasQuizzes },
        { value: "questions", label: "Perguntas", show: hasQuizzes },
    ];

    return (
        <div className="flex flex-col h-full w-full overflow-hidden">
            {/* ── Sticky header ──────────────────────────────── */}
            <div className="shrink-0 pb-0 pt-1">
                {/* Row 1: Icon + Title + Close */}
                <div className="flex items-center gap-3 px-5 mb-2">
                    <div className="h-12 w-12 rounded-xl bg-brand-primary/[0.04] flex items-center justify-center shrink-0 text-brand-primary/50">
                        {!assignment.artifacts?.[0]?.artifact_type || ((assignment.artifacts?.length ?? 0) > 1 && new Set(assignment.artifacts!.map((a) => a.artifact_type)).size > 1)
                            ? <ClipboardList className="h-5 w-5" />
                            : <ArtifactTypeIcon type={assignment.artifacts[0].artifact_type} />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-medium text-brand-primary truncate leading-tight">
                            {assignment.title || "TPC sem título"}
                        </h2>
                        <p className="text-[11px] text-brand-primary/35 truncate mt-0.5">
                            {assignment.teacher_name || "Professor"}
                            {due && <> · <span className={due.color}>{due.text}</span></>}
                        </p>
                    </div>
                    <button onClick={onClose}
                        className="h-7 w-7 rounded-lg bg-brand-primary/5 flex items-center justify-center text-brand-primary/40 hover:text-brand-primary hover:bg-brand-primary/10 transition-colors shrink-0 self-start">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Row 2: Status + Progress + Actions */}
                <Popover open={addStudentsOpen} onOpenChange={setAddStudentsOpen}>
                <PopoverTrigger asChild>
                <div className="flex items-center gap-2 px-5 mb-3">
                    <Badge className={cn("text-[10px] px-2 py-0.5 border-0",
                        assignment.status === "published" ? "bg-emerald-50 text-emerald-700"
                            : assignment.status === "closed" ? "bg-gray-100 text-gray-600"
                            : "bg-amber-50 text-amber-700")}>
                        {assignment.status === "published" ? "Ativo" : assignment.status === "closed" ? "Fechado" : "Rascunho"}
                    </Badge>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <div className="h-1.5 flex-1 bg-brand-primary/8 rounded-full overflow-hidden max-w-[80px]">
                            <div className={cn("h-full rounded-full transition-all",
                                completionPct === 100 ? "bg-emerald-400" : "bg-brand-accent")}
                                style={{ width: `${completionPct}%` }} />
                        </div>
                        <span className="text-[10px] text-brand-primary/40 shrink-0">{submittedCount}/{studentCount}</span>
                        {assignment.status !== "closed" && (
                            <button onClick={() => setAddStudentsOpen(true)}
                                className="h-5 w-5 rounded-full bg-brand-primary/[0.06] flex items-center justify-center text-brand-primary/40 hover:text-brand-primary hover:bg-brand-primary/10 transition-colors shrink-0">
                                <UserPlus className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-auto">
                        {assignment.status === "draft" && (
                            <Button size="sm" onClick={() => handleStatusChange("published")} className="gap-1 text-xs h-7 px-2.5">
                                <Send className="h-3 w-3" /> Publicar
                            </Button>
                        )}
                        {assignment.status === "published" && (
                            <Button size="sm" variant="outline" onClick={() => handleStatusChange("closed")} className="gap-1 text-xs h-7 px-2.5">
                                <Lock className="h-3 w-3" /> Fechar
                            </Button>
                        )}
                        {assignment.status === "closed" && (
                            <Button size="sm" variant="outline" onClick={() => handleStatusChange("published")} className="gap-1 text-xs h-7 px-2.5">
                                <Unlock className="h-3 w-3" /> Reabrir
                            </Button>
                        )}
                        {!confirmDelete ? (
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}
                                className="text-brand-error/60 hover:text-brand-error hover:bg-brand-error/5 h-7 w-7 p-0">
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        ) : (
                            <div className="flex items-center gap-1">
                                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} className="text-xs h-7 px-2">Cancelar</Button>
                                <Button size="sm" onClick={handleDelete} disabled={deleting}
                                    className="text-xs h-7 px-2 bg-brand-error hover:bg-brand-error/90 text-white border-0">
                                    {deleting ? "..." : "Eliminar"}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="center" side="bottom"
                    style={{ width: "var(--radix-popover-trigger-width)" }}
                    onOpenAutoFocus={(e) => e.preventDefault()}>
                    <AddStudentsPanel
                        existingIds={new Set(assignment.student_ids ?? [])}
                        onAdd={handleAddStudents}
                        adding={addingStudents}
                        primaryClassId={primaryClassId}
                    />
                </PopoverContent>
                </Popover>

                {/* Instructions citation */}
                {assignment.instructions && (
                    <div className="mx-5 mb-2 pl-3 border-l-2 border-brand-primary/10">
                        <p className="text-[11px] text-brand-primary/45 italic line-clamp-2 leading-snug">
                            {assignment.instructions}
                        </p>
                    </div>
                )}

                {/* Row 3: Tab bar */}
                <div className="flex items-center gap-0.5 border-b border-brand-primary/5 px-5">
                    {TABS.filter((t) => t.show !== false).map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => setPanelTab(tab.value)}
                            className={cn(
                                "px-3 py-2 text-[12px] transition-all relative",
                                panelTab === tab.value
                                    ? "text-brand-primary font-medium"
                                    : "text-brand-primary/40 hover:text-brand-primary/60",
                            )}
                        >
                            {tab.label}
                            {panelTab === tab.value && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-full" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Content area ─────────────────────────────── */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    {/* ── Students tab ── */}
                    {panelTab === "students" && (
                        <div className="flex flex-col flex-1 min-h-0">
                            {/* Fixed: task overview + view toggle */}
                            <div className="shrink-0 px-5 pt-4">
                            {/* ── Global task overview (multi-attachment) ── */}
                            {hasMultipleArtifacts && submissions.length > 0 && (
                                <div className="space-y-1.5 mb-4">
                                    {(assignment.artifacts ?? []).map((art, i) => {
                                        const doneCount = submissions.filter((s) => {
                                            const ts = getTaskStatus(s.submission, s.progress, art.id);
                                            return ts === "completed" || ts === "graded";
                                        }).length;
                                        const total = submissions.length || 1;
                                        const pct = Math.round((doneCount / total) * 100);
                                        const doneStudents = submissions.filter((s) => {
                                            const ts = getTaskStatus(s.submission, s.progress, art.id);
                                            return ts === "completed" || ts === "graded";
                                        });
                                        return (
                                            <div
                                                key={art.id}
                                                className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-brand-primary/5 bg-white"
                                            >
                                                <div className="relative h-7 w-7 shrink-0">
                                                    <svg className="h-7 w-7 -rotate-90" viewBox="0 0 36 36">
                                                        <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-brand-primary/8" />
                                                        <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3"
                                                            strokeDasharray={`${pct * 0.88} 100`} strokeLinecap="round"
                                                            className={pct === 100 ? "text-emerald-500" : pct > 0 ? "text-brand-accent" : "text-brand-primary/10"} />
                                                    </svg>
                                                    <span className="absolute inset-0 flex items-center justify-center text-[6px] font-semibold text-brand-primary">{pct}%</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[10px] font-medium text-brand-primary/30">{i + 1}.</span>
                                                        <ArtifactTypeIcon type={art.artifact_type} />
                                                        <p className="text-[11px] font-medium text-brand-primary truncate">{art.artifact_name}</p>
                                                    </div>
                                                </div>
                                                {doneStudents.length > 0 && (
                                                    <div className="flex items-center -space-x-1.5 shrink-0">
                                                        {doneStudents.slice(0, 3).map((s) => (
                                                            <div key={s.id} className="h-4.5 w-4.5 rounded-full bg-emerald-100 border-[1.5px] border-white flex items-center justify-center text-[7px] font-medium text-emerald-700"
                                                                title={s.student_name || undefined}>
                                                                {(s.student_name || "?").charAt(0).toUpperCase()}
                                                            </div>
                                                        ))}
                                                        {doneStudents.length > 3 && (
                                                            <div className="h-4.5 w-4.5 rounded-full bg-brand-primary/10 border-[1.5px] border-white flex items-center justify-center text-[6px] font-medium text-brand-primary/50">
                                                                +{doneStudents.length - 3}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* View toggle */}
                            {hasQuizzes && gradedSubmissions.length > 0 && (
                                <div className="flex items-center gap-1 mb-3 bg-brand-primary/[0.03] rounded-md p-0.5 w-fit">
                                    <button onClick={() => setStudentView("status")}
                                        className={cn("px-2.5 py-1 text-[11px] rounded transition-all",
                                            studentView === "status" ? "bg-white text-brand-primary shadow-sm font-medium" : "text-brand-primary/50")}>
                                        Estado
                                    </button>
                                    <button onClick={() => setStudentView("leaderboard")}
                                        className={cn("px-2.5 py-1 text-[11px] rounded transition-all flex items-center gap-1",
                                            studentView === "leaderboard" ? "bg-white text-brand-primary shadow-sm font-medium" : "text-brand-primary/50")}>
                                        <Trophy className="h-3 w-3" /> Ranking
                                    </button>
                                </div>
                            )}
                            </div>

                            {/* Scrollable: student rows */}
                            <AppScrollArea className="flex-1 min-h-0" interactiveScrollbar>
                            <div className="px-5 pb-4">
                            {loading ? (
                                <div className="flex items-center justify-center py-10">
                                    <div className="h-5 w-5 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                                </div>
                            ) : submissions.length === 0 ? (
                                <p className="text-sm text-brand-primary/40 text-center py-8">Sem submissões</p>
                            ) : studentView === "leaderboard" && hasQuizzes ? (
                                /* ── Leaderboard ── */
                                <div className="space-y-2">
                                    {/* Quiz selector for leaderboard */}
                                    {hasMultipleQuizzes && (
                                        <div className="grid gap-0.5 bg-brand-primary/[0.03] rounded-lg p-0.5" style={{ gridTemplateColumns: `repeat(${quizArtifacts.length + 1}, minmax(0, 1fr))` }}>
                                            <button
                                                onClick={() => setLeaderboardQuizId(null)}
                                                className={cn(
                                                    "min-w-0 px-2 py-1.5 text-[10px] rounded-md transition-all flex items-center gap-1 justify-center overflow-hidden",
                                                    leaderboardQuizId === null
                                                        ? "bg-white text-brand-primary shadow-sm font-medium"
                                                        : "text-brand-primary/40 hover:text-brand-primary/60",
                                                )}>
                                                <Trophy className="h-3 w-3 shrink-0" />
                                                <span className="truncate">Global</span>
                                            </button>
                                            {quizArtifacts.map((art) => (
                                                <button key={art.id}
                                                    onClick={() => setLeaderboardQuizId(art.id)}
                                                    className={cn(
                                                        "min-w-0 px-2 py-1.5 text-[10px] rounded-md transition-all flex items-center gap-1 justify-center overflow-hidden",
                                                        leaderboardQuizId === art.id
                                                            ? "bg-white text-brand-primary shadow-sm font-medium"
                                                            : "text-brand-primary/40 hover:text-brand-primary/60",
                                                    )}>
                                                    <ArtifactTypeIcon type={art.artifact_type} />
                                                    <span className="truncate">{art.artifact_name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="space-y-1">
                                    {leaderboard.map((sub, idx) => {
                                        const displayGrade = leaderboardQuizId
                                            ? (sub as any)._lbGrade ?? 0
                                            : sub.grade ?? 0;
                                        const timeTaken = sub.started_at && sub.submitted_at
                                            ? Math.round((new Date(sub.submitted_at).getTime() - new Date(sub.started_at).getTime()) / 60000) : null;
                                        return (
                                            <div key={sub.id} onClick={() => handleStudentClick(sub)}
                                                className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all",
                                                    "hover:bg-brand-primary/[0.03] border border-transparent",
                                                    idx === 0 && "bg-amber-50/50 border-amber-200/30",
                                                    idx === 1 && "bg-gray-50/50 border-gray-200/30",
                                                    idx === 2 && "bg-orange-50/30 border-orange-200/20")}>
                                                <span className={cn("text-sm font-instrument w-6 text-center shrink-0",
                                                    idx === 0 ? "text-amber-600" : idx === 1 ? "text-gray-500" : idx === 2 ? "text-orange-500" : "text-brand-primary/30")}>
                                                    {idx + 1}
                                                </span>
                                                <div className="h-7 w-7 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0 text-[11px] font-medium text-brand-primary">
                                                    {(sub.student_name || "?").charAt(0).toUpperCase()}
                                                </div>
                                                <p className="text-[13px] text-brand-primary truncate flex-1 min-w-0">{sub.student_name || "Aluno"}</p>
                                                <span className="text-sm font-instrument text-brand-primary shrink-0">{displayGrade.toFixed(0)}%</span>
                                                {timeTaken !== null && !leaderboardQuizId && (
                                                    <span className="text-[10px] text-brand-primary/35 flex items-center gap-0.5 shrink-0">
                                                        <Clock className="h-2.5 w-2.5" />{timeTaken}m
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {submissions.filter((s) => {
                                        if (leaderboardQuizId) return getTaskGrade(s.submission, leaderboardQuizId) === null;
                                        return s.grade === null || s.grade === undefined;
                                    }).length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-brand-primary/5">
                                            <p className="text-[10px] text-brand-primary/30 uppercase tracking-wider mb-2 px-3">Sem nota</p>
                                            {submissions.filter((s) => {
                                                if (leaderboardQuizId) return getTaskGrade(s.submission, leaderboardQuizId) === null;
                                                return s.grade === null || s.grade === undefined;
                                            }).map((sub) => (
                                                <div key={sub.id} onClick={() => handleStudentClick(sub)}
                                                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-brand-primary/[0.03] transition-all">
                                                    <span className="w-6" />
                                                    <div className="h-7 w-7 rounded-full bg-brand-primary/5 flex items-center justify-center shrink-0 text-[11px] text-brand-primary/40">
                                                        {(sub.student_name || "?").charAt(0).toUpperCase()}
                                                    </div>
                                                    <p className="text-[13px] text-brand-primary/50 truncate flex-1">{sub.student_name || "Aluno"}</p>
                                                    <Badge className={cn("text-[10px] px-2 py-0 h-5 border-0", STUDENT_STATUS_COLORS[sub.status])}>
                                                        {STUDENT_STATUS_LABELS[sub.status] || sub.status}
                                                    </Badge>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    </div>
                                </div>
                            ) : (
                                /* ── Status view ── */
                                <div className="space-y-4">
                                    {(["submitted", "graded", "in_progress", "not_started"] as const).map((status) => {
                                        const group = statusGroups[status];
                                        if (!group?.length) return null;
                                        return (
                                            <div key={status}>
                                                <div className="flex items-center gap-2 mb-2 px-1">
                                                    <div className={cn("h-1.5 w-1.5 rounded-full",
                                                        status === "submitted" ? "bg-blue-500" : status === "graded" ? "bg-emerald-500" :
                                                        status === "in_progress" ? "bg-amber-500" : "bg-gray-300")} />
                                                    <span className="text-[10px] text-brand-primary/40 uppercase tracking-wider">
                                                        {STUDENT_STATUS_LABELS[status]} ({group.length})
                                                    </span>
                                                </div>
                                                <div className="space-y-1">
                                                    {group.map((sub) => {
                                                        const artifacts = assignment.artifacts ?? [];
                                                        return (
                                                            <Popover key={sub.id} open={quizPickerFor?.id === sub.id} onOpenChange={(open) => { if (!open) setQuizPickerFor(null); }}>
                                                            <PopoverTrigger asChild>
                                                            <div
                                                                className="group/row flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white border border-brand-primary/5 hover:border-brand-primary/10 transition-all cursor-pointer"
                                                                onClick={() => handleStudentClick(sub)}>
                                                                <div className="h-7 w-7 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0 text-[11px] font-medium text-brand-primary">
                                                                    {(sub.student_name || "?").charAt(0).toUpperCase()}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-[13px] text-brand-primary truncate">{sub.student_name || "Aluno"}</p>
                                                                    {sub.submitted_at && (
                                                                        <p className="text-[10px] text-brand-primary/40">
                                                                            {new Date(sub.submitted_at).toLocaleDateString("pt-PT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                {/* Per-task status */}
                                                                {hasMultipleArtifacts && (
                                                                    <div className="flex flex-col gap-0 shrink min-w-0">
                                                                        {artifacts.map((art) => {
                                                                            const tStatus = getTaskStatus(sub.submission, sub.progress, art.id);
                                                                            const isDone = tStatus === "completed" || tStatus === "graded";
                                                                            const tGrade = getTaskGrade(sub.submission, art.id);
                                                                            const isGradableArt = GRADABLE_ARTIFACT_TYPES.has(art.artifact_type);
                                                                            return (
                                                                                <div key={art.id}
                                                                                    className={cn("flex items-center gap-1 text-[8px] leading-[16px]",
                                                                                        isDone ? "text-emerald-600"
                                                                                            : tStatus === "in_progress" ? "text-amber-600"
                                                                                            : "text-brand-primary/30")}>
                                                                                    {isDone
                                                                                        ? <Check className="h-2 w-2 shrink-0" />
                                                                                        : <span className="h-1.5 w-1.5 rounded-full border border-current shrink-0" />}
                                                                                    <span className="shrink-0 [&_svg]:h-[10px] [&_svg]:w-[10px]"><ArtifactTypeIcon type={art.artifact_type} /></span>
                                                                                    <span className="truncate">{art.artifact_name}</span>
                                                                                    {isDone && isGradableArt && tGrade !== null && (
                                                                                        <span className="font-instrument font-medium shrink-0">{tGrade.toFixed(0)}%</span>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                                {!hasMultipleArtifacts && hasGradable && sub.grade !== null && sub.grade !== undefined && (
                                                                    <span className="text-sm font-instrument text-brand-primary shrink-0">{sub.grade.toFixed(0)}%</span>
                                                                )}
                                                                {!hasGradable && (
                                                                    <button type="button"
                                                                        onClick={(e) => { e.stopPropagation(); handleMarkDelivered(sub, sub.grade !== 100); }}
                                                                        className={cn("shrink-0 text-[10px] px-2 py-1 rounded-lg border transition-colors",
                                                                            sub.grade === 100 ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                                                                : "bg-brand-primary/[0.03] border-brand-primary/10 text-brand-primary/50 hover:text-brand-primary/70")}>
                                                                        {sub.grade === 100 ? "Entregue" : "Marcar"}
                                                                    </button>
                                                                )}
                                                                {assignment.status !== "closed" && studentCount > 1 && (
                                                                    confirmRemoveStudentId === sub.student_id ? (
                                                                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                                            <button type="button"
                                                                                onClick={() => setConfirmRemoveStudentId(null)}
                                                                                className="text-[9px] text-brand-primary/40 hover:text-brand-primary/60 px-1 py-0.5 rounded transition-colors">
                                                                                Cancelar
                                                                            </button>
                                                                            <button type="button"
                                                                                onClick={() => handleRemoveStudent(sub.student_id)}
                                                                                disabled={removingStudent}
                                                                                className="text-[9px] text-white bg-brand-error hover:bg-brand-error/90 px-1.5 py-0.5 rounded font-medium transition-colors disabled:opacity-50">
                                                                                {removingStudent ? "..." : "Remover"}
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <button type="button"
                                                                            onClick={(e) => { e.stopPropagation(); setConfirmRemoveStudentId(sub.student_id); }}
                                                                            className="shrink-0 p-1 rounded-md opacity-0 group-hover/row:opacity-100 text-brand-primary/20 hover:text-brand-error hover:bg-brand-error/5 transition-all">
                                                                            <X className="h-3 w-3" />
                                                                        </button>
                                                                    )
                                                                )}
                                                            </div>
                                                            </PopoverTrigger>
                                                            {hasMultipleQuizzes && (
                                                                <PopoverContent className="w-56 p-1.5" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
                                                                    <p className="text-[10px] text-brand-primary/40 px-2 py-1">Selecionar quiz</p>
                                                                    {quizArtifacts.map((art) => {
                                                                        const tGrade = getTaskGrade(sub.submission, art.id);
                                                                        return (
                                                                            <button key={art.id}
                                                                                onClick={() => {
                                                                                    setReviewingQuizArtifactId(art.id);
                                                                                    setReviewingSubmission(sub);
                                                                                    setQuizPickerFor(null);
                                                                                }}
                                                                                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-brand-primary/[0.04] transition-colors">
                                                                                <span className="shrink-0 text-brand-primary/50"><ArtifactTypeIcon type={art.artifact_type} /></span>
                                                                                <span className="text-[11px] text-brand-primary truncate flex-1 min-w-0">{art.artifact_name}</span>
                                                                                {tGrade !== null && (
                                                                                    <span className="text-[10px] font-instrument text-brand-primary/60 shrink-0">{tGrade.toFixed(0)}%</span>
                                                                                )}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </PopoverContent>
                                                            )}
                                                            </Popover>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            </div>
                            </AppScrollArea>
                        </div>
                    )}

                    {/* ── Insights tab ── */}
                    {panelTab === "insights" && (
                        <AppScrollArea className="flex-1 min-h-0" interactiveScrollbar>
                        <div className="px-5 py-4 space-y-4">
                            {/* ── Quiz-specific stats ── */}
                            {hasQuizzes && (
                                <>
                                    {/* Quiz selector (multi-quiz) */}
                                    {hasMultipleQuizzes && (
                                        <div className="grid gap-0.5 bg-brand-primary/[0.03] rounded-lg p-0.5" style={{ gridTemplateColumns: `repeat(${quizArtifacts.length}, minmax(0, 1fr))` }}>
                                            {quizArtifacts.map((art) => (
                                                <button
                                                    key={art.id}
                                                    onClick={() => setSelectedQuizId(art.id)}
                                                    className={cn(
                                                        "min-w-0 px-2 py-1.5 text-[10px] rounded-md transition-all flex items-center gap-1 justify-center overflow-hidden",
                                                        activeQuizArtifactId === art.id
                                                            ? "bg-white text-brand-primary shadow-sm font-medium"
                                                            : "text-brand-primary/40 hover:text-brand-primary/60",
                                                    )}
                                                >
                                                    <ArtifactTypeIcon type={art.artifact_type} />
                                                    <span className="truncate">{art.artifact_name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* 2 insight cards side by side */}
                                    <div className="grid grid-cols-2 gap-3">
                                        {/* Card 1: Class average with ring */}
                                        <div className="rounded-xl border border-brand-primary/5 bg-white p-3 flex flex-col items-center justify-center">
                                            <div className="relative h-14 w-14 mb-2">
                                                <svg className="h-14 w-14 -rotate-90" viewBox="0 0 36 36">
                                                    <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-brand-primary/8" />
                                                    <circle
                                                        cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3"
                                                        strokeDasharray={`${(avgGrade ?? 0) * 0.88} 100`}
                                                        strokeLinecap="round"
                                                        className={cn(
                                                            (avgGrade ?? 0) >= 70 ? "text-emerald-500" :
                                                            (avgGrade ?? 0) >= 50 ? "text-amber-500" : "text-brand-error",
                                                        )}
                                                    />
                                                </svg>
                                                <span className="absolute inset-0 flex items-center justify-center text-sm font-instrument font-medium text-brand-primary">
                                                    {avgGrade !== null ? `${avgGrade.toFixed(0)}%` : "—"}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-brand-primary/50 text-center">Média da turma</p>
                                        </div>

                                        {/* Card 2: Hardest questions */}
                                        <div className="rounded-xl border border-brand-primary/5 bg-white p-3">
                                            <p className="text-[10px] text-brand-primary/50 mb-2">Mais difíceis</p>
                                            {hardestQuestions.length === 0 ? (
                                                <p className="text-[10px] text-brand-primary/30">Sem dados</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {hardestQuestions.map((q) => (
                                                        <div key={q.name} className="flex items-center gap-2">
                                                            <span className="text-[10px] text-brand-primary/60 w-6 shrink-0">{q.name}</span>
                                                            <div className="flex-1 h-1.5 bg-brand-primary/5 rounded-full overflow-hidden">
                                                                <div
                                                                    className={cn(
                                                                        "h-full rounded-full",
                                                                        q.failRate >= 70 ? "bg-red-400" : q.failRate >= 40 ? "bg-amber-400" : "bg-emerald-400",
                                                                    )}
                                                                    style={{ width: `${q.failRate}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-[10px] text-brand-primary/50 w-8 text-right shrink-0">
                                                                {q.failRate}%
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Full bar chart */}
                            {questionStats.length > 0 && (
                                <div>
                                    <h4 className="text-[10px] font-medium text-brand-primary/40 uppercase tracking-wider mb-2">
                                        Taxa de erro por pergunta
                                    </h4>
                                    <div className="h-36 rounded-xl border border-brand-primary/5 bg-white p-3">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={questionStats} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                                                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "rgba(0,0,0,0.4)" }} tickLine={false} axisLine={false} />
                                                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "rgba(0,0,0,0.4)" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                                                <Tooltip
                                                    formatter={(value) => [`${Number(value)}% erros`]}
                                                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid rgba(0,0,0,0.08)" }}
                                                />
                                                <Bar dataKey="failRate" radius={[3, 3, 0, 0]}>
                                                    {questionStats.map((entry, index) => (
                                                        <Cell
                                                            key={index}
                                                            fill={entry.failRate >= 70 ? "#ef4444" : entry.failRate >= 40 ? "#f97316" : "#22c55e"}
                                                            fillOpacity={0.75}
                                                        />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}
                        </div>
                        </AppScrollArea>
                    )}

                    {/* ── Questions tab — slide thumbnails ── */}
                    {panelTab === "questions" && hasQuizzes && (
                        <div className="flex flex-col flex-1 min-h-0">
                            {/* Fixed: quiz selector */}
                            {hasMultipleQuizzes && (
                                <div className="shrink-0 px-5 pt-4 pb-2">
                                <div className="grid gap-0.5 bg-brand-primary/[0.03] rounded-lg p-0.5" style={{ gridTemplateColumns: `repeat(${quizArtifacts.length}, minmax(0, 1fr))` }}>
                                    {quizArtifacts.map((art) => (
                                        <button
                                            key={art.id}
                                            onClick={() => setSelectedQuizId(art.id)}
                                            className={cn(
                                                "min-w-0 px-2 py-1.5 text-[10px] rounded-md transition-all flex items-center gap-1 justify-center overflow-hidden",
                                                activeQuizArtifactId === art.id
                                                    ? "bg-white text-brand-primary shadow-sm font-medium"
                                                    : "text-brand-primary/40 hover:text-brand-primary/60",
                                            )}
                                        >
                                            <ArtifactTypeIcon type={art.artifact_type} />
                                            <span className="truncate">{art.artifact_name}</span>
                                        </button>
                                    ))}
                                </div>
                                </div>
                            )}
                            {/* Scrollable: questions grid */}
                            <AppScrollArea className="flex-1 min-h-0" interactiveScrollbar>
                            <div className="px-5 pb-4 pt-2">
                            {questions.length === 0 ? (
                                <p className="text-sm text-brand-primary/40 text-center py-8">
                                    Sem perguntas
                                </p>
                            ) : (
                                <div className="grid grid-cols-2 gap-3">
                                    {questions.map((q, idx) => {
                                        const stats = questionStats[idx];
                                        const c = q.content as Record<string, any>;
                                        const qType = q.type as string;
                                        const correctRate = stats ? 100 - stats.failRate : null;

                                        return (
                                            <div
                                                key={q.id}
                                                className="group cursor-pointer"
                                                onClick={() => setSelectedQuestionIdx(idx)}
                                            >
                                                {/* Slide number + accuracy */}
                                                <div className="flex items-center justify-between mb-1 px-0.5">
                                                    <span className="text-[10px] font-medium text-brand-primary/40">
                                                        {idx + 1}
                                                    </span>
                                                    {correctRate !== null && (
                                                        <span className={cn(
                                                            "text-[9px] font-medium",
                                                            correctRate >= 70 ? "text-emerald-500" :
                                                            correctRate >= 40 ? "text-amber-500" : "text-red-500",
                                                        )}>
                                                            {correctRate}%
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Slide thumbnail */}
                                                <div className="rounded-xl border-2 border-brand-primary/10 bg-white overflow-hidden h-[90px] p-2 hover:border-brand-primary/25 hover:shadow-sm transition-all">
                                                    <div className="w-full h-full flex flex-col gap-[5px]">
                                                        {/* Question text */}
                                                        <p className="text-[7px] leading-[1.3] font-semibold text-brand-primary/75 line-clamp-2 shrink-0">
                                                            {c?.question || c?.text || <span className="text-brand-primary/25 italic">Sem enunciado</span>}
                                                        </p>

                                                        {/* Type-specific preview */}
                                                        <div className="flex-1 min-h-0 overflow-hidden">
                                                            {/* Multiple choice / Multiple response */}
                                                            {(qType === "multiple_choice" || qType === "multiple_response") && Array.isArray(c?.options) && (
                                                                <div className="space-y-[3px]">
                                                                    {(c.options as { id?: string; text?: string; is_correct?: boolean }[]).slice(0, 4).map((opt, i) => (
                                                                        <div key={opt.id ?? i} className="flex items-center gap-[4px]">
                                                                            <div className={cn(
                                                                                "shrink-0 border",
                                                                                qType === "multiple_response" ? "w-[6px] h-[6px] rounded-[1.5px]" : "w-[6px] h-[6px] rounded-full",
                                                                                opt.is_correct ? "bg-emerald-400 border-emerald-400" : "bg-white border-brand-primary/20",
                                                                            )} />
                                                                            <span className="text-[6px] leading-none text-brand-primary/50 truncate">{opt.text}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {/* True / False */}
                                                            {qType === "true_false" && (
                                                                <div className="flex gap-[4px]">
                                                                    <div className={cn(
                                                                        "px-[5px] py-[2px] rounded-[3px] text-[6px] font-bold",
                                                                        c?.answer === true ? "bg-emerald-100 text-emerald-600 ring-1 ring-emerald-300" : "bg-brand-primary/5 text-brand-primary/35",
                                                                    )}>V</div>
                                                                    <div className={cn(
                                                                        "px-[5px] py-[2px] rounded-[3px] text-[6px] font-bold",
                                                                        c?.answer === false ? "bg-red-100 text-red-500 ring-1 ring-red-300" : "bg-brand-primary/5 text-brand-primary/35",
                                                                    )}>F</div>
                                                                </div>
                                                            )}

                                                            {/* Fill in the blank */}
                                                            {qType === "fill_blank" && Array.isArray(c?.options) && (
                                                                <div className="flex flex-wrap gap-[3px]">
                                                                    {(c.options as { id?: string; text?: string }[]).slice(0, 6).map((opt, i) => (
                                                                        <span key={opt.id ?? i} className="inline-flex items-center px-[4px] py-[1px] rounded-[3px] text-[5.5px] leading-none bg-brand-accent/10 text-brand-accent/70 border border-brand-accent/20">
                                                                            {opt.text}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {/* Short answer */}
                                                            {qType === "short_answer" && (
                                                                <div className="mt-[2px] rounded-[3px] border border-brand-primary/15 bg-brand-primary/3 h-[10px] w-full flex items-center px-[4px]">
                                                                    {Array.isArray(c?.accepted_answers) && c.accepted_answers[0] ? (
                                                                        <span className="text-[5.5px] text-brand-primary/40 truncate">{c.accepted_answers[0]}</span>
                                                                    ) : (
                                                                        <div className="h-[1px] w-8 bg-brand-primary/15 rounded" />
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Ordering */}
                                                            {qType === "ordering" && Array.isArray(c?.items) && (
                                                                <div className="space-y-[3px]">
                                                                    {(c.items as { id?: string; text?: string }[]).slice(0, 3).map((item, i) => (
                                                                        <div key={item.id ?? i} className="flex items-center gap-[3px]">
                                                                            <span className="text-[5.5px] font-bold text-brand-primary/30 w-[7px] shrink-0 text-right">{i + 1}.</span>
                                                                            <div className="flex-1 h-[6px] rounded-[2px] bg-brand-primary/5 border border-brand-primary/8 overflow-hidden flex items-center px-[3px]">
                                                                                <span className="text-[5px] text-brand-primary/40 truncate">{item.text}</span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {/* Matching */}
                                                            {qType === "matching" && Array.isArray(c?.left_items) && (
                                                                <div className="space-y-[3px]">
                                                                    {(c.left_items as { id?: string; text?: string }[]).slice(0, 3).map((item, i) => (
                                                                        <div key={item.id ?? i} className="flex items-center gap-[3px]">
                                                                            <div className="flex-1 h-[6px] rounded-[2px] bg-brand-primary/5 border border-brand-primary/8 overflow-hidden flex items-center px-[3px]">
                                                                                <span className="text-[5px] text-brand-primary/40 truncate">{item.text}</span>
                                                                            </div>
                                                                            <span className="text-[5.5px] text-brand-primary/20 shrink-0">{"\u2192"}</span>
                                                                            <div className="flex-1 h-[6px] rounded-[2px] bg-brand-primary/5 border border-brand-primary/8" />
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Accuracy bar under slide */}
                                                {stats && stats.total > 0 && (
                                                    <div className="mt-1 h-1 bg-brand-primary/5 rounded-full overflow-hidden mx-1">
                                                        <div
                                                            className={cn(
                                                                "h-full rounded-full",
                                                                stats.failRate >= 70 ? "bg-red-400" : stats.failRate >= 40 ? "bg-amber-400" : "bg-emerald-400",
                                                            )}
                                                            style={{ width: `${100 - stats.failRate}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            </div>
                            </AppScrollArea>
                        </div>
                    )}
            </div>

            {/* ── Student submission dialog ── */}
            {reviewingSubmission && (
                <StudentSubmissionDialog
                    onClose={() => { setReviewingSubmission(null); setReviewingQuizArtifactId(null); }}
                    assignment={assignment}
                    studentAssignment={reviewingSubmission}
                    quizArtifactId={reviewingQuizArtifactId ?? activeQuizArtifactId}
                    canGrade
                    onGraded={handleGraded}
                />
            )}

            {/* ── Question detail floating dialog ── */}
            {selectedQuestionIdx !== null && questions.length > 0 && (
                <QuestionDetailDialog
                    questions={questions}
                    initialIndex={selectedQuestionIdx}
                    allStats={questionStats}
                    submissions={submissions}
                    onClose={() => setSelectedQuestionIdx(null)}
                />
            )}
        </div>
    );
}

/* ─── Question Detail Floating Dialog ────────────────────────────────────── */

interface QuestionDetailDialogProps {
    questions: QuizQuestion[];
    initialIndex: number;
    allStats: { name: string; failRate: number; total: number }[];
    submissions: StudentAssignment[];
    onClose: () => void;
}

function QuestionDetailDialog({
    questions,
    initialIndex,
    allStats,
    submissions,
    onClose,
}: QuestionDetailDialogProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const question = questions[currentIndex];
    const stats = allStats[currentIndex];
    const correctRate = stats ? 100 - stats.failRate : null;

    // Per-student results for current question
    const studentResults = useMemo(() => {
        if (!question) return [];
        const results: { name: string; isCorrect: boolean; answer?: string }[] = [];
        for (const sub of submissions) {
            const grading = (sub.submission as Record<string, any>)?.grading;
            if (!grading?.results) continue;
            const result = (grading.results as { question_id: string; is_correct: boolean; student_answer?: string }[])
                .find((r) => r.question_id === question.id);
            if (!result) continue;
            results.push({
                name: sub.student_name || "Aluno",
                isCorrect: result.is_correct,
                answer: result.student_answer,
            });
        }
        return results;
    }, [submissions, question]);

    const correctCount = studentResults.filter((r) => r.isCorrect).length;
    const wrongCount = studentResults.filter((r) => !r.isCorrect).length;

    // Synthesize the "correct answer" so review components render the solution in green
    const correctAnswer = useMemo(() => {
        if (!question) return undefined;
        const c = question.content || {};
        switch (question.type) {
            case "multiple_choice":
                return c.correct_answer || c.solution || undefined;
            case "multiple_response":
                return Array.isArray(c.correct_answers) && c.correct_answers.length
                    ? c.correct_answers
                    : Array.isArray(c.solution) ? c.solution : undefined;
            case "true_false":
                return c.correct_answer ?? undefined;
            case "ordering": {
                // Pass correctOrder as the answer so all items show green
                return Array.isArray(c.correct_order) ? c.correct_order : undefined;
            }
            case "matching": {
                // Build { leftId: rightId } from correct_pairs
                const pairs: [string, string][] = Array.isArray(c.correct_pairs) ? c.correct_pairs : [];
                if (!pairs.length) return undefined;
                const map: Record<string, string> = {};
                for (const p of pairs) {
                    if (Array.isArray(p) && p.length === 2) map[String(p[0])] = String(p[1]);
                }
                return map;
            }
            case "fill_blank": {
                // Build { blankId: correct_answer } for each blank
                const blanks: { id: string; correct_answer: string }[] = Array.isArray(c.blanks) ? c.blanks : [];
                if (!blanks.length) return undefined;
                const map: Record<string, string> = {};
                for (const b of blanks) {
                    if (b.id && b.correct_answer) map[b.id] = b.correct_answer;
                }
                return map;
            }
            case "short_answer":
                return Array.isArray(c.correct_answers) && c.correct_answers.length
                    ? c.correct_answers[0] : undefined;
            default:
                return undefined;
        }
    }, [question]);

    if (!question) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />

            {/* Dialog — wide rectangular */}
            <div className="relative bg-white rounded-2xl shadow-2xl border border-brand-primary/10 w-full max-w-[920px] max-h-[70vh] flex overflow-hidden animate-fade-in-up">
                {/* Left — question content */}
                <div className="flex-1 min-w-0 flex flex-col h-full">
                    {/* Top bar — question counter + close */}
                    <div className="shrink-0 flex items-center justify-between px-6 pt-4 pb-3">
                        <span className="text-xs text-brand-primary/40 font-medium">
                            {currentIndex + 1} / {questions.length}
                        </span>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-brand-primary/5 transition-colors"
                        >
                            <X className="h-4 w-4 text-brand-primary/40" />
                        </button>
                    </div>

                    {/* Question */}
                    <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4">
                        <QuizQuestionRenderer
                            question={question}
                            mode="review"
                            answer={correctAnswer}
                            questionNumber={currentIndex + 1}
                            skipHeader={question.type === "fill_blank"}
                        />
                    </div>

                    {/* Prev / Next */}
                    {questions.length > 1 && (
                        <div className="shrink-0 px-6 pb-4 pt-2 flex items-center justify-between border-t border-brand-primary/5">
                            <button
                                type="button"
                                onClick={() => setCurrentIndex((i) => i - 1)}
                                disabled={currentIndex === 0}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all",
                                    currentIndex === 0
                                        ? "text-brand-primary/20 cursor-not-allowed"
                                        : "text-brand-primary/60 hover:bg-brand-primary/5",
                                )}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Anterior
                            </button>
                            <button
                                type="button"
                                onClick={() => setCurrentIndex((i) => i + 1)}
                                disabled={currentIndex >= questions.length - 1}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all",
                                    currentIndex >= questions.length - 1
                                        ? "text-brand-primary/20 cursor-not-allowed"
                                        : "text-brand-primary/60 hover:bg-brand-primary/5",
                                )}
                            >
                                Seguinte
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Right — insights sidebar */}
                <div className="w-[240px] shrink-0 border-l border-brand-primary/5 bg-brand-bg/40 flex flex-col">
                    {/* Accuracy header */}
                    <div className="shrink-0 p-4 border-b border-brand-primary/5">
                        <div className="flex items-center justify-center mb-3">
                            <div className="relative h-16 w-16">
                                <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
                                    <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-brand-primary/8" />
                                    <circle
                                        cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3"
                                        strokeDasharray={`${(correctRate ?? 0) * 0.88} 100`}
                                        strokeLinecap="round"
                                        className={cn(
                                            (correctRate ?? 0) >= 70 ? "text-emerald-500" :
                                            (correctRate ?? 0) >= 40 ? "text-amber-500" : "text-red-500",
                                        )}
                                    />
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center text-base font-instrument font-medium text-brand-primary">
                                    {correctRate !== null ? `${Math.round(correctRate)}%` : "—"}
                                </span>
                            </div>
                        </div>
                        <p className="text-[10px] text-brand-primary/40 text-center uppercase tracking-wider">
                            Taxa de acerto
                        </p>

                        {/* Correct / wrong counts */}
                        <div className="flex items-center justify-center gap-4 mt-3">
                            <div className="flex items-center gap-1.5">
                                <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center">
                                    <Check className="h-3 w-3 text-emerald-600" />
                                </div>
                                <span className="text-xs font-medium text-brand-primary">{correctCount}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="h-5 w-5 rounded-full bg-red-100 flex items-center justify-center">
                                    <X className="h-3 w-3 text-red-500" />
                                </div>
                                <span className="text-xs font-medium text-brand-primary">{wrongCount}</span>
                            </div>
                        </div>
                    </div>

                    {/* Student results list */}
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        <div className="p-3">
                            <p className="text-[10px] text-brand-primary/40 uppercase tracking-wider font-medium mb-2 px-1">
                                Alunos ({studentResults.length})
                            </p>

                            {studentResults.length === 0 ? (
                                <p className="text-[11px] text-brand-primary/30 text-center py-6">
                                    Sem respostas
                                </p>
                            ) : (
                                <div className="space-y-0.5">
                                    {studentResults.map((r, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/60 transition-colors"
                                        >
                                            <div className={cn(
                                                "h-4 w-4 rounded-full flex items-center justify-center shrink-0",
                                                r.isCorrect ? "bg-emerald-100" : "bg-red-100",
                                            )}>
                                                {r.isCorrect
                                                    ? <Check className="h-2.5 w-2.5 text-emerald-600" />
                                                    : <X className="h-2.5 w-2.5 text-red-500" />
                                                }
                                            </div>
                                            <span className="text-[11px] text-brand-primary flex-1 min-w-0 truncate">
                                                {r.name}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
