"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, List } from "lucide-react";
import { SlideCanvas, QuizState } from "./SlideCanvas";
import { SlideThumbnailStrip } from "./SlideThumbnailStrip";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

interface PlanSlide {
    id: string;
    type: string;
    subtype: string | null;
    title: string;
    reinforcement_slide: string | null;
    phase?: string;
    intent?: string;
    description?: string;
}

interface SlideViewerProps {
    slides: Array<{ id: string; html: string }>;
    plan: {
        title: string;
        slides: PlanSlide[];
    };
    onBack?: () => void;
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

/** Parse fragment count from HTML string */
function parseFragmentCount(html: string): number {
    const regex = /data-fragment-index="(\d+)"/g;
    let max = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
        const idx = parseInt(match[1], 10);
        if (idx > max) max = idx;
    }
    return max;
}

/** Check if slide HTML is a quiz slide */
function isQuizSlide(html: string): boolean {
    return html.includes('data-slide-type="quiz"');
}

/** Find correct option from HTML */
function findCorrectOption(html: string): string | null {
    const match = html.match(/data-correct="true"[^>]*data-quiz-option="([^"]+)"/);
    if (match) return match[1];
    const match2 = html.match(/data-quiz-option="([^"]+)"[^>]*data-correct="true"/);
    return match2?.[1] ?? null;
}

/** Get reinforcement slide ID from HTML */
function getReinforcementId(html: string): string | null {
    const match = html.match(/data-reinforcement="([^"]+)"/);
    return match?.[1] ?? null;
}

/** Check if a slide is conditional (reinforcement) */
function isConditionalSlide(html: string): boolean {
    return html.includes('data-conditional="true"');
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export function SlideViewer({ slides, plan, onBack }: SlideViewerProps) {
    const slideMap = useMemo(() => new Map(slides.map((s) => [s.id, s])), [slides]);

    // ── Slide order (non-conditional slides by default) ──
    const [slideOrder, setSlideOrder] = useState<string[]>(() =>
        slides.filter((s) => !isConditionalSlide(s.html)).map((s) => s.id),
    );

    // ── Navigation state ──
    const [currentIndex, setCurrentIndex] = useState(0);

    // ── Fragment state ──
    const [visibleFragments, setVisibleFragments] = useState<Record<string, number>>({});
    const fragmentCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const s of slides) {
            counts[s.id] = parseFragmentCount(s.html);
        }
        return counts;
    }, [slides]);

    // ── Quiz state ──
    const [quizStates, setQuizStates] = useState<Record<string, QuizState>>({});

    // ── Thumbnail panel ──
    const [showThumbnails, setShowThumbnails] = useState(false);

    // ── Derived ──
    const currentSlideId = slideOrder[currentIndex] ?? slides[0]?.id;
    const currentSlide = slideMap.get(currentSlideId);
    const currentHtml = currentSlide?.html ?? "";
    const currentFragmentCount = fragmentCounts[currentSlideId] ?? 0;
    const currentVisibleFragments = visibleFragments[currentSlideId] ?? 0;
    const currentQuizState = quizStates[currentSlideId];
    const isQuiz = isQuizSlide(currentHtml);

    // Track which reinforcement slides have already been inserted
    const insertedReinforcementsRef = useRef<Set<string>>(new Set());

    // ── Navigation handlers ──

    const handleAdvance = useCallback(() => {
        const sid = slideOrder[currentIndex];
        if (!sid) return;
        const html = slideMap.get(sid)?.html ?? "";
        const fragCount = fragmentCounts[sid] ?? 0;
        const visFrag = visibleFragments[sid] ?? 0;

        // If there are unrevealed fragments, reveal next
        if (fragCount > visFrag) {
            setVisibleFragments((prev) => ({ ...prev, [sid]: visFrag + 1 }));
            return;
        }

        // If quiz slide and not answered, block
        if (isQuizSlide(html) && !quizStates[sid]?.answered) {
            return;
        }

        // Go to next slide
        if (currentIndex < slideOrder.length - 1) {
            setCurrentIndex(currentIndex + 1);
        }
    }, [currentIndex, slideOrder, slideMap, fragmentCounts, visibleFragments, quizStates]);

    const handlePrevious = useCallback(() => {
        if (currentIndex > 0) {
            const prevIdx = currentIndex - 1;
            const prevSid = slideOrder[prevIdx];
            // Show all fragments on previous slide
            if (prevSid) {
                setVisibleFragments((prev) => ({
                    ...prev,
                    [prevSid]: fragmentCounts[prevSid] ?? 0,
                }));
            }
            setCurrentIndex(prevIdx);
        }
    }, [currentIndex, slideOrder, fragmentCounts]);

    const handleGoToSlide = useCallback(
        (index: number) => {
            if (index < 0 || index >= slideOrder.length) return;
            const sid = slideOrder[index];
            // Show all fragments when jumping to a slide
            if (sid) {
                setVisibleFragments((prev) => ({
                    ...prev,
                    [sid]: fragmentCounts[sid] ?? 0,
                }));
            }
            setCurrentIndex(index);
        },
        [slideOrder, fragmentCounts],
    );

    // ── Quiz answer handler ──

    const handleQuizAnswer = useCallback(
        (option: string) => {
            const sid = currentSlideId;
            const html = slideMap.get(sid)?.html ?? "";
            const correctOption = findCorrectOption(html);
            const correct = option === correctOption;

            setQuizStates((prev) => ({
                ...prev,
                [sid]: { answered: true, correct, selectedOption: option },
            }));

            // Conditional navigation — insert reinforcement slide if incorrect
            if (!correct) {
                const reinforcementId =
                    getReinforcementId(html) ??
                    plan.slides.find((s) => s.id === sid)?.reinforcement_slide;

                if (
                    reinforcementId &&
                    slideMap.has(reinforcementId) &&
                    !insertedReinforcementsRef.current.has(reinforcementId)
                ) {
                    insertedReinforcementsRef.current.add(reinforcementId);
                    setSlideOrder((prev) => {
                        const idx = prev.indexOf(sid);
                        if (idx === -1) return prev;
                        // Insert reinforcement slide after current
                        const next = [...prev];
                        next.splice(idx + 1, 0, reinforcementId);
                        return next;
                    });
                }
            }
        },
        [currentSlideId, slideMap, plan.slides],
    );

    // ── Keyboard navigation ──
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                e.target instanceof HTMLSelectElement
            ) return;

            switch (e.key) {
                case "ArrowRight":
                case " ":
                    e.preventDefault();
                    handleAdvance();
                    break;
                case "ArrowLeft":
                    e.preventDefault();
                    handlePrevious();
                    break;
                case "Escape":
                    setShowThumbnails((p) => !p);
                    break;
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [handleAdvance, handlePrevious]);

    // ── Touch/swipe ──
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        const touch = e.touches[0];
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }, []);

    const handleTouchEnd = useCallback(
        (e: React.TouchEvent) => {
            if (!touchStartRef.current) return;
            const touch = e.changedTouches[0];
            const dx = touch.clientX - touchStartRef.current.x;
            const dy = touch.clientY - touchStartRef.current.y;
            touchStartRef.current = null;

            // Only count horizontal swipes
            if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;

            if (dx < 0) handleAdvance(); // swipe left → advance
            else handlePrevious(); // swipe right → previous
        },
        [handleAdvance, handlePrevious],
    );

    return (
        <div className="h-full flex flex-col">
            {/* ── Header ── */}
            <div className="shrink-0 px-4 sm:px-6 py-2.5 border-b border-brand-primary/5 flex items-center gap-3">
                {onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        className="p-1.5 rounded-lg text-brand-primary/40 hover:text-brand-primary/70 hover:bg-brand-primary/5 transition-colors"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                )}
                <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold text-brand-primary truncate">
                        {plan.title}
                    </h2>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-brand-primary/40 tabular-nums">
                        {currentIndex + 1} / {slideOrder.length}
                    </span>
                    <button
                        type="button"
                        onClick={() => setShowThumbnails((p) => !p)}
                        className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            showThumbnails
                                ? "bg-brand-accent/10 text-brand-accent"
                                : "text-brand-primary/40 hover:text-brand-primary/70 hover:bg-brand-primary/5",
                        )}
                    >
                        <List className="h-4.5 w-4.5" />
                    </button>
                </div>
            </div>

            {/* ── Main area ── */}
            <div className="flex-1 min-h-0 flex">
                {/* Slide area */}
                <div
                    className="flex-1 min-w-0 flex flex-col"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                >
                    {/* Slide canvas */}
                    <div className="flex-1 min-h-0 flex items-center justify-center px-4 py-3 bg-brand-primary/[0.02]">
                        <div className="w-full max-w-5xl">
                            {currentSlide && (
                                <SlideCanvas
                                    html={currentHtml}
                                    slideId={currentSlideId}
                                    visibleFragments={currentVisibleFragments}
                                    quizState={currentQuizState}
                                    onQuizOptionClick={handleQuizAnswer}
                                    onClick={handleAdvance}
                                />
                            )}
                        </div>
                    </div>

                    {/* Navigation bar */}
                    <div className="shrink-0 border-t border-brand-primary/5 bg-brand-bg">
                        <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={handlePrevious}
                                disabled={currentIndex === 0}
                                className={cn(
                                    "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                                    currentIndex === 0
                                        ? "text-brand-primary/20 cursor-not-allowed"
                                        : "text-brand-primary/60 hover:bg-brand-primary/5 active:scale-[0.98]",
                                )}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Anterior
                            </button>

                            {/* Progress dots */}
                            <div className="flex items-center gap-1 max-w-xs overflow-hidden">
                                {slideOrder.length <= 20 ? (
                                    slideOrder.map((id, i) => (
                                        <button
                                            key={`${id}-${i}`}
                                            onClick={() => handleGoToSlide(i)}
                                            className={cn(
                                                "h-1.5 rounded-full transition-all",
                                                i === currentIndex
                                                    ? "w-4 bg-brand-accent"
                                                    : i < currentIndex
                                                      ? "w-1.5 bg-brand-primary/20"
                                                      : "w-1.5 bg-brand-primary/10",
                                            )}
                                        />
                                    ))
                                ) : (
                                    <span className="text-xs text-brand-primary/40 tabular-nums">
                                        {currentIndex + 1} / {slideOrder.length}
                                    </span>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={handleAdvance}
                                disabled={
                                    currentIndex >= slideOrder.length - 1 &&
                                    currentVisibleFragments >= currentFragmentCount &&
                                    (!isQuiz || currentQuizState?.answered === true)
                                }
                                className={cn(
                                    "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                                    currentIndex >= slideOrder.length - 1 &&
                                        currentVisibleFragments >= currentFragmentCount
                                        ? "text-brand-primary/20 cursor-not-allowed"
                                        : "text-brand-primary/60 hover:bg-brand-primary/5 active:scale-[0.98]",
                                )}
                            >
                                Seguinte
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Thumbnail strip (right panel) */}
                {showThumbnails && (
                    <div className="hidden lg:block w-56 border-l border-brand-primary/5 bg-brand-bg shrink-0">
                        <SlideThumbnailStrip
                            slides={slides}
                            currentSlideId={currentSlideId}
                            slideOrder={slideOrder}
                            planSlides={plan.slides}
                            onSelectSlide={handleGoToSlide}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
