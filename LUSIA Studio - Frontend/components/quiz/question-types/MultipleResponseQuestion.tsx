"use client";

import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, ImagePlus, Plus, Square, SquareCheck, Trash2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface Option {
    id: string;
    text: string;
    image_url?: string | null;
}

/* ─── Student View ─── */
export function MultipleResponseStudent({
    options,
    answer,
    onAnswerChange,
}: {
    options: Option[];
    answer?: string[];
    onAnswerChange?: (value: string[]) => void;
}) {
    const selected = new Set(Array.isArray(answer) ? answer : []);

    return (
        <div className="space-y-2.5">
            {options.map((option) => {
                const checked = selected.has(option.id);
                return (
                    <motion.button
                        key={option.id}
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                            const next = new Set(selected);
                            if (checked) next.delete(option.id);
                            else next.add(option.id);
                            onAnswerChange?.(Array.from(next));
                        }}
                        className={cn(
                            "w-full rounded-xl border-2 px-4 py-3.5 text-left flex items-center gap-3 transition-all duration-200",
                            checked
                                ? "border-brand-accent bg-brand-accent/5"
                                : "border-brand-primary/8 hover:border-brand-primary/20 bg-white",
                        )}
                    >
                        {checked ? (
                            <SquareCheck className="h-5 w-5 text-brand-accent shrink-0" />
                        ) : (
                            <Square className="h-5 w-5 text-brand-primary/25 shrink-0" />
                        )}
                        {option.image_url && (
                            <img
                                src={option.image_url}
                                alt=""
                                className="w-10 h-10 rounded-lg object-cover border border-brand-primary/10 shrink-0"
                            />
                        )}
                        <span
                            className={cn(
                                "text-sm leading-relaxed",
                                checked
                                    ? "text-brand-primary font-medium"
                                    : "text-brand-primary/75",
                            )}
                        >
                            {option.text}
                        </span>
                    </motion.button>
                );
            })}
        </div>
    );
}

/* ─── Editor View ─── */
export function MultipleResponseEditor({
    options,
    correctAnswers,
    onContentChange,
    onImageUpload,
}: {
    options: Option[];
    correctAnswers: string[];
    onContentChange: (patch: Record<string, any>) => void;
    onImageUpload?: (file: File) => Promise<string>;
}) {
    const correctSet = new Set(correctAnswers);

    const updateOption = (index: number, patch: Partial<Option>) => {
        const next = options.map((o, i) =>
            i === index ? { ...o, ...patch } : o,
        );
        onContentChange({ options: next });
    };

    const removeOption = (index: number) => {
        const removed = options[index];
        const nextOptions = options.filter((_, i) => i !== index);
        const nextCorrect = correctAnswers.filter((id) => id !== removed.id);
        onContentChange({ options: nextOptions, correct_answers: nextCorrect });
    };

    const addOption = () => {
        onContentChange({
            options: [
                ...options,
                { id: crypto.randomUUID(), text: `Opção ${options.length + 1}`, image_url: null },
            ],
        });
    };

    const toggleCorrect = (optionId: string) => {
        const next = new Set(correctSet);
        if (next.has(optionId)) next.delete(optionId);
        else next.add(optionId);
        onContentChange({ correct_answers: Array.from(next) });
    };

    return (
        <div className="space-y-2.5">
            {options.map((option, index) => {
                const isCorrect = correctSet.has(option.id);
                return (
                    <div
                        key={option.id}
                        className={cn(
                            "rounded-xl border-2 px-4 py-3 flex items-start gap-3 transition-all",
                            isCorrect
                                ? "border-emerald-300 bg-emerald-50/30"
                                : "border-brand-primary/8 bg-white",
                        )}
                    >
                        <Checkbox
                            checked={isCorrect}
                            onCheckedChange={() => toggleCorrect(option.id)}
                            className="mt-1"
                        />
                        <div className="flex-1 space-y-2">
                            <Input
                                value={option.text}
                                onChange={(e) =>
                                    updateOption(index, { text: e.target.value })
                                }
                                placeholder={`Opção ${index + 1}`}
                                className="text-sm"
                            />
                            {option.image_url && (
                                <div className="flex items-center gap-2">
                                    <img
                                        src={option.image_url}
                                        alt=""
                                        className="w-16 h-16 rounded-lg object-cover border border-brand-primary/10"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="xs"
                                        onClick={() =>
                                            updateOption(index, { image_url: null })
                                        }
                                    >
                                        Remover
                                    </Button>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 mt-1">
                            {onImageUpload && !option.image_url && (
                                <label className="cursor-pointer p-1.5 rounded-lg hover:bg-brand-primary/5 transition-colors">
                                    <ImagePlus className="h-4 w-4 text-brand-primary/30" />
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file || !onImageUpload) return;
                                            const url = await onImageUpload(file);
                                            updateOption(index, { image_url: url });
                                            e.currentTarget.value = "";
                                        }}
                                    />
                                </label>
                            )}
                            {options.length > 2 && (
                                <button
                                    type="button"
                                    onClick={() => removeOption(index)}
                                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                >
                                    <Trash2 className="h-4 w-4 text-brand-error/60" />
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addOption}
                className="gap-1.5"
            >
                <Plus className="h-3.5 w-3.5" />
                Adicionar opção
            </Button>
        </div>
    );
}

/* ─── Review View ─── */
export function MultipleResponseReview({
    options,
    answer,
    correctAnswers,
}: {
    options: Option[];
    answer?: string[];
    correctAnswers: string[];
}) {
    const selected = new Set(Array.isArray(answer) ? answer : []);
    const correct = new Set(correctAnswers);

    return (
        <div className="space-y-2.5">
            {options.map((option) => {
                const isSelected = selected.has(option.id);
                const isCorrectOption = correct.has(option.id);

                let borderClass = "border-brand-primary/8 bg-white";
                let icon = null;
                if (isSelected && isCorrectOption) {
                    borderClass = "border-emerald-400 bg-emerald-50/40";
                    icon = <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />;
                } else if (isSelected && !isCorrectOption) {
                    borderClass = "border-red-300 bg-red-50/30";
                    icon = <XCircle className="h-5 w-5 text-red-500 shrink-0" />;
                } else if (!isSelected && isCorrectOption) {
                    borderClass = "border-emerald-300/50 bg-emerald-50/20";
                    icon = <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />;
                } else {
                    icon = <Square className="h-5 w-5 text-brand-primary/15 shrink-0" />;
                }

                return (
                    <div
                        key={option.id}
                        className={cn(
                            "w-full rounded-xl border-2 px-4 py-3.5 flex items-center gap-3",
                            borderClass,
                        )}
                    >
                        {icon}
                        {option.image_url && (
                            <img
                                src={option.image_url}
                                alt=""
                                className="w-10 h-10 rounded-lg object-cover border border-brand-primary/10 shrink-0"
                            />
                        )}
                        <span className="text-sm text-brand-primary/75 leading-relaxed">
                            {option.text}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
