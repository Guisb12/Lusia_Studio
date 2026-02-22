"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const ITEMS = [
    { value: true,  letter: "V" },
    { value: false, letter: "F" },
] as const;

/* ─── Student View ─── */
export function TrueFalseStudent({
    answer,
    onAnswerChange,
}: {
    answer?: boolean;
    onAnswerChange?: (value: boolean) => void;
}) {
    return (
        <div className="grid grid-cols-2 gap-4">
            {ITEMS.map((item) => {
                const selected = answer === item.value;
                return (
                    <motion.button
                        key={String(item.value)}
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onAnswerChange?.(item.value)}
                        className={cn(
                            "h-44 w-full rounded-2xl flex items-center justify-center transition-all duration-200 shadow-sm hover:shadow-md",
                            selected ? "bg-brand-accent" : "bg-white",
                        )}
                    >
                        <span className={cn(
                            "text-7xl font-bold transition-colors",
                            selected ? "text-white" : "text-brand-primary/15",
                        )}>
                            {item.letter}
                        </span>
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
        <div className="grid grid-cols-2 gap-4">
            {ITEMS.map((item) => {
                const isCorrect = correctAnswer === item.value;
                return (
                    <button
                        key={String(item.value)}
                        type="button"
                        onClick={() => onContentChange({ correct_answer: item.value })}
                        className={cn(
                            "h-44 w-full rounded-2xl flex items-center justify-center transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer",
                            isCorrect ? "bg-brand-accent" : "bg-white",
                        )}
                    >
                        <span className={cn(
                            "text-7xl font-bold transition-colors",
                            isCorrect ? "text-white" : "text-brand-primary/15",
                        )}>
                            {item.letter}
                        </span>
                    </button>
                );
            })}
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
        <div className="grid grid-cols-2 gap-4">
            {ITEMS.map((item) => {
                const selected = answer === item.value;
                const isTheCorrect = correctAnswer === item.value;

                let bg = "bg-white";
                let textColor = "text-brand-primary/15";
                if (selected && isTheCorrect)  { bg = "bg-emerald-500"; textColor = "text-white"; }
                else if (selected && !isTheCorrect) { bg = "bg-red-500";     textColor = "text-white"; }
                else if (isTheCorrect)         { bg = "bg-emerald-100"; textColor = "text-emerald-500"; }

                return (
                    <div
                        key={String(item.value)}
                        className={cn(
                            "h-44 w-full rounded-2xl flex items-center justify-center transition-all shadow-sm",
                            bg,
                        )}
                    >
                        <span className={cn("text-7xl font-bold", textColor)}>
                            {item.letter}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
