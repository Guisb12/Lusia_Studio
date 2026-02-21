"use client";

import React from "react";
import { motion } from "framer-motion";
import { Check, CheckCircle2, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Student View ─── */
export function TrueFalseStudent({
    answer,
    onAnswerChange,
}: {
    answer?: boolean;
    onAnswerChange?: (value: boolean) => void;
}) {
    return (
        <div className="grid grid-cols-2 gap-3">
            {[
                { value: true, label: "Verdadeiro" },
                { value: false, label: "Falso" },
            ].map((item) => {
                const selected = answer === item.value;
                return (
                    <motion.button
                        key={String(item.value)}
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onAnswerChange?.(item.value)}
                        className={cn(
                            "rounded-xl border-2 py-8 text-center text-base font-medium transition-all duration-200",
                            selected
                                ? "border-brand-accent bg-brand-accent/5 text-brand-accent"
                                : "border-brand-primary/8 text-brand-primary/60 hover:border-brand-primary/20 bg-white",
                        )}
                    >
                        {item.label}
                    </motion.button>
                );
            })}
        </div>
    );
}

/* ─── Editor View ─── */
export function TrueFalseEditor({
    correctAnswer,
    onContentChange,
}: {
    correctAnswer: boolean | null;
    onContentChange: (patch: Record<string, any>) => void;
}) {
    return (
        <div className="space-y-2">
            <p className="text-xs text-brand-primary/45 font-medium uppercase tracking-wider">
                Resposta correta
            </p>
            <div className="grid grid-cols-2 gap-3">
                {[
                    { value: true, label: "Verdadeiro" },
                    { value: false, label: "Falso" },
                ].map((item) => {
                    const isCorrect = correctAnswer === item.value;
                    return (
                        <button
                            key={String(item.value)}
                            type="button"
                            onClick={() =>
                                onContentChange({ correct_answer: item.value })
                            }
                            className={cn(
                                "rounded-xl border-2 py-8 text-center text-base font-medium transition-all duration-200 relative",
                                isCorrect
                                    ? "border-emerald-400 bg-emerald-50/30 text-emerald-700"
                                    : "border-brand-primary/8 text-brand-primary/60 hover:border-brand-primary/20 bg-white",
                            )}
                        >
                            {item.label}
                            {isCorrect && (
                                <Check className="absolute top-3 right-3 h-4 w-4 text-emerald-600" />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* ─── Review View ─── */
export function TrueFalseReview({
    answer,
    correctAnswer,
}: {
    answer?: boolean;
    correctAnswer: boolean | null;
}) {
    return (
        <div className="grid grid-cols-2 gap-3">
            {[
                { value: true, label: "Verdadeiro" },
                { value: false, label: "Falso" },
            ].map((item) => {
                const selected = answer === item.value;
                const isTheCorrect = correctAnswer === item.value;

                let borderClass = "border-brand-primary/8 bg-white text-brand-primary/40";
                if (selected && isTheCorrect) {
                    borderClass = "border-emerald-400 bg-emerald-50/40 text-emerald-700";
                } else if (selected && !isTheCorrect) {
                    borderClass = "border-red-300 bg-red-50/30 text-red-600";
                } else if (isTheCorrect) {
                    borderClass = "border-emerald-300/50 bg-emerald-50/20 text-emerald-600";
                }

                return (
                    <div
                        key={String(item.value)}
                        className={cn(
                            "rounded-xl border-2 py-8 text-center text-base font-medium relative",
                            borderClass,
                        )}
                    >
                        {item.label}
                        {selected && isTheCorrect && (
                            <CheckCircle2 className="absolute top-3 right-3 h-4 w-4 text-emerald-600" />
                        )}
                        {selected && !isTheCorrect && (
                            <XCircle className="absolute top-3 right-3 h-4 w-4 text-red-500" />
                        )}
                        {!selected && isTheCorrect && (
                            <CheckCircle2 className="absolute top-3 right-3 h-4 w-4 text-emerald-400" />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
