"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { SlideCanvas, QuizState } from "./SlideCanvas";
import { cn } from "@/lib/utils";

interface FullscreenPresentationProps {
    html: string;
    slideId: string;
    visibleFragments: number;
    fragmentCount: number;
    quizState?: QuizState;
    currentIndex: number;
    totalSlides: number;
    canLeaveCurrentSlide: boolean;
    subjectColor?: string | null;
    orgName?: string | null;
    orgLogoUrl?: string | null;
    onAdvanceStep: () => void;
    onRewindStep: () => void;
    onQuizOptionClick?: (option: string) => void;
    onExit: () => void;
}

export function FullscreenPresentation({
    html,
    slideId,
    visibleFragments,
    fragmentCount,
    quizState,
    currentIndex,
    totalSlides,
    canLeaveCurrentSlide,
    subjectColor,
    orgName,
    orgLogoUrl,
    onAdvanceStep,
    onRewindStep,
    onQuizOptionClick,
    onExit,
}: FullscreenPresentationProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const idleTimerRef = useRef<number | null>(null);
    const [controlsVisible, setControlsVisible] = useState(true);

    // Stabilize callbacks via refs so effects don't re-run on every render
    const onExitRef = useRef(onExit);
    onExitRef.current = onExit;
    const onAdvanceRef = useRef(onAdvanceStep);
    onAdvanceRef.current = onAdvanceStep;
    const onRewindRef = useRef(onRewindStep);
    onRewindRef.current = onRewindStep;

    const canGoBack = currentIndex > 0 || visibleFragments > 0;
    const canGoForward =
        fragmentCount > visibleFragments ||
        (canLeaveCurrentSlide && currentIndex < totalSlides - 1);

    // ── Fullscreen lifecycle — runs ONCE on mount ──
    useEffect(() => {
        const el = containerRef.current;
        if (el?.requestFullscreen) {
            el.requestFullscreen().catch(() => {});
        }

        const handleChange = () => {
            if (!document.fullscreenElement) {
                onExitRef.current();
            }
        };
        document.addEventListener("fullscreenchange", handleChange);
        return () => {
            document.removeEventListener("fullscreenchange", handleChange);
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Auto-hide controls ──
    const resetIdleTimer = useCallback(() => {
        setControlsVisible(true);
        if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = window.setTimeout(() => setControlsVisible(false), 2500);
    }, []);

    useEffect(() => {
        resetIdleTimer();
        return () => {
            if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
        };
    }, [resetIdleTimer]);

    // ── Keyboard ──
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            switch (e.key) {
                case "Escape":
                    if (document.fullscreenElement) {
                        document.exitFullscreen().catch(() => {});
                    } else {
                        onExitRef.current();
                    }
                    break;
                case "ArrowRight":
                case " ":
                case "ArrowDown":
                    e.preventDefault();
                    resetIdleTimer();
                    onAdvanceRef.current();
                    break;
                case "ArrowLeft":
                case "ArrowUp":
                    e.preventDefault();
                    resetIdleTimer();
                    onRewindRef.current();
                    break;
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [resetIdleTimer]);

    // ── Touch ──
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, []);
    const handleTouchEnd = useCallback(
        (e: React.TouchEvent) => {
            if (!touchStartRef.current) return;
            const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
            const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
            touchStartRef.current = null;
            if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
            if (dx < 0) onAdvanceRef.current();
            else onRewindRef.current();
        },
        [],
    );

    const handleExit = useCallback(() => {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        } else {
            onExitRef.current();
        }
    }, []);

    return createPortal(
        <div
            ref={containerRef}
            className="fixed inset-0 z-[9999] bg-black flex items-center justify-center select-none"
            style={{ cursor: controlsVisible ? "default" : "none" }}
            onMouseMove={resetIdleTimer}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {/* Slide */}
            <div className="w-full h-full">
                <SlideCanvas
                    html={html}
                    slideId={slideId}
                    visibleFragments={visibleFragments}
                    executeScripts
                    quizState={quizState}
                    onQuizOptionClick={onQuizOptionClick}
                    subjectColor={subjectColor}
                    currentPage={currentIndex + 1}
                    totalPages={totalSlides}
                    orgName={orgName}
                    orgLogoUrl={orgLogoUrl}
                    fitViewport
                />
            </div>

            {/* Controls overlay — auto-hide */}
            <div
                className={cn(
                    "absolute inset-0 pointer-events-none transition-opacity duration-500",
                    controlsVisible ? "opacity-100" : "opacity-0",
                )}
            >
                <button
                    type="button"
                    onClick={handleExit}
                    className="pointer-events-auto absolute top-4 right-4 p-2 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition-colors z-10"
                >
                    <X className="h-5 w-5" />
                </button>

                {canGoBack ? (
                    <button
                        type="button"
                        onClick={() => { resetIdleTimer(); onRewindStep(); }}
                        className="pointer-events-auto absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/30 text-white/70 hover:text-white hover:bg-black/50 transition-colors"
                    >
                        <ChevronLeft className="h-6 w-6" />
                    </button>
                ) : null}

                {canGoForward ? (
                    <button
                        type="button"
                        onClick={() => { resetIdleTimer(); onAdvanceStep(); }}
                        className="pointer-events-auto absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/30 text-white/70 hover:text-white hover:bg-black/50 transition-colors"
                    >
                        <ChevronRight className="h-6 w-6" />
                    </button>
                ) : null}

                <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/40 text-white/70 text-sm tabular-nums">
                    {currentIndex + 1} / {totalSlides}
                </div>
            </div>
        </div>,
        document.body,
    );
}
