"use client";

import React, { startTransition, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SlideCanvas } from "@/components/presentations/SlideCanvas";
import {
    streamPresentationGeneration,
    PresentationStreamEvent,
    PresentationPlan,
} from "@/lib/presentation-generation";
import { Artifact, fetchArtifact } from "@/lib/artifacts";
import { useGlowEffect } from "@/components/providers/GlowEffectProvider";

interface StreamedPlanSlide {
    id: string;
    index: number;
    header: string;
    subheader: string;
    body: string;
}

interface LivePreviewSlide {
    id: string;
    index: number;
    html: string;
    isDone: boolean;
}

type PlanPlaybackState = "idle" | "streaming" | "rewinding" | "complete";

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

const PLAN_SLIDE_SETTLE_MS = 220;
const PLAN_REWIND_SETTLE_MS = 260;
const PLAN_COPY_MIN_FONT_PX = 28;
const PLAN_COPY_MAX_FONT_PX = 88;

function buildSlideCopy(
    slide: NonNullable<PresentationPlan["slides"]>[number],
    index: number,
): Pick<StreamedPlanSlide, "subheader" | "body"> {
    const intent = slide.intent?.trim() || "";
    const description = slide.description?.trim() || "";

    if (description) {
        return {
            subheader: intent,
            body: description,
        };
    }

    if (intent) {
        return {
            subheader: "",
            body: intent,
        };
    }

    const fallback =
        slide.title?.trim() ||
        `Estruturar o conteúdo central do slide ${index + 1}.`;

    return {
        subheader: "",
        body: fallback,
    };
}

function normalizePlanSlides(plan: PresentationPlan | null): StreamedPlanSlide[] {
    if (!plan?.slides?.length) return [];

    return plan.slides.map((slide, index) => {
        const copy = buildSlideCopy(slide, index);
        return {
            id: slide.id || `plan-slide-${index + 1}`,
            index,
            header: slide.title?.trim() || `Slide ${index + 1}`,
            subheader: copy.subheader,
            body: copy.body,
        };
    });
}

function upsertLivePreviewSlide(
    slides: LivePreviewSlide[],
    nextSlide: LivePreviewSlide,
): LivePreviewSlide[] {
    const existingIndex = slides.findIndex((slide) => slide.id === nextSlide.id);

    if (existingIndex === -1) {
        return [...slides, nextSlide].sort((left, right) => left.index - right.index);
    }

    const updated = [...slides];
    updated[existingIndex] = {
        ...updated[existingIndex],
        ...nextSlide,
        isDone: updated[existingIndex].isDone || nextSlide.isDone,
    };

    return updated;
}

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
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

interface PresentationGenerationFullPageProps {
    artifactId: string;
    onDone: (artifactId: string) => void;
    onBack: () => void;
}

export function PresentationGenerationFullPage({
    artifactId,
    onDone,
    onBack,
}: PresentationGenerationFullPageProps) {
    // ── Core state ──
    const [status, setStatus] = useState<"planning" | "generating_slides" | "done" | "error">("planning");
    const [errorMessage, setErrorMessage] = useState("");
    const [artifact, setArtifact] = useState<Artifact | null>(null);
    const [plan, setPlan] = useState<PresentationPlan | null>(null);
    const [totalSlides, setTotalSlides] = useState(0);
    const [generatedSlides, setGeneratedSlides] = useState(0);
    const [planningMessage, setPlanningMessage] = useState("");
    const [planPlaybackState, setPlanPlaybackState] = useState<PlanPlaybackState>("idle");
    const [planStreamComplete, setPlanStreamComplete] = useState(false);
    const [planPlaybackSlides, setPlanPlaybackSlides] = useState<StreamedPlanSlide[]>([]);
    const [activePlanSlideIndex, setActivePlanSlideIndex] = useState(0);
    const [planSlideDirection, setPlanSlideDirection] = useState(1);
    const [livePreviewSlides, setLivePreviewSlides] = useState<LivePreviewSlide[]>([]);
    const [activeLiveSlideIndex, setActiveLiveSlideIndex] = useState(0);
    const [liveSlideDirection, setLiveSlideDirection] = useState(1);

    // ── Glow effect ──
    const { triggerGlow, clearGlow } = useGlowEffect();
    const planPlaybackStartedRef = useRef(false);
    const planSlideCountRef = useRef(0);
    const doneNotified = useRef(false);

    useEffect(() => {
        planPlaybackStartedRef.current = false;
        doneNotified.current = false;
        setArtifact(null);
        setPlan(null);
        setTotalSlides(0);
        setGeneratedSlides(0);
        setPlanningMessage("");
        setPlanPlaybackState("idle");
        setPlanStreamComplete(false);
        setPlanPlaybackSlides([]);
        setActivePlanSlideIndex(0);
        setPlanSlideDirection(1);
        setLivePreviewSlides([]);
        setActiveLiveSlideIndex(0);
        setLiveSlideDirection(1);
        setStatus("planning");
        setErrorMessage("");
        planSlideCountRef.current = 0;
    }, [artifactId]);

    useEffect(() => {
        if (status === "planning" || status === "generating_slides") {
            triggerGlow("streaming");
        } else if (status === "error") {
            triggerGlow("error");
        } else {
            clearGlow();
        }
        return () => clearGlow();
    }, [status, triggerGlow, clearGlow]);

    // ── Fetch artifact metadata ──
    useEffect(() => {
        fetchArtifact(artifactId)
            .then(setArtifact)
            .catch(() => {});
    }, [artifactId]);

    useEffect(() => {
        planSlideCountRef.current = planPlaybackSlides.length;
    }, [planPlaybackSlides.length]);

    // ── SSE streaming ──
    useEffect(() => {
        const controller = streamPresentationGeneration(
            artifactId,
            (event: PresentationStreamEvent) => {
                switch (event.type) {
                    case "planning":
                        setStatus("planning");
                        setPlanningMessage(event.message);
                        break;
                    case "plan_partial":
                        startTransition(() => {
                            setPlan(event.plan);
                            setTotalSlides(event.plan.total_slides || 0);
                        });

                        if (event.plan.slides?.length) {
                            const nextSlides = normalizePlanSlides(event.plan);
                            const previousCount = planSlideCountRef.current;
                            if (!planPlaybackStartedRef.current) {
                                planPlaybackStartedRef.current = true;
                                setPlanPlaybackSlides(nextSlides);
                                setActivePlanSlideIndex(0);
                                setPlanSlideDirection(1);
                                setPlanPlaybackState("streaming");
                            } else if (nextSlides.length > previousCount) {
                                setPlanPlaybackSlides(nextSlides);
                                setPlanSlideDirection(1);
                                setActivePlanSlideIndex(nextSlides.length - 1);
                            } else {
                                setPlanPlaybackSlides(nextSlides);
                            }
                            planSlideCountRef.current = nextSlides.length;
                        }
                        break;
                    case "plan_complete":
                        setPlanStreamComplete(true);
                        startTransition(() => {
                            setPlan(event.plan);
                            setTotalSlides(event.plan.total_slides || 0);
                        });

                        const nextSlides = normalizePlanSlides(event.plan);
                        const previousCount = planSlideCountRef.current;
                        if (!planPlaybackStartedRef.current) {
                            planPlaybackStartedRef.current = true;
                            setPlanPlaybackSlides(nextSlides);
                            setActivePlanSlideIndex(0);
                            setPlanSlideDirection(1);
                            setPlanPlaybackState(nextSlides.length > 0 ? "streaming" : "complete");
                        } else if (nextSlides.length > previousCount) {
                            setPlanPlaybackSlides(nextSlides);
                            setPlanSlideDirection(1);
                            setActivePlanSlideIndex(nextSlides.length - 1);
                        } else {
                            setPlanPlaybackSlides(nextSlides);
                        }
                        planSlideCountRef.current = nextSlides.length;
                        break;
                    case "generating_slides":
                        setStatus("generating_slides");
                        setTotalSlides(event.total || 0);
                        break;
                    case "slide_progress":
                        setGeneratedSlides((previous) => Math.max(previous, Math.max(event.current - 1, 0)));
                        setTotalSlides(event.total || 0);
                        break;
                    case "slide_html_snapshot":
                        setStatus("generating_slides");
                        setTotalSlides(event.total || 0);
                        setGeneratedSlides((previous) => Math.max(previous, Math.max(event.current - 1, 0)));
                        setLiveSlideDirection(1);
                        setActiveLiveSlideIndex(event.current - 1);
                        startTransition(() => {
                            setLivePreviewSlides((previous) => upsertLivePreviewSlide(previous, {
                                id: event.slide_id,
                                index: Math.max(event.current - 1, 0),
                                html: event.html,
                                isDone: false,
                            }));
                        });
                        break;
                    case "slide_html_done":
                        setStatus("generating_slides");
                        setTotalSlides(event.total || 0);
                        setGeneratedSlides((previous) => Math.max(previous, event.current));
                        setLiveSlideDirection(1);
                        setActiveLiveSlideIndex(event.current - 1);
                        startTransition(() => {
                            setLivePreviewSlides((previous) => upsertLivePreviewSlide(previous, {
                                id: event.slide_id,
                                index: Math.max(event.current - 1, 0),
                                html: event.html,
                                isDone: true,
                            }));
                        });
                        break;
                    case "done":
                        setStatus("done");
                        if (event.total_slides) setTotalSlides(event.total_slides);
                        if (event.total_slides) setGeneratedSlides(event.total_slides);
                        break;
                    case "error":
                        setStatus("error");
                        setErrorMessage(event.message);
                        break;
                }
            },
            (error) => {
                setStatus("error");
                setErrorMessage(error.message || "Erro de ligação.");
            },
            () => {},
        );

        return () => controller.abort();
    }, [artifactId]);

    useEffect(() => {
        if (planPlaybackState !== "streaming") return;
        if (!planStreamComplete) return;
        if (planPlaybackSlides.length === 0) return;
        if (activePlanSlideIndex !== planPlaybackSlides.length - 1) return;

        const timeout = window.setTimeout(() => {
            if (planPlaybackSlides.length > 1) {
                setPlanSlideDirection(-1);
                setActivePlanSlideIndex(0);
                setPlanPlaybackState("rewinding");
                return;
            }

            setPlanPlaybackState("complete");
        }, PLAN_SLIDE_SETTLE_MS);

        return () => window.clearTimeout(timeout);
    }, [activePlanSlideIndex, planPlaybackSlides.length, planPlaybackState, planStreamComplete]);

    useEffect(() => {
        if (planPlaybackState !== "rewinding") return;

        const timeout = window.setTimeout(() => {
            setPlanPlaybackState("complete");
        }, PLAN_REWIND_SETTLE_MS);

        return () => window.clearTimeout(timeout);
    }, [planPlaybackState]);

    useEffect(() => {
        if (planPlaybackState !== "complete") return;
        if (livePreviewSlides.length === 0) return;

        setActiveLiveSlideIndex(livePreviewSlides[livePreviewSlides.length - 1].index);
        setLiveSlideDirection(1);
    }, [livePreviewSlides, planPlaybackState]);

    useEffect(() => {
        if (status === "done" && !doneNotified.current) {
            doneNotified.current = true;
            // Don't auto-navigate — let user click to proceed
        }
    }, [status]);

    const presentationName = artifact?.artifact_name || "A gerar apresentação...";
    const activePlanSlide = planPlaybackSlides[activePlanSlideIndex] || null;
    const isPlanStreaming = planPlaybackState === "streaming" || planPlaybackState === "rewinding";
    const planSlidesReady = planPlaybackSlides.length > 0;
    const activeLiveSlide = livePreviewSlides.find((slide) => slide.index === activeLiveSlideIndex) || null;
    const livePreviewSubjectColor =
        artifact?.content?.subject?.color ||
        artifact?.subjects?.[0]?.color ||
        null;
    const completedLiveSlides = livePreviewSlides.filter((slide) => slide.isDone).length;
    const showLivePreview =
        planPlaybackState === "complete" &&
        !!activeLiveSlide &&
        status !== "done" &&
        status !== "error";
    const hasPlanStoryboard =
        planPlaybackSlides.length > 0 &&
        status !== "done" &&
        status !== "error" &&
        !showLivePreview;
    const generationProgress = totalSlides > 0
        ? Math.min(100, Math.max((generatedSlides / totalSlides) * 100, generatedSlides > 0 ? 12 : 0))
        : 0;
    const visiblePlanCopy = activePlanSlide
        ? {
            subheader: activePlanSlide.subheader,
            body: activePlanSlide.body,
        }
        : null;
    const isActivePlanSlideStreaming =
        status === "planning" &&
        !planStreamComplete &&
        !!activePlanSlide &&
        activePlanSlideIndex === planPlaybackSlides.length - 1;

    // ── Progress display ──
    const progressLabel =
        status === "planning" ? "A planear estrutura pedagógica..." :
        status === "generating_slides" ? `A gerar ${totalSlides} slides...` :
        status === "done" ? "Apresentação gerada com sucesso!" :
        "Erro na geração";

    return (
        <div className="h-full flex flex-col">
            {/* ── Header ── */}
            <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-brand-primary/5 flex items-center gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="p-1.5 rounded-lg text-brand-primary/40 hover:text-brand-primary/70 hover:bg-brand-primary/5 transition-colors"
                >
                    <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-brand-primary truncate">
                        {presentationName}
                    </h2>
                    <p className="text-xs text-brand-primary/40 mt-0.5">
                        {status === "done"
                            ? `${totalSlides} slides gerados`
                            : "A gerar com LUSIA..."
                        }
                    </p>
                </div>
            </div>

            {/* ── Main content area ── */}
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6">
                {/* Live slide preview */}
                {showLivePreview && activeLiveSlide && (
                    <div className="w-full max-w-6xl flex flex-col items-center gap-5">
                        <div className="max-w-2xl text-center">
                            <p className="text-sm font-medium text-brand-primary/70">
                                {activeLiveSlide.isDone
                                    ? `Slide ${activeLiveSlide.index + 1} pronto.`
                                    : `A montar o slide ${activeLiveSlide.index + 1} em tempo real...`}
                            </p>
                            <p className="mt-1 text-xs text-brand-primary/42">
                                {completedLiveSlides > 0 && totalSlides > 0
                                    ? `${completedLiveSlides} de ${totalSlides} slides concluídos no motor.`
                                    : "O HTML aparece à medida que o motor o escreve."}
                            </p>
                        </div>

                        <div className="w-full max-w-5xl">
                            <AnimatePresence mode="wait" custom={liveSlideDirection}>
                                <motion.div
                                    key={activeLiveSlide.id}
                                    custom={liveSlideDirection}
                                    variants={PLAN_CARD_VARIANTS}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                    className="overflow-hidden rounded-[1.85rem] border border-brand-primary/8 bg-white shadow-[0_22px_58px_rgba(21,49,107,0.08)]"
                                >
                                    <SlideCanvas
                                        html={activeLiveSlide.html}
                                        slideId={activeLiveSlide.id}
                                        visibleFragments={999}
                                        executeScripts={activeLiveSlide.isDone}
                                        subjectColor={livePreviewSubjectColor}
                                    />
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        <div className="w-full max-w-3xl space-y-3">
                            <div className="flex items-center justify-between text-xs text-brand-primary/45">
                                <span>
                                    {activeLiveSlide.isDone
                                        ? `Slide ${activeLiveSlide.index + 1} concluído`
                                        : `A gerar slide ${activeLiveSlide.index + 1} de ${totalSlides}`}
                                </span>
                                <span className="tabular-nums">
                                    {totalSlides > 0
                                        ? `${activeLiveSlide.index + 1}/${totalSlides}`
                                        : "em curso"}
                                </span>
                            </div>
                            <div className="relative h-2 overflow-hidden rounded-full bg-brand-primary/6">
                                {generationProgress > 0 ? (
                                    <motion.div
                                        className="h-full rounded-full bg-[linear-gradient(90deg,rgba(10,27,182,0.92),rgba(102,192,238,0.92))]"
                                        animate={{ width: `${generationProgress}%` }}
                                        transition={{ duration: 0.35, ease: "easeOut" }}
                                    />
                                ) : (
                                    <motion.div
                                        className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-[linear-gradient(90deg,rgba(10,27,182,0),rgba(10,27,182,0.88),rgba(102,192,238,0))]"
                                        animate={{ x: ["-120%", "320%"] }}
                                        transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity }}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Plan storyboard */}
                {hasPlanStoryboard && activePlanSlide && (
                    <div className="w-full max-w-5xl flex flex-col items-center gap-6">
                        <div className="max-w-2xl text-center">
                            <p className="text-sm font-medium text-brand-primary/70">
                                {status === "generating_slides" ? "A gerar slides a partir do plano..." : progressLabel}
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

                        {status === "generating_slides" && (
                            <div className="w-full max-w-3xl space-y-3">
                                <div className="flex items-center justify-between text-xs text-brand-primary/45">
                                    <span>{generatedSlides > 0 ? `A gerar slide ${generatedSlides} de ${totalSlides}` : "A transformar o plano em slides finais..."}</span>
                                    <span className="tabular-nums">
                                        {generatedSlides > 0 && totalSlides > 0 ? `${generatedSlides}/${totalSlides}` : "em curso"}
                                    </span>
                                </div>
                                <div className="relative h-2 overflow-hidden rounded-full bg-brand-primary/6">
                                    {generationProgress > 0 ? (
                                        <motion.div
                                            className="h-full rounded-full bg-[linear-gradient(90deg,rgba(10,27,182,0.92),rgba(102,192,238,0.92))]"
                                            animate={{ width: `${generationProgress}%` }}
                                            transition={{ duration: 0.35, ease: "easeOut" }}
                                        />
                                    ) : (
                                        <motion.div
                                            className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-[linear-gradient(90deg,rgba(10,27,182,0),rgba(10,27,182,0.88),rgba(102,192,238,0))]"
                                            animate={{ x: ["-120%", "320%"] }}
                                            transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity }}
                                        />
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Pre-plan waiting state */}
                {!planSlidesReady && (status === "planning" || status === "generating_slides") && (
                    <div className="flex flex-col items-center gap-6 max-w-md text-center">
                        {/* Animated loader */}
                        <div className="relative">
                            <div className="h-20 w-20 rounded-2xl bg-brand-accent/[0.08] flex items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-brand-accent" />
                            </div>
                        </div>

                        {/* Status label */}
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-brand-primary">
                                {progressLabel}
                            </p>
                            <p className="text-xs text-brand-primary/40">
                                {planningMessage || "Isto pode demorar 1-2 minutos. Podes sair — a geração continua em segundo plano."}
                            </p>
                        </div>

                        {/* Progress bar for generating_slides */}
                        {status === "generating_slides" && (
                            <div className="w-full max-w-xs">
                                <div className="h-1.5 rounded-full bg-brand-primary/5 overflow-hidden">
                                    {generationProgress > 0 ? (
                                        <motion.div
                                            className="h-full bg-brand-accent rounded-full"
                                            animate={{ width: `${generationProgress}%` }}
                                            transition={{ duration: 0.35, ease: "easeOut" }}
                                        />
                                    ) : (
                                        <motion.div
                                            className="h-full w-1/3 bg-brand-accent rounded-full"
                                            animate={{ x: ["-120%", "320%"] }}
                                            transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity }}
                                        />
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Plan preview */}
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
                )}

                {/* Done state */}
                {status === "done" && (
                    <div className="flex flex-col items-center gap-6 max-w-md text-center">
                        <div className="h-20 w-20 rounded-2xl bg-green-50 flex items-center justify-center">
                            <span className="text-3xl">🎓</span>
                        </div>
                        <div className="space-y-2">
                            <p className="text-lg font-semibold text-brand-primary">
                                Apresentação gerada!
                            </p>
                            <p className="text-sm text-brand-primary/50">
                                {totalSlides} slides prontos para utilizar.
                            </p>
                        </div>
                        <Button
                            onClick={() => onDone(artifactId)}
                            className="gap-2"
                        >
                            Ver apresentação
                        </Button>
                    </div>
                )}

                {/* Error state */}
                {status === "error" && (
                    <div className="flex flex-col items-center gap-4 max-w-md text-center">
                        <div className="flex items-center gap-2 text-brand-error">
                            <AlertCircle className="h-5 w-5" />
                            <span className="text-sm font-medium">{errorMessage || "Erro ao gerar apresentação."}</span>
                        </div>
                        <Button variant="outline" onClick={onBack}>
                            Voltar
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
