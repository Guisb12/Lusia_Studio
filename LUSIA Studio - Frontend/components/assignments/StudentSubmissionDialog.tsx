"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Trophy, X } from "lucide-react";
import { Assignment, StudentAssignment } from "@/lib/assignments";
import { fetchArtifact } from "@/lib/artifacts";
import {
    evaluateQuizAttempt,
    extractQuizAnswers,
    extractQuizQuestionIds,
    fetchQuizQuestions,
    normalizeQuestionForEditor,
    QuizQuestion,
} from "@/lib/quiz";
import { QuizQuestionRenderer } from "@/components/quiz/QuizQuestionRenderer";
import { QuestionSidebar, QuestionStripMobile } from "@/components/docs/quiz/QuestionSidebar";
import { cn } from "@/lib/utils";

const slideVariants = {
    enter: (direction: number) => ({ x: direction > 0 ? 120 : -120, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({ x: direction > 0 ? -120 : 120, opacity: 0 }),
};

const fadeVariants = {
    enter: () => ({ opacity: 0 }),
    center: { opacity: 1 },
    exit: () => ({ opacity: 0 }),
};

interface StudentSubmissionDialogProps {
    onClose: () => void;
    assignment: Assignment;
    studentAssignment: StudentAssignment;
}

type ReviewMode = "progress" | "submission";

export function StudentSubmissionDialog({
    onClose,
    assignment,
    studentAssignment,
}: StudentSubmissionDialogProps) {
    const [loading, setLoading] = useState(false);
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [isQuiz, setIsQuiz] = useState(false);
    const [mode, setMode] = useState<ReviewMode>(
        studentAssignment.submission ? "submission" : "progress",
    );
    const [currentIndex, setCurrentIndex] = useState(0);
    const [direction, setDirection] = useState(0);

    useEffect(() => {
        if (!assignment?.artifact_id) return;
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setCurrentIndex(0);
            try {
                const artifact = await fetchArtifact(assignment.artifact_id as string);
                if (cancelled) return;
                if (artifact.artifact_type !== "quiz") {
                    setIsQuiz(false);
                    setQuestions([]);
                    return;
                }
                setIsQuiz(true);
                const ids = extractQuizQuestionIds(artifact.content);
                if (!ids.length) { setQuestions([]); return; }
                const bank = await fetchQuizQuestions({ ids });
                if (cancelled) return;
                const map = new Map(bank.map((q) => [q.id, q]));
                setQuestions(
                    (ids.map((id) => map.get(id)).filter(Boolean) as QuizQuestion[])
                        .map(normalizeQuestionForEditor),
                );
            } catch (error) {
                if (cancelled) return;
                console.error(error);
                setIsQuiz(false);
                setQuestions([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [assignment?.artifact_id, studentAssignment?.id]);

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
            if (e.key === "Escape") { onClose(); return; }
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.key === "ArrowLeft") { e.preventDefault(); navigateTo(currentIndex - 1); }
            else if (e.key === "ArrowRight") { e.preventDefault(); navigateTo(currentIndex + 1); }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [currentIndex, navigateTo, onClose]);

    const attemptPayload =
        mode === "submission" ? studentAssignment?.submission : studentAssignment?.progress;

    const answers = useMemo(() => extractQuizAnswers(attemptPayload || {}), [attemptPayload]);
    const evaluation = useMemo(
        () => evaluateQuizAttempt(questions, attemptPayload || {}),
        [questions, attemptPayload],
    );
    const resultMap = useMemo(
        () => new Map((evaluation?.results || []).map((r) => [r.question_id, r.is_correct])),
        [evaluation],
    );
    const questionIds = useMemo(() => questions.map((q) => q.id), [questions]);
    const currentQuestion = questions[currentIndex] || null;
    const hasProgress = Boolean(studentAssignment?.progress);
    const hasSubmission = Boolean(studentAssignment?.submission);

    return (
        <div className="fixed inset-0 z-50 bg-brand-bg flex flex-col">

            {/* Header */}
            <div className="sticky top-0 z-30 border-b border-brand-primary/8 bg-brand-bg shrink-0">
                <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 p-2 -ml-2 rounded-xl text-brand-primary/50 hover:text-brand-primary hover:bg-brand-primary/5 transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-base font-instrument text-brand-primary truncate leading-tight">
                            {studentAssignment.student_name || "Aluno"}
                        </h1>
                        <p className="text-[10px] text-brand-primary/40 leading-none mt-0.5">
                            {assignment.title || "Revisão de Respostas"}
                        </p>
                    </div>

                    {/* Grade */}
                    {studentAssignment.grade !== null && studentAssignment.grade !== undefined && (
                        <div className="shrink-0 px-3 py-1.5 rounded-xl bg-brand-primary/5 text-right">
                            <p className="text-[10px] text-brand-primary/40 leading-none">Nota</p>
                            <p className="text-base font-instrument text-brand-primary leading-tight">
                                {studentAssignment.grade.toFixed(1)}%
                            </p>
                        </div>
                    )}

                    {/* Mode toggle */}
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

            {/* Score banner */}
            {!loading && isQuiz && questions.length > 0 && (
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
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-primary/30" />
                </div>
            )}

            {/* Non-quiz */}
            {!loading && !isQuiz && (
                <div className="flex-1 flex items-center justify-center text-sm text-brand-primary/40">
                    Este TPC não está ligado a um quiz.
                </div>
            )}

            {/* Empty */}
            {!loading && isQuiz && questions.length === 0 && (
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
                                            currentQuestion?.type === "ordering" ||
                                            currentQuestion?.type === "fill_blank" ||
                                            currentQuestion?.type === "matching"
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
                                                {/* Question header */}
                                                <div className="shrink-0 px-4 sm:px-6 lg:px-12 pt-5 pb-3">
                                                    {currentQuestion.type !== "fill_blank" && (
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
                                                    )}
                                                </div>
                                                <div className="shrink-0 border-t border-brand-primary/5 mx-4 sm:mx-6 lg:mx-12 mb-4" />

                                                {/* Body */}
                                                <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 px-4 sm:px-6 lg:px-12 pb-5">
                                                    <div className="flex-1 min-w-0">
                                                        <QuizQuestionRenderer
                                                            question={currentQuestion}
                                                            mode="review"
                                                            answer={answers[currentQuestion.id]}
                                                            isCorrect={resultMap.get(currentQuestion.id) ?? null}
                                                            questionNumber={currentIndex + 1}
                                                            skipHeader
                                                        />
                                                    </div>
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

                        {/* Desktop sidebar — read-only */}
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
    );
}
