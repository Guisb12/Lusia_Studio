"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuizPaginationProps {
    totalQuestions: number;
    currentIndex: number;
    onNavigate: (index: number) => void;
    answeredSet?: Set<string>;
    questionIds?: string[];
    resultMap?: Map<string, boolean>;
    progressLabel?: string;
    children: React.ReactNode;
    showProgress?: boolean;
    className?: string;
}

const slideVariants = {
    enter: (direction: number) => ({
        x: direction > 0 ? 180 : -180,
        opacity: 0,
    }),
    center: {
        x: 0,
        opacity: 1,
    },
    exit: (direction: number) => ({
        x: direction > 0 ? -180 : 180,
        opacity: 0,
    }),
};

export function QuizPagination({
    totalQuestions,
    currentIndex,
    onNavigate,
    answeredSet,
    questionIds,
    resultMap,
    progressLabel,
    children,
    showProgress = true,
    className,
}: QuizPaginationProps) {
    const [direction, setDirection] = useState(0);
    const dotsRef = useRef<HTMLDivElement>(null);

    const navigateTo = useCallback(
        (index: number) => {
            if (index < 0 || index >= totalQuestions) return;
            setDirection(index > currentIndex ? 1 : -1);
            onNavigate(index);
        },
        [currentIndex, onNavigate, totalQuestions],
    );

    // Keyboard navigation
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                navigateTo(currentIndex - 1);
            } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                navigateTo(currentIndex + 1);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [currentIndex, navigateTo]);

    // Auto-scroll dots to keep active dot visible
    useEffect(() => {
        if (!dotsRef.current) return;
        const activeDot = dotsRef.current.children[currentIndex] as HTMLElement;
        if (!activeDot) return;
        activeDot.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
        });
    }, [currentIndex]);

    const progressPercent =
        answeredSet && totalQuestions > 0
            ? (answeredSet.size / totalQuestions) * 100
            : 0;

    return (
        <div className={cn("flex flex-col h-full min-h-0", className)}>
            {/* Progress bar */}
            {showProgress && answeredSet && (
                <div className="px-4 sm:px-6 pt-3">
                    <div className="h-1 w-full bg-brand-primary/5 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-brand-accent rounded-full"
                            initial={false}
                            animate={{ width: `${progressPercent}%` }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                        />
                    </div>
                </div>
            )}

            {/* Header: question counter + dots */}
            <div className="px-4 sm:px-6 pt-3 pb-2 space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-brand-primary/50 font-medium">
                        Pergunta {currentIndex + 1} de {totalQuestions}
                    </span>
                    {progressLabel && (
                        <span className="text-xs text-brand-primary/40">
                            {progressLabel}
                        </span>
                    )}
                </div>

                {/* Dot navigation */}
                {totalQuestions > 1 && (
                    <div
                        ref={dotsRef}
                        className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1"
                    >
                        {Array.from({ length: totalQuestions }, (_, i) => {
                            const qId = questionIds?.[i];
                            const isActive = i === currentIndex;
                            const isAnswered = qId
                                ? answeredSet?.has(qId)
                                : false;
                            const isCorrect =
                                qId !== undefined
                                    ? resultMap?.get(qId)
                                    : undefined;

                            let dotColor =
                                "bg-brand-primary/15 hover:bg-brand-primary/25";
                            if (isActive) {
                                dotColor = "bg-brand-accent ring-2 ring-brand-accent/30";
                            } else if (isCorrect === true) {
                                dotColor = "bg-emerald-500";
                            } else if (isCorrect === false) {
                                dotColor = "bg-red-400";
                            } else if (isAnswered) {
                                dotColor = "bg-brand-primary/40";
                            }

                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => navigateTo(i)}
                                    className={cn(
                                        "shrink-0 rounded-full transition-all duration-200",
                                        isActive
                                            ? "w-3 h-3"
                                            : "w-2.5 h-2.5",
                                        dotColor,
                                    )}
                                    aria-label={`Pergunta ${i + 1}`}
                                />
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Question content with slide animation */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-4">
                <AnimatePresence mode="wait" custom={direction}>
                    <motion.div
                        key={currentIndex}
                        custom={direction}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={0.15}
                        onDragEnd={(_, info) => {
                            if (
                                info.offset.x > 60 &&
                                currentIndex > 0
                            ) {
                                navigateTo(currentIndex - 1);
                            } else if (
                                info.offset.x < -60 &&
                                currentIndex < totalQuestions - 1
                            ) {
                                navigateTo(currentIndex + 1);
                            }
                        }}
                    >
                        {children}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Navigation buttons */}
            <div className="px-4 sm:px-6 pb-4 pt-2 flex items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={() => navigateTo(currentIndex - 1)}
                    disabled={currentIndex === 0}
                    className={cn(
                        "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                        currentIndex === 0
                            ? "text-brand-primary/25 cursor-not-allowed"
                            : "text-brand-primary/70 hover:bg-brand-primary/5 active:scale-[0.98]",
                    )}
                >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                </button>
                <button
                    type="button"
                    onClick={() => navigateTo(currentIndex + 1)}
                    disabled={currentIndex >= totalQuestions - 1}
                    className={cn(
                        "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                        currentIndex >= totalQuestions - 1
                            ? "text-brand-primary/25 cursor-not-allowed"
                            : "text-brand-primary/70 hover:bg-brand-primary/5 active:scale-[0.98]",
                    )}
                >
                    Seguinte
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
