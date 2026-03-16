"use client";

import React, { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface PickerScrollBodyProps {
    children: React.ReactNode;
    maxHeight?: number | string;
    className?: string;
    viewportClassName?: string;
    contentClassName?: string;
    separateScrollbar?: boolean;
    onScroll?: React.UIEventHandler<HTMLDivElement>;
    viewportRef?: React.MutableRefObject<HTMLDivElement | null> | ((node: HTMLDivElement | null) => void);
}

export function PickerScrollBody({
    children,
    maxHeight = 280,
    className,
    viewportClassName,
    contentClassName,
    separateScrollbar = false,
    onScroll,
    viewportRef,
}: PickerScrollBodyProps) {
    const internalViewportRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const hideTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
    const hoverStateRef = useRef(false);
    const [isRailVisible, setIsRailVisible] = useState(false);
    const [isDraggingThumb, setIsDraggingThumb] = useState(false);
    const [scrollMetrics, setScrollMetrics] = useState({
        canScroll: false,
        thumbHeight: 0,
        thumbTop: 0,
        showTopFade: false,
        showBottomFade: false,
    });

    useEffect(() => {
        const viewport = internalViewportRef.current;
        if (!viewport) return;

        const updateMetrics = () => {
            const { clientHeight, scrollHeight, scrollTop } = viewport;
            const maxScrollTop = Math.max(scrollHeight - clientHeight, 0);
            const trackHeight = trackRef.current?.clientHeight ?? clientHeight;

            if (maxScrollTop <= 1) {
                setScrollMetrics({
                    canScroll: false,
                    thumbHeight: 0,
                    thumbTop: 0,
                    showTopFade: false,
                    showBottomFade: false,
                });
                return;
            }

            const thumbHeight = Math.max((clientHeight / scrollHeight) * trackHeight, 32);
            const maxThumbTop = Math.max(trackHeight - thumbHeight, 0);

            setScrollMetrics({
                canScroll: true,
                thumbHeight,
                thumbTop: maxScrollTop === 0 ? 0 : (scrollTop / maxScrollTop) * maxThumbTop,
                showTopFade: scrollTop > 2,
                showBottomFade: scrollTop < maxScrollTop - 2,
            });
        };

        updateMetrics();

        const resizeObserver = new ResizeObserver(updateMetrics);
        resizeObserver.observe(viewport);

        const content = viewport.firstElementChild;
        if (content instanceof HTMLElement) {
            resizeObserver.observe(content);
        }

        const mutationObserver = new MutationObserver(() => {
            requestAnimationFrame(updateMetrics);
        });
        mutationObserver.observe(viewport, {
            childList: true,
            subtree: true,
            attributes: true,
        });

        viewport.addEventListener("scroll", updateMetrics, { passive: true });
        window.addEventListener("resize", updateMetrics);

        return () => {
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            viewport.removeEventListener("scroll", updateMetrics);
            window.removeEventListener("resize", updateMetrics);
        };
    }, [children]);

    useEffect(() => {
        return () => {
            if (hideTimeoutRef.current) {
                window.clearTimeout(hideTimeoutRef.current);
            }
        };
    }, []);

    const showRail = () => {
        if (hideTimeoutRef.current) {
            window.clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
        setIsRailVisible(true);
    };

    const scheduleHideRail = () => {
        if (hideTimeoutRef.current) {
            window.clearTimeout(hideTimeoutRef.current);
        }
        hideTimeoutRef.current = window.setTimeout(() => {
            if (!hoverStateRef.current && !isDraggingThumb) {
                setIsRailVisible(false);
            }
            hideTimeoutRef.current = null;
        }, 420);
    };

    const scrollToTrackPosition = (clientY: number) => {
        const viewport = internalViewportRef.current;
        const track = trackRef.current;
        if (!viewport || !track || !scrollMetrics.canScroll) return;

        const trackRect = track.getBoundingClientRect();
        const centeredThumbTop = clientY - trackRect.top - scrollMetrics.thumbHeight / 2;
        const maxThumbTop = Math.max(trackRect.height - scrollMetrics.thumbHeight, 0);
        const nextThumbTop = Math.min(Math.max(centeredThumbTop, 0), maxThumbTop);
        const maxScrollTop = Math.max(viewport.scrollHeight - viewport.clientHeight, 0);

        viewport.scrollTop = maxThumbTop === 0 ? 0 : (nextThumbTop / maxThumbTop) * maxScrollTop;
    };

    const handleTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        scrollToTrackPosition(event.clientY);
    };

    const handleThumbPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();

        const viewport = internalViewportRef.current;
        const track = trackRef.current;
        if (!viewport || !track || !scrollMetrics.canScroll) return;

        const startY = event.clientY;
        const startScrollTop = viewport.scrollTop;
        const maxScrollTop = Math.max(viewport.scrollHeight - viewport.clientHeight, 0);
        const maxThumbTop = Math.max(track.getBoundingClientRect().height - scrollMetrics.thumbHeight, 0);
        setIsDraggingThumb(true);
        showRail();

        const handlePointerMove = (moveEvent: PointerEvent) => {
            if (maxScrollTop === 0 || maxThumbTop === 0) return;
            const deltaY = moveEvent.clientY - startY;
            viewport.scrollTop = startScrollTop + (deltaY / maxThumbTop) * maxScrollTop;
        };

        const handlePointerUp = () => {
            setIsDraggingThumb(false);
            scheduleHideRail();
            document.removeEventListener("pointermove", handlePointerMove);
            document.removeEventListener("pointerup", handlePointerUp);
        };

        document.addEventListener("pointermove", handlePointerMove);
        document.addEventListener("pointerup", handlePointerUp);
    };

    return (
        <div
            className={cn(
                separateScrollbar
                    ? "grid min-h-0 overflow-hidden rounded-[inherit] grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_20px]"
                    : "relative overflow-hidden rounded-[inherit]",
                className
            )}
            onMouseEnter={() => {
                hoverStateRef.current = true;
                showRail();
            }}
            onMouseLeave={() => {
                hoverStateRef.current = false;
                scheduleHideRail();
            }}
        >
            <div className="relative min-h-0 min-w-0 overflow-hidden">
                <div
                    ref={(node) => {
                        internalViewportRef.current = node;
                        if (typeof viewportRef === "function") {
                            viewportRef(node);
                        } else if (viewportRef) {
                            viewportRef.current = node;
                        }
                    }}
                    className={cn(
                        "overflow-y-auto overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
                        separateScrollbar ? "pr-0" : "pr-2 md:pr-5",
                        viewportClassName,
                    )}
                    style={{ maxHeight }}
                    onScroll={onScroll}
                >
                    <div className={cn("p-1", contentClassName)}>{children}</div>
                </div>

                <div
                    className={cn(
                        "pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-white via-white/90 to-transparent transition-opacity",
                        scrollMetrics.showTopFade ? "opacity-100" : "opacity-0",
                    )}
                />
                <div
                    className={cn(
                        "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-white via-white/90 to-transparent transition-opacity",
                        scrollMetrics.showBottomFade ? "opacity-100" : "opacity-0",
                    )}
                />
            </div>

            <div
                className={cn(
                    separateScrollbar
                        ? "hidden md:flex items-stretch justify-center py-1 pr-1.5 transition-opacity duration-300 ease-out"
                        : "absolute inset-y-0 right-0 hidden md:flex items-stretch justify-center py-1 pr-1.5 transition-opacity duration-300 ease-out",
                    scrollMetrics.canScroll && (isRailVisible || isDraggingThumb) ? "opacity-100" : "opacity-0",
                )}
                aria-hidden={!scrollMetrics.canScroll}
            >
                <div
                    ref={trackRef}
                    className="relative w-3 cursor-pointer rounded-full bg-brand-primary/18 ring-1 ring-brand-primary/12 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.24)]"
                    onPointerDown={handleTrackPointerDown}
                >
                    <div
                        className="absolute inset-x-[1px] rounded-full border border-white/30 bg-brand-primary/60"
                        style={{
                            height: `${scrollMetrics.thumbHeight}px`,
                            transform: `translateY(${scrollMetrics.thumbTop}px)`,
                        }}
                        onPointerDown={handleThumbPointerDown}
                    />
                </div>
            </div>
        </div>
    );
}
