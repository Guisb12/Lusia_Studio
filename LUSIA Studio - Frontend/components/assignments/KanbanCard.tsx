"use client";

import { defaultAnimateLayoutChanges, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, Users } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Pdf01Icon,
    Note01Icon,
    Quiz02Icon,
    LicenseDraftIcon,
} from "@hugeicons/core-free-icons";
import { Assignment } from "@/lib/assignments";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface KanbanCardProps {
    assignment: Assignment;
    accentColor?: string;
    isAdminGlobalView?: boolean;
    isSelected?: boolean;
    compact?: boolean;
    onPrefetch?: () => void;
    onClick: () => void;
}

interface KanbanCardOverlayProps {
    assignment: Assignment;
    accentColor?: string;
    isAdminGlobalView?: boolean;
}

function ArtifactTypeIcon({ type, size = 16 }: { type?: string; size?: number }) {
    switch (type) {
        case "quiz":
            return <HugeiconsIcon icon={Quiz02Icon} size={size} color="currentColor" strokeWidth={1.5} />;
        case "note":
            return <HugeiconsIcon icon={Note01Icon} size={size} color="currentColor" strokeWidth={1.5} />;
        case "exercise_sheet":
            return <HugeiconsIcon icon={LicenseDraftIcon} size={size} color="currentColor" strokeWidth={1.5} />;
        case "uploaded_file":
            return <HugeiconsIcon icon={Pdf01Icon} size={size} color="currentColor" strokeWidth={1.5} />;
        default:
            return <HugeiconsIcon icon={Note01Icon} size={size} color="currentColor" strokeWidth={1.5} />;
    }
}

function formatDueDate(date: string | null) {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const dueStart = new Date(d);
    dueStart.setHours(0, 0, 0, 0);
    const days = Math.round(
        (dueStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24),
    );
    const time = d.toLocaleTimeString("pt-PT", {
        hour: "2-digit",
        minute: "2-digit",
    });
    if (d < now) return { text: "Expirado", short: "Exp.", color: "text-brand-error", dotColor: "bg-red-400" };
    if (days === 0) return { text: `Hoje, ${time}`, short: "Hoje", color: "text-amber-600", dotColor: "bg-amber-400" };
    if (days === 1) return { text: `Amanhã, ${time}`, short: "Amanhã", color: "text-amber-600", dotColor: "bg-amber-400" };
    return {
        text: `${d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}, ${time}`,
        short: `${days}d`,
        color: "text-brand-primary/50",
        dotColor: "bg-brand-primary/20",
    };
}

export function KanbanCard({
    assignment,
    accentColor = "#94a3b8",
    isAdminGlobalView,
    isSelected,
    compact,
    onPrefetch,
    onClick,
}: KanbanCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: assignment.id,
        animateLayoutChanges: (args) =>
            defaultAnimateLayoutChanges({
                ...args,
                wasDragging: true,
            }),
        transition: {
            duration: 220,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const due = formatDueDate(assignment.due_date);
    const studentCount = assignment.student_count ?? 0;
    const submittedCount = assignment.submitted_count ?? 0;
    const progress = studentCount > 0 ? Math.round((submittedCount / studentCount) * 100) : 0;

    if (compact) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                {...attributes}
                {...listeners}
                onClick={onClick}
                onMouseEnter={onPrefetch}
                onFocus={onPrefetch}
                onTouchStart={onPrefetch}
                className={cn(
                    "group min-h-[108px] overflow-hidden rounded-xl border-[1.5px] bg-white p-3 transition-[transform,box-shadow,background-color,border-color] duration-200 ease-out cursor-grab active:cursor-grabbing",
                    isDragging && "shadow-lg scale-[1.02]",
                    "hover:shadow-sm",
                )}
                style={{
                    borderColor: isSelected ? `${accentColor}B3` : `${accentColor}66`,
                    boxShadow: isSelected ? `0 0 0 1px ${accentColor}22` : undefined,
                    backgroundColor: `${accentColor}22`,
                }}
                data-kanban-card
            >
                <div className="flex items-start justify-between gap-3">
                    <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${accentColor}12`, color: accentColor }}
                    >
                        <ArtifactTypeIcon type={assignment.artifact?.artifact_type} size={14} />
                    </div>
                    {due && (
                        <span
                            className={cn(
                                "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                                due.color,
                            )}
                            style={{ backgroundColor: `${accentColor}0F` }}
                        >
                            {due.short}
                        </span>
                    )}
                </div>

                <div className="mt-3 min-w-0">
                    <p className="line-clamp-2 text-[12px] font-medium leading-[1.25] text-brand-primary">
                        {assignment.title || "TPC"}
                    </p>
                    {assignment.artifact && (
                        <p className="mt-1 truncate text-[9px] text-brand-primary/35">
                            {assignment.artifact.artifact_name}
                        </p>
                    )}
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-[9px] text-brand-primary/45">
                    <span
                        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5"
                        style={{ backgroundColor: `${accentColor}10`, color: accentColor }}
                    >
                        <Users className="h-2.5 w-2.5" />
                        {studentCount}
                    </span>
                    {studentCount > 0 && (
                        <span className="inline-flex items-center rounded-full bg-brand-primary/[0.04] px-1.5 py-0.5">
                            {progress}%
                        </span>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={onClick}
            onMouseEnter={onPrefetch}
            onFocus={onPrefetch}
            onTouchStart={onPrefetch}
            className={cn(
                "group overflow-hidden rounded-xl border-[1.5px] bg-white px-3.5 py-3 transition-[transform,box-shadow,background-color,border-color] duration-200 ease-out cursor-grab active:cursor-grabbing",
                isDragging && "shadow-lg scale-[1.02]",
                "hover:shadow-sm",
            )}
            style={{
                borderColor: isSelected ? `${accentColor}B3` : `${accentColor}66`,
                boxShadow: isSelected ? `0 0 0 1px ${accentColor}22` : undefined,
                backgroundColor: `${accentColor}22`,
            }}
            data-kanban-card
        >
            {/* Title row */}
            <div className="flex items-start gap-2.5">
                <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${accentColor}12`, color: accentColor }}
                >
                    <ArtifactTypeIcon type={assignment.artifact?.artifact_type} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-brand-primary truncate leading-tight">
                        {assignment.title || "TPC sem título"}
                    </p>
                    {assignment.artifact && (
                        <p className="text-[10px] text-brand-primary/40 truncate mt-0.5">
                            {assignment.artifact.artifact_name}
                        </p>
                    )}
                </div>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-2.5 mt-2.5">
                {due && (
                    <span className={cn("text-[10px] flex items-center gap-1", due.color)}>
                        <Calendar className="h-3 w-3" />
                        {due.text}
                    </span>
                )}
                <span className="text-[10px] text-brand-primary/40 flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {studentCount}
                </span>
            </div>

            {/* Progress */}
            {studentCount > 0 && (
                <div className="mt-2.5">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-brand-primary/40">
                            {submittedCount}/{studentCount} entregues
                        </span>
                        <span className="text-[10px] font-medium text-brand-primary/60">
                            {progress}%
                        </span>
                    </div>
                    <Progress value={progress} className="h-1" />
                </div>
            )}

            {/* Teacher name (admin global view) */}
            {isAdminGlobalView && assignment.teacher_name && (
                <div className="mt-2">
                    <span
                        className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-md bg-brand-primary/[0.04] text-brand-primary/50"
                    >
                        {assignment.teacher_name}
                    </span>
                </div>
            )}
        </div>
    );
}

// Simplified version for DragOverlay (no sortable hooks)
export function KanbanCardOverlay({ assignment, accentColor = "#94a3b8", isAdminGlobalView }: KanbanCardOverlayProps) {
    const due = formatDueDate(assignment.due_date);
    const studentCount = assignment.student_count ?? 0;
    const submittedCount = assignment.submitted_count ?? 0;
    const progress = studentCount > 0 ? Math.round((submittedCount / studentCount) * 100) : 0;

    return (
        <div
            className="w-[260px] rounded-xl border-[1.5px] px-3.5 py-3 shadow-xl scale-[1.03]"
            style={{
                borderColor: `${accentColor}99`,
                backgroundColor: `${accentColor}22`,
                boxShadow: `0 14px 32px ${accentColor}2E`,
            }}
        >
            <div className="flex items-start gap-2.5">
                <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${accentColor}16`, color: accentColor }}
                >
                    <ArtifactTypeIcon type={assignment.artifact?.artifact_type} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-brand-primary truncate leading-tight">
                        {assignment.title || "TPC sem título"}
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2.5 mt-2.5">
                {due && (
                    <span className={cn("text-[10px] flex items-center gap-1", due.color)}>
                        <Calendar className="h-3 w-3" />
                        {due.text}
                    </span>
                )}
            </div>
            {studentCount > 0 && (
                <div className="mt-2.5">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-brand-primary/40">
                            {submittedCount}/{studentCount}
                        </span>
                    </div>
                    <Progress value={progress} className="h-1" />
                </div>
            )}
            {isAdminGlobalView && assignment.teacher_name && (
                <div className="mt-2">
                    <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-md bg-brand-primary/[0.04] text-brand-primary/50">
                        {assignment.teacher_name}
                    </span>
                </div>
            )}
        </div>
    );
}
