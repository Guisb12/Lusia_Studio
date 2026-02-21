"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Send, Trophy } from "lucide-react";
import { toast } from "sonner";
import { StudentAssignment, updateStudentAssignment } from "@/lib/assignments";
import { fetchArtifact } from "@/lib/artifacts";
import {
    evaluateQuizAttempt,
    extractQuizAnswers,
    extractQuizQuestionIds,
    fetchQuizQuestions,
    QuizQuestion,
} from "@/lib/quiz";
import { QuizQuestionRenderer } from "@/components/quiz/QuizQuestionRenderer";
import { QuizPagination } from "@/components/quiz/QuizPagination";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface StudentQuizAttemptDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    studentAssignment: StudentAssignment | null;
    onUpdated: (next: StudentAssignment) => void;
}

type Phase = "taking" | "submitted";

export function StudentQuizAttemptDialog({
    open,
    onOpenChange,
    studentAssignment,
    onUpdated,
}: StudentQuizAttemptDialogProps) {
    const [loading, setLoading] = useState(false);
    const [isQuiz, setIsQuiz] = useState(false);
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [submitting, setSubmitting] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [phase, setPhase] = useState<Phase>("taking");
    const [saveIndicator, setSaveIndicator] = useState<"" | "saving" | "saved" | "error">("");

    // Ref-based autosave to avoid re-render loops
    const lastSavedRef = useRef<string>("");
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const answersRef = useRef(answers);
    answersRef.current = answers;

    const canEdit =
        !!studentAssignment &&
        studentAssignment.status !== "submitted" &&
        studentAssignment.status !== "graded";

    // Determine phase from assignment status
    useEffect(() => {
        if (!studentAssignment) return;
        if (studentAssignment.status === "submitted" || studentAssignment.status === "graded") {
            setPhase("submitted");
        } else {
            setPhase("taking");
        }
    }, [studentAssignment]);

    // Load quiz data
    useEffect(() => {
        if (!open || !studentAssignment) return;
        const artifactId = studentAssignment.assignment?.artifact_id;
        if (!artifactId) return;

        const load = async () => {
            setLoading(true);
            setCurrentIndex(0);

            try {
                const artifact = await fetchArtifact(artifactId);
                if (artifact.artifact_type !== "quiz") {
                    setIsQuiz(false);
                    setQuestions([]);
                    setAnswers({});
                    lastSavedRef.current = "";
                    return;
                }
                setIsQuiz(true);

                const ids = extractQuizQuestionIds(artifact.content);
                if (!ids.length) {
                    setQuestions([]);
                    setAnswers({});
                    lastSavedRef.current = "";
                    return;
                }

                const bankQuestions = await fetchQuizQuestions({ ids });
                const byId = new Map(bankQuestions.map((q) => [q.id, q]));
                const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as QuizQuestion[];
                setQuestions(ordered);

                const initialAnswers = extractQuizAnswers(
                    studentAssignment.submission || studentAssignment.progress || { answers: {} },
                );
                setAnswers(initialAnswers);
                lastSavedRef.current = JSON.stringify(initialAnswers);
            } catch (error) {
                console.error(error);
                setIsQuiz(false);
                setQuestions([]);
                setAnswers({});
                lastSavedRef.current = "";
                toast.error("Não foi possível carregar este quiz.");
            } finally {
                setLoading(false);
            }
        };

        load();

        return () => {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current);
                autosaveTimerRef.current = null;
            }
        };
    }, [open, studentAssignment]);

    // Autosave with 2.5s debounce using refs
    const triggerAutosave = useCallback(() => {
        if (!studentAssignment || !canEdit) return;

        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current);
        }

        autosaveTimerRef.current = setTimeout(async () => {
            const currentAnswers = answersRef.current;
            const serialized = JSON.stringify(currentAnswers);
            if (serialized === lastSavedRef.current) return;

            setSaveIndicator("saving");
            try {
                await updateStudentAssignment(studentAssignment.id, {
                    progress: { answers: currentAnswers },
                    status: "in_progress",
                });
                lastSavedRef.current = serialized;
                setSaveIndicator("saved");
                // Clear "saved" indicator after 2s
                setTimeout(() => setSaveIndicator(""), 2000);
            } catch (error) {
                console.error("Autosave failed:", error);
                setSaveIndicator("error");
            }
        }, 2500);
    }, [studentAssignment, canEdit]);

    const handleAnswerChange = useCallback(
        (questionId: string, value: any) => {
            setAnswers((prev) => {
                const next = { ...prev, [questionId]: value };
                return next;
            });
            triggerAutosave();
        },
        [triggerAutosave],
    );

    // Evaluation (only computed, used in submitted phase)
    const evaluation = useMemo(
        () => evaluateQuizAttempt(questions, { answers }),
        [questions, answers],
    );

    const resultMap = useMemo(
        () =>
            new Map(
                (evaluation?.results || []).map((r) => [r.question_id, r.is_correct]),
            ),
        [evaluation],
    );

    const questionIds = useMemo(() => questions.map((q) => q.id), [questions]);

    const answeredSet = useMemo(() => {
        const set = new Set<string>();
        for (const q of questions) {
            const a = answers[q.id];
            if (a !== undefined && a !== null && a !== "") {
                if (Array.isArray(a) ? a.length > 0 : typeof a === "object" ? Object.keys(a).length > 0 : true) {
                    set.add(q.id);
                }
            }
        }
        return set;
    }, [questions, answers]);

    const handleSubmit = async () => {
        if (!studentAssignment || !canEdit) return;

        // Cancel pending autosave
        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current);
            autosaveTimerRef.current = null;
        }

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
        } catch (error) {
            console.error(error);
            toast.error("Não foi possível submeter o quiz.");
        } finally {
            setSubmitting(false);
        }
    };

    const currentQuestion = questions[currentIndex] || null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[680px] h-[92vh] max-sm:h-dvh max-sm:w-dvw max-sm:max-w-none max-sm:rounded-none p-0 overflow-hidden gap-0">
                <div className="h-full flex flex-col">
                    {/* Header */}
                    <div className="px-4 sm:px-6 py-3 border-b border-brand-primary/8 flex items-center justify-between gap-3 shrink-0">
                        <div className="min-w-0">
                            <DialogTitle className="text-lg font-instrument text-brand-primary truncate">
                                {studentAssignment?.assignment?.title || "Quiz"}
                            </DialogTitle>
                            {canEdit && saveIndicator && (
                                <span className="text-[10px] text-brand-primary/40">
                                    {saveIndicator === "saving" && "A guardar..."}
                                    {saveIndicator === "saved" && "Guardado"}
                                    {saveIndicator === "error" && "Erro ao guardar"}
                                </span>
                            )}
                        </div>
                        {phase === "taking" && canEdit && questions.length > 0 && (
                            <Button
                                onClick={handleSubmit}
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

                    {/* Body */}
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-brand-primary/40" />
                        </div>
                    ) : !isQuiz ? (
                        <div className="flex-1 flex items-center justify-center text-sm text-brand-primary/45">
                            Este TPC não está associado a um quiz.
                        </div>
                    ) : questions.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-sm text-brand-primary/45">
                            Este quiz ainda não tem perguntas.
                        </div>
                    ) : phase === "submitted" ? (
                        /* ── Results Phase ── */
                        <div className="flex-1 min-h-0 flex flex-col">
                            {/* Score summary */}
                            <div className="px-4 sm:px-6 py-5 border-b border-brand-primary/8">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "h-14 w-14 rounded-2xl flex items-center justify-center shrink-0",
                                        evaluation && evaluation.score >= 50
                                            ? "bg-emerald-50"
                                            : "bg-red-50",
                                    )}>
                                        <Trophy className={cn(
                                            "h-7 w-7",
                                            evaluation && evaluation.score >= 50
                                                ? "text-emerald-500"
                                                : "text-red-400",
                                        )} />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-instrument text-brand-primary">
                                            {evaluation?.score.toFixed(0) ?? 0}%
                                        </p>
                                        <p className="text-xs text-brand-primary/50">
                                            {evaluation?.correct_questions ?? 0} de {evaluation?.total_questions ?? 0} corretas
                                        </p>
                                    </div>
                                    {studentAssignment?.grade !== null &&
                                        studentAssignment?.grade !== undefined && (
                                            <div className="ml-auto text-right">
                                                <p className="text-xs text-brand-primary/40">Nota</p>
                                                <p className="text-lg font-instrument text-brand-primary">
                                                    {studentAssignment.grade.toFixed(1)}%
                                                </p>
                                            </div>
                                        )}
                                </div>
                            </div>

                            {/* Paginated review */}
                            <QuizPagination
                                totalQuestions={questions.length}
                                currentIndex={currentIndex}
                                onNavigate={setCurrentIndex}
                                questionIds={questionIds}
                                resultMap={resultMap}
                                showProgress={false}
                            >
                                {currentQuestion && (
                                    <QuizQuestionRenderer
                                        question={currentQuestion}
                                        mode="review"
                                        answer={answers[currentQuestion.id]}
                                        isCorrect={resultMap.get(currentQuestion.id) ?? null}
                                        questionNumber={currentIndex + 1}
                                    />
                                )}
                            </QuizPagination>
                        </div>
                    ) : (
                        /* ── Taking Phase ── */
                        <QuizPagination
                            totalQuestions={questions.length}
                            currentIndex={currentIndex}
                            onNavigate={setCurrentIndex}
                            answeredSet={answeredSet}
                            questionIds={questionIds}
                            progressLabel={`${answeredSet.size}/${questions.length} respondidas`}
                        >
                            {currentQuestion && (
                                <QuizQuestionRenderer
                                    question={currentQuestion}
                                    mode="student"
                                    answer={answers[currentQuestion.id]}
                                    onAnswerChange={(value) =>
                                        handleAnswerChange(currentQuestion.id, value)
                                    }
                                    questionNumber={currentIndex + 1}
                                />
                            )}
                        </QuizPagination>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
