"use client";

import React, { useEffect, useMemo, useRef } from "react";
import type { QuizState } from "./SlideCanvas";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import { SlideCanvas } from "./SlideCanvas";
import { cn } from "@/lib/utils";

interface SlideThumbnailStripProps {
    slides: Array<{ id: string; html: string }>;
    currentSlideId: string;
    slideOrder: string[];
    planSlides?: Array<{ id: string; title?: string }>;
    subjectColor?: string | null;
    fragmentCounts: Record<string, number>;
    quizStates: Record<string, QuizState>;
    orgName?: string | null;
    orgLogoUrl?: string | null;
    onSelectSlide: (index: number) => void;
    /** Set of slide IDs still being generated (partial HTML) */
    pendingSlideIds?: Set<string>;
    /** Total expected slides (to show placeholder slots) */
    expectedSlideCount?: number;
    /** Whether generation is active */
    isGenerating?: boolean;
}

interface ThumbnailCanvasProps {
    html: string;
    slideId: string;
    visibleFragments: number;
    quizState?: QuizState;
    subjectColor?: string | null;
    currentPage: number;
    totalPages: number;
    orgName?: string | null;
    orgLogoUrl?: string | null;
}

const ThumbnailCanvas = React.memo(function ThumbnailCanvas({
    html,
    slideId,
    visibleFragments,
    quizState,
    subjectColor,
    currentPage,
    totalPages,
    orgName,
    orgLogoUrl,
}: ThumbnailCanvasProps) {
    return (
        <div className="pointer-events-none">
            <SlideCanvas
                html={html}
                slideId={`${slideId}-thumb`}
                visibleFragments={visibleFragments}
                executeScripts
                quizState={quizState}
                subjectColor={subjectColor}
                currentPage={currentPage}
                totalPages={totalPages}
                orgName={orgName}
                orgLogoUrl={orgLogoUrl}
            />
        </div>
    );
});

export function SlideThumbnailStrip({
    slides,
    currentSlideId,
    slideOrder,
    planSlides,
    subjectColor,
    fragmentCounts,
    quizStates,
    orgName,
    orgLogoUrl,
    onSelectSlide,
    pendingSlideIds,
    expectedSlideCount,
    isGenerating,
}: SlideThumbnailStripProps) {
    const activeRef = useRef<HTMLButtonElement>(null);

    // Auto-scroll to keep current slide visible
    useEffect(() => {
        activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [currentSlideId]);

    const slideMap = useMemo(() => new Map(slides.map((s) => [s.id, s])), [slides]);
    const planMap = useMemo(() => new Map((planSlides ?? []).map((s) => [s.id, s])), [planSlides]);

    return (
        <div className="w-[220px] shrink-0 flex flex-col h-full min-h-0 self-stretch">
            <div className="px-3 py-3 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-brand-primary/40 uppercase tracking-wider">
                    Slides
                </span>
                <span className="text-[10px] text-brand-primary/30">
                    {isGenerating && expectedSlideCount
                        ? `${slideOrder.length}/${expectedSlideCount}`
                        : slideOrder.length}
                </span>
            </div>

            <AppScrollArea
                className="flex-1 min-h-0"
                viewportClassName="px-3 pb-3"
                interactiveScrollbar
            >
                <div className="space-y-3 pt-0.5">
                    {slideOrder.map((id, idx) => {
                        const slide = slideMap.get(id);
                        const plan = planMap.get(id);
                        const isCurrent = id === currentSlideId;
                        const isConditional = slide?.html?.includes('data-conditional="true"');

                        if (!slide) return null;

                        const isPending = pendingSlideIds?.has(id) ?? false;

                        return (
                            <button
                                key={`${id}-${idx}`}
                                ref={isCurrent ? activeRef : undefined}
                                onClick={() => onSelectSlide(idx)}
                                className={cn(
                                    "group w-full text-left transition-all",
                                    isConditional && "opacity-70",
                                )}
                            >
                                <div className="mb-1.5 flex items-center gap-1.5 px-0.5">
                                    <span
                                        className={cn(
                                            "text-[10px] font-bold tabular-nums leading-none",
                                            isCurrent ? "text-brand-accent" : "text-brand-primary/30",
                                        )}
                                    >
                                        {idx + 1}
                                    </span>
                                    <span
                                        className={cn(
                                            "text-[9px] leading-none truncate",
                                            isCurrent ? "text-brand-accent/60" : "text-brand-primary/25",
                                        )}
                                    >
                                        {plan?.title || id}
                                    </span>
                                </div>

                                <div
                                    className={cn(
                                        "overflow-hidden rounded-[1rem] border bg-white transition-all duration-200",
                                        isCurrent
                                            ? "border-brand-accent shadow-[0_0_0_3px_oklch(var(--brand-accent)/0.12)] shadow-brand-accent/10"
                                            : isPending
                                                ? "border-brand-accent/30 animate-pulse"
                                                : "border-brand-primary/10 hover:border-brand-primary/25 hover:shadow-sm",
                                    )}
                                >
                                    <ThumbnailCanvas
                                        html={slide.html}
                                        slideId={slide.id}
                                        visibleFragments={isPending ? 999 : (fragmentCounts[id] ?? 0)}
                                        quizState={isPending ? undefined : quizStates[id]}
                                        subjectColor={subjectColor}
                                        currentPage={idx + 1}
                                        totalPages={expectedSlideCount ?? slideOrder.length}
                                        orgName={orgName}
                                        orgLogoUrl={orgLogoUrl}
                                    />
                                </div>
                            </button>
                        );
                    })}

                    {/* Placeholder slots for upcoming slides */}
                    {isGenerating && expectedSlideCount != null && slideOrder.length < expectedSlideCount && (
                        Array.from({ length: expectedSlideCount - slideOrder.length }, (_, i) => {
                            const slotIndex = slideOrder.length + i;
                            return (
                                <div key={`placeholder-${slotIndex}`} className="w-full">
                                    <div className="mb-1.5 flex items-center gap-1.5 px-0.5">
                                        <span className="text-[10px] font-bold tabular-nums leading-none text-brand-primary/15">
                                            {slotIndex + 1}
                                        </span>
                                    </div>
                                    <div className="aspect-[16/9] rounded-[1rem] border border-dashed border-brand-primary/10 bg-brand-primary/[0.02] animate-pulse" />
                                </div>
                            );
                        })
                    )}
                </div>
            </AppScrollArea>
        </div>
    );
}
