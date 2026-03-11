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
    const [showLeftFade, setShowLeftFade] = useState(false);
    const [showRightFade, setShowRightFade] = useState(false);

    const checkScrollPosition = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const { scrollLeft, scrollWidth, clientWidth } = container;
        setShowLeftFade(scrollLeft > 0);
        setShowRightFade(scrollLeft < scrollWidth - clientWidth - 1);
    }, []);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        checkScrollPosition();
        container.addEventListener("scroll", checkScrollPosition);
        const resizeObserver = new ResizeObserver(checkScrollPosition);
        resizeObserver.observe(container);
        return () => {
            container.removeEventListener("scroll", checkScrollPosition);
            resizeObserver.disconnect();
        };
    }, [classes, loading, checkScrollPosition]);

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
        <section className="relative mb-3">
            <div
                ref={scrollContainerRef}
                className="flex gap-3 overflow-x-auto pb-2 scrollbar-none"
                style={{ scrollbarWidth: "none" }}
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
            {showLeftFade && (
                <div
                    className="absolute left-0 top-0 bottom-0 w-12 pointer-events-none z-10"
                    style={{ background: "linear-gradient(to right, #f6f3ef 0%, rgba(246, 243, 239, 0) 100%)" }}
                />
            )}
            {showRightFade && (
                <div
                    className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none z-10"
                    style={{ background: "linear-gradient(to left, #f6f3ef 0%, rgba(246, 243, 239, 0) 100%)" }}
                />
            )}
        </section>
    );
}
