"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import {
    streamPresentationGeneration,
    PresentationStreamEvent,
    PresentationPlan,
} from "@/lib/presentation-generation";
import { Artifact, fetchArtifact } from "@/lib/artifacts";
import { useGlowEffect } from "@/components/providers/GlowEffectProvider";

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export interface StreamedPlanSlide {
    id: string;
    index: number;
    header: string;
    subheader: string;
    body: string;
}

export interface LivePreviewSlide {
    id: string;
    index: number;
    html: string;
    isDone: boolean;
}

export type PlanPlaybackState = "idle" | "streaming" | "rewinding" | "complete";
export type GenerationStatus = "planning" | "generating_slides" | "done" | "error";

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

const PLAN_SLIDE_SETTLE_MS = 220;
const PLAN_REWIND_SETTLE_MS = 260;

function buildSlideCopy(
    slide: NonNullable<PresentationPlan["slides"]>[number],
    index: number,
): Pick<StreamedPlanSlide, "subheader" | "body"> {
    const intent = slide.intent?.trim() || "";
    const description = slide.description?.trim() || "";

    if (description) return { subheader: intent, body: description };
    if (intent) return { subheader: "", body: intent };

    const fallback =
        slide.title?.trim() ||
        `Estruturar o conteúdo central do slide ${index + 1}.`;

    return { subheader: "", body: fallback };
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
    const existingIndex = slides.findIndex((s) => s.id === nextSlide.id);

    if (existingIndex === -1) {
        return [...slides, nextSlide].sort((a, b) => a.index - b.index);
    }

    const updated = [...slides];
    updated[existingIndex] = {
        ...updated[existingIndex],
        ...nextSlide,
        isDone: updated[existingIndex].isDone || nextSlide.isDone,
    };

    return updated;
}

/* ═══════════════════════════════════════════════════════════════
   HOOK
   ═══════════════════════════════════════════════════════════════ */

export interface UsePresentationStreamReturn {
    status: GenerationStatus;
    errorMessage: string;
    artifact: Artifact | null;
    plan: PresentationPlan | null;
    totalSlides: number;
    generatedSlides: number;
    planningMessage: string;

    // Plan playback
    planPlaybackState: PlanPlaybackState;
    planPlaybackSlides: StreamedPlanSlide[];
    activePlanSlideIndex: number;
    planSlideDirection: number;
    planStreamComplete: boolean;

    // Live slides
    livePreviewSlides: LivePreviewSlide[];
}

export function usePresentationStream(artifactId: string): UsePresentationStreamReturn {
    // ── Core state ──
    const [status, setStatus] = useState<GenerationStatus>("planning");
    const [errorMessage, setErrorMessage] = useState("");
    const [artifact, setArtifact] = useState<Artifact | null>(null);
    const [plan, setPlan] = useState<PresentationPlan | null>(null);
    const [totalSlides, setTotalSlides] = useState(0);
    const [generatedSlides, setGeneratedSlides] = useState(0);
    const [planningMessage, setPlanningMessage] = useState("");

    // ── Plan playback state ──
    const [planPlaybackState, setPlanPlaybackState] = useState<PlanPlaybackState>("idle");
    const [planStreamComplete, setPlanStreamComplete] = useState(false);
    const [planPlaybackSlides, setPlanPlaybackSlides] = useState<StreamedPlanSlide[]>([]);
    const [activePlanSlideIndex, setActivePlanSlideIndex] = useState(0);
    const [planSlideDirection, setPlanSlideDirection] = useState(1);

    // ── Live slides state ──
    const [livePreviewSlides, setLivePreviewSlides] = useState<LivePreviewSlide[]>([]);

    // ── Refs ──
    const planPlaybackStartedRef = useRef(false);
    const planSlideCountRef = useRef(0);
    const doneNotified = useRef(false);

    // ── Glow effect ──
    const { triggerGlow, clearGlow } = useGlowEffect();

    // Reset on artifactId change
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
        setStatus("planning");
        setErrorMessage("");
        planSlideCountRef.current = 0;
    }, [artifactId]);

    // Glow management
    useEffect(() => {
        if (!artifactId) return;
        if (status === "planning" || status === "generating_slides") {
            triggerGlow("streaming");
        } else if (status === "error") {
            triggerGlow("error");
        } else {
            clearGlow();
        }
        return () => clearGlow();
    }, [artifactId, status, triggerGlow, clearGlow]);

    // Fetch artifact metadata
    useEffect(() => {
        if (!artifactId) return;
        fetchArtifact(artifactId)
            .then(setArtifact)
            .catch(() => {});
    }, [artifactId]);

    // Sync plan slide count ref
    useEffect(() => {
        planSlideCountRef.current = planPlaybackSlides.length;
    }, [planPlaybackSlides.length]);

    // ── SSE streaming ──
    useEffect(() => {
        if (!artifactId) return;
        const controller = streamPresentationGeneration(
            artifactId,
            (event: PresentationStreamEvent) => {
                switch (event.type) {
                    case "planning":
                        setStatus("planning");
                        setPlanningMessage(event.message);
                        break;
                    case "plan_partial": {
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
                    }
                    case "plan_complete": {
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
                    }
                    case "generating_slides":
                        setStatus("generating_slides");
                        setTotalSlides(event.total || 0);
                        break;
                    case "slide_progress":
                        setGeneratedSlides((prev) => Math.max(prev, Math.max(event.current - 1, 0)));
                        setTotalSlides(event.total || 0);
                        break;
                    case "slide_html_snapshot":
                        setStatus("generating_slides");
                        setTotalSlides(event.total || 0);
                        setGeneratedSlides((prev) => Math.max(prev, Math.max(event.current - 1, 0)));
                        startTransition(() => {
                            setLivePreviewSlides((prev) => upsertLivePreviewSlide(prev, {
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
                        setGeneratedSlides((prev) => Math.max(prev, event.current));
                        startTransition(() => {
                            setLivePreviewSlides((prev) => upsertLivePreviewSlide(prev, {
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
                        // Refetch artifact to get final slides with injected image/visual URLs
                        fetchArtifact(artifactId)
                            .then(setArtifact)
                            .catch(() => {});
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

    // ── Plan playback: settle on last slide then rewind ──
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

    // ── Plan playback: rewind → complete ──
    useEffect(() => {
        if (planPlaybackState !== "rewinding") return;

        const timeout = window.setTimeout(() => {
            setPlanPlaybackState("complete");
        }, PLAN_REWIND_SETTLE_MS);

        return () => window.clearTimeout(timeout);
    }, [planPlaybackState]);

    return {
        status,
        errorMessage,
        artifact,
        plan,
        totalSlides,
        generatedSlides,
        planningMessage,
        planPlaybackState,
        planPlaybackSlides,
        activePlanSlideIndex,
        planSlideDirection,
        planStreamComplete,
        livePreviewSlides,
    };
}
