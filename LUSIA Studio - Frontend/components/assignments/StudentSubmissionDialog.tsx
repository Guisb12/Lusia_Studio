"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Trophy } from "lucide-react";
import { Assignment, StudentAssignment } from "@/lib/assignments";
import { fetchArtifact } from "@/lib/artifacts";
import {
    evaluateQuizAttempt,
    extractQuizAnswers,
    extractQuizQuestionIds,
    fetchQuizQuestions,
    QuizQuestion,
} from "@/lib/quiz";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { QuizQuestionRenderer } from "@/components/quiz/QuizQuestionRenderer";
import { QuizPagination } from "@/components/quiz/QuizPagination";
import { cn } from "@/lib/utils";

interface StudentSubmissionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    assignment: Assignment;
    studentAssignment: StudentAssignment | null;
}

type ReviewMode = "progress" | "submission";

export function StudentSubmissionDialog({
    open,
    onOpenChange,
    assignment,
    studentAssignment,
}: StudentSubmissionDialogProps) {
    const [loading, setLoading] = useState(false);
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [isQuiz, setIsQuiz] = useState(false);
    const [mode, setMode] = useState<ReviewMode>("submission");
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (!studentAssignment) return;
        if (studentAssignment.submission) setMode("submission");
        else setMode("progress");
    }, [studentAssignment]);

    useEffect(() => {
        if (!open || !assignment?.artifact_id || !studentAssignment) return;

        const load = async () => {
            setLoading(true);
            setCurrentIndex(0);
            try {
                const artifact = await fetchArtifact(assignment.artifact_id as string);
                if (artifact.artifact_type !== "quiz") {
                    setIsQuiz(false);
                    setQuestions([]);
                    return;
                }
                setIsQuiz(true);

                const ids = extractQuizQuestionIds(artifact.content);
                if (!ids.length) {
                    setQuestions([]);
                    return;
                }
                const bankQuestions = await fetchQuizQuestions({ ids });
                const map = new Map(bankQuestions.map((q) => [q.id, q]));
                setQuestions(ids.map((id) => map.get(id)).filter(Boolean) as QuizQuestion[]);
            } catch (error) {
                console.error(error);
                setQuestions([]);
                setIsQuiz(false);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [open, assignment?.artifact_id, studentAssignment]);

    const attemptPayload =
        mode === "submission"
            ? studentAssignment?.submission
            : studentAssignment?.progress;

    const answers = useMemo(() => extractQuizAnswers(attemptPayload || {}), [attemptPayload]);
    const evaluation = useMemo(
        () => evaluateQuizAttempt(questions, attemptPayload || {}),
        [questions, attemptPayload],
    );
    const resultMap = useMemo(
        () =>
            new Map(
                (evaluation?.results || []).map((item) => [
                    item.question_id,
                    item.is_correct,
                ]),
            ),
        [evaluation],
    );

    const questionIds = useMemo(() => questions.map((q) => q.id), [questions]);

    const hasProgress = Boolean(studentAssignment?.progress);
    const hasSubmission = Boolean(studentAssignment?.submission);

    const currentQuestion = questions[currentIndex] || null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[680px] h-[92vh] max-sm:h-dvh max-sm:w-dvw max-sm:max-w-none max-sm:rounded-none p-0 overflow-hidden gap-0">
                <div className="h-full flex flex-col">
                    {/* Header */}
                    <div className="px-4 sm:px-6 py-3 border-b border-brand-primary/8 shrink-0">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <DialogTitle className="text-lg font-instrument text-brand-primary truncate">
                                    {studentAssignment?.student_name || "Aluno"}
                                </DialogTitle>
                                <p className="text-[10px] text-brand-primary/40">
                                    {assignment.title || "Revisão de Respostas"}
                                </p>
                            </div>
                            {/* Progress/Submission toggle */}
                            {hasProgress && hasSubmission && (
                                <div className="flex items-center gap-1 bg-brand-primary/5 rounded-lg p-0.5 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => { setMode("progress"); setCurrentIndex(0); }}
                                        className={cn(
                                            "px-2.5 py-1 text-[10px] rounded-md transition-all font-medium",
                                            mode === "progress"
                                                ? "bg-white text-brand-primary shadow-sm"
                                                : "text-brand-primary/50",
                                        )}
                                    >
                                        Progresso
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setMode("submission"); setCurrentIndex(0); }}
                                        className={cn(
                                            "px-2.5 py-1 text-[10px] rounded-md transition-all font-medium",
                                            mode === "submission"
                                                ? "bg-white text-brand-primary shadow-sm"
                                                : "text-brand-primary/50",
                                        )}
                                    >
                                        Submissão
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Body */}
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-brand-primary/40" />
                        </div>
                    ) : !isQuiz ? (
                        <div className="flex-1 flex items-center justify-center text-sm text-brand-primary/45">
                            Este TPC não está ligado a um quiz.
                        </div>
                    ) : questions.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-sm text-brand-primary/45">
                            Este quiz ainda não tem perguntas.
                        </div>
                    ) : (
                        <div className="flex-1 min-h-0 flex flex-col">
                            {/* Score summary */}
                            <div className="px-4 sm:px-6 py-4 border-b border-brand-primary/8">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
                                        evaluation && evaluation.score >= 50
                                            ? "bg-emerald-50"
                                            : "bg-red-50",
                                    )}>
                                        <Trophy className={cn(
                                            "h-6 w-6",
                                            evaluation && evaluation.score >= 50
                                                ? "text-emerald-500"
                                                : "text-red-400",
                                        )} />
                                    </div>
                                    <div>
                                        <p className="text-xl font-instrument text-brand-primary">
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
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
