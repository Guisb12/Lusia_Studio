"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight, ArrowRight, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardQuestion } from "@/lib/wizard-types";
import { motion, AnimatePresence } from "framer-motion";

interface AgentQuestionsDockProps {
    questions: WizardQuestion[];
    onSubmit: (answers: string) => void;
    disabled?: boolean;
    onBack?: () => void;
}

export function AgentQuestionsDock({ questions, onSubmit, disabled, onBack }: AgentQuestionsDockProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, { selected: string[]; freeText: string; usingFreeText: boolean }>>({});
    const [direction, setDirection] = useState<1 | -1>(1);

    const question = questions[currentIndex];
    if (!question) return null;

    const isMulti = question.type === "multi_select";
    const answer = answers[currentIndex] || { selected: [], freeText: "", usingFreeText: false };

    const goTo = (index: number) => {
        setDirection(index > currentIndex ? 1 : -1);
        setCurrentIndex(index);
    };

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

    const handleOptionClick = (option: string) => {
        if (disabled) return;
        toggleOption(option);

        if (!isMulti) {
            const updatedAnswers = {
                ...answers,
                [currentIndex]: { selected: [option], freeText: "", usingFreeText: false },
            };

            if (isLast) {
                submitWithAnswers(updatedAnswers);
            } else {
                setAnswers(updatedAnswers);
                setDirection(1);
                setCurrentIndex((i) => i + 1);
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
                continue;
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
            goTo(currentIndex + 1);
        }
    };

    const handleFreeTextSubmit = () => {
        if (!answer.freeText.trim()) return;
        const updatedAnswers = { ...answers, [currentIndex]: { ...answer } };
        if (isLast) {
            submitWithAnswers(updatedAnswers);
        } else {
            setAnswers(updatedAnswers);
            goTo(currentIndex + 1);
        }
    };

    const slideVariants = {
        enter: (dir: number) => ({ opacity: 0, x: dir * 14 }),
        center: { opacity: 1, x: 0 },
        exit: (dir: number) => ({ opacity: 0, x: dir * -10 }),
    };

    const optionVariants = {
        hidden: { opacity: 0, y: 5 },
        visible: (i: number) => ({
            opacity: 1,
            y: 0,
            transition: { duration: 0.22, ease: "easeOut", delay: i * 0.045 },
        }),
    };

    return (
        <div className="space-y-1">
            {/* Navigation counter */}
            {questions.length > 1 && (
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1 text-brand-primary/30 text-xs">
                        <button
                            onClick={() => goTo(Math.max(0, currentIndex - 1))}
                            disabled={currentIndex === 0}
                            className="disabled:opacity-20 hover:text-brand-primary/60 transition-colors"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <span className="tabular-nums">{currentIndex + 1} de {questions.length}</span>
                        <button
                            onClick={() => goTo(Math.min(questions.length - 1, currentIndex + 1))}
                            disabled={currentIndex === questions.length - 1}
                            className="disabled:opacity-20 hover:text-brand-primary/60 transition-colors"
                        >
                            <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Animated question + options */}
            <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                    key={currentIndex}
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="space-y-1"
                >
                    {/* Question text */}
                    <p className="text-sm font-medium text-brand-primary leading-snug mb-2">
                        {question.question}
                        {isMulti && (
                            <span className="text-brand-primary/30 font-normal text-xs ml-1.5">
                                (seleciona todas que se aplicam)
                            </span>
                        )}
                    </p>

                    {/* Options */}
                    <div className="space-y-1">
                        {question.options.map((option, i) => {
                            const isSelected = answer.selected.includes(option);
                            return (
                                <motion.div
                                    key={option}
                                    custom={i}
                                    variants={optionVariants}
                                    initial="hidden"
                                    animate="visible"
                                >
                                    <button
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
                                        <span className={cn("text-sm flex-1", isSelected ? "text-brand-primary font-medium" : "text-brand-primary")}>
                                            {option}
                                        </span>
                                        {isSelected && !isMulti && (
                                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-brand-primary/40" />
                                        )}
                                    </button>
                                </motion.div>
                            );
                        })}

                        {/* Free text option */}
                        <motion.div
                            custom={question.options.length}
                            variants={optionVariants}
                            initial="hidden"
                            animate="visible"
                        >
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
                        </motion.div>
                    </div>

                    {/* Bottom row: voltar (left) + multi-select submit (right) */}
                    {(onBack || (isMulti && hasAnswer)) && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.15 }}
                            className="flex items-center justify-between pt-1"
                        >
                            {onBack ? (
                                <button
                                    onClick={onBack}
                                    className="flex items-center gap-0.5 group outline-none focus-visible:outline-none"
                                >
                                    <ChevronLeft className="h-3 w-3 text-brand-primary/25 group-hover:text-brand-primary/45 transition-colors" />
                                    <span className="text-[11px] text-brand-primary/25 group-hover:text-brand-primary/45 transition-colors">voltar</span>
                                </button>
                            ) : <div />}
                            {isMulti && hasAnswer && (
                                <button
                                    onClick={handleSubmit}
                                    disabled={disabled}
                                    className="h-8 w-8 rounded-full bg-brand-accent flex items-center justify-center transition-all hover:bg-brand-accent/90"
                                >
                                    <ArrowRight className="h-4 w-4 text-white" />
                                </button>
                            )}
                        </motion.div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
