"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight, ArrowRight, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardQuestion } from "@/lib/wizard-types";

interface AgentQuestionsDockProps {
    questions: WizardQuestion[];
    onSubmit: (answers: string) => void;
    disabled?: boolean;
}

export function AgentQuestionsDock({ questions, onSubmit, disabled }: AgentQuestionsDockProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, { selected: string[]; freeText: string; usingFreeText: boolean }>>({});

    const question = questions[currentIndex];
    if (!question) return null;

    const isMulti = question.type === "multi_select";
    const answer = answers[currentIndex] || { selected: [], freeText: "", usingFreeText: false };

    const toggleOption = (option: string) => {
        setAnswers((prev) => {
            const cur = prev[currentIndex] || { selected: [], freeText: "", usingFreeText: false };
            const selected = isMulti
                ? cur.selected.includes(option)
                    ? cur.selected.filter((o) => o !== option)
                    : [...cur.selected, option]
                : [option];
            return { ...prev, [currentIndex]: { ...cur, selected, usingFreeText: false } };
        });
    };

    const setFreeText = (text: string) => {
        setAnswers((prev) => {
            const cur = prev[currentIndex] || { selected: [], freeText: "", usingFreeText: true };
            return { ...prev, [currentIndex]: { ...cur, freeText: text, usingFreeText: true, selected: [] } };
        });
    };

    const startFreeText = () => {
        setAnswers((prev) => {
            const cur = prev[currentIndex] || { selected: [], freeText: "", usingFreeText: false };
            return { ...prev, [currentIndex]: { ...cur, usingFreeText: true, selected: [] } };
        });
    };

    const hasAnswer = answer.selected.length > 0 || (answer.usingFreeText && answer.freeText.trim().length > 0);
    const isLast = currentIndex === questions.length - 1;

    // For single_select: auto-advance on click if not last question, auto-submit if last
    const handleOptionClick = (option: string) => {
        if (disabled) return;
        toggleOption(option);

        if (!isMulti) {
            // Build answers with this selection included
            const updatedAnswers = {
                ...answers,
                [currentIndex]: { selected: [option], freeText: "", usingFreeText: false },
            };

            if (isLast) {
                // Submit all answers
                submitWithAnswers(updatedAnswers);
            } else {
                // Auto-advance to next question
                setAnswers(updatedAnswers);
                setTimeout(() => setCurrentIndex((i) => i + 1), 150);
            }
        }
    };

    const submitWithAnswers = (finalAnswers: typeof answers) => {
        const parts: string[] = [];
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            const a = finalAnswers[i] || { selected: [], freeText: "", usingFreeText: false };
            let response = "";
            if (a.usingFreeText && a.freeText.trim()) {
                response = a.freeText.trim();
            } else if (a.selected.length > 0) {
                response = a.selected.join(", ");
            } else {
                continue; // Skip unanswered
            }
            parts.push(`P: ${q.question}\nR: ${response}`);
        }
        onSubmit(parts.join("\n\n"));
    };

    const handleSubmit = () => {
        if (!hasAnswer) return;
        if (isLast) {
            submitWithAnswers(answers);
        } else {
            setCurrentIndex((i) => i + 1);
        }
    };

    const handleFreeTextSubmit = () => {
        if (!answer.freeText.trim()) return;
        const updatedAnswers = {
            ...answers,
            [currentIndex]: { ...answer },
        };
        if (isLast) {
            submitWithAnswers(updatedAnswers);
        } else {
            setAnswers(updatedAnswers);
            setCurrentIndex((i) => i + 1);
        }
    };

    return (
        <div className="space-y-1">
            {/* Header: question + navigation */}
            <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm font-medium text-brand-primary leading-snug flex-1">
                    {question.question}
                    {isMulti && (
                        <span className="text-brand-primary/30 font-normal text-xs ml-1.5">
                            (seleciona todas que se aplicam)
                        </span>
                    )}
                </p>
                {questions.length > 1 && (
                    <div className="flex items-center gap-1 shrink-0 text-brand-primary/30 text-xs">
                        <button
                            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                            disabled={currentIndex === 0}
                            className="disabled:opacity-20 hover:text-brand-primary/60 transition-colors"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <span className="tabular-nums">{currentIndex + 1} de {questions.length}</span>
                        <button
                            onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                            disabled={currentIndex === questions.length - 1}
                            className="disabled:opacity-20 hover:text-brand-primary/60 transition-colors"
                        >
                            <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}
            </div>

            {/* Options */}
            <div className="space-y-1">
                {question.options.map((option, i) => {
                    const isSelected = answer.selected.includes(option);
                    return (
                        <button
                            key={option}
                            onClick={() => handleOptionClick(option)}
                            disabled={disabled}
                            className={cn(
                                "flex items-center gap-3 w-full px-3 py-2.5 transition-all duration-150 outline-none focus-visible:outline-none text-left rounded-xl",
                                isSelected
                                    ? "bg-brand-primary/[0.08] ring-1 ring-brand-primary/20"
                                    : "hover:bg-brand-primary/[0.04]",
                            )}
                        >
                            <span
                                className={cn(
                                    "h-6 w-6 rounded-lg flex items-center justify-center text-xs font-semibold shrink-0 transition-colors",
                                    isSelected
                                        ? "bg-brand-primary text-white"
                                        : "bg-brand-primary/[0.06] text-brand-primary/50",
                                )}
                            >
                                {i + 1}
                            </span>
                            <span className={cn("text-sm flex-1", isSelected ? "text-brand-primary font-medium" : "text-brand-primary")}>{option}</span>
                            {isSelected && !isMulti && (
                                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-brand-primary/40" />
                                )}
                        </button>
                    );
                })}

                {/* Free text option */}
                {answer.usingFreeText ? (
                    <div className="flex items-center gap-3 px-3 py-2.5">
                        <span className="h-6 w-6 rounded-lg bg-brand-primary/[0.06] flex items-center justify-center shrink-0">
                            <Pencil className="h-3 w-3 text-brand-primary/40" />
                        </span>
                        <input
                            type="text"
                            autoFocus
                            value={answer.freeText}
                            onChange={(e) => setFreeText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleFreeTextSubmit();
                                }
                            }}
                            placeholder="Escreve aqui..."
                            className="flex-1 text-sm bg-transparent outline-none text-brand-primary placeholder:text-brand-primary/25 font-satoshi"
                        />
                        <button
                            onClick={handleFreeTextSubmit}
                            disabled={!answer.freeText.trim()}
                            className="h-7 w-7 rounded-lg bg-brand-primary disabled:opacity-20 flex items-center justify-center transition-all hover:bg-brand-primary/90"
                        >
                            <ArrowRight className="h-3.5 w-3.5 text-white" />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={startFreeText}
                        disabled={disabled}
                        className="flex items-center gap-3 w-full px-3 py-3 rounded-xl hover:bg-brand-primary/[0.04] transition-colors outline-none text-left"
                    >
                        <span className="h-6 w-6 rounded-lg bg-brand-primary/[0.06] flex items-center justify-center shrink-0">
                            <Pencil className="h-3 w-3 text-brand-primary/30" />
                        </span>
                        <span className="text-sm text-brand-primary/30">Outra opção</span>
                    </button>
                )}
            </div>

            {/* Multi-select submit button */}
            {isMulti && hasAnswer && (
                <div className="flex justify-end pt-1">
                    <button
                        onClick={handleSubmit}
                        disabled={disabled}
                        className="h-8 w-8 rounded-full bg-brand-accent flex items-center justify-center transition-all hover:bg-brand-accent/90"
                    >
                        <ArrowRight className="h-4 w-4 text-white" />
                    </button>
                </div>
            )}
        </div>
    );
}
