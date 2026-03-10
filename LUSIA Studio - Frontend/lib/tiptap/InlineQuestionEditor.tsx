"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    type QuizQuestion,
    updateQuizQuestion,
} from "@/lib/quiz";
import { questionCache } from "./QuestionBlockView";

/* ------------------------------------------------------------------ */
/*  Editable text — contentEditable div that looks identical to static */
/* ------------------------------------------------------------------ */

function EditableText({
    value,
    onChange,
    placeholder,
    className,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    className?: string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const lastValue = useRef(value);

    // Only update DOM if value changed externally
    useEffect(() => {
        if (ref.current && value !== lastValue.current) {
            ref.current.textContent = value;
            lastValue.current = value;
        }
    }, [value]);

    // Set initial content
    useEffect(() => {
        if (ref.current) {
            ref.current.textContent = value;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleInput = useCallback(() => {
        const text = ref.current?.textContent ?? "";
        lastValue.current = text;
        onChange(text);
    }, [onChange]);

    return (
        <div
            ref={ref}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            data-placeholder={placeholder}
            className={`outline-none cursor-text empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40 ${className ?? ""}`}
        />
    );
}

/* ------------------------------------------------------------------ */
/*  InlineQuestionEditor                                               */
/* ------------------------------------------------------------------ */

interface InlineQuestionEditorProps {
    question: QuizQuestion;
    index: number;
    onClose: () => void;
    onQuestionUpdate: (updated: QuizQuestion) => void;
}

export function InlineQuestionEditor({
    question,
    index,
    onClose,
    onQuestionUpdate,
}: InlineQuestionEditorProps) {
    const [content, setContent] = useState<Record<string, any>>(() => ({ ...question.content }));
    const [saving, setSaving] = useState(false);
    const pendingRef = useRef<Record<string, any> | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const flush = useCallback(async () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (!pendingRef.current) return;
        const snapshot = pendingRef.current;
        pendingRef.current = null;

        setSaving(true);
        try {
            const payload: Parameters<typeof updateQuizQuestion>[1] = {
                type: question.type,
                content: snapshot,
            };
            if (question.source_type === "ai_created") {
                payload.source_type = "ai_created_teacher_edited";
            }
            const updated = await updateQuizQuestion(question.id, payload);
            questionCache.set(question.id, updated);
            onQuestionUpdate(updated);
        } catch (e) {
            console.error("Failed to save question inline:", e);
        } finally {
            setSaving(false);
        }
    }, [question.id, question.type, question.source_type, onQuestionUpdate]);

    const scheduleSave = useCallback(
        (newContent: Record<string, any>) => {
            pendingRef.current = newContent;
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => flush(), 800);
        },
        [flush],
    );

    const patch = useCallback(
        (p: Record<string, any>) => {
            setContent((prev) => {
                const next = { ...prev, ...p };
                scheduleSave(next);
                return next;
            });
        },
        [scheduleSave],
    );

    const handleClose = useCallback(() => {
        flush().then(() => onClose());
    }, [flush, onClose]);

    useEffect(() => {
        function onPointerDown(e: PointerEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                handleClose();
            }
        }
        document.addEventListener("pointerdown", onPointerDown, true);
        return () => document.removeEventListener("pointerdown", onPointerDown, true);
    }, [handleClose]);

    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

    const stopProp = useCallback((e: React.MouseEvent | React.PointerEvent) => {
        e.stopPropagation();
    }, []);

    const label = question.label ?? `${index}.`;

    return (
        <div ref={wrapperRef} onMouseDown={stopProp} onClick={stopProp}>
            <div className="flex items-start gap-3">
                <span className="shrink-0 font-bold text-sm text-foreground leading-relaxed pt-px">
                    {label}
                </span>

                <div className="flex-1 min-w-0 space-y-2">
                    {/* Question text — identical to static <p> */}
                    <EditableText
                        value={content.question ?? ""}
                        onChange={(v) => patch({ question: v })}
                        placeholder="Escreve o enunciado..."
                        className="text-sm text-foreground leading-relaxed whitespace-pre-wrap"
                    />

                    {/* Tip */}
                    {content.tip != null && (
                        <EditableText
                            value={content.tip ?? ""}
                            onChange={(v) => patch({ tip: v || null })}
                            placeholder="Instrução (opcional)"
                            className="text-xs italic text-muted-foreground"
                        />
                    )}

                    {/* Type-specific body */}
                    <TypeEditor type={question.type} content={content} patch={patch} />
                </div>
            </div>

            {/* Bottom bar */}
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-foreground/8">
                <span className={`text-xs ${saving ? "text-foreground/40 animate-pulse" : "text-foreground/20"}`}>
                    {saving ? "A guardar..." : "Guardado"}
                </span>
                <button
                    type="button"
                    onClick={handleClose}
                    className="text-xs font-medium text-brand-accent hover:text-brand-accent/80 transition-colors px-3 py-1.5 rounded-lg hover:bg-brand-accent/5"
                >
                    Concluir
                </button>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Type-specific editors                                              */
/* ------------------------------------------------------------------ */

function TypeEditor({
    type,
    content,
    patch,
}: {
    type: string;
    content: Record<string, any>;
    patch: (p: Record<string, any>) => void;
}) {
    switch (type) {
        case "multiple_choice":
        case "multiple_response":
            return <OptionsEditor content={content} patch={patch} />;
        case "true_false":
            return <TrueFalseEditor content={content} patch={patch} />;
        case "fill_blank":
            return <FillBlankEditor content={content} patch={patch} />;
        case "short_answer":
            return <ShortAnswerEditor content={content} patch={patch} />;
        case "matching":
            return <MatchingEditor content={content} patch={patch} />;
        case "ordering":
            return <OrderingEditor content={content} patch={patch} />;
        case "open_extended":
            return <OpenExtendedEditor content={content} patch={patch} />;
        case "context_group":
            return null;
        default:
            return null;
    }
}

function letter(i: number) {
    return String.fromCharCode(65 + i);
}

/* ── MC / MR ── */

function OptionsEditor({
    content,
    patch,
}: {
    content: Record<string, any>;
    patch: (p: Record<string, any>) => void;
}) {
    const options: { id: string; text: string }[] = content.options ?? [];
    const correctAnswer = content.correct_answer ?? content.solution ?? null;
    const correctAnswers: string[] = content.correct_answers ?? (Array.isArray(content.solution) ? content.solution : []);

    const updateOption = (idx: number, text: string) => {
        const next = options.map((o, i) => (i === idx ? { ...o, text } : o));
        patch({ options: next });
    };

    return (
        <ul className="space-y-2.5 pt-1 pl-3">
            {options.map((opt, i) => {
                const isCorrect = correctAnswer === opt.id || correctAnswers.includes(opt.id);
                return (
                    <li key={opt.id ?? i} className="flex items-start gap-2.5 text-sm text-foreground">
                        <span className={`shrink-0 font-bold ${isCorrect ? "text-emerald-600" : ""}`}>
                            ({letter(i)})
                        </span>
                        <EditableText
                            value={opt.text}
                            onChange={(v) => updateOption(i, v)}
                            className="flex-1 text-sm text-foreground"
                        />
                    </li>
                );
            })}
        </ul>
    );
}

/* ── True/False ── */

function TrueFalseEditor({
    content,
    patch,
}: {
    content: Record<string, any>;
    patch: (p: Record<string, any>) => void;
}) {
    const correct = content.correct_answer;
    const labels = ["Verdadeiro", "Falso"];
    const values = [true, false];

    return (
        <ul className="space-y-2.5 pt-1 pl-3">
            {labels.map((label, i) => (
                <li key={label} className="flex items-center gap-2.5 text-sm text-foreground">
                    <button
                        type="button"
                        onClick={() => patch({ correct_answer: values[i] })}
                        className={`shrink-0 font-bold transition-colors ${correct === values[i] ? "text-emerald-600" : ""}`}
                    >
                        ({letter(i)})
                    </button>
                    <span>{label}</span>
                </li>
            ))}
        </ul>
    );
}

/* ── Fill blank ── */

function FillBlankEditor({
    content,
    patch,
}: {
    content: Record<string, any>;
    patch: (p: Record<string, any>) => void;
}) {
    const blanks: { id: string; correct_answer: string }[] = content.blanks ?? [];

    const updateBlank = (idx: number, value: string) => {
        const next = blanks.map((b, i) => (i === idx ? { ...b, correct_answer: value } : b));
        patch({ blanks: next });
    };

    return (
        <div className="space-y-1.5 pt-1 pl-3">
            {blanks.map((blank, i) => (
                <div key={blank.id ?? i} className="flex items-center gap-2 text-sm">
                    <span className="shrink-0 text-muted-foreground text-xs">Lacuna {i + 1}:</span>
                    <EditableText
                        value={blank.correct_answer}
                        onChange={(v) => updateBlank(i, v)}
                        placeholder="Resposta correta"
                        className="flex-1 text-sm text-foreground"
                    />
                </div>
            ))}
        </div>
    );
}

/* ── Short answer ── */

function ShortAnswerEditor({
    content,
    patch,
}: {
    content: Record<string, any>;
    patch: (p: Record<string, any>) => void;
}) {
    const answers: string[] = content.correct_answers ?? [""];

    const update = (idx: number, value: string) => {
        const next = [...answers];
        next[idx] = value;
        patch({ correct_answers: next });
    };

    return (
        <div className="space-y-1.5 pt-1 pl-3">
            {answers.map((ans, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="shrink-0 text-emerald-600 text-xs font-medium">
                        {i === 0 ? "Resposta:" : `Alt ${i}:`}
                    </span>
                    <EditableText
                        value={ans}
                        onChange={(v) => update(i, v)}
                        placeholder="Resposta correta"
                        className="flex-1 text-sm text-foreground"
                    />
                </div>
            ))}
        </div>
    );
}

/* ── Matching ── */

function MatchingEditor({
    content,
    patch,
}: {
    content: Record<string, any>;
    patch: (p: Record<string, any>) => void;
}) {
    const left: { id: string; text: string }[] = content.left_items ?? [];
    const right: { id: string; text: string }[] = content.right_items ?? [];

    const updateLeft = (idx: number, text: string) => {
        const next = left.map((item, i) => (i === idx ? { ...item, text } : item));
        patch({ left_items: next });
    };
    const updateRight = (idx: number, text: string) => {
        const next = right.map((item, i) => (i === idx ? { ...item, text } : item));
        patch({ right_items: next });
    };

    return (
        <div className="flex gap-10 text-sm pt-1 pl-3">
            <ul className="space-y-2 flex-1">
                {left.map((item, i) => (
                    <li key={item.id ?? i} className="flex items-center gap-2">
                        <span className="font-bold shrink-0">{letter(i)}.</span>
                        <EditableText
                            value={item.text}
                            onChange={(v) => updateLeft(i, v)}
                            className="flex-1 text-sm"
                        />
                    </li>
                ))}
            </ul>
            <ul className="space-y-2 flex-1">
                {right.map((item, i) => (
                    <li key={item.id ?? i} className="flex items-center gap-2">
                        <span className="font-bold shrink-0">{i + 1}.</span>
                        <EditableText
                            value={item.text}
                            onChange={(v) => updateRight(i, v)}
                            className="flex-1 text-sm"
                        />
                    </li>
                ))}
            </ul>
        </div>
    );
}

/* ── Ordering ── */

function OrderingEditor({
    content,
    patch,
}: {
    content: Record<string, any>;
    patch: (p: Record<string, any>) => void;
}) {
    const items: { id: string; text: string }[] = content.items ?? [];

    const update = (idx: number, text: string) => {
        const next = items.map((item, i) => (i === idx ? { ...item, text } : item));
        patch({ items: next });
    };

    return (
        <ul className="space-y-2.5 pt-1 pl-3">
            {items.map((item, i) => (
                <li key={item.id ?? i} className="flex items-start gap-2.5 text-sm text-foreground">
                    <span className="shrink-0 font-bold">({letter(i)})</span>
                    <EditableText
                        value={item.text}
                        onChange={(v) => update(i, v)}
                        className="flex-1 text-sm text-foreground"
                    />
                </li>
            ))}
        </ul>
    );
}

/* ── Open extended ── */

function OpenExtendedEditor({
    content,
    patch,
}: {
    content: Record<string, any>;
    patch: (p: Record<string, any>) => void;
}) {
    return (
        <div className="space-y-2 pt-1 pl-3">
            <div className="space-y-1">
                <span className="text-xs text-emerald-600 font-medium">Resposta modelo:</span>
                <EditableText
                    value={content.solution ?? ""}
                    onChange={(v) => patch({ solution: v })}
                    placeholder="Resposta modelo..."
                    className="text-sm text-foreground leading-relaxed whitespace-pre-wrap"
                />
            </div>
            <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Critérios (opcional):</span>
                <EditableText
                    value={content.criteria ?? ""}
                    onChange={(v) => patch({ criteria: v })}
                    placeholder="Critérios de avaliação..."
                    className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap"
                />
            </div>
        </div>
    );
}
