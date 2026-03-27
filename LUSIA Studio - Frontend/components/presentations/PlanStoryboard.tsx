"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import type { PresentationPlan } from "@/lib/presentation-generation";
import type {
    StreamedPlanSlide,
    PlanPlaybackState,
    GenerationStatus,
} from "@/lib/presentations/use-presentation-stream";

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════ */

const PLAN_COPY_MIN_FONT_PX = 28;
const PLAN_COPY_MAX_FONT_PX = 88;

const PLAN_CARD_VARIANTS = {
    enter: (direction: number) => ({
        x: direction > 0 ? 110 : -110,
        opacity: 0,
        scale: 0.97,
        rotate: direction > 0 ? 1.4 : -1.4,
    }),
    center: {
        x: 0,
        opacity: 1,
        scale: 1,
        rotate: 0,
    },
    exit: (direction: number) => ({
        x: direction > 0 ? -110 : 110,
        opacity: 0,
        scale: 0.97,
        rotate: direction > 0 ? -1.4 : 1.4,
    }),
};

/* ═══════════════════════════════════════════════════════════════
   AUTO-FIT TEXT
   ═══════════════════════════════════════════════════════════════ */

function getPlanCopyLineHeight(fontSize: number): number {
    if (fontSize >= 72) return 0.92;
    if (fontSize >= 58) return 0.96;
    if (fontSize >= 44) return 1;
    return 1.04;
}

function AutoFitPlanCopy({
    text,
    showCaret,
}: {
    text: string;
    showCaret: boolean;
}) {
    const frameRef = useRef<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLParagraphElement>(null);
    const [fontSize, setFontSize] = useState(PLAN_COPY_MAX_FONT_PX);
    const [isReady, setIsReady] = useState(false);

    useLayoutEffect(() => {
        const container = containerRef.current;
        const textElement = textRef.current;
        if (!container || !textElement) return;

        const fitText = () => {
            const width = container.clientWidth;
            const height = container.clientHeight;
            if (!width || !height) return;

            const maxFont = Math.min(
                PLAN_COPY_MAX_FONT_PX,
                Math.max(PLAN_COPY_MIN_FONT_PX, Math.floor(width * 0.082)),
            );

            let low = PLAN_COPY_MIN_FONT_PX;
            let high = maxFont;
            let best = PLAN_COPY_MIN_FONT_PX;

            while (low <= high) {
                const middle = Math.floor((low + high) / 2);
                textElement.style.fontSize = `${middle}px`;
                textElement.style.lineHeight = `${getPlanCopyLineHeight(middle)}`;

                const fits =
                    textElement.scrollHeight <= height &&
                    textElement.scrollWidth <= width;

                if (fits) {
                    best = middle;
                    low = middle + 1;
                } else {
                    high = middle - 1;
                }
            }

            textElement.style.fontSize = `${best}px`;
            textElement.style.lineHeight = `${getPlanCopyLineHeight(best)}`;
            setFontSize(best);
            setIsReady(true);
        };

        const scheduleFit = () => {
            if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current);
            }
            frameRef.current = window.requestAnimationFrame(fitText);
        };

        scheduleFit();

        const observer = new ResizeObserver(scheduleFit);
        observer.observe(container);

        return () => {
            observer.disconnect();
            if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current);
            }
        };
    }, [text]);

    return (
        <div ref={containerRef} className="h-full w-full overflow-hidden">
            <p
                ref={textRef}
                className="text-brand-primary"
                style={{
                    fontFamily: '"InstrumentSerif", "Georgia", serif',
                    fontSize,
                    lineHeight: getPlanCopyLineHeight(fontSize),
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    opacity: isReady ? 1 : 0,
                    transition: "opacity 120ms ease-out",
                }}
            >
                {text}
                {showCaret && (
                    <span className="ml-1 inline-block h-[0.92em] w-px translate-y-[0.08em] animate-pulse bg-brand-accent/70 align-baseline" />
                )}
            </p>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════
   PLAN STORYBOARD
   ═══════════════════════════════════════════════════════════════ */

interface PlanStoryboardProps {
    planPlaybackSlides: StreamedPlanSlide[];
    planPlaybackState: PlanPlaybackState;
    activePlanSlideIndex: number;
    planSlideDirection: number;
    planStreamComplete: boolean;
    status: GenerationStatus;
    planningMessage: string;
    plan: PresentationPlan | null;
}

export function PlanStoryboard({
    planPlaybackSlides,
    planPlaybackState,
    activePlanSlideIndex,
    planSlideDirection,
    planStreamComplete,
    status,
    planningMessage,
    plan,
}: PlanStoryboardProps) {
    const activePlanSlide = planPlaybackSlides[activePlanSlideIndex] || null;
    const planSlidesReady = planPlaybackSlides.length > 0;

    const isActivePlanSlideStreaming =
        status === "planning" &&
        !planStreamComplete &&
        !!activePlanSlide &&
        activePlanSlideIndex === planPlaybackSlides.length - 1;

    const visiblePlanCopy = activePlanSlide
        ? { subheader: activePlanSlide.subheader, body: activePlanSlide.body }
        : null;

    const progressLabel =
        status === "planning"
            ? "A planear estrutura pedagógica..."
            : "A preparar slides...";

    // ── Pre-plan waiting state ──
    if (!planSlidesReady) {
        return (
            <div className="h-full flex flex-col items-center justify-center px-6">
                <div className="flex flex-col items-center gap-6 max-w-md text-center">
                    <div className="relative">
                        <div className="h-20 w-20 rounded-2xl bg-brand-accent/[0.08] flex items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-brand-accent" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-brand-primary">
                            {progressLabel}
                        </p>
                        <p className="text-xs text-brand-primary/40">
                            {planningMessage || "Isto pode demorar 1-2 minutos. Podes sair — a geração continua em segundo plano."}
                        </p>
                    </div>

                    {plan && (
                        <div className="w-full max-w-sm bg-white border border-brand-primary/8 rounded-2xl p-4 text-left">
                            <p className="text-[10px] font-medium text-brand-primary/40 uppercase tracking-wider mb-2">
                                Plano pedagógico
                            </p>
                            {plan.title && (
                                <p className="text-sm font-medium text-brand-primary mb-1">{plan.title}</p>
                            )}
                            {plan.target_audience && (
                                <p className="text-xs text-brand-primary/50 mb-2">{plan.target_audience}</p>
                            )}
                            {plan.slides && plan.slides.length > 0 && (
                                <div className="space-y-1">
                                    {plan.slides.slice(0, 6).map((s, i) => (
                                        <div key={s.id || i} className="flex items-center gap-2 text-xs text-brand-primary/60">
                                            <span className="text-[10px] text-brand-primary/30 tabular-nums w-4 text-right shrink-0">{i + 1}</span>
                                            <span className="truncate">{s.title || s.description || s.id}</span>
                                        </div>
                                    ))}
                                    {plan.slides.length > 6 && (
                                        <p className="text-[10px] text-brand-primary/30 pl-6">
                                            +{plan.slides.length - 6} mais
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── Plan card storyboard ──
    if (!activePlanSlide) return null;

    return (
        <div className="h-full flex flex-col items-center justify-center px-6">
            <div className="w-full max-w-5xl flex flex-col items-center gap-6">
                <div className="max-w-2xl text-center">
                    <p className="text-sm font-medium text-brand-primary/70">
                        {progressLabel}
                    </p>
                </div>

                <div className="w-full">
                    <div className="relative mx-auto aspect-[16/9] w-full max-w-4xl overflow-hidden rounded-[2rem] border border-brand-primary/10 bg-[linear-gradient(140deg,rgba(255,255,255,0.94),rgba(246,243,239,0.96))] shadow-[0_28px_80px_rgba(21,49,107,0.10)]">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(10,27,182,0.08),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(102,192,238,0.12),transparent_38%)]" />
                        <div className="absolute left-6 top-5 text-[10px] uppercase tracking-[0.28em] text-brand-primary/30 sm:left-8">
                            <span>Slide {activePlanSlide.index + 1}</span>
                        </div>

                        <AnimatePresence mode="wait" custom={planSlideDirection}>
                            <motion.div
                                key={activePlanSlide.id}
                                custom={planSlideDirection}
                                variants={PLAN_CARD_VARIANTS}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                className="absolute inset-0 flex flex-col px-6 pb-6 pt-14 sm:px-8 sm:pb-8 sm:pt-16 lg:px-10 lg:pb-10"
                            >
                                <div className="flex min-h-0 flex-1 flex-col gap-4">
                                    <div className="max-w-4xl space-y-3">
                                        <h3
                                            className="text-brand-primary"
                                            style={{
                                                fontFamily: '"InstrumentSerif", "Georgia", serif',
                                                fontSize: "clamp(3rem, 5.4vw, 5.5rem)",
                                                lineHeight: 0.92,
                                            }}
                                        >
                                            {activePlanSlide.header}
                                        </h3>
                                        {visiblePlanCopy?.subheader ? (
                                            <p className="max-w-3xl text-[1.05rem] font-medium leading-snug text-brand-primary/72 sm:text-[1.2rem] lg:text-[1.45rem]">
                                                {visiblePlanCopy.subheader}
                                                {isActivePlanSlideStreaming && !visiblePlanCopy.body && (
                                                    <span className="ml-1 inline-block h-[0.92em] w-px translate-y-[0.08em] animate-pulse bg-brand-accent/70 align-baseline" />
                                                )}
                                            </p>
                                        ) : null}
                                    </div>

                                    <div className="min-h-0 flex-1 pt-2">
                                        <AutoFitPlanCopy
                                            text={visiblePlanCopy?.body || ""}
                                            showCaret={isActivePlanSlideStreaming && (!!visiblePlanCopy?.body || !visiblePlanCopy?.subheader)}
                                        />
                                    </div>
                                </div>

                                <div className="mt-5 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        {planPlaybackSlides.map((slide, index) => {
                                            const isActive = index === activePlanSlideIndex;
                                            const isComplete =
                                                planPlaybackState === "complete" ||
                                                planPlaybackState === "rewinding" ||
                                                index < activePlanSlideIndex;

                                            return (
                                                <span
                                                    key={slide.id}
                                                    className="h-1.5 rounded-full transition-all duration-300"
                                                    style={{
                                                        width: isActive ? 34 : 12,
                                                        backgroundColor: isActive
                                                            ? "rgba(10, 27, 182, 0.82)"
                                                            : isComplete
                                                                ? "rgba(10, 27, 182, 0.26)"
                                                                : "rgba(21, 49, 107, 0.10)",
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>
                                    <span className="shrink-0 text-sm tabular-nums text-brand-primary/42">
                                        {activePlanSlide.index + 1}/{planPlaybackSlides.length}
                                    </span>
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
}
