"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, Send, Trophy } from "lucide-react";
import { toast } from "sonner";
import { StudentAssignment, updateStudentAssignment } from "@/lib/assignments";
import { Artifact, fetchArtifact, fetchArtifactFileUrl } from "@/lib/artifacts";
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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
    const [artifact, setArtifact] = useState<Artifact | null>(null);
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [submitting, setSubmitting] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
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
                const loadedArtifact = await fetchArtifact(artifactId);
                setArtifact(loadedArtifact);
                if (loadedArtifact.artifact_type !== "quiz") {
                    setIsQuiz(false);
                    setQuestions([]);
                    setAnswers({});
                    lastSavedRef.current = "";
                    return;
                }
                setIsQuiz(true);

                const ids = extractQuizQuestionIds(loadedArtifact.content);
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

    const handleSubmitConfirm = async () => {
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

    const handleMarkDone = async () => {
        if (!studentAssignment || !canEdit) return;
        setSubmitting(true);
        try {
            const updated = await updateStudentAssignment(studentAssignment.id, {
                submission: {},
                status: "submitted",
            });
            onUpdated(updated);
            setPhase("submitted");
            toast.success("TPC marcado como concluído!");
        } catch (error) {
            console.error(error);
            toast.error("Não foi possível submeter.");
        } finally {
            setSubmitting(false);
        }
    };

    const currentQuestion = questions[currentIndex] || null;

    return (
    <>
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

                    {/* Body */}
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-brand-primary/40" />
                        </div>
                    ) : !isQuiz ? (
                        <NonQuizBody
                            instructions={studentAssignment?.assignment?.instructions ?? null}
                            artifact={artifact}
                            canEdit={canEdit}
                            phase={phase}
                            submitting={submitting}
                            onMarkDone={handleMarkDone}
                        />
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

interface NonQuizBodyProps {
    instructions: string | null;
    artifact: Artifact | null;
    canEdit: boolean;
    phase: "taking" | "submitted";
    submitting: boolean;
    onMarkDone: () => void;
}

function NonQuizBody({ instructions, artifact, canEdit, phase, submitting, onMarkDone }: NonQuizBodyProps) {
    const [openingFile, setOpeningFile] = useState(false);

    const handleOpenFile = async () => {
        if (!artifact?.id) return;
        setOpeningFile(true);
        try {
            const url = await fetchArtifactFileUrl(artifact.id);
            window.open(url, "_blank", "noopener,noreferrer");
        } catch {
            toast.error("Não foi possível abrir o documento.");
        } finally {
            setOpeningFile(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col gap-6 px-4 sm:px-6 py-6 overflow-y-auto">
            {instructions ? (
                <div>
                    <p className="text-xs font-medium text-brand-primary/50 uppercase tracking-wider mb-2">
                        Instruções
                    </p>
                    <p className="text-sm text-brand-primary/80 whitespace-pre-wrap leading-relaxed">
                        {instructions}
                    </p>
                </div>
            ) : (
                <p className="text-sm text-brand-primary/40 italic">Sem instruções adicionais.</p>
            )}

            {artifact && artifact.storage_path && (
                <div>
                    <p className="text-xs font-medium text-brand-primary/50 uppercase tracking-wider mb-2">
                        Documento
                    </p>
                    <button
                        onClick={handleOpenFile}
                        disabled={openingFile}
                        className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-brand-primary/10 bg-brand-primary/[0.02] hover:border-brand-primary/20 hover:bg-brand-primary/[0.04] transition-all text-sm text-brand-primary w-full text-left"
                    >
                        <span className="text-lg">{artifact.icon || "📄"}</span>
                        <span className="flex-1 truncate">{artifact.artifact_name}</span>
                        {openingFile ? (
                            <Loader2 className="h-4 w-4 animate-spin text-brand-primary/40 shrink-0" />
                        ) : (
                            <ExternalLink className="h-4 w-4 text-brand-primary/40 shrink-0" />
                        )}
                    </button>
                </div>
            )}

            {canEdit && phase === "taking" && (
                <div className="mt-auto pt-4 border-t border-brand-primary/5">
                    <Button
                        onClick={onMarkDone}
                        disabled={submitting}
                        size="sm"
                        className="gap-1.5"
                    >
                        {submitting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Send className="h-3.5 w-3.5" />
                        )}
                        Marcar como concluído
                    </Button>
                </div>
            )}

            {phase === "submitted" && (
                <div className="mt-auto pt-4 border-t border-brand-primary/5">
                    <p className="text-sm text-emerald-600 font-medium">TPC concluído.</p>
                </div>
            )}
        </div>
    );
}
