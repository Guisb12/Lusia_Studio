"use client";

import { useMemo } from "react";
import { defaultAnimateLayoutChanges, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, ClipboardList } from "lucide-react";
import { Assignment } from "@/lib/assignments";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { ArtifactTypeIcon } from "@/components/docs/ArtifactIcon";

function getInitials(name: string | null | undefined): string {
    if (!name) return "?";
    return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function seededRandom(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return ((hash % 1000) + 1000) % 1000 / 1000;
}

/** Convert hex accent to a solid pastel background (like post-it paper) */
function accentToPastel(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const pr = Math.round(255 * 0.85 + r * 0.15);
    const pg = Math.round(255 * 0.85 + g * 0.15);
    const pb = Math.round(255 * 0.85 + b * 0.15);
    return `rgb(${pr}, ${pg}, ${pb})`;
}

/** Darker tint for tags on top of pastel */
function accentToTagBg(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const pr = Math.round(255 * 0.72 + r * 0.28);
    const pg = Math.round(255 * 0.72 + g * 0.28);
    const pb = Math.round(255 * 0.72 + b * 0.28);
    return `rgb(${pr}, ${pg}, ${pb})`;
}

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

/** Shows artifact type icons + count badge */
function ArtifactsBadge({
    artifacts,
    accentColor,
    size = 12,
}: {
    artifacts?: Assignment["artifacts"];
    accentColor: string;
    size?: number;
}) {
    const list = artifacts ?? [];
    if (list.length === 0) return null;

    return (
        <span
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium"
            style={{ backgroundColor: `${accentColor}10`, color: accentColor }}
        >
            {list.map((a, i) => (
                <ArtifactTypeIcon key={a.id ?? i} type={a.artifact_type} size={size} />
            ))}
            <span className="ml-0.5">
                {list.length} {list.length === 1 ? "doc" : "docs"}
            </span>
        </span>
    );
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

    const rotation = useMemo(() => seededRandom(assignment.id) * 3 - 1.5, [assignment.id]);
    const tapeRotation = useMemo(() => -1.5 + seededRandom(assignment.id + "t") * 3, [assignment.id]);

    const style = {
        transform: [CSS.Transform.toString(transform), !isDragging && !isSelected ? `rotate(${rotation}deg)` : undefined].filter(Boolean).join(" "),
        transition,
    };

    const due = formatDueDate(assignment.due_date);
    const studentCount = assignment.student_count ?? 0;
    const submittedCount = assignment.submitted_count ?? 0;
    const progress = studentCount > 0 ? Math.round((submittedCount / studentCount) * 100) : 0;
    const artifactTypes = new Set((assignment.artifacts ?? []).map((a) => a.artifact_type));
    const hasMixedTypes = artifactTypes.size > 1;
    const firstArtifactType = assignment.artifacts?.[0]?.artifact_type;

    const cardStyle = {
        ...style,
        backgroundColor: accentToPastel(accentColor),
        borderColor: isSelected ? `${accentColor}60` : "rgba(0,0,0,0.06)",
        boxShadow: isSelected
            ? `0 0 0 1px ${accentColor}40, 0 4px 16px rgba(0,0,0,0.1)`
            : "0 2px 12px rgba(0,0,0,0.08)",
    };

    const cardClass = cn(
        "group relative overflow-visible rounded-xl border-[1.5px] transition-all duration-200 ease-out cursor-grab active:cursor-grabbing",
        isDragging && "shadow-xl scale-[1.04] !rotate-[2deg]",
        "hover:shadow-md hover:!rotate-0 hover:scale-[1.02]",
    );

    const tape = (
        <div
            className="absolute -top-[6px] left-1/2 w-[42px] h-[11px] rounded-sm pointer-events-none z-10"
            style={{
                backgroundColor: "rgba(255,255,255,0.85)",
                transform: `translateX(-50%) rotate(${tapeRotation}deg)`,
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
        />
    );

    const tagBg = accentToTagBg(accentColor);

    const artifacts = assignment.artifacts ?? [];

    if (compact) {
        return (
            <div ref={setNodeRef} style={cardStyle}
                {...attributes} {...listeners}
                onClick={onClick} onMouseEnter={onPrefetch} onFocus={onPrefetch} onTouchStart={onPrefetch}
                className={cn(cardClass, "p-3 flex flex-col")} data-kanban-card>
                {tape}
                {/* Title with icon */}
                <div className="flex items-start gap-1.5 mb-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                        style={{ backgroundColor: tagBg, color: accentColor }}>
                        {hasMixedTypes || !firstArtifactType ? <ClipboardList className="h-3 w-3" /> : <ArtifactTypeIcon type={firstArtifactType} size={12} />}
                    </div>
                    <p className="line-clamp-2 text-[11px] font-semibold leading-[1.3] text-gray-800 pt-0.5">
                        {assignment.title || "TPC"}
                    </p>
                </div>

                {/* Docs */}
                {artifacts.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                        {artifacts.map((a) => (
                            <span key={a.id} className="inline-flex items-center gap-0.5 text-[8px] rounded px-1 py-0.5"
                                style={{ backgroundColor: tagBg, color: accentColor }}>
                                <ArtifactTypeIcon type={a.artifact_type} size={9} />
                                <span className="truncate max-w-[55px]">{a.artifact_name}</span>
                            </span>
                        ))}
                    </div>
                )}

                {/* Due date */}
                {due && (
                    <div className="mb-1.5">
                        <span className={cn("text-[9px] font-medium", due.color)}>{due.short}</span>
                    </div>
                )}

                {/* Progress bar */}
                {studentCount > 0 && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: tagBg }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: `${accentColor}90` }} />
                        </div>
                        <span className="text-[8px] text-gray-500 font-medium shrink-0">{submittedCount}/{studentCount}</span>
                    </div>
                )}

                {/* Bottom: teacher left, students right */}
                <div className="flex items-center justify-between mt-auto">
                    {/* Teacher avatar */}
                    <div className="group/author relative shrink-0">
                        <Avatar className="h-[16px] w-[16px] ring-1 ring-black/[0.06]">
                            <AvatarImage src={assignment.teacher_avatar || undefined} />
                            <AvatarFallback className="text-[5px] font-bold text-white"
                                style={{ backgroundColor: "rgba(0,0,0,0.25)" }}>
                                {getInitials(assignment.teacher_name)}
                            </AvatarFallback>
                        </Avatar>
                        <div className="absolute bottom-full left-0 mb-1 hidden group-hover/author:block z-20 pointer-events-none">
                            <div className="rounded-md bg-brand-primary px-2 py-1 text-[9px] text-white shadow-lg whitespace-nowrap">
                                {assignment.teacher_name ?? "Professor"}
                            </div>
                        </div>
                    </div>

                    {/* Student avatars */}
                    <div className="flex items-center -space-x-1 shrink-0">
                        {(assignment.student_preview ?? []).slice(0, 2).map((s) => (
                            <Avatar key={s.id} className="h-[16px] w-[16px] ring-1 ring-white">
                                <AvatarImage src={s.avatar_url || undefined} />
                                <AvatarFallback className="text-[5px] font-bold text-white"
                                    style={{ backgroundColor: `${accentColor}80` }}>
                                    {getInitials(s.display_name || s.full_name)}
                                </AvatarFallback>
                            </Avatar>
                        ))}
                        {studentCount > 2 && (
                            <Avatar className="h-[16px] w-[16px] ring-1 ring-white">
                                <AvatarFallback className="text-[5px] font-bold text-white"
                                    style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
                                    +{studentCount - 2}
                                </AvatarFallback>
                            </Avatar>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div ref={setNodeRef} style={cardStyle}
            {...attributes} {...listeners}
            onClick={onClick} onMouseEnter={onPrefetch} onFocus={onPrefetch} onTouchStart={onPrefetch}
            className={cn(cardClass, "px-3.5 py-3 flex flex-col")} data-kanban-card>
            {tape}

            {/* Title row with icon */}
            <div className="flex items-start gap-2 mb-1.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: tagBg, color: accentColor }}>
                    {hasMixedTypes || !firstArtifactType ? <ClipboardList className="h-3.5 w-3.5" /> : <ArtifactTypeIcon type={firstArtifactType} size={14} />}
                </div>
                <p className="text-[13px] font-semibold text-gray-800 leading-tight line-clamp-2 pt-0.5">
                    {assignment.title || "TPC sem título"}
                </p>
            </div>

            {/* Docs as tags */}
            {artifacts.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                    {artifacts.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1 text-[9px] rounded-md px-1.5 py-0.5"
                            style={{ backgroundColor: tagBg, color: accentColor }}>
                            <ArtifactTypeIcon type={a.artifact_type} size={10} />
                            <span className="truncate max-w-[80px]">{a.artifact_name}</span>
                        </span>
                    ))}
                </div>
            )}

            {/* Due date */}
            {due && (
                <div className="flex items-center gap-1.5 mb-2">
                    <Calendar className="h-3 w-3 text-gray-400" />
                    <span className={cn("text-[10px] font-medium", due.color)}>{due.text}</span>
                </div>
            )}

            {/* Bottom: teacher left, progress center, students right */}
            <div className="flex items-center gap-2 mt-auto pt-1">
                {/* Teacher avatar — PostItNote style */}
                <div className="group/author relative shrink-0">
                    <Avatar className="h-[18px] w-[18px] ring-1 ring-black/[0.06]">
                        <AvatarImage src={assignment.teacher_avatar || undefined} />
                        <AvatarFallback className="text-[6px] font-bold text-white"
                            style={{ backgroundColor: "rgba(0,0,0,0.25)" }}>
                            {getInitials(assignment.teacher_name)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="absolute bottom-full left-0 mb-1 hidden group-hover/author:block z-20 pointer-events-none">
                        <div className="rounded-md bg-brand-primary px-2 py-1 text-[9px] text-white shadow-lg whitespace-nowrap">
                            {assignment.teacher_name ?? "Professor"}
                        </div>
                    </div>
                </div>

                {/* Progress */}
                {studentCount > 0 && (
                    <div className="flex-1 min-w-0 flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: tagBg }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: `${accentColor}90` }} />
                        </div>
                        <span className="text-[9px] text-gray-500 font-medium shrink-0">{submittedCount}/{studentCount}</span>
                    </div>
                )}

                {/* Student avatars */}
                <div className="flex items-center -space-x-1 shrink-0">
                    {(assignment.student_preview ?? []).slice(0, 3).map((s) => (
                        <div key={s.id} className="group/student relative">
                            <Avatar className="h-[18px] w-[18px] ring-1 ring-white">
                                <AvatarImage src={s.avatar_url || undefined} />
                                <AvatarFallback className="text-[6px] font-bold text-white"
                                    style={{ backgroundColor: `${accentColor}80` }}>
                                    {getInitials(s.display_name || s.full_name)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="absolute bottom-full right-0 mb-1 hidden group-hover/student:block z-20 pointer-events-none">
                                <div className="rounded-md bg-brand-primary px-2 py-1 text-[9px] text-white shadow-lg whitespace-nowrap">
                                    {s.display_name || s.full_name}
                                </div>
                            </div>
                        </div>
                    ))}
                    {studentCount > 3 && (
                        <Avatar className="h-[18px] w-[18px] ring-1 ring-white">
                            <AvatarFallback className="text-[6px] font-bold text-white"
                                style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
                                +{studentCount - 3}
                            </AvatarFallback>
                        </Avatar>
                    )}
                </div>
            </div>
        </div>
    );
}

// Simplified version for DragOverlay (no sortable hooks)
export function KanbanCardOverlay({ assignment, accentColor = "#94a3b8" }: KanbanCardOverlayProps) {
    const due = formatDueDate(assignment.due_date);
    const artifacts = assignment.artifacts ?? [];

    return (
        <div
            className="relative w-[260px] overflow-visible rounded-xl border-[1.5px] px-3.5 py-3 scale-[1.04] rotate-[2deg]"
            style={{
                backgroundColor: accentToPastel(accentColor),
                borderColor: "rgba(0,0,0,0.06)",
                boxShadow: "0 16px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.08)",
            }}
        >
            <div
                className="absolute -top-[6px] left-1/2 w-[42px] h-[11px] rounded-sm pointer-events-none z-10"
                style={{ backgroundColor: "rgba(255,255,255,0.85)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", transform: "translateX(-50%) rotate(1deg)" }}
            />
            <p className="text-[13px] font-semibold text-gray-800 leading-tight mb-1.5 truncate">
                {assignment.title || "TPC sem título"}
            </p>
            {artifacts.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                    {artifacts.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1 text-[9px] rounded-md px-1.5 py-0.5"
                            style={{ backgroundColor: accentToTagBg(accentColor), color: accentColor }}>
                            <ArtifactTypeIcon type={a.artifact_type} size={10} />
                            <span className="truncate max-w-[80px]">{a.artifact_name}</span>
                        </span>
                    ))}
                </div>
            )}
            {due && (
                <span className={cn("text-[10px] font-medium", due.color)}>{due.text}</span>
            )}
        </div>
    );
}
