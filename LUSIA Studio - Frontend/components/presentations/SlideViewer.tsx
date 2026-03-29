"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { toast } from "sonner";
import { ArtifactIcon } from "@/components/docs/ArtifactIcon";
import { type Presentation, updatePresentationArtifact } from "@/lib/queries/presentations";
import { cn } from "@/lib/utils";
import { SlideCanvas, QuizState } from "./SlideCanvas";
import { SlideThumbnailStrip } from "./SlideThumbnailStrip";

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

interface StreamingSlide {
    id: string;
    index: number;
    html: string;
    isDone: boolean;
}

interface SlideViewerProps {
    artifactId: string;
    artifactName: string;
    content: Presentation["content"];
    subjectColor?: string | null;
    orgName?: string | null;
    orgLogoUrl?: string | null;
    onBack?: () => void;
    /** When provided, the viewer is in generation mode */
    streamingSlides?: StreamingSlide[];
    /** Whether generation is still in progress */
    isGenerating?: boolean;
    /** Total expected slide count from the plan */
    expectedSlideCount?: number;
}

function parseFragmentCount(html: string): number {
    const regex = /data-fragment-index="(\d+)"/g;
    let max = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
        const idx = Number.parseInt(match[1], 10);
        if (idx > max) max = idx;
    }
    return max;
}

function isQuizSlide(html: string): boolean {
    return html.includes('class="sl-quiz"');
}

function findCorrectOption(html: string): string | null {
    const match = html.match(/data-correct="true"[^>]*data-quiz-option="([^"]+)"/);
    if (match) return match[1];
    const match2 = html.match(/data-quiz-option="([^"]+)"[^>]*data-correct="true"/);
    return match2?.[1] ?? null;
}

function getReinforcementId(html: string): string | null {
    const match = html.match(/data-reinforcement="([^"]+)"/);
    return match?.[1] ?? null;
}

function isConditionalSlide(html: string): boolean {
    return html.includes('data-conditional="true"');
}

export function SlideViewer({
    artifactId,
    artifactName,
    content,
    subjectColor,
    orgName,
    orgLogoUrl,
    onBack,
    streamingSlides,
    isGenerating = false,
    expectedSlideCount,
}: SlideViewerProps) {
    const contentSlides = useMemo(() => content.slides ?? [], [content.slides]);
    const plan = content.plan ?? { title: artifactName, slides: [] as PlanSlide[] };

    // During generation, use streaming slides mapped to {id, html} format.
    // Once generation is done, use content.slides from DB.
    const slides = useMemo(() => {
        if (isGenerating && streamingSlides && streamingSlides.length > 0) {
            return streamingSlides.map((s) => ({ id: s.id, html: s.html }));
        }
        return contentSlides;
    }, [isGenerating, streamingSlides, contentSlides]);

    // Track which slides are still being written (partial HTML)
    const pendingSlideIds = useMemo(() => {
        if (!streamingSlides) return new Set<string>();
        return new Set(streamingSlides.filter((s) => !s.isDone).map((s) => s.id));
    }, [streamingSlides]);

    const [presentationName, setPresentationName] = useState(artifactName);
    const [editValue, setEditValue] = useState(artifactName);
    const [editingName, setEditingName] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const fullscreenRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // ── Fullscreen toggle ──
    const enterFullscreen = useCallback(() => {
        const el = fullscreenRef.current;
        if (el?.requestFullscreen) {
            el.requestFullscreen().catch(() => {});
        }
    }, []);

    useEffect(() => {
        const handleChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener("fullscreenchange", handleChange);
        return () => document.removeEventListener("fullscreenchange", handleChange);
    }, []);

    const [slideOrder, setSlideOrder] = useState<string[]>(() =>
        slides.filter((slide) => !isConditionalSlide(slide.html)).map((slide) => slide.id),
    );
    const [currentIndex, setCurrentIndex] = useState(0);
    const [visibleFragments, setVisibleFragments] = useState<Record<string, number>>({});
    const [quizStates, setQuizStates] = useState<Record<string, QuizState>>({});
    const insertedReinforcementsRef = useRef<Set<string>>(new Set());

    // Auto-follow: during generation, track the latest slide
    const autoFollowRef = useRef(true);
    const prevSlideCountRef = useRef(0);

    // Reset auto-follow when generation starts; go to slide 1 when it ends
    const wasGeneratingRef = useRef(isGenerating);
    useEffect(() => {
        if (isGenerating) {
            autoFollowRef.current = true;
            wasGeneratingRef.current = true;
        } else if (wasGeneratingRef.current) {
            // Generation just finished — jump to first slide
            wasGeneratingRef.current = false;
            setCurrentIndex(0);
            setVisibleFragments({});
        }
    }, [isGenerating]);

    // Auto-follow latest slide during generation
    useEffect(() => {
        if (!isGenerating || !autoFollowRef.current) return;
        if (slideOrder.length > prevSlideCountRef.current && slideOrder.length > 0) {
            setCurrentIndex(slideOrder.length - 1);
        }
        prevSlideCountRef.current = slideOrder.length;
    }, [isGenerating, slideOrder.length]);

    useEffect(() => {
        setPresentationName(artifactName);
        if (!editingName) {
            setEditValue(artifactName);
        }
    }, [artifactName, editingName]);

    useEffect(() => {
        if (editingName && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingName]);

    useEffect(() => {
        setSlideOrder(slides.filter((slide) => !isConditionalSlide(slide.html)).map((slide) => slide.id));
        insertedReinforcementsRef.current = new Set();
    }, [slides]);

    useEffect(() => {
        setCurrentIndex((previous) => {
            const maxIndex = Math.max(0, slideOrder.length - 1);
            return Math.min(previous, maxIndex);
        });
    }, [slideOrder.length]);

    const slideMap = useMemo(
        () => new Map(slides.map((slide) => [slide.id, slide])),
        [slides],
    );

    const fragmentCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const slide of slides) {
            counts[slide.id] = parseFragmentCount(slide.html);
        }
        return counts;
    }, [slides]);

    const currentSlideId = slideOrder[currentIndex] ?? slides[0]?.id ?? null;
    const currentSlide = currentSlideId ? slideMap.get(currentSlideId) : null;
    const currentHtml = currentSlide?.html ?? "";
    const currentFragmentCount = currentSlideId ? fragmentCounts[currentSlideId] ?? 0 : 0;
    const currentVisibleFragments = currentSlideId ? visibleFragments[currentSlideId] ?? 0 : 0;
    const currentQuizState = currentSlideId ? quizStates[currentSlideId] : undefined;

    // Generation-aware: is the current slide still being written?
    const isCurrentSlidePending = currentSlideId ? pendingSlideIds.has(currentSlideId) : false;
    // During generation, show all fragments and don't execute scripts for pending slides
    const effectiveVisibleFragments = isCurrentSlidePending ? 999 : currentVisibleFragments;
    const effectiveExecuteScripts = !isCurrentSlidePending;
    // Total pages: use expected count during generation for chrome overlay
    const effectiveTotalPages = isGenerating && expectedSlideCount
        ? expectedSlideCount
        : slideOrder.length;

    // Glow fade-out tracking
    const [showGlow, setShowGlow] = useState(isGenerating);
    useEffect(() => {
        if (isGenerating) {
            setShowGlow(true);
        } else if (showGlow) {
            // Fade out after generation completes
            const timeout = window.setTimeout(() => setShowGlow(false), 1200);
            return () => window.clearTimeout(timeout);
        }
    }, [isGenerating, showGlow]);

    const isQuiz = isQuizSlide(currentHtml);
    const canLeaveCurrentSlide = !isQuiz || currentQuizState?.answered === true;
    const canAdvanceCurrentSlide = currentFragmentCount > currentVisibleFragments;
    const canRewindCurrentSlide = currentVisibleFragments > 0;
    const canMoveToPreviousSlide = currentIndex > 0;
    const canMoveToNextSlide = currentIndex < slideOrder.length - 1;

    const commitName = useCallback(async () => {
        setEditingName(false);
        const trimmed = editValue.trim();

        if (!trimmed) {
            setEditValue(presentationName);
            return;
        }

        if (trimmed === presentationName) {
            return;
        }

        try {
            await updatePresentationArtifact(artifactId, { artifact_name: trimmed });
            setPresentationName(trimmed);
            setEditValue(trimmed);
            toast.success("Nome atualizado.");
        } catch {
            setEditValue(presentationName);
            toast.error("Não foi possível atualizar o nome.");
        }
    }, [artifactId, editValue, presentationName]);

    const handleQuizAnswer = useCallback(
        (option: string) => {
            if (!currentSlideId) return;

            const html = slideMap.get(currentSlideId)?.html ?? "";
            const correctOption = findCorrectOption(html);
            const correct = option === correctOption;

            setQuizStates((prev) => ({
                ...prev,
                [currentSlideId]: { answered: true, correct, selectedOption: option },
            }));

            if (!correct) {
                const reinforcementId =
                    getReinforcementId(html) ??
                    plan.slides.find((slide) => slide.id === currentSlideId)?.reinforcement_slide;

                if (
                    reinforcementId &&
                    slideMap.has(reinforcementId) &&
                    !insertedReinforcementsRef.current.has(reinforcementId)
                ) {
                    insertedReinforcementsRef.current.add(reinforcementId);
                    setSlideOrder((prev) => {
                        const idx = prev.indexOf(currentSlideId);
                        if (idx === -1) return prev;
                        const next = [...prev];
                        next.splice(idx + 1, 0, reinforcementId);
                        return next;
                    });
                }
            }
        },
        [currentSlideId, plan.slides, slideMap],
    );

    const handleAdvanceStep = useCallback(() => {
        const sid = slideOrder[currentIndex];
        if (!sid) return;
        const html = slideMap.get(sid)?.html ?? "";
        const fragCount = fragmentCounts[sid] ?? 0;
        const visFrag = visibleFragments[sid] ?? 0;

        if (fragCount > visFrag) {
            setVisibleFragments((prev) => ({ ...prev, [sid]: visFrag + 1 }));
            return;
        }

        if (isQuizSlide(html) && !quizStates[sid]?.answered) {
            return;
        }

        if (currentIndex < slideOrder.length - 1) {
            setCurrentIndex(currentIndex + 1);
        }
    }, [currentIndex, fragmentCounts, quizStates, slideMap, slideOrder, visibleFragments]);

    const handleRewindStep = useCallback(() => {
        const sid = slideOrder[currentIndex];
        if (!sid) return;

        const visFrag = visibleFragments[sid] ?? 0;
        if (visFrag > 0) {
            setVisibleFragments((prev) => ({ ...prev, [sid]: visFrag - 1 }));
            return;
        }

        if (currentIndex > 0) {
            const prevIdx = currentIndex - 1;
            const prevSid = slideOrder[prevIdx];
            if (prevSid) {
                setVisibleFragments((prev) => ({
                    ...prev,
                    [prevSid]: fragmentCounts[prevSid] ?? 0,
                }));
            }
            setCurrentIndex(prevIdx);
        }
    }, [currentIndex, fragmentCounts, slideOrder, visibleFragments]);

    const handlePreviousSlide = useCallback(() => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
        }
    }, [currentIndex]);

    const handleNextSlide = useCallback(() => {
        if (currentIndex < slideOrder.length - 1) {
            setCurrentIndex(currentIndex + 1);
        }
    }, [currentIndex, slideOrder.length]);

    const handleGoToSlide = useCallback(
        (index: number) => {
            if (index < 0 || index >= slideOrder.length) return;
            // Disable auto-follow when user manually navigates
            if (isGenerating) autoFollowRef.current = false;
            const sid = slideOrder[index];
            if (sid) {
                setVisibleFragments((prev) => ({
                    ...prev,
                    [sid]: fragmentCounts[sid] ?? 0,
                }));
            }
            setCurrentIndex(index);
        },
        [fragmentCounts, isGenerating, slideOrder],
    );

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (
                event.target instanceof HTMLInputElement ||
                event.target instanceof HTMLTextAreaElement ||
                event.target instanceof HTMLSelectElement ||
                (event.target instanceof HTMLElement && event.target.isContentEditable)
            ) {
                return;
            }

            switch (event.key) {
                case "ArrowRight":
                case " ":
                    event.preventDefault();
                    handleAdvanceStep();
                    break;
                case "ArrowLeft":
                    event.preventDefault();
                    handleRewindStep();
                    break;
                case "ArrowUp":
                    event.preventDefault();
                    handlePreviousSlide();
                    break;
                case "ArrowDown":
                    event.preventDefault();
                    handleNextSlide();
                    break;
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [handleAdvanceStep, handleNextSlide, handlePreviousSlide, handleRewindStep]);

    const touchStartRef = useRef<{ x: number; y: number } | null>(null);
    const handleTouchStart = useCallback((event: React.TouchEvent) => {
        const touch = event.touches[0];
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }, []);

    const handleTouchEnd = useCallback(
        (event: React.TouchEvent) => {
            if (!touchStartRef.current) return;
            const touch = event.changedTouches[0];
            const dx = touch.clientX - touchStartRef.current.x;
            const dy = touch.clientY - touchStartRef.current.y;
            touchStartRef.current = null;

            if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
            if (dx < 0) handleAdvanceStep();
            else handleRewindStep();
        },
        [handleAdvanceStep, handleRewindStep],
    );

    return (
        <div ref={fullscreenRef} className={cn("h-full flex overflow-hidden", isFullscreen ? "bg-black" : "bg-brand-bg")}>
            <div className="flex-1 min-w-0 flex flex-col">
                {!isFullscreen ? (
                <div className="shrink-0 px-4 sm:px-6 py-2.5 flex items-center gap-3">
                    {onBack ? (
                        <button
                            type="button"
                            onClick={onBack}
                            className="p-1.5 rounded-lg text-brand-primary/40 hover:text-brand-primary/70 hover:bg-brand-primary/5 transition-colors"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                    ) : null}

                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 min-w-0">
                            <ArtifactIcon
                                artifact={{
                                    artifact_type: "presentation",
                                    storage_path: null,
                                    icon: "🎓",
                                }}
                                size={20}
                            />
                            {editingName && !isGenerating ? (
                                <input
                                    ref={inputRef}
                                    value={editValue}
                                    onChange={(event) => setEditValue(event.target.value)}
                                    onBlur={() => {
                                        void commitName();
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            void commitName();
                                        }
                                        if (event.key === "Escape") {
                                            setEditValue(presentationName);
                                            setEditingName(false);
                                        }
                                    }}
                                    className="text-lg font-instrument text-brand-primary bg-transparent border-b-2 border-brand-accent/40 outline-none py-0.5 min-w-0 flex-1"
                                />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isGenerating) return;
                                        setEditValue(presentationName);
                                        setEditingName(true);
                                    }}
                                    className={cn(
                                        "text-lg font-instrument text-brand-primary truncate text-left min-w-0",
                                        isGenerating
                                            ? "cursor-default"
                                            : "hover:text-brand-accent transition-colors",
                                    )}
                                    title={isGenerating ? undefined : "Clica para editar o nome"}
                                >
                                    {presentationName || plan.title}
                                </button>
                            )}
                        </div>
                    </div>

                    {!isGenerating && slides.length > 0 ? (
                        <button
                            type="button"
                            onClick={enterFullscreen}
                            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-accent text-white text-sm font-medium hover:bg-brand-accent/90 active:scale-[0.97] transition-all"
                            title="Apresentar"
                        >
                            <Play className="h-3.5 w-3.5 fill-current" />
                            Apresentar
                        </button>
                    ) : null}
                </div>
                ) : null}

                <div
                    className="flex-1 min-w-0 flex flex-col"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                >
                    <div className={cn(
                        "flex-1 min-h-0 flex items-center justify-center",
                        isFullscreen ? "" : "px-4 py-3 sm:px-6 lg:px-8",
                    )}>
                        <div
                            className={cn(
                                "w-full max-h-full overflow-hidden transition-shadow duration-[1200ms] ease-out",
                                isFullscreen
                                    ? ""
                                    : "rounded-[1.85rem] border",
                                !isFullscreen && showGlow
                                    ? "border-brand-accent/20 shadow-[0_0_28px_6px_oklch(var(--brand-accent)/0.12),0_22px_58px_rgba(21,49,107,0.08)]"
                                    : !isFullscreen
                                        ? "border-brand-primary/8 shadow-[0_22px_58px_rgba(21,49,107,0.08)]"
                                        : "",
                            )}
                        >
                            {currentSlide ? (
                                <SlideCanvas
                                    html={currentHtml}
                                    slideId={currentSlideId ?? currentSlide.id}
                                    visibleFragments={effectiveVisibleFragments}
                                    executeScripts={effectiveExecuteScripts}
                                    quizState={isCurrentSlidePending ? undefined : currentQuizState}
                                    onQuizOptionClick={isCurrentSlidePending ? undefined : handleQuizAnswer}
                                    subjectColor={subjectColor}
                                    currentPage={currentIndex + 1}
                                    totalPages={effectiveTotalPages}
                                    orgName={orgName}
                                    orgLogoUrl={orgLogoUrl}
                                    fitViewport={isFullscreen}
                                />
                            ) : null}
                        </div>
                    </div>

                    {!isFullscreen ? (
                    <div className="shrink-0">
                        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-end justify-between gap-4">
                            <button
                                type="button"
                                onClick={handleRewindStep}
                                disabled={!canRewindCurrentSlide && !canMoveToPreviousSlide}
                                className={cn(
                                    "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                                    !canRewindCurrentSlide && !canMoveToPreviousSlide
                                        ? "text-brand-primary/20 cursor-not-allowed"
                                        : "text-brand-primary/60 hover:bg-brand-primary/5 active:scale-[0.98]",
                                )}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Anterior
                            </button>

                            <div className="flex flex-col items-center gap-1.5 min-w-[220px]">
                                <span className="text-[11px] text-brand-primary/35 text-center">
                                    ↑↓ slides · ←→ animações
                                </span>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1 max-w-xs overflow-hidden">
                                        {slideOrder.length <= 20
                                            ? slideOrder.map((id, index) => (
                                                  <button
                                                      key={`${id}-${index}`}
                                                      onClick={() => handleGoToSlide(index)}
                                                      className={cn(
                                                          "h-1.5 rounded-full transition-all",
                                                          index === currentIndex
                                                              ? "w-4 bg-brand-accent"
                                                              : index < currentIndex
                                                                ? "w-1.5 bg-brand-primary/20"
                                                                : "w-1.5 bg-brand-primary/10",
                                                      )}
                                                  />
                                              ))
                                            : null}
                                    </div>
                                    <span className="text-xs text-brand-primary/40 tabular-nums">
                                        {currentIndex + 1} / {slideOrder.length}
                                    </span>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleAdvanceStep}
                                disabled={!canAdvanceCurrentSlide && (!canLeaveCurrentSlide || !canMoveToNextSlide)}
                                className={cn(
                                    "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                                    !canAdvanceCurrentSlide && (!canLeaveCurrentSlide || !canMoveToNextSlide)
                                        ? "text-brand-primary/20 cursor-not-allowed"
                                        : "text-brand-primary/60 hover:bg-brand-primary/5 active:scale-[0.98]",
                                )}
                            >
                                Seguinte
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    ) : null}
                </div>
            </div>

            {!isFullscreen ? (
            <div className="hidden lg:flex shrink-0 h-full min-h-0 self-stretch border-l border-brand-primary/8 bg-brand-bg/60">
                <SlideThumbnailStrip
                    slides={slides}
                    currentSlideId={currentSlideId ?? ""}
                    slideOrder={slideOrder}
                    planSlides={plan.slides}
                    subjectColor={subjectColor}
                    fragmentCounts={fragmentCounts}
                    quizStates={quizStates}
                    orgName={orgName}
                    orgLogoUrl={orgLogoUrl}
                    onSelectSlide={handleGoToSlide}
                    pendingSlideIds={pendingSlideIds}
                    expectedSlideCount={isGenerating ? expectedSlideCount : undefined}
                    isGenerating={isGenerating}
                />
            </div>
            ) : null}
        </div>
    );
}
