"use client";

import React from "react";
import { ArrowRight, CheckCircle2, Plus, Trash2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LatexText } from "@/components/quiz/LatexText";

interface MatchItem {
    id: string;
    text: string;
}

/* ─── Student View ─── */
export function MatchingStudent({
    leftItems,
    rightItems,
    answer,
    onAnswerChange,
}: {
    leftItems: MatchItem[];
    rightItems: MatchItem[];
    answer?: Record<string, string>;
    onAnswerChange?: (value: Record<string, string>) => void;
}) {
    return (
        <div className="space-y-3">
            {leftItems.map((left) => {
                const selected = answer?.[left.id] || "";
                return (
                    <div
                        key={left.id}
                        className="grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-3 items-center"
                    >
                        <div className="rounded-xl border-2 border-brand-primary/8 bg-white px-3 py-3 text-sm text-brand-primary/80">
                            <LatexText>{left.text}</LatexText>
                        </div>
                        <ArrowRight className="h-4 w-4 text-brand-primary/25 shrink-0" />
                        <select
                            value={selected}
                            onChange={(e) => {
                                const next = { ...(answer || {}) };
                                next[left.id] = e.target.value || "";
                                onAnswerChange?.(next);
                            }}
                            className={cn(
                                "w-full rounded-xl border-2 px-3 py-3 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent/20",
                                selected
                                    ? "border-brand-accent/30 bg-brand-accent/5 text-brand-primary"
                                    : "border-brand-primary/8 bg-white text-brand-primary/60",
                            )}
                        >
                            <option value="">Selecionar...</option>
                            {rightItems.map((right) => (
                                <option key={right.id} value={right.id}>
                                    {right.text}
                                </option>
                            ))}
                        </select>
                    </div>
                );
            })}
        </div>
    );
}

/* ─── Editor View ─── */
export function MatchingEditor({
    leftItems,
    rightItems,
    correctPairs,
    onContentChange,
}: {
    leftItems: MatchItem[];
    rightItems: MatchItem[];
    correctPairs: [string, string][];
    onContentChange: (patch: Record<string, any>) => void;
}) {
    const pairMap = new Map(
        correctPairs
            .filter((p) => Array.isArray(p) && p.length === 2)
            .map((p) => [String(p[0]), String(p[1])]),
    );

    return (
        <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label className="text-brand-primary/60 text-xs">Coluna esquerda</Label>
                    {leftItems.map((item, index) => (
                        <div key={item.id} className="flex items-center gap-2">
                            <Input
                                value={item.text}
                                onChange={(e) => {
                                    const next = [...leftItems];
                                    next[index] = { ...item, text: e.target.value };
                                    onContentChange({ left_items: next });
                                }}
                                className="text-sm"
                            />
                            {leftItems.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const nextLeft = leftItems.filter((_, i) => i !== index);
                                        const nextPairs = correctPairs.filter((p) => String(p[0]) !== item.id);
                                        onContentChange({ left_items: nextLeft, correct_pairs: nextPairs });
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                                >
                                    <Trash2 className="h-3.5 w-3.5 text-brand-error/60" />
                                </button>
                            )}
                        </div>
                    ))}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            onContentChange({
                                left_items: [...leftItems, { id: crypto.randomUUID(), text: "" }],
                            })
                        }
                        className="gap-1.5"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Item esquerda
                    </Button>
                </div>

                <div className="space-y-2">
                    <Label className="text-brand-primary/60 text-xs">Coluna direita</Label>
                    {rightItems.map((item, index) => (
                        <div key={item.id} className="flex items-center gap-2">
                            <Input
                                value={item.text}
                                onChange={(e) => {
                                    const next = [...rightItems];
                                    next[index] = { ...item, text: e.target.value };
                                    onContentChange({ right_items: next });
                                }}
                                className="text-sm"
                            />
                            {rightItems.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const nextRight = rightItems.filter((_, i) => i !== index);
                                        const nextPairs = correctPairs.filter((p) => String(p[1]) !== item.id);
                                        onContentChange({ right_items: nextRight, correct_pairs: nextPairs });
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                                >
                                    <Trash2 className="h-3.5 w-3.5 text-brand-error/60" />
                                </button>
                            )}
                        </div>
                    ))}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            onContentChange({
                                right_items: [...rightItems, { id: crypto.randomUUID(), text: "" }],
                            })
                        }
                        className="gap-1.5"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Item direita
                    </Button>
                </div>
            </div>

            <div className="space-y-2">
                <Label className="text-brand-primary/60 text-xs">Pares corretos</Label>
                {leftItems.map((left) => (
                    <div
                        key={left.id}
                        className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center"
                    >
                        <div className="text-sm text-brand-primary/70 rounded-lg border border-brand-primary/10 px-3 py-2 truncate">
                            {left.text || "—"}
                        </div>
                        <ArrowRight className="h-4 w-4 text-brand-primary/25 shrink-0" />
                        <select
                            value={pairMap.get(left.id) || ""}
                            onChange={(e) => {
                                const newMap = new Map(pairMap);
                                if (e.target.value) {
                                    newMap.set(left.id, e.target.value);
                                } else {
                                    newMap.delete(left.id);
                                }
                                onContentChange({
                                    correct_pairs: Array.from(newMap.entries()),
                                });
                            }}
                            className="w-full rounded-lg border border-brand-primary/15 bg-white px-3 py-2 text-sm text-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-accent/20"
                        >
                            <option value="">Selecionar...</option>
                            {rightItems.map((right) => (
                                <option key={right.id} value={right.id}>
                                    {right.text}
                                </option>
                            ))}
                        </select>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ─── Review View ─── */
export function MatchingReview({
    leftItems,
    rightItems,
    answer,
    correctPairs,
}: {
    leftItems: MatchItem[];
    rightItems: MatchItem[];
    answer?: Record<string, string>;
    correctPairs: [string, string][];
}) {
    const pairMap = new Map(
        correctPairs
            .filter((p) => Array.isArray(p) && p.length === 2)
            .map((p) => [String(p[0]), String(p[1])]),
    );
    const rightMap = new Map(rightItems.map((r) => [r.id, r.text]));

    return (
        <div className="space-y-3">
            {leftItems.map((left) => {
                const selectedId = answer?.[left.id] || "";
                const correctId = pairMap.get(left.id) || "";
                const isCorrect = selectedId === correctId;
                const selectedText = selectedId
                    ? rightMap.get(selectedId) || "?"
                    : "—";
                const correctText = correctId
                    ? rightMap.get(correctId) || "?"
                    : "—";

                return (
                    <div
                        key={left.id}
                        className="grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-3 items-center"
                    >
                        <div className="rounded-xl border-2 border-brand-primary/8 bg-white px-3 py-3 text-sm text-brand-primary/80">
                            <LatexText>{left.text}</LatexText>
                        </div>
                        <ArrowRight className="h-4 w-4 text-brand-primary/25 shrink-0" />
                        <div
                            className={cn(
                                "rounded-xl border-2 px-3 py-3 text-sm flex items-center gap-2",
                                selectedId
                                    ? isCorrect
                                        ? "border-emerald-400 bg-emerald-50/40 text-emerald-700"
                                        : "border-red-300 bg-red-50/30 text-red-600"
                                    : "border-brand-primary/10 bg-brand-primary/5 text-brand-primary/40",
                            )}
                        >
                            {selectedId && isCorrect && (
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                            )}
                            {selectedId && !isCorrect && (
                                <XCircle className="h-4 w-4 shrink-0" />
                            )}
                            <span className="truncate">
                                <LatexText>{selectedText}</LatexText>
                                {!isCorrect && selectedId && (
                                    <span className="ml-2 text-emerald-600 text-xs">
                                        (correta: <LatexText>{correctText}</LatexText>)
                                    </span>
                                )}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
