"use client";

import { useEffect, useRef, useState, type ReactNode, type UIEvent } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
    SortableContext,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Ban, MoveRight, Plus } from "lucide-react";
import { Assignment } from "@/lib/assignments";
import { KanbanCard } from "@/components/assignments/KanbanCard";
import { cn } from "@/lib/utils";

interface KanbanColumnProps {
    id: string;
    title: string;
    count: number;
    assignments: Assignment[];
    accentColor: string;
    isAdminGlobalView?: boolean;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onPrefetchAssignment?: (id: string) => void;
    headerContent?: ReactNode;
    footerContent?: ReactNode;
    onScrollEnd?: () => void;
    compact?: boolean;
    isDragging?: boolean;
    isDropBlocked?: boolean;
    isValidDrop?: boolean;
    isDropAvailable?: boolean;
    onCreateNew?: () => void;
}

export function KanbanColumn({
    id,
    title,
    count,
    assignments,
    accentColor,
    isAdminGlobalView,
    selectedId,
    onSelect,
    onPrefetchAssignment,
    headerContent,
    footerContent,
    onScrollEnd,
    compact,
    isDragging,
    isDropBlocked,
    isValidDrop,
    isDropAvailable,
    onCreateNew,
}: KanbanColumnProps) {
    const { setNodeRef } = useDroppable({ id });
    const itemIds = assignments.map((a) => a.id);
    const viewportRef = useRef<HTMLDivElement>(null);
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
        const viewport = viewportRef.current;
        if (!viewport) return;

        const updateMetrics = () => {
            const { clientHeight, scrollHeight, scrollTop } = viewport;
            const maxScrollTop = Math.max(scrollHeight - clientHeight, 0);
            const trackHeight = trackRef.current?.clientHeight ?? clientHeight;

            if (maxScrollTop <= 1) {
                setScrollMetrics((previous) => (
                    previous.canScroll
                    || previous.thumbHeight !== 0
                    || previous.thumbTop !== 0
                    || previous.showTopFade
                    || previous.showBottomFade
                        ? {
                            canScroll: false,
                            thumbHeight: 0,
                            thumbTop: 0,
                            showTopFade: false,
                            showBottomFade: false,
                        }
                        : previous
                ));
                return;
            }

            const thumbHeight = Math.max((clientHeight / scrollHeight) * trackHeight, 40);
            const maxThumbTop = Math.max(trackHeight - thumbHeight, 0);
            const nextMetrics = {
                canScroll: true,
                thumbHeight,
                thumbTop: maxScrollTop === 0 ? 0 : (scrollTop / maxScrollTop) * maxThumbTop,
                showTopFade: scrollTop > 2,
                showBottomFade: scrollTop < maxScrollTop - 2,
            };

            setScrollMetrics((previous) => (
                previous.canScroll === nextMetrics.canScroll
                && Math.abs(previous.thumbHeight - nextMetrics.thumbHeight) < 0.5
                && Math.abs(previous.thumbTop - nextMetrics.thumbTop) < 0.5
                && previous.showTopFade === nextMetrics.showTopFade
                && previous.showBottomFade === nextMetrics.showBottomFade
                    ? previous
                    : nextMetrics
            ));
        };

        updateMetrics();

        const resizeObserver = new ResizeObserver(updateMetrics);
        resizeObserver.observe(viewport);

        const content = viewport.firstElementChild;
        if (content instanceof HTMLElement) {
            resizeObserver.observe(content);
        }

        viewport.addEventListener("scroll", updateMetrics, { passive: true });
        window.addEventListener("resize", updateMetrics);

        return () => {
            resizeObserver.disconnect();
            viewport.removeEventListener("scroll", updateMetrics);
            window.removeEventListener("resize", updateMetrics);
        };
    }, [assignments.length, compact, count, onCreateNew]);

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

    const handleScroll = (event: UIEvent<HTMLDivElement>) => {
        if (!onScrollEnd) {
            return;
        }

        const target = event.currentTarget;
        const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
        if (remaining < 180) {
            onScrollEnd();
        }
    };

    const scrollToTrackPosition = (clientY: number) => {
        const viewport = viewportRef.current;
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
    };

    const viewportMaskImage = (() => {
        const fadeSize = 24;

        if (scrollMetrics.showTopFade && scrollMetrics.showBottomFade) {
            return `linear-gradient(to bottom, transparent 0px, black ${fadeSize}px, black calc(100% - ${fadeSize}px), transparent 100%)`;
        }

        if (scrollMetrics.showTopFade) {
            return `linear-gradient(to bottom, transparent 0px, black ${fadeSize}px, black 100%)`;
        }

        if (scrollMetrics.showBottomFade) {
            return `linear-gradient(to bottom, black 0px, black calc(100% - ${fadeSize}px), transparent 100%)`;
        }

        return undefined;
    })();

    return (
        <div className={cn(
            "flex h-full flex-1 flex-col rounded-2xl border p-3 shadow-sm",
            compact ? "min-w-0" : "min-w-[260px]",
        )}
        style={{
            borderColor: `${accentColor}22`,
            backgroundColor: `${accentColor}0D`,
        }}>
            {/* Column header */}
            <div className="flex items-center gap-2 px-1 pb-3">
                <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: accentColor }}
                />
                <h3 className={cn(
                    "font-medium uppercase tracking-wider truncate",
                    compact ? "text-[10px]" : "text-xs",
                )}
                style={{ color: `${accentColor}B3` }}>
                    {title}
                </h3>
                <span
                    className="text-[10px] tabular-nums shrink-0"
                    style={{ color: `${accentColor}80` }}
                >
                    {count}
                </span>
                {headerContent ? (
                    <div className="ml-auto min-w-0">
                        {headerContent}
                    </div>
                ) : null}
            </div>

            {/* Drop zone */}
            <div
                ref={setNodeRef}
                className={cn(
                    "relative flex-1 min-h-0 overflow-hidden rounded-xl border transition-all duration-200",
                    isDropBlocked
                        ? "border-red-300/100 bg-red-50"
                        : isValidDrop
                            ? "border-brand-primary/40 bg-white/95"
                            : isDropAvailable
                                ? "border-brand-primary/28 bg-white/85"
                            : isDragging
                                ? "border-white/30 bg-white/50"
                                : "border-transparent bg-transparent",
                )}
                style={isValidDrop || isDropAvailable ? { borderColor: `${accentColor}${isValidDrop ? "E0" : "B0"}` } : undefined}
            >
                {/* Blocked drop overlay */}
                {isDropBlocked && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-red-50/95 backdrop-blur-[1px]">
                        <Ban className="mb-1.5 h-5 w-5 text-red-500" />
                        <p className="text-[11px] font-semibold text-red-600">
                            Coluna automática
                        </p>
                        {!compact && (
                            <p className="mt-0.5 max-w-[180px] text-center text-[10px] leading-tight text-red-500">
                                Os TPCs aparecem aqui quando o prazo expira ou todos entregam
                            </p>
                        )}
                    </div>
                )}

                {isDropAvailable && (
                    <div
                        className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl border-2 border-dashed backdrop-blur-[1px] transition-all duration-150"
                        style={{
                            borderColor: `${accentColor}${isValidDrop ? "FF" : "D0"}`,
                            backgroundColor: `${accentColor}${isValidDrop ? "72" : "52"}`,
                            color: accentColor,
                        }}
                    >
                        <MoveRight className="mb-1.5 h-5 w-5" />
                        <p className="text-[11px] font-semibold">{isValidDrop ? "Largar aqui" : "Mover para aqui"}</p>
                        {!compact && (
                            <p className="mt-0.5 text-[10px] opacity-75">
                                Mover TPC para {title.toLowerCase()}
                            </p>
                        )}
                    </div>
                )}

                <div
                    className="relative h-full overflow-hidden"
                    onMouseEnter={() => {
                        hoverStateRef.current = true;
                        showRail();
                    }}
                    onMouseLeave={() => {
                        hoverStateRef.current = false;
                        scheduleHideRail();
                    }}
                >
                    <div
                        ref={viewportRef}
                        className="h-full overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                        onScroll={handleScroll}
                        style={{
                            WebkitMaskImage: viewportMaskImage,
                            maskImage: viewportMaskImage,
                            WebkitMaskRepeat: "no-repeat",
                            maskRepeat: "no-repeat",
                            WebkitMaskSize: "100% 100%",
                            maskSize: "100% 100%",
                        }}
                    >
                        <SortableContext
                            items={itemIds}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className={cn("p-1 pr-4", compact ? "space-y-1.5" : "space-y-2")}>
                                {/* Add new task skeleton — only in Ativos column */}
                                {onCreateNew && (
                                    <button
                                        type="button"
                                        onClick={onCreateNew}
                                        className={cn(
                                            "group flex w-full items-center justify-start gap-2 rounded-xl border text-left transition-all",
                                            compact
                                                ? "px-2.5 py-2"
                                                : "px-3.5 py-3.5",
                                        )}
                                        style={{
                                            borderColor: `${accentColor}33`,
                                            backgroundColor: `${accentColor}12`,
                                            color: accentColor,
                                        }}
                                    >
                                        <div
                                            className={cn(
                                                "flex shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105",
                                                compact ? "h-6 w-6" : "h-9 w-9",
                                            )}
                                            style={{ backgroundColor: `${accentColor}20` }}
                                        >
                                            <Plus className={compact ? "h-3 w-3" : "h-4 w-4"} />
                                        </div>
                                        <span className={cn("min-w-0 text-left font-semibold", compact ? "text-[10px]" : "text-[12px]")}>
                                            Novo TPC
                                        </span>
                                    </button>
                                )}

                                {assignments.length === 0 && !onCreateNew ? (
                                    <div className="flex items-center justify-center py-10">
                                        <p className="text-xs text-brand-primary/30">
                                            Sem TPCs
                                        </p>
                                    </div>
                                ) : (
                                    assignments.map((assignment) => (
                                        <KanbanCard
                                            key={assignment.id}
                                            assignment={assignment}
                                            accentColor={accentColor}
                                            isAdminGlobalView={isAdminGlobalView}
                                            isSelected={selectedId === assignment.id}
                                            compact={compact}
                                            onPrefetch={() => onPrefetchAssignment?.(assignment.id)}
                                            onClick={() => onSelect(assignment.id)}
                                        />
                                    ))
                                )}
                                {footerContent}
                            </div>
                        </SortableContext>
                    </div>

                    <div
                        className={cn(
                            "absolute inset-y-0 right-0 hidden md:flex items-stretch justify-center py-1 pr-1 transition-opacity duration-300 ease-out",
                            scrollMetrics.canScroll && (isRailVisible || isDraggingThumb) ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden={!scrollMetrics.canScroll}
                    >
                        <div
                            ref={trackRef}
                            className="relative w-2.5 cursor-pointer rounded-full bg-brand-primary/18 ring-1 ring-brand-primary/12 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.24)]"
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
            </div>
        </div>
    );
}
