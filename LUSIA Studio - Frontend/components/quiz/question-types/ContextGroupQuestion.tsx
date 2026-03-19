"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import { QuizBlockText } from "@/components/quiz/QuizText";
import { QuizInlineTextEditor } from "@/lib/tiptap/QuizInlineTextEditor";

/* ─── Editor View ─── */
export function ContextGroupEditor({
    contextText,
    onContentChange,
}: {
    contextText: string;
    onContentChange: (patch: Record<string, any>) => void;
}) {
    return (
        <div className="space-y-1.5">
            <Label className="text-brand-primary/40 text-xs">
                Texto de contexto / introdução
            </Label>
            <div className="w-full rounded-xl border-2 border-brand-primary/10 bg-white px-5 py-4 transition-all focus-within:border-brand-accent/40 focus-within:ring-4 focus-within:ring-brand-accent/10">
                <QuizInlineTextEditor
                    fieldId="context-group:question"
                    value={contextText}
                    onChange={(value) => onContentChange({ question: value })}
                    placeholder="Escreve o texto de contexto do grupo..."
                    className="text-base text-brand-primary min-h-[5rem]"
                    showMathButton
                />
            </div>
            <p className="text-xs text-brand-primary/30">
                As subperguntas do grupo são editadas individualmente no documento.
            </p>
        </div>
    );
}

/* ─── Display View ─── */
export function ContextGroupDisplay({
    contextText,
}: {
    contextText: string;
}) {
    return (
        <div className="rounded-xl border border-dashed border-brand-primary/15 bg-brand-primary/3 px-4 py-3">
            {contextText ? (
                <QuizBlockText text={contextText} className="text-sm text-brand-primary/70 whitespace-pre-wrap" />
            ) : (
                <p className="text-sm text-brand-primary/70 whitespace-pre-wrap">Texto de contexto do grupo</p>
            )}
        </div>
    );
}
