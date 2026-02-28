"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Send, Trophy, X, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { StudentAssignment, updateStudentAssignment } from "@/lib/assignments";
import { fetchArtifact } from "@/lib/artifacts";
import {
    evaluateQuizAttempt,
    extractQuizAnswers,
    extractQuizQuestionIds,
    fetchQuizQuestions,
    migrateAnswersToNewIds,
    normalizeQuestionForEditor,
    QuizQuestion,
} from "@/lib/quiz";
import { QuizQuestionRenderer } from "@/components/quiz/QuizQuestionRenderer";
import { QuestionSidebar, QuestionStripMobile } from "@/components/docs/quiz/QuestionSidebar";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

const slideVariants = {
    enter: (direction: number) => ({ x: direction > 0 ? 120 : -120, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({ x: direction > 0 ? -120 : 120, opacity: 0 }),
};

/* Fade-only variant for drag-based question types (ordering, fill_blank) —
   x-transforms on the parent break Reorder/drag coordinate calculations */
const fadeVariants = {
    enter: () => ({ opacity: 0 }),
    center: { opacity: 1 },
    exit: () => ({ opacity: 0 }),
};

interface StudentQuizFullPageProps {
    studentAssignment: StudentAssignment;
    onClose: () => void;
    onUpdated: (sa: StudentAssignment) => void;
}

type Phase = "taking" | "submitted";

export function StudentQuizFullPage({
    studentAssignment,
    onClose,
    onUpdated,
}: StudentQuizFullPageProps) {
    const [loading, setLoading] = useState(false);
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [submitting, setSubmitting] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [direction, setDirection] = useState(0);
    const [phase, setPhase] = useState<Phase>(
        studentAssignment.status === "submitted" || studentAssignment.status === "graded"
            ? "submitted"
            : "taking",
    );
    const [saveIndicator, setSaveIndicator] = useState<"" | "saving" | "saved" | "error">("");

    const lastSavedRef = useRef<string>("");
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const answersRef = useRef(answers);
    answersRef.current = answers;

    const isDeadlinePassed = studentAssignment.assignment?.due_date
        ? new Date(studentAssignment.assignment.due_date) < new Date()
        : false;

    const canEdit =
        !isDeadlinePassed &&
        studentAssignment.status !== "submitted" &&
        studentAssignment.status !== "graded";

    const questionIds = useMemo(() => questions.map((q) => q.id), [questions]);
    const currentQuestion = questions[currentIndex] || null;

    useEffect(() => {
        if (studentAssignment.status === "submitted" || studentAssignment.status === "graded") {
            setPhase("submitted");
        }
    }, [studentAssignment.status]);

    // Load quiz
    useEffect(() => {
        if (!studentAssignment?.id) return;
        const artifactId = studentAssignment.assignment?.artifact_id;
        if (!artifactId) return;

        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setCurrentIndex(0);
            try {
                const art = await fetchArtifact(artifactId);
                if (cancelled) return;
                if (art.artifact_type !== "quiz") { setQuestions([]); return; }

                const ids = extractQuizQuestionIds(art.content);
                if (!ids.length) { setQuestions([]); return; }

                const bank = await fetchQuizQuestions({ ids });
                if (cancelled) return;
                const byId = new Map(bank.map((q) => [q.id, q]));
                const rawById = new Map(bank.map((q) => [q.id, q]));
                const normalized = (ids.map((id) => byId.get(id)).filter(Boolean) as QuizQuestion[])
                    .map(normalizeQuestionForEditor);
                setQuestions(normalized);

                const init = extractQuizAnswers(
                    studentAssignment.submission || studentAssignment.progress || { answers: {} },
                );
                // Migrate legacy answers with old random UUIDs to deterministic IDs
                const migratedInit = migrateAnswersToNewIds(normalized, init, rawById);
                setAnswers(migratedInit);
                lastSavedRef.current = JSON.stringify(migratedInit);
            } catch (err) {
                if (cancelled) return;
                console.error(err);
                toast.error("Não foi possível carregar este quiz.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
            if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        };
    }, [studentAssignment?.id]);

    const navigateTo = useCallback(
        (index: number) => {
            if (index < 0 || index >= questions.length) return;
            setDirection(index > currentIndex ? 1 : -1);
            setCurrentIndex(index);
        },
        [currentIndex, questions.length],
    );

    // Keyboard navigation
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                e.target instanceof HTMLSelectElement
            ) return;
            if (e.key === "ArrowLeft") { e.preventDefault(); navigateTo(currentIndex - 1); }
            else if (e.key === "ArrowRight") { e.preventDefault(); navigateTo(currentIndex + 1); }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [currentIndex, navigateTo]);

    // Autosave
    const triggerAutosave = useCallback(() => {
        if (!canEdit) return;
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = setTimeout(async () => {
            const current = answersRef.current;
            const serialized = JSON.stringify(current);
            if (serialized === lastSavedRef.current) return;
            setSaveIndicator("saving");
            try {
                await updateStudentAssignment(studentAssignment.id, {
                    progress: { answers: current },
                    status: "in_progress",
                });
                lastSavedRef.current = serialized;
                setSaveIndicator("saved");
                setTimeout(() => setSaveIndicator(""), 2000);
            } catch (err: any) {
                if ((err?.message || "").includes("409")) return;
                setSaveIndicator("error");
            }
        }, 2500);
    }, [studentAssignment, canEdit]);

    const handleAnswerChange = useCallback(
        (questionId: string, value: any) => {
            setAnswers((prev) => ({ ...prev, [questionId]: value }));
            triggerAutosave();
        },
        [triggerAutosave],
    );

    const evaluation = useMemo(
        () => evaluateQuizAttempt(questions, { answers }),
        [questions, answers],
    );
    const resultMap = useMemo(
        () => new Map((evaluation?.results || []).map((r) => [r.question_id, r.is_correct])),
        [evaluation],
    );
    const answeredSet = useMemo(() => {
        const set = new Set<string>();
        for (const q of questions) {
            const a = answers[q.id];
            if (a !== undefined && a !== null && a !== "") {
                if (Array.isArray(a) ? a.length > 0 : typeof a === "object" ? Object.keys(a).length > 0 : true)
                    set.add(q.id);
            }
        }
        return set;
    }, [questions, answers]);

    const handleSubmitConfirm = async () => {
        if (!canEdit) return;
        if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; }
        setSubmitting(true);
        try {
            const updated = await updateStudentAssignment(studentAssignment.id, {
                submission: { answers },
                status: "submitted",
            });
            onUpdated(updated);
            lastSavedRef.current = JSON.stringify(answers);
            setPhase("submitted");
            setCurrentIndex(0);
            toast.success("Quiz submetido com sucesso!");
        } catch {
            toast.error("Não foi possível submeter o quiz.");
        } finally {
            setSubmitting(false);
        }
    };

    const assignment = studentAssignment.assignment;

    return (
        <>
            <div className="fixed inset-0 z-50 bg-brand-bg flex flex-col">

                {/* Header */}
                <div className="sticky top-0 z-30 border-b border-brand-primary/8">
                    <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
                        {/* Left: close + title + save */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <button
                                type="button"
                                onClick={onClose}
                                className="shrink-0 p-2 -ml-2 rounded-xl text-brand-primary/50 hover:text-brand-primary hover:bg-brand-primary/5 transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                            <h1 className="text-lg font-instrument text-brand-primary truncate">
                                {assignment?.title || "Quiz"}
                            </h1>
                            {canEdit && saveIndicator && (
                                <span className="shrink-0 text-[10px] text-brand-primary/40">
                                    {saveIndicator === "saving" && "A guardar..."}
                                    {saveIndicator === "saved" && "Guardado"}
                                    {saveIndicator === "error" && "Erro ao guardar"}
                                </span>
                            )}
                        </div>

                        {/* Right: submit (taking phase only) */}
                        {phase === "taking" && canEdit && questions.length > 0 && (
                            <Button
                                onClick={() => setConfirmOpen(true)}
                                disabled={submitting || loading}
                                size="sm"
                                className="gap-1.5 shrink-0"
                            >
                                {submitting ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Send className="h-3.5 w-3.5" />
                                )}
                                Submeter
                            </Button>
                        )}
                    </div>
                </div>

                {/* Deadline expired banner */}
                {isDeadlinePassed && phase === "taking" && (
                    <div className="shrink-0 px-4 sm:px-6 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2">
                        <span className="text-sm text-red-600 font-medium">
                            O prazo desta tarefa expirou. Já não é possível submeter.
                        </span>
                    </div>
                )}

                {/* Score banner — review mode */}
                {phase === "submitted" && !loading && questions.length > 0 && (
                    <div className="shrink-0 px-4 sm:px-6 lg:px-12 py-3 border-b border-brand-primary/5 bg-brand-bg flex flex-wrap items-center gap-3">
                        <div className={cn(
                            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                            evaluation && evaluation.score >= 50 ? "bg-emerald-50" : "bg-red-50",
                        )}>
                            <Trophy className={cn(
                                "h-5 w-5",
                                evaluation && evaluation.score >= 50 ? "text-emerald-500" : "text-red-400",
                            )} />
                        </div>
                        <div>
                            <p className="text-lg font-instrument text-brand-primary leading-none">
                                {evaluation?.score.toFixed(0) ?? 0}%
                            </p>
                            <p className="text-xs text-brand-primary/40 mt-0.5">
                                {evaluation?.correct_questions ?? 0} de {evaluation?.total_questions ?? 0} corretas
                            </p>
                        </div>
                        {studentAssignment.grade !== null && studentAssignment.grade !== undefined && (
                            <div className="pl-3 sm:ml-1 sm:pl-4 border-l border-brand-primary/8">
                                <p className="text-xs text-brand-primary/40">Nota do professor</p>
                                <p className="text-lg font-instrument text-brand-primary">
                                    {studentAssignment.grade.toFixed(1)}%
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Loading */}
                {loading && (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-brand-primary/30" />
                    </div>
                )}

                {/* Empty */}
                {!loading && questions.length === 0 && (
                    <div className="flex-1 flex items-center justify-center text-sm text-brand-primary/40">
                        Este quiz ainda não tem perguntas.
                    </div>
                )}

                {/* Questions */}
                {!loading && questions.length > 0 && (
                    <>
                        {/* Mobile strip */}
                        <div className="lg:hidden">
                            <QuestionStripMobile
                                questions={questions}
                                currentIndex={currentIndex}
                                onNavigate={navigateTo}
                            />
                        </div>

                        <div className="flex-1 min-h-0 flex">
                            {/* Main content */}
                            <div className="flex-1 min-w-0 flex flex-col min-h-0">
                                <div className="flex-1 min-h-0 overflow-y-auto">
                                    <AnimatePresence mode="wait" custom={direction}>
                                        <motion.div
                                            key={currentIndex}
                                            custom={direction}
                                            variants={
                                                currentQuestion?.type === "ordering" || currentQuestion?.type === "fill_blank" || currentQuestion?.type === "matching"
                                                    ? fadeVariants
                                                    : slideVariants
                                            }
                                            initial="enter"
                                            animate="center"
                                            exit="exit"
                                            transition={{ duration: 0.2, ease: "easeInOut" }}
                                            className="min-h-full flex flex-col"
                                        >
                                            {currentQuestion && (
                                                <>
                                                    {/* Question header — fill_blank renders its own sentence inline so header is empty */}
                                                    <div className="shrink-0 px-4 sm:px-6 lg:px-12 pt-5 pb-3">
                                                        {currentQuestion.type !== "fill_blank" && (
                                                            <>
                                                                <p className={cn(
                                                                    "font-semibold text-brand-primary leading-snug mb-0.5",
                                                                    (() => {
                                                                        const len = String(currentQuestion.content.question || "").length;
                                                                        if (len <= 60) return "text-2xl sm:text-3xl";
                                                                        if (len <= 130) return "text-xl sm:text-2xl";
                                                                        return "text-lg sm:text-xl";
                                                                    })(),
                                                                )}>
                                                                    {String(currentQuestion.content.question || "")}
                                                                </p>
                                                                <p className="text-xs text-brand-primary/35 mb-0.5">
                                                                    {currentQuestion.content.tip || (
                                                                        currentQuestion.type === "multiple_choice" ? "Seleciona a opção correta." :
                                                                        currentQuestion.type === "multiple_response" ? "Seleciona todas as opções corretas." :
                                                                        currentQuestion.type === "ordering" ? "Arrasta para ordenar corretamente." :
                                                                        currentQuestion.type === "matching" ? "Liga cada item ao seu par." :
                                                                        null
                                                                    )}
                                                                </p>
                                                            </>
                                                        )}
                                                    </div>
                                                    {/* Divider — always shown, same as teacher */}
                                                    <div className="shrink-0 border-t border-brand-primary/5 mx-4 sm:mx-6 lg:mx-12 mb-4" />

                                                    {/* Body: renderer + optional image */}
                                                    <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 px-4 sm:px-6 lg:px-12 pb-5">
                                                        <div className="flex-1 min-w-0">
                                                            <QuizQuestionRenderer
                                                                question={currentQuestion}
                                                                mode={phase === "taking" ? "student" : "review"}
                                                                answer={answers[currentQuestion.id]}
                                                                onAnswerChange={
                                                                    phase === "taking"
                                                                        ? (value) => handleAnswerChange(currentQuestion.id, value)
                                                                        : undefined
                                                                }
                                                                isCorrect={
                                                                    phase === "submitted"
                                                                        ? (resultMap.get(currentQuestion.id) ?? null)
                                                                        : undefined
                                                                }
                                                                questionNumber={currentIndex + 1}
                                                                skipHeader
                                                            />
                                                        </div>

                                                        {/* Question image — stacks above on mobile, side panel on desktop */}
                                                        {currentQuestion.content.image_url && (
                                                            <QuestionImageDisplay
                                                                imageUrl={currentQuestion.content.image_url}
                                                            />
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </motion.div>
                                    </AnimatePresence>
                                </div>

                                {/* Bottom navigation */}
                                <div className="shrink-0 border-t border-brand-primary/5 bg-brand-bg">
                                    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
                                        <button
                                            type="button"
                                            onClick={() => navigateTo(currentIndex - 1)}
                                            disabled={currentIndex === 0}
                                            className={cn(
                                                "flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
                                                currentIndex === 0
                                                    ? "text-brand-primary/20 cursor-not-allowed"
                                                    : "text-brand-primary/60 hover:bg-brand-primary/5 active:scale-[0.98]",
                                            )}
                                        >
                                            Anterior
                                        </button>
                                        <span className="text-xs font-medium text-brand-primary/40">
                                            {currentIndex + 1} / {questions.length}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => navigateTo(currentIndex + 1)}
                                            disabled={currentIndex >= questions.length - 1}
                                            className={cn(
                                                "flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
                                                currentIndex >= questions.length - 1
                                                    ? "text-brand-primary/20 cursor-not-allowed"
                                                    : "text-brand-primary/60 hover:bg-brand-primary/5 active:scale-[0.98]",
                                            )}
                                        >
                                            Seguinte
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Desktop sidebar — read-only (no add button) */}
                            <div className="hidden lg:block">
                                <QuestionSidebar
                                    questions={questions}
                                    questionIds={questionIds}
                                    currentIndex={currentIndex}
                                    onNavigate={navigateTo}
                                    onReorder={() => {}}
                                />
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Submit confirmation */}
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Submeter quiz?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Depois de submeter não poderás alterar as tuas respostas.{" "}
                            {answeredSet.size < questions.length && (
                                <span className="font-medium text-amber-600">
                                    Tens {questions.length - answeredSet.size} pergunta(s) sem resposta.
                                </span>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleSubmitConfirm} disabled={submitting}>
                            {submitting ? "A submeter..." : "Submeter"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

/* ─── Read-only image display ─────────────────────────────────────────────── */
function QuestionImageDisplay({ imageUrl }: { imageUrl: string }) {
    const [lightboxOpen, setLightboxOpen] = useState(false);
    return (
        <div className="w-full lg:w-52 xl:w-64 lg:shrink-0 lg:self-start order-first lg:order-last">
            <div
                className="group relative rounded-2xl overflow-hidden border border-brand-primary/10 cursor-zoom-in"
                onClick={() => setLightboxOpen(true)}
            >
                <img src={imageUrl} alt="Imagem da pergunta" className="w-full max-h-52 sm:max-h-64 lg:max-h-none object-contain hover:opacity-95 transition-opacity" />
                <div className="absolute bottom-2 right-2 p-1.5 bg-black/30 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    <ZoomIn className="h-3.5 w-3.5 text-white" />
                </div>
            </div>
            {lightboxOpen && (
                <div
                    className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setLightboxOpen(false)}
                >
                    <button
                        type="button"
                        onClick={() => setLightboxOpen(false)}
                        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                    <img
                        src={imageUrl}
                        alt="Imagem da pergunta"
                        className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
}
