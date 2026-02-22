"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    streamQuizGeneration,
    QuizStreamEvent,
    QuizStreamQuestion,
} from "@/lib/quiz-generation";
import { cn } from "@/lib/utils";
import {
    CheckCircle2,
    AlertCircle,
    Loader2,
    RefreshCw,
    ExternalLink,
} from "lucide-react";

interface QuizGenerationViewProps {
    artifactId: string;
    numQuestions: number;
    onDone: (artifactId: string) => void;
    onRetry: () => void;
}

const QUESTION_TYPE_LABELS: Record<string, string> = {
    multiple_choice: "Escolha Múltipla",
    true_false: "Verdadeiro/Falso",
    fill_blank: "Preenchimento",
    matching: "Correspondência",
    short_answer: "Resposta Curta",
    multiple_response: "Resposta Múltipla",
    ordering: "Ordenação",
    open_extended: "Resposta Aberta",
    context_group: "Grupo",
};

export function QuizGenerationView({
    artifactId,
    numQuestions,
    onDone,
    onRetry,
}: QuizGenerationViewProps) {
    const [questions, setQuestions] = useState<QuizStreamQuestion[]>([]);
    const [status, setStatus] = useState<"streaming" | "done" | "error">(
        "streaming",
    );
    const [errorMessage, setErrorMessage] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const controller = streamQuizGeneration(
            artifactId,
            (event: QuizStreamEvent) => {
                switch (event.type) {
                    case "question":
                        setQuestions((prev) => [...prev, event.question]);
                        break;
                    case "done":
                        setStatus("done");
                        break;
                    case "error":
                        setStatus("error");
                        setErrorMessage(event.message);
                        break;
                }
            },
            (error) => {
                setStatus("error");
                setErrorMessage(error.message || "Erro de ligação.");
            },
            () => {
                // Stream complete — status already set by done/error events
            },
        );

        return () => controller.abort();
    }, [artifactId]);

    // Auto-scroll on new questions
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [questions]);

    return (
        <div className="flex flex-col h-full">
            {/* Progress bar */}
            <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-1.5 rounded-full bg-brand-primary/5 overflow-hidden">
                    <motion.div
                        className="h-full bg-brand-accent rounded-full"
                        initial={{ width: 0 }}
                        animate={{
                            width: `${Math.min((questions.length / numQuestions) * 100, 100)}%`,
                        }}
                        transition={{ duration: 0.3 }}
                    />
                </div>
                <span className="text-xs text-brand-primary/50 font-satoshi shrink-0">
                    {questions.length} / {numQuestions}
                </span>
            </div>

            {/* Questions list */}
            <div
                ref={scrollRef}
                className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1"
            >
                <AnimatePresence>
                    {questions.map((q, i) => (
                        <motion.div
                            key={q.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: 0.05 }}
                            className="rounded-xl border border-brand-primary/8 bg-white p-3"
                        >
                            <div className="flex items-start gap-2.5">
                                <span className="text-sm font-medium text-brand-primary/40 shrink-0 mt-0.5 w-6 text-right">
                                    {q.label || `${i + 1}.`}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Badge
                                            variant="outline"
                                            className="text-[10px] px-1.5 py-0 h-5 text-brand-primary/40 border-brand-primary/10"
                                        >
                                            {QUESTION_TYPE_LABELS[q.type] || q.type}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-brand-primary/80 line-clamp-2">
                                        {q.content?.question || "—"}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Streaming skeleton */}
                {status === "streaming" && (
                    <div className="rounded-xl border border-brand-primary/5 bg-brand-primary/[0.02] p-3 animate-pulse">
                        <div className="flex items-center gap-2 text-xs text-brand-primary/30">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            A gerar...
                        </div>
                    </div>
                )}
            </div>

            {/* Status footer */}
            <div className="mt-4 pt-3 border-t border-brand-primary/5">
                {status === "streaming" && (
                    <div className="flex items-center gap-2 text-sm text-brand-primary/50">
                        <Loader2 className="h-4 w-4 animate-spin text-brand-accent" />
                        A gerar questões...
                    </div>
                )}

                {status === "done" && (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-green-600">
                            <CheckCircle2 className="h-4 w-4" />
                            Quiz criado com sucesso!
                        </div>
                        <Button
                            onClick={() => onDone(artifactId)}
                            size="sm"
                            className="gap-1.5"
                        >
                            Ver Quiz
                            <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                )}

                {status === "error" && (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-brand-error">
                            <AlertCircle className="h-4 w-4" />
                            {errorMessage || "Erro ao gerar questões."}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onRetry}
                            className="gap-1.5"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Tentar novamente
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
