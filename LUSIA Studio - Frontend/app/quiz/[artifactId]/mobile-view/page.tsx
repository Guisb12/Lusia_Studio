"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Send, Trophy } from "lucide-react";
import { toast } from "sonner";
import { useParams, useSearchParams } from "next/navigation";
import {
    evaluateQuizAttempt,
    extractQuizQuestionIds,
    fetchQuizQuestions,
    normalizeQuestionForEditor,
    QuizQuestion,
} from "@/lib/quiz";
import { QuizQuestionRenderer } from "@/components/quiz/QuizQuestionRenderer";
import { QuestionStripMobile } from "@/components/docs/quiz/QuestionSidebar";
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

export default function QuizMobileViewPage() {
    const params = useParams<{ artifactId: string }>();
    const searchParams = useSearchParams();
    const artifactId = params.artifactId;
    const token = searchParams.get("token");

    // Store token in localStorage for API calls
    useEffect(() => {
        if (token) {
            localStorage.setItem("mobile_auth_token", token);
        }
    }, [token]);

    const [loading, setLoading] = useState(false);
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [submitting, setSubmitting] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [direction, setDirection] = useState(0);
    const [phase, setPhase] = useState<"taking" | "submitted">("taking");
    const [results, setResults] = useState<any>(null);

    const questionIds = useMemo(() => questions.map((q) => q.id), [questions]);
    const currentQuestion = questions[currentIndex] || null;

    // Load quiz
    useEffect(() => {
        if (!artifactId) return;

        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setCurrentIndex(0);
            try {
                // Fetch artifact via API proxy with auth
                const headers: Record<string, string> = {};
                if (token) {
                    headers["Authorization"] = `Bearer ${token}`;
                }
                
                const artifactRes = await fetch(`/api/artifacts/${artifactId}`, {
                    headers,
                    cache: "no-store"
                });
                
                if (!artifactRes.ok) {
                    throw new Error(`Failed to fetch artifact: ${artifactRes.status}`);
                }
                
                const art = await artifactRes.json();
                
                if (cancelled) return;
                if (art.artifact_type !== "quiz") { 
                    setQuestions([]); 
                    return; 
                }

                const ids = extractQuizQuestionIds(art.content);
                if (!ids.length) { 
                    setQuestions([]); 
                    return; 
                }

                const bank = await fetchQuizQuestions({ ids });
                if (cancelled) return;
                const byId = new Map(bank.map((q) => [q.id, q]));
                const normalized = (ids.map((id) => byId.get(id)).filter(Boolean) as QuizQuestion[])
                    .map(normalizeQuestionForEditor);
                setQuestions(normalized);

                // Start fresh (no saved progress for now)
                setAnswers({});
            } catch (err) {
                if (cancelled) return;
                console.error(err);
                toast.error("Não foi possível carregar este quiz.");
            } finally {
                setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [artifactId, token]);

    // Navigation
    const canGoPrev = currentIndex > 0;
    const canGoNext = currentIndex < questions.length - 1;

    const goPrev = useCallback(() => {
        if (canGoPrev) {
            setDirection(-1);
            setCurrentIndex((i) => i - 1);
        }
    }, [canGoPrev]);

    const goNext = useCallback(() => {
        if (canGoNext) {
            setDirection(1);
            setCurrentIndex((i) => i + 1);
        }
    }, [canGoNext]);

    const goToIndex = useCallback((idx: number) => {
        setDirection(idx > currentIndex ? 1 : -1);
        setCurrentIndex(idx);
    }, [currentIndex]);

    // Answer handling
    const setAnswer = useCallback((questionId: string, value: any) => {
        setAnswers((prev) => ({ ...prev, [questionId]: value }));
    }, []);

    const isAnswered = useCallback(
        (qid: string) => {
            const q = questions.find((x) => x.id === qid);
            if (!q) return false;
            const val = answers[qid];
            if (val === undefined || val === null) return false;
            if (Array.isArray(val) && val.length === 0) return false;
            if (typeof val === "string" && val.trim() === "") return false;
            return true;
        },
        [answers, questions]
    );

    const allAnswered = useMemo(
        () => questionIds.every((id) => isAnswered(id)),
        [questionIds, isAnswered]
    );

    const answeredCount = useMemo(
        () => questionIds.filter((id) => isAnswered(id)).length,
        [questionIds, isAnswered]
    );

    // Submit
    const submit = useCallback(async () => {
        setSubmitting(true);
        try {
            const attempt = {
                answers: answers as any,
                questions: questions,
            };
            const evaluation = await evaluateQuizAttempt(attempt);
            setResults(evaluation);
            setPhase("submitted");
            toast.success("Quiz submetido com sucesso!");
        } catch (e) {
            console.error(e);
            toast.error("Erro ao submeter. Tenta novamente.");
        } finally {
            setSubmitting(false);
            setConfirmOpen(false);
        }
    }, [answers, questions]);

    // Submit guard
    const unansweredCount = questions.length - answeredCount;

    // Current question animation variant
    const needsFade = useMemo(() => {
        const t = currentQuestion?.type;
        return t === "ordering" || t === "fill_blank" || t === "matching";
    }, [currentQuestion]);

    const variants = needsFade ? fadeVariants : slideVariants;

    if (loading) {
        return (
            <div className="min-h-screen bg-[#f6f3ef] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#15316b]" />
            </div>
        );
    }

    if (questions.length === 0) {
        return (
            <div className="min-h-screen bg-[#f6f3ef] flex items-center justify-center p-4">
                <p className="text-[#15316b]">Nenhuma questão encontrada.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f6f3ef] flex flex-col">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-sm border-b border-[#15316b]/10">
                <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#15316b]/60">
                            Questão {currentIndex + 1} / {questions.length}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-[#15316b]/60">
                        <span>{answeredCount}</span>
                        <span className="text-[#15316b]/30">/</span>
                        <span>{questions.length}</span>
                        <span>respondidas</span>
                    </div>
                </div>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-[#15316b]/10">
                <div
                    className="h-full bg-[#15316b] transition-all duration-300"
                    style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                />
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 py-4">
                {phase === "taking" ? (
                    <>
                        {/* Question */}
                        <div className="flex-1 min-h-0 overflow-auto">
                            <AnimatePresence mode="wait" custom={direction}>
                                <motion.div
                                    key={currentQuestion.id}
                                    custom={direction}
                                    variants={variants}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={{ duration: 0.25, ease: "easeOut" }}
                                    className="pb-4"
                                >
                                    <QuizQuestionRenderer
                                        question={currentQuestion}
                                        value={answers[currentQuestion.id]}
                                        onChange={(val) => setAnswer(currentQuestion.id, val)}
                                        mode="student"
                                        index={currentIndex + 1}
                                        showCorrect={false}
                                        isChild={false}
                                    />
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Navigation */}
                        <div className="flex items-center justify-between gap-3 pt-4 border-t border-[#15316b]/10 mt-auto">
                            <Button
                                variant="outline"
                                onClick={goPrev}
                                disabled={!canGoPrev}
                                className="flex-1"
                            >
                                Anterior
                            </Button>

                            {canGoNext ? (
                                <Button
                                    onClick={goNext}
                                    className="flex-1 bg-[#15316b] hover:bg-[#15316b]/90"
                                >
                                    Próxima
                                </Button>
                            ) : (
                                <Button
                                    onClick={() => setConfirmOpen(true)}
                                    disabled={submitting}
                                    className="flex-1 bg-green-600 hover:bg-green-700"
                                >
                                    {submitting ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <>
                                            <Send className="h-4 w-4 mr-2" />
                                            Submeter
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>

                        {/* Question sidebar (mobile strip) */}
                        <div className="mt-4">
                            <QuestionStripMobile
                                questions={questions}
                                currentIndex={currentIndex}
                                onSelect={goToIndex}
                                answeredIds={questionIds.filter((id) => isAnswered(id))}
                                correctIds={[]}
                                wrongIds={[]}
                            />
                        </div>
                    </>
                ) : (
                    /* Results view */
                    <div className="flex-1 flex flex-col items-center justify-center py-8">
                        <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mb-6">
                            <Trophy className="h-12 w-12 text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-[#15316b] mb-2">
                            Quiz Submetido!
                        </h2>
                        {results && (
                            <div className="text-center space-y-2 mb-6">
                                <p className="text-4xl font-bold text-[#15316b]">
                                    {results.score} / {results.maxScore}
                                </p>
                                <p className="text-[#15316b]/60">
                                    {Math.round((results.score / results.maxScore) * 100)}% correto
                                </p>
                            </div>
                        )}
                        <Button
                            onClick={() => {
                                setPhase("taking");
                                setCurrentIndex(0);
                                setAnswers({});
                            }}
                            variant="outline"
                            className="mt-4"
                        >
                            Tentar Novamente
                        </Button>
                    </div>
                )}
            </div>

            {/* Submit confirmation */}
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Submeter quiz?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {unansweredCount > 0 ? (
                                <>
                                    Ainda tens <strong>{unansweredCount}</strong> questão
                                    {unansweredCount === 1 ? "" : "s"} por responder.
                                    <br />
                                    Queres submeter mesmo assim?
                                </>
                            ) : (
                                "Todas as questões foram respondidas. Queres submeter agora?"
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={submit}
                            disabled={submitting}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            {submitting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                "Submeter"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
