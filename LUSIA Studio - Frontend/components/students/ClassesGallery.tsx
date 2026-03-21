"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { Classroom } from "@/lib/classes";
import type { Subject } from "@/types/subjects";
import { ClassCard, AddClassCard } from "./ClassCard";

interface ClassesGalleryProps {
    classes: Classroom[];
    subjects: Subject[];
    teacherNames?: Record<string, string>;
    memberCounts?: Record<string, number>;
    loading?: boolean;
    activeClassId?: string | null;
    onClassClick: (classroom: Classroom) => void;
    onAddClassClick?: () => void;
    compact?: boolean;
}

function SkeletonCard({ compact }: { compact?: boolean }) {
    return (
        <div className={cn(
            "flex-shrink-0 rounded-xl bg-white border border-brand-primary/5 animate-pulse transition-all duration-300",
            compact ? "w-[120px]" : "w-[170px]",
        )}>
            <div className={cn(
                "bg-brand-primary/[0.03]",
                compact ? "h-[90px]" : "h-[120px]",
            )} />
            <div className={cn(
                "border-t border-brand-primary/[0.06]",
                compact ? "px-2 py-1.5" : "px-3 py-2",
            )}>
                <div className="h-3 w-20 rounded bg-brand-primary/5 mb-1" />
                <div className="h-2 w-12 rounded bg-brand-primary/5" />
            </div>
        </div>
    );
}

export function ClassesGallery({
    classes,
    subjects,
    teacherNames = {},
    memberCounts = {},
    loading = false,
    activeClassId,
    onClassClick,
    onAddClassClick,
    compact = false,
}: ClassesGalleryProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const hideTimeoutRef = useRef<number | null>(null);
    const hoverStateRef = useRef(false);
    const [showLeftFade, setShowLeftFade] = useState(false);
    const [showRightFade, setShowRightFade] = useState(false);
    const [isRailVisible, setIsRailVisible] = useState(false);
    const [isDraggingThumb, setIsDraggingThumb] = useState(false);
    const [scrollMetrics, setScrollMetrics] = useState({
        canScroll: false,
        thumbWidth: 0,
        thumbLeft: 0,
    });

    const checkScrollPosition = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const { scrollLeft, scrollWidth, clientWidth } = container;
        setShowLeftFade(scrollLeft > 0);
        setShowRightFade(scrollLeft < scrollWidth - clientWidth - 1);

        const maxScrollLeft = Math.max(scrollWidth - clientWidth, 0);
        const trackWidth = trackRef.current?.clientWidth ?? clientWidth;

        if (maxScrollLeft <= 1) {
            setScrollMetrics({
                canScroll: false,
                thumbWidth: 0,
                thumbLeft: 0,
            });
            return;
        }

        const thumbWidth = Math.max((clientWidth / scrollWidth) * trackWidth, 48);
        const maxThumbLeft = Math.max(trackWidth - thumbWidth, 0);

        setScrollMetrics({
            canScroll: true,
            thumbWidth,
            thumbLeft: maxScrollLeft === 0 ? 0 : (scrollLeft / maxScrollLeft) * maxThumbLeft,
        });
    }, []);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        checkScrollPosition();

        container.addEventListener("scroll", checkScrollPosition);
        const resizeObserver = new ResizeObserver(checkScrollPosition);
        resizeObserver.observe(container);
        const content = container.firstElementChild;
        if (content instanceof HTMLElement) {
            resizeObserver.observe(content);
        }

        return () => {
            container.removeEventListener("scroll", checkScrollPosition);
            resizeObserver.disconnect();
        };
    }, [classes, loading, checkScrollPosition]);

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

    const scrollToTrackPosition = (clientX: number) => {
        const container = scrollContainerRef.current;
        const track = trackRef.current;
        if (!container || !track || !scrollMetrics.canScroll) return;

        const trackRect = track.getBoundingClientRect();
        const centeredThumbLeft = clientX - trackRect.left - scrollMetrics.thumbWidth / 2;
        const maxThumbLeft = Math.max(trackRect.width - scrollMetrics.thumbWidth, 0);
        const nextThumbLeft = Math.min(Math.max(centeredThumbLeft, 0), maxThumbLeft);
        const maxScrollLeft = Math.max(container.scrollWidth - container.clientWidth, 0);

        container.scrollLeft = maxThumbLeft === 0 ? 0 : (nextThumbLeft / maxThumbLeft) * maxScrollLeft;
    };

    const handleTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        scrollToTrackPosition(event.clientX);
    };

    const handleThumbPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();

        const container = scrollContainerRef.current;
        const track = trackRef.current;
        if (!container || !track || !scrollMetrics.canScroll) return;

        const startX = event.clientX;
        const startScrollLeft = container.scrollLeft;
        const maxScrollLeft = Math.max(container.scrollWidth - container.clientWidth, 0);
        const maxThumbLeft = Math.max(track.getBoundingClientRect().width - scrollMetrics.thumbWidth, 0);

        setIsDraggingThumb(true);
        showRail();

        const handlePointerMove = (moveEvent: PointerEvent) => {
            if (maxScrollLeft === 0 || maxThumbLeft === 0) return;
            const deltaX = moveEvent.clientX - startX;
            container.scrollLeft = startScrollLeft + (deltaX / maxThumbLeft) * maxScrollLeft;
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

    const sorted = React.useMemo(() => {
        return [...classes].sort((a, b) => {
            if (a.is_primary && !b.is_primary) return -1;
            if (!a.is_primary && b.is_primary) return 1;
            return a.name.localeCompare(b.name, "pt");
        });
    }, [classes]);

    function resolveLabel(classroom: Classroom): string {
        if (classroom.is_primary) {
            const teacher = teacherNames[classroom.teacher_id];
            return teacher ? `Alunos de ${teacher}` : classroom.name;
        }
        return classroom.name;
    }

    function resolveSubjectInfo(classroom: Classroom) {
        const first = classroom.subject_ids.length > 0
            ? subjects.find((s) => s.id === classroom.subject_ids[0])
            : undefined;
        return {
            color: first?.color || (classroom.is_primary ? "#0a1bb6" : "#6B7280"),
            icon: first?.icon ?? "users",
        };
    }

    return (
        <section
            className="relative w-full min-w-0 mb-3"
            onMouseEnter={() => {
                hoverStateRef.current = true;
                showRail();
            }}
            onMouseLeave={() => {
                hoverStateRef.current = false;
                scheduleHideRail();
            }}
        >
            <div className="relative w-full min-w-0 overflow-hidden pb-0">
                <div
                    ref={scrollContainerRef}
                    className="flex w-full max-w-full min-w-0 gap-3 overflow-x-auto overflow-y-hidden pb-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                >
                    {loading ? (
                        <>
                            <SkeletonCard compact={compact} />
                            <SkeletonCard compact={compact} />
                            <SkeletonCard compact={compact} />
                        </>
                    ) : (
                        <>
                            {sorted.map((classroom) => {
                                const { color, icon } = resolveSubjectInfo(classroom);
                                return (
                                    <ClassCard
                                        key={classroom.id}
                                        label={resolveLabel(classroom)}
                                        subjectColor={color}
                                        subjectIcon={icon}
                                        memberCount={memberCounts[classroom.id]}
                                        isActive={classroom.id === activeClassId}
                                        onClick={() => onClassClick(classroom)}
                                        compact={compact}
                                    />
                                );
                            })}
                            {onAddClassClick && (
                                <AddClassCard onClick={onAddClassClick} compact={compact} />
                            )}
                        </>
                    )}
                </div>

                {/* Left fade mask */}
                {showLeftFade && (
                    <div
                        className="absolute left-0 top-0 bottom-0 w-12 pointer-events-none z-10"
                        style={{ background: "linear-gradient(to right, #f6f3ef 0%, rgba(246, 243, 239, 0) 100%)" }}
                    />
                )}

                {/* Right fade mask */}
                {showRightFade && (
                    <div
                        className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none z-10"
                        style={{ background: "linear-gradient(to left, #f6f3ef 0%, rgba(246, 243, 239, 0) 100%)" }}
                    />
                )}

                {/* Custom horizontal scroll rail */}
                <div
                    className={cn(
                        "absolute inset-x-0 bottom-1 hidden md:flex justify-center transition-opacity duration-300 ease-out",
                        scrollMetrics.canScroll && (isRailVisible || isDraggingThumb) ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden={!scrollMetrics.canScroll}
                >
                    <div
                        ref={trackRef}
                        className="relative h-2.5 w-full cursor-pointer rounded-full bg-brand-primary/18 ring-1 ring-brand-primary/12 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.24)]"
                        onPointerDown={handleTrackPointerDown}
                    >
                        <div
                            className="absolute inset-y-[1px] rounded-full border border-white/30 bg-brand-primary/60"
                            style={{
                                width: `${scrollMetrics.thumbWidth}px`,
                                transform: `translateX(${scrollMetrics.thumbLeft}px)`,
                            }}
                            onPointerDown={handleThumbPointerDown}
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}
