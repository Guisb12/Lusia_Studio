"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface AppScrollAreaProps {
    children: React.ReactNode;
    className?: string;
    viewportClassName?: string;
    viewportStyle?: React.CSSProperties;
    showFadeMasks?: boolean;
    desktopScrollbarOnly?: boolean;
    fadeClassName?: string;
    interactiveScrollbar?: boolean;
    style?: React.CSSProperties;
    onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
}

export function AppScrollArea({
    children,
    className,
    viewportClassName,
    viewportStyle,
    showFadeMasks = true,
    desktopScrollbarOnly = true,
    fadeClassName,
    interactiveScrollbar = false,
    style,
    onMouseLeave,
}: AppScrollAreaProps) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const hideTimeoutRef = useRef<number | null>(null);
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

    const updateScrollMetrics = useCallback(() => {
        const el = viewportRef.current;
        const track = trackRef.current;
        if (!el) return;

        const { clientHeight, scrollHeight } = el;
        const maxScrollTop = Math.max(scrollHeight - clientHeight, 0);
        const nextScrollTop = Math.min(el.scrollTop, maxScrollTop);
        const trackHeight = track?.clientHeight ?? clientHeight;

        if (nextScrollTop !== el.scrollTop) {
            el.scrollTop = nextScrollTop;
        }

        if (maxScrollTop <= 1) {
            setScrollMetrics({
                canScroll: false,
                thumbHeight: Math.max(clientHeight - 16, 24),
                thumbTop: 0,
                showTopFade: false,
                showBottomFade: false,
            });
            return;
        }

        const thumbHeight = Math.max((clientHeight / scrollHeight) * trackHeight, 40);
        const maxThumbTop = Math.max(trackHeight - thumbHeight, 0);

        setScrollMetrics({
            canScroll: true,
            thumbHeight,
            thumbTop: maxScrollTop === 0 ? 0 : (nextScrollTop / maxScrollTop) * maxThumbTop,
            showTopFade: nextScrollTop > 2,
            showBottomFade: nextScrollTop < maxScrollTop - 2,
        });
    }, []);

    useEffect(() => {
        const el = viewportRef.current;
        if (!el) return;

        updateScrollMetrics();

        const handleScroll = () => updateScrollMetrics();
        el.addEventListener("scroll", handleScroll, { passive: true });

        const resizeObserver = new ResizeObserver(() => updateScrollMetrics());
        resizeObserver.observe(el);

        const content = el.firstElementChild;
        if (content instanceof HTMLElement) {
            resizeObserver.observe(content);
        }

        const mutationObserver = new MutationObserver(() => {
            requestAnimationFrame(() => updateScrollMetrics());
        });

        mutationObserver.observe(el, {
            childList: true,
            subtree: true,
            attributes: true,
        });

        window.addEventListener("resize", updateScrollMetrics);

        return () => {
            el.removeEventListener("scroll", handleScroll);
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            window.removeEventListener("resize", updateScrollMetrics);
        };
    }, [children, updateScrollMetrics]);

    useEffect(() => {
        return () => {
            if (hideTimeoutRef.current) {
                window.clearTimeout(hideTimeoutRef.current);
            }
        };
    }, []);

    const showRail = useCallback(() => {
        if (hideTimeoutRef.current) {
            window.clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
        setIsRailVisible(true);
    }, []);

    const scheduleHideRail = useCallback(() => {
        if (hideTimeoutRef.current) {
            window.clearTimeout(hideTimeoutRef.current);
        }
        hideTimeoutRef.current = window.setTimeout(() => {
            if (!hoverStateRef.current && !isDraggingThumb) {
                setIsRailVisible(false);
            }
            hideTimeoutRef.current = null;
        }, 420);
    }, [isDraggingThumb]);

    const scrollToTrackPosition = useCallback((clientY: number) => {
        const viewport = viewportRef.current;
        const track = trackRef.current;
        if (!viewport || !track || !scrollMetrics.canScroll) return;

        const trackRect = track.getBoundingClientRect();
        const centeredThumbTop = clientY - trackRect.top - scrollMetrics.thumbHeight / 2;
        const maxThumbTop = Math.max(trackRect.height - scrollMetrics.thumbHeight, 0);
        const nextThumbTop = Math.min(Math.max(centeredThumbTop, 0), maxThumbTop);
        const maxScrollTop = Math.max(viewport.scrollHeight - viewport.clientHeight, 0);

        viewport.scrollTop = maxThumbTop === 0 ? 0 : (nextThumbTop / maxThumbTop) * maxScrollTop;
    }, [scrollMetrics.canScroll, scrollMetrics.thumbHeight]);

    const handleTrackPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        scrollToTrackPosition(event.clientY);
    }, [scrollToTrackPosition]);

    const handleThumbPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();

        const viewport = viewportRef.current;
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
    }, [scheduleHideRail, scrollMetrics.canScroll, scrollMetrics.thumbHeight, showRail]);

    const scrollbarColumnClass = desktopScrollbarOnly
        ? "grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_20px]"
        : "grid-cols-[minmax(0,1fr)_20px]";
    const viewportScrollbarClass = desktopScrollbarOnly
        ? "md:[scrollbar-width:none] md:[-ms-overflow-style:none] md:[&::-webkit-scrollbar]:hidden"
        : "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";
    const trackVisibilityClass = desktopScrollbarOnly ? "hidden md:flex" : "flex";

    return (
        <div
            className={cn("grid min-h-0 overflow-hidden rounded-[inherit]", scrollbarColumnClass, className)}
            style={style}
            onMouseEnter={() => {
                hoverStateRef.current = true;
                showRail();
            }}
            onMouseLeave={(event) => {
                hoverStateRef.current = false;
                scheduleHideRail();
                onMouseLeave?.(event);
            }}
        >
            <div
                className="relative min-h-0 min-w-0 overflow-hidden"
                style={showFadeMasks ? {
                    maskImage: `linear-gradient(to bottom, ${scrollMetrics.showTopFade ? "transparent 0%, black 24px" : "black 0%"}, ${scrollMetrics.showBottomFade ? "black calc(100% - 24px), transparent 100%" : "black 100%"})`,
                    WebkitMaskImage: `linear-gradient(to bottom, ${scrollMetrics.showTopFade ? "transparent 0%, black 24px" : "black 0%"}, ${scrollMetrics.showBottomFade ? "black calc(100% - 24px), transparent 100%" : "black 100%"})`,
                } : undefined}
            >
                <div
                    ref={viewportRef}
                    className={cn(
                        "min-h-0 min-w-0 max-h-full overflow-y-auto",
                        viewportScrollbarClass,
                        viewportClassName,
                    )}
                    style={viewportStyle}
                >
                    {children}
                </div>
            </div>

            <div
                className={cn(
                    trackVisibilityClass,
                    "items-stretch justify-center py-1 pr-1.5 transition-opacity duration-300 ease-out",
                    scrollMetrics.canScroll && (isRailVisible || isDraggingThumb) ? "opacity-100" : "opacity-0",
                )}
                aria-hidden={!scrollMetrics.canScroll}
            >
                <div
                    ref={trackRef}
                    className={cn(
                        "relative w-3 rounded-full bg-brand-primary/18 ring-1 ring-brand-primary/12 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.24)]",
                        interactiveScrollbar ? "cursor-pointer" : "pointer-events-none"
                    )}
                    onPointerDown={interactiveScrollbar ? handleTrackPointerDown : undefined}
                >
                    <div
                        className="absolute inset-x-[1px] rounded-full border border-white/30 bg-brand-primary/60"
                        style={{
                            height: `${scrollMetrics.thumbHeight}px`,
                            transform: `translateY(${scrollMetrics.thumbTop}px)`,
                        }}
                        onPointerDown={interactiveScrollbar ? handleThumbPointerDown : undefined}
                    />
                </div>
            </div>
        </div>
    );
}
