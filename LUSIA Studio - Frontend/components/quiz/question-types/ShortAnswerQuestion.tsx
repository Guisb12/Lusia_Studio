"use client";

import React from "react";
import { CheckCircle2, Plus, Trash2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/* ─── Student View ─── */
export function ShortAnswerStudent({
    answer,
    onAnswerChange,
}: {
    answer?: string;
    onAnswerChange?: (value: string) => void;
}) {
    return (
        <div className="space-y-2">
            <input
                type="text"
                value={typeof answer === "string" ? answer : ""}
                onChange={(e) => onAnswerChange?.(e.target.value)}
                placeholder="Escreve a tua resposta..."
                className="w-full rounded-xl border-2 border-brand-primary/10 bg-white px-5 py-4 text-base text-brand-primary placeholder:text-brand-primary/25 outline-none focus:border-brand-accent/40 focus:ring-4 focus:ring-brand-accent/10 transition-all"
            />
            <div className="flex justify-end">
                <span className="text-[11px] text-brand-primary/25">
                    {(typeof answer === "string" ? answer : "").length} caracteres
                </span>
            </div>
        </div>
    );
}

/* ─── Editor View (WYSIWYG — same input as student, correct answers below) ─── */
export function ShortAnswerEditor({
    correctAnswers,
    caseSensitive,
    onContentChange,
}: {
    correctAnswers: string[];
    caseSensitive: boolean;
    onContentChange: (patch: Record<string, any>) => void;
}) {
    return (
        <div className="space-y-4">
            {/* Same input style as student — shows the first correct answer */}
            <input
                type="text"
                value={correctAnswers[0] || ""}
                onChange={(e) => {
                    const next = [...correctAnswers];
                    next[0] = e.target.value;
                    onContentChange({ correct_answers: next });
                }}
                placeholder="Escreve a resposta correta..."
                className="w-full rounded-xl border-2 border-brand-primary/10 bg-white px-5 py-4 text-base text-brand-primary placeholder:text-brand-primary/25 outline-none focus:border-brand-accent/40 focus:ring-4 focus:ring-brand-accent/10 transition-all"
            />

            {/* Additional accepted answers */}
            {correctAnswers.length > 1 && (
                <div className="space-y-2">
                    <Label className="text-brand-primary/40 text-xs">Respostas alternativas aceites</Label>
                    {correctAnswers.slice(1).map((ans, i) => {
                        const index = i + 1;
                        return (
                            <div key={index} className="flex items-center gap-2">
                                <input
                                    value={ans}
                                    onChange={(e) => {
                                        const next = [...correctAnswers];
                                        next[index] = e.target.value;
                                        onContentChange({ correct_answers: next });
                                    }}
                                    placeholder={`Alternativa ${index}`}
                                    className="flex-1 rounded-xl border-2 border-brand-primary/8 bg-white px-4 py-2.5 text-sm text-brand-primary placeholder:text-brand-primary/25 outline-none focus:border-brand-accent/40 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() =>
                                        onContentChange({
                                            correct_answers: correctAnswers.filter(
                                                (_, idx) => idx !== index,
                                            ),
                                        })
                                    }
                                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                                >
                                    <Trash2 className="h-3.5 w-3.5 text-brand-error/60" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="flex items-center gap-3">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                        onContentChange({
                            correct_answers: [...correctAnswers, ""],
                        })
                    }
                    className="gap-1.5"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Alternativa
                </Button>

                <label className="inline-flex items-center gap-2 text-sm text-brand-primary/50">
                    <Checkbox
                        checked={caseSensitive}
                        onCheckedChange={(checked) =>
                            onContentChange({ case_sensitive: Boolean(checked) })
                        }
                    />
                    Maiúsculas/minúsculas
                </label>
            </div>
        </div>
    );
}

/* ─── Review View ─── */
export function ShortAnswerReview({
    answer,
    correctAnswers,
    isCorrect,
}: {
    answer?: string;
    correctAnswers: string[];
    isCorrect?: boolean | null;
}) {
    const studentAnswer = typeof answer === "string" ? answer : "";

    return (
        <div className="space-y-3">
            <div
                className={cn(
                    "rounded-xl border-2 px-5 py-4 text-base",
                    isCorrect === true
                        ? "border-emerald-400 bg-emerald-50/40 text-brand-primary"
                        : isCorrect === false
                            ? "border-red-300 bg-red-50/30 text-brand-primary"
                            : "border-brand-primary/10 bg-white text-brand-primary/60",
                )}
            >
                <div className="flex items-start gap-2">
                    {isCorrect === true && (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    )}
                    {isCorrect === false && (
                        <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <span>{studentAnswer || "Sem resposta"}</span>
                </div>
            </div>

            {isCorrect === false && correctAnswers.length > 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 px-4 py-3">
                    <p className="text-xs text-emerald-700 font-medium mb-1">
                        Respostas aceites:
                    </p>
                    <ul className="space-y-0.5">
                        {correctAnswers
                            .filter((a) => a.trim())
                            .map((a, i) => (
                                <li key={i} className="text-sm text-emerald-700">
                                    {a}
                                </li>
                            ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
