"use client";

import React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { MathBlockText, MathEditableText } from "@/lib/tiptap/math-rich-text";

/* ─── Student View ─── */
export function OpenExtendedStudent({
    answer,
    onAnswerChange,
}: {
    answer?: string;
    onAnswerChange?: (value: string) => void;
}) {
    return (
        <div className="space-y-2">
            <textarea
                value={typeof answer === "string" ? answer : ""}
                onChange={(e) => onAnswerChange?.(e.target.value)}
                placeholder="Escreve a tua resposta..."
                rows={6}
                className="w-full rounded-xl border-2 border-brand-primary/10 bg-white px-5 py-4 text-base text-brand-primary placeholder:text-brand-primary/25 outline-none focus:border-brand-accent/40 focus:ring-4 focus:ring-brand-accent/10 transition-all resize-y"
            />
            <div className="flex justify-end">
                <span className="text-[11px] text-brand-primary/25">
                    {(typeof answer === "string" ? answer : "").length} caracteres
                </span>
            </div>
        </div>
    );
}

/* ─── Editor View ─── */
export function OpenExtendedEditor({
    solution,
    criteria,
    onContentChange,
}: {
    solution: string;
    criteria: string;
    onContentChange: (patch: Record<string, any>) => void;
}) {
    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label className="text-brand-primary/40 text-xs">
                    Resposta modelo
                </Label>
                <div className="w-full rounded-xl border-2 border-brand-primary/10 bg-white px-5 py-4 transition-all focus-within:border-brand-accent/40 focus-within:ring-4 focus-within:ring-brand-accent/10">
                    <MathEditableText
                        value={solution}
                        onChange={(value) => onContentChange({ solution: value })}
                        placeholder="Escreve a resposta modelo..."
                        className="text-base text-brand-primary min-h-[5rem]"
                        showMathButton
                    />
                </div>
            </div>

            <div className="space-y-1.5">
                <Label className="text-brand-primary/40 text-xs">
                    Critérios de avaliação (opcional)
                </Label>
                <div className="w-full rounded-xl border-2 border-brand-primary/8 bg-white px-5 py-3 transition-all focus-within:border-brand-accent/40 focus-within:ring-4 focus-within:ring-brand-accent/10">
                    <MathEditableText
                        value={criteria}
                        onChange={(value) => onContentChange({ criteria: value })}
                        placeholder="Critérios para avaliar a resposta..."
                        className="text-sm text-brand-primary min-h-[4rem]"
                    />
                </div>
            </div>
        </div>
    );
}

/* ─── Review View ─── */
export function OpenExtendedReview({
    answer,
    solution,
    isCorrect,
}: {
    answer?: string;
    solution?: string;
    isCorrect?: boolean | null;
}) {
    const studentAnswer = typeof answer === "string" ? answer : "";

    return (
        <div className="space-y-3">
            <div
                className={cn(
                    "rounded-xl border-2 px-5 py-4 text-base whitespace-pre-wrap",
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

            {solution && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 px-4 py-3">
                    <p className="text-xs text-emerald-700 font-medium mb-1">
                        Resposta modelo:
                    </p>
                    <MathBlockText text={solution} className="text-sm text-emerald-700 whitespace-pre-wrap" />
                </div>
            )}
        </div>
    );
}
