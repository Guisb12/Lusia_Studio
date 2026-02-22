"use client";

import React, { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LatexText } from "@/components/quiz/LatexText";

interface Option {
    id: string;
    text: string;
}
interface Blank {
    id: string;
    correct_answer: string;
}

function parseBlanks(question: string): (string | { blankIndex: number })[] {
    const parts: (string | { blankIndex: number })[] = [];
    let blankIndex = 0;
    const segments = question.split("{{blank}}");
    segments.forEach((segment, i) => {
        if (segment) parts.push(segment);
        if (i < segments.length - 1) {
            parts.push({ blankIndex: blankIndex++ });
        }
    });
    return parts;
}

/* ─── Student View ─── */
export function FillBlankStudent({
    questionText,
    options,
    blanks,
    answer,
    onAnswerChange,
}: {
    questionText: string;
    options: Option[];
    blanks: Blank[];
    answer?: Record<string, string>;
    onAnswerChange?: (value: Record<string, string>) => void;
}) {
    const parts = useMemo(() => parseBlanks(questionText), [questionText]);

    return (
        <div className="text-sm text-brand-primary/80 leading-[2.2] flex flex-wrap items-baseline gap-y-1">
            {parts.map((part, i) => {
                if (typeof part === "string") {
                    return <span key={i}><LatexText>{part}</LatexText></span>;
                }
                const blank = blanks[part.blankIndex];
                if (!blank) return null;
                return (
                    <select
                        key={blank.id}
                        value={answer?.[blank.id] || ""}
                        onChange={(e) => {
                            const next = { ...(answer || {}) };
                            next[blank.id] = e.target.value || "";
                            onAnswerChange?.(next);
                        }}
                        className="mx-1 inline-flex rounded-lg border-2 border-brand-primary/15 bg-white px-3 py-1.5 text-sm text-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent/40 transition-all"
                    >
                        <option value="">Selecionar...</option>
                        {options.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.text}
                            </option>
                        ))}
                    </select>
                );
            })}
        </div>
    );
}

/* ─── Editor View ─── */
export function FillBlankEditor({
    questionText,
    options,
    blanks,
    onContentChange,
}: {
    questionText: string;
    options: Option[];
    blanks: Blank[];
    onContentChange: (patch: Record<string, any>) => void;
}) {
    const updateOption = (index: number, text: string) => {
        const next = options.map((o, i) => (i === index ? { ...o, text } : o));
        onContentChange({ options: next });
    };

    const removeOption = (index: number) => {
        onContentChange({ options: options.filter((_, i) => i !== index) });
    };

    const addOption = () => {
        onContentChange({
            options: [
                ...options,
                { id: crypto.randomUUID(), text: `Resposta ${options.length + 1}` },
            ],
        });
    };

    const updateBlankAnswer = (blankIndex: number, correctAnswer: string) => {
        const next = blanks.map((b, i) =>
            i === blankIndex ? { ...b, correct_answer: correctAnswer } : b,
        );
        onContentChange({ blanks: next });
    };

    const addBlank = () => {
        onContentChange({
            blanks: [...blanks, { id: crypto.randomUUID(), correct_answer: "" }],
        });
    };

    const removeBlank = (index: number) => {
        onContentChange({ blanks: blanks.filter((_, i) => i !== index) });
    };

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label className="text-brand-primary/60 text-xs">
                    Texto da pergunta (usa {"{{blank}}"} para marcar lacunas)
                </Label>
                <Textarea
                    value={questionText}
                    onChange={(e) =>
                        onContentChange({ question: e.target.value })
                    }
                    rows={2}
                    className="resize-none text-sm"
                    placeholder='Ex: A capital de Portugal é {{blank}} e a segunda cidade é {{blank}}.'
                />
            </div>

            <div className="space-y-2">
                <Label className="text-brand-primary/60 text-xs">Opções de resposta</Label>
                {options.map((opt, index) => (
                    <div key={opt.id} className="flex items-center gap-2">
                        <Input
                            value={opt.text}
                            onChange={(e) => updateOption(index, e.target.value)}
                            placeholder={`Opção ${index + 1}`}
                            className="text-sm"
                        />
                        {options.length > 2 && (
                            <button
                                type="button"
                                onClick={() => removeOption(index)}
                                className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                            >
                                <Trash2 className="h-3.5 w-3.5 text-brand-error/60" />
                            </button>
                        )}
                    </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addOption} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar opção
                </Button>
            </div>

            <div className="space-y-2">
                <Label className="text-brand-primary/60 text-xs">Lacunas e respostas corretas</Label>
                {blanks.map((blank, index) => (
                    <div
                        key={blank.id}
                        className="rounded-xl border border-brand-primary/10 p-3 flex items-center gap-3"
                    >
                        <span className="text-xs text-brand-primary/40 shrink-0">
                            Lacuna {index + 1}
                        </span>
                        <select
                            value={blank.correct_answer || ""}
                            onChange={(e) => updateBlankAnswer(index, e.target.value)}
                            className="flex-1 rounded-lg border border-brand-primary/15 bg-white px-3 py-1.5 text-sm text-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-accent/20"
                        >
                            <option value="">Selecionar correta...</option>
                            {options.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                    {opt.text}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => removeBlank(index)}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                        >
                            <Trash2 className="h-3.5 w-3.5 text-brand-error/60" />
                        </button>
                    </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addBlank} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar lacuna
                </Button>
            </div>
        </div>
    );
}

/* ─── Review View ─── */
export function FillBlankReview({
    questionText,
    options,
    blanks,
    answer,
}: {
    questionText: string;
    options: Option[];
    blanks: Blank[];
    answer?: Record<string, string>;
}) {
    const parts = useMemo(() => parseBlanks(questionText), [questionText]);
    const optionMap = useMemo(
        () => new Map(options.map((o) => [o.id, o.text])),
        [options],
    );

    return (
        <div className="text-sm text-brand-primary/80 leading-[2.2] flex flex-wrap items-baseline gap-y-1">
            {parts.map((part, i) => {
                if (typeof part === "string") {
                    return <span key={i}><LatexText>{part}</LatexText></span>;
                }
                const blank = blanks[part.blankIndex];
                if (!blank) return null;
                const selectedId = answer?.[blank.id];
                const isCorrect = selectedId === blank.correct_answer;
                const selectedText = selectedId
                    ? optionMap.get(selectedId) || "?"
                    : "—";
                return (
                    <span
                        key={blank.id}
                        className={cn(
                            "mx-1 inline-flex rounded-lg border-2 px-3 py-1 text-sm font-medium",
                            selectedId
                                ? isCorrect
                                    ? "border-emerald-400 bg-emerald-50/40 text-emerald-700"
                                    : "border-red-300 bg-red-50/30 text-red-600"
                                : "border-brand-primary/10 bg-brand-primary/5 text-brand-primary/40",
                        )}
                    >
                        {selectedText}
                    </span>
                );
            })}
        </div>
    );
}
