"use client";

import React, { useState, useMemo, useCallback, useRef } from "react";
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    addMonths,
    subMonths,
    addWeeks,
    subWeeks,
    parseISO,
    setHours,
    setMinutes,
    differenceInMinutes,
    isToday,
} from "date-fns";
import { pt } from "date-fns/locale";
import {
    ChevronLeft,
    ChevronRight,
    Plus,
    Calendar as CalendarIcon,
    List,
    LayoutGrid,
    Columns3,
    Clock,
    Users,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { SessionFormDialog, SessionFormData } from "./SessionFormDialog";
import { StudentInfo } from "./StudentHoverCard";
import { SubjectInfo } from "./SubjectPicker";

// ── Types ─────────────────────────────────────────────────────

export interface CalendarSession {
    id: string;
    organization_id: string;
    teacher_id: string;
    student_ids: string[];
    starts_at: string;
    ends_at: string;
    title?: string | null;
    subject_ids?: string[] | null;
    teacher_notes?: string | null;
    teacher_name?: string | null;
    students?: Array<{
        id: string;
        full_name?: string;
        display_name?: string;
        avatar_url?: string;
        grade_level?: string;
        course?: string;
    }>;
    subjects?: Array<{
        id: string;
        name: string;
        color?: string;
        icon?: string;
    }>;
}

type ViewMode = "month" | "week" | "list";

interface EventCalendarProps {
    sessions: CalendarSession[];
    onCreateSession: (data: SessionFormData) => Promise<void>;
    onUpdateSession: (id: string, data: SessionFormData) => Promise<void>;
    onDeleteSession: (id: string) => Promise<void>;
    onDateRangeChange: (start: Date, end: Date) => void;
    isAdmin?: boolean;
    teacherFilter?: React.ReactNode;
}

// ── Helpers ───────────────────────────────────────────────────

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 60; // px per hour
// 0x20 = 32/255 ≈ 12% opacity — light tinted background.
const SESSION_BLOCK_BG_ALPHA_HEX = "20";
const SESSION_BLOCK_COLUMN_GUTTER_PX = 4;
const SNAP_INTERVAL_MINUTES = 15;
const DRAG_THRESHOLD_PX = 5; // min movement to be considered a drag

type SessionLayoutItem = {
    session: CalendarSession;
    topPx: number;
    heightPx: number;
    col: number;
    cols: number;
};

function minutesOfDay(d: Date): number {
    return d.getHours() * 60 + d.getMinutes();
}

/**
 * Computes a simple, robust layout for overlapping sessions within a single day column:
 * - Sessions that overlap are assigned different "cols" so they appear side-by-side.
 * - We also compute an overlap group size (cols) so widths are consistent within a cluster.
 */
function layoutSessionsForDay(daySessions: CalendarSession[], minHeightPx: number): SessionLayoutItem[] {
    const items = daySessions
        .map((session) => {
            const start = parseISO(session.starts_at);
            const end = parseISO(session.ends_at);
            const startMin = minutesOfDay(start);
            const endMin = Math.max(minutesOfDay(end), startMin + 1);
            const topPx = (startMin / 60) * HOUR_HEIGHT;
            const heightPx = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, minHeightPx);
            return { session, startMin, endMin, topPx, heightPx, col: 0, cols: 1 };
        })
        .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

    // 1) Assign each session to the first available column (interval graph coloring, greedy).
    const colEnds: number[] = [];
    items.forEach((it) => {
        let col = -1;
        for (let i = 0; i < colEnds.length; i++) {
            if (it.startMin >= colEnds[i]) {
                col = i;
                break;
            }
        }
        if (col === -1) {
            col = colEnds.length;
            colEnds.push(it.endMin);
        } else {
            colEnds[col] = it.endMin;
        }
        it.col = col;
    });

    // 2) Create overlap clusters and set a consistent "cols" value per cluster.
    // Two sessions are in the same cluster if there is a chain of overlaps between them.
    let clusterStart = 0;
    let clusterEnd = -Infinity;
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (i === clusterStart) {
            clusterEnd = it.endMin;
        } else if (it.startMin >= clusterEnd) {
            const cluster = items.slice(clusterStart, i);
            const cols = Math.max(1, ...cluster.map((x) => x.col + 1));
            cluster.forEach((x) => (x.cols = cols));
            clusterStart = i;
            clusterEnd = it.endMin;
        } else {
            clusterEnd = Math.max(clusterEnd, it.endMin);
        }
    }
    // Final cluster.
    if (items.length > 0) {
        const cluster = items.slice(clusterStart);
        const cols = Math.max(1, ...cluster.map((x) => x.col + 1));
        cluster.forEach((x) => (x.cols = cols));
    }

    return items.map(({ session, topPx, heightPx, col, cols }) => ({
        session,
        topPx,
        heightPx,
        col,
        cols,
    }));
}

function sessionToFormData(session: CalendarSession): SessionFormData {
    const start = parseISO(session.starts_at);
    const students: StudentInfo[] = (session.students || []).map((s) => ({
        id: s.id,
        full_name: s.full_name,
        display_name: s.display_name,
        avatar_url: s.avatar_url,
        grade_level: s.grade_level,
        course: s.course,
    }));
    const subjects: SubjectInfo[] = (session.subjects || []).map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
    }));

    return {
        id: session.id,
        title: session.title || "",
        date: start,
        startTime: format(start, "HH:mm"),
        endTime: format(parseISO(session.ends_at), "HH:mm"),
        students,
        subjects,
        teacherNotes: session.teacher_notes || "",
    };
}

function getSessionColor(session: CalendarSession): string {
    if (session.subjects && session.subjects.length > 0 && session.subjects[0].color) {
        return session.subjects[0].color;
    }
    return "#0a1bb6"; // brand-accent
}

function getSessionLabel(session: CalendarSession): string {
    if (session.title) return session.title;
    if (session.students && session.students.length > 0) {
        const names = session.students
            .slice(0, 2)
            .map((s) => s.display_name || s.full_name || "Aluno");
        if (session.students.length > 2) {
            return `${names.join(", ")} +${session.students.length - 2}`;
        }
        return names.join(", ");
    }
    return "Sessão";
}

function snapToInterval(minutes: number, interval: number): number {
    return Math.round(minutes / interval) * interval;
}

function minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ── Component ─────────────────────────────────────────────────

export function EventCalendar({
    sessions,
    onCreateSession,
    onUpdateSession,
    onDeleteSession,
    onDateRangeChange,
    isAdmin = false,
    teacherFilter,
}: EventCalendarProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<ViewMode>("week");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingSession, setEditingSession] = useState<SessionFormData | null>(null);
    
    // Optimistic updates: map of session ID to temporary updated session
    const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, CalendarSession>>({});

    // ── Navigation ──

    const navigate = useCallback(
        (direction: "prev" | "next" | "today") => {
            setCurrentDate((prev) => {
                if (direction === "today") return new Date();
                const d = direction === "next" ? 1 : -1;
                switch (viewMode) {
                    case "month":
                        return d === 1 ? addMonths(prev, 1) : subMonths(prev, 1);
                    case "week":
                        return d === 1 ? addWeeks(prev, 1) : subWeeks(prev, 1);
                    default:
                        return d === 1 ? addMonths(prev, 1) : subMonths(prev, 1);
                }
            });
        },
        [viewMode]
    );

    // ── Date range for queries ──

    const dateRange = useMemo(() => {
        switch (viewMode) {
            case "month": {
                const monthStart = startOfMonth(currentDate);
                const monthEnd = endOfMonth(currentDate);
                return {
                    start: startOfWeek(monthStart, { weekStartsOn: 1 }),
                    end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
                };
            }
            case "week": {
                return {
                    start: startOfWeek(currentDate, { weekStartsOn: 1 }),
                    end: endOfWeek(currentDate, { weekStartsOn: 1 }),
                };
            }
            case "list": {
                const monthStart = startOfMonth(currentDate);
                return { start: monthStart, end: endOfMonth(currentDate) };
            }
            default:
                return { start: currentDate, end: currentDate };
        }
    }, [currentDate, viewMode]);

    // Track previous date range timestamps to avoid unnecessary refetches
    const startTimestamp = dateRange.start.getTime();
    const endTimestamp = dateRange.end.getTime();
    const prevTimestampsRef = useRef<{ start: number; end: number } | null>(null);

    React.useEffect(() => {
        const prev = prevTimestampsRef.current;
        
        // Only call onDateRangeChange if the timestamps actually changed
        if (!prev || prev.start !== startTimestamp || prev.end !== endTimestamp) {
            prevTimestampsRef.current = { start: startTimestamp, end: endTimestamp };
            onDateRangeChange(dateRange.start, dateRange.end);
        }
    }, [startTimestamp, endTimestamp, dateRange.start, dateRange.end, onDateRangeChange]);

    // ── Header title ──

    const headerTitle = useMemo(() => {
        switch (viewMode) {
            case "month":
                return format(currentDate, "MMMM yyyy", { locale: pt });
            case "week": {
                const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
                const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
                if (weekStart.getMonth() === weekEnd.getMonth()) {
                    return `${format(weekStart, "d", { locale: pt })} — ${format(weekEnd, "d MMMM yyyy", { locale: pt })}`;
                }
                return `${format(weekStart, "d MMM", { locale: pt })} — ${format(weekEnd, "d MMM yyyy", { locale: pt })}`;
            }
            case "list":
                return format(currentDate, "MMMM yyyy", { locale: pt });
            default:
                return "";
        }
    }, [currentDate, viewMode]);

    // ── Dialog handlers ──

    const handleOpenCreate = (date?: Date, startTime?: string) => {
        const now = new Date();
        const nextHour = now.getHours() + 1;
        setEditingSession({
            date: date || currentDate,
            startTime: startTime || `${String(nextHour).padStart(2, "0")}:00`,
            endTime: startTime
                ? `${String(parseInt(startTime.split(":")[0]) + 1).padStart(2, "0")}:00`
                : `${String(nextHour + 1).padStart(2, "0")}:00`,
            students: [],
            subjects: [],
        });
        setDialogOpen(true);
    };

    const handleEditSession = (session: CalendarSession) => {
        setEditingSession(sessionToFormData(session));
        setDialogOpen(true);
    };

    const handleSubmit = async (data: SessionFormData) => {
        // Close dialog immediately for better UX
        setDialogOpen(false);
        setEditingSession(null);

        // Apply optimistic update immediately
        if (data.id) {
            // Find the original session
            const originalSession = sessions.find(s => s.id === data.id);
            if (originalSession) {
                const startDateTime = setMinutes(
                    setHours(data.date, parseInt(data.startTime.split(':')[0])),
                    parseInt(data.startTime.split(':')[1])
                );
                const endDateTime = setMinutes(
                    setHours(data.date, parseInt(data.endTime.split(':')[0])),
                    parseInt(data.endTime.split(':')[1])
                );
                
                const optimisticSession: CalendarSession = {
                    ...originalSession,
                    starts_at: startDateTime.toISOString(),
                    ends_at: endDateTime.toISOString(),
                    title: data.title || null,
                    teacher_notes: data.teacherNotes || null,
                };
                handleOptimisticUpdate(data.id, optimisticSession);
            }
        }

        try {
            if (data.id) {
                await onUpdateSession(data.id, data);
                // Optimistic update will be auto-cleared when server data arrives
            } else {
                await onCreateSession(data);
            }
        } catch (error) {
            if (data.id) {
                clearOptimisticUpdate(data.id);
            }
            console.error("Failed to submit session:", error);
        }
    };

    // ── Session grouping with optimistic updates ──

    const sessionsByDate = useMemo(() => {
        // Merge optimistic updates
        const mergedSessions = sessions.map(s => optimisticUpdates[s.id] || s);
        
        const map: Record<string, CalendarSession[]> = {};
        mergedSessions.forEach((s) => {
            const key = format(parseISO(s.starts_at), "yyyy-MM-dd");
            if (!map[key]) map[key] = [];
            map[key].push(s);
        });
        // Sort each day's sessions by start time
        Object.values(map).forEach((arr) =>
            arr.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        );
        return map;
    }, [sessions, optimisticUpdates]);

    // Handler for optimistic session updates
    const handleOptimisticUpdate = useCallback((sessionId: string, updatedSession: CalendarSession) => {
        setOptimisticUpdates(prev => ({ ...prev, [sessionId]: updatedSession }));
    }, []);

    const clearOptimisticUpdate = useCallback((sessionId: string) => {
        setOptimisticUpdates(prev => {
            const next = { ...prev };
            delete next[sessionId];
            return next;
        });
    }, []);

    // Auto-clear optimistic updates when server data arrives with matching times
    React.useEffect(() => {
        Object.keys(optimisticUpdates).forEach((sessionId) => {
            const serverSession = sessions.find(s => s.id === sessionId);
            const optimisticSession = optimisticUpdates[sessionId];
            
            if (serverSession && optimisticSession) {
                // Check if server data matches optimistic update (within 1 second tolerance)
                const serverStart = parseISO(serverSession.starts_at).getTime();
                const optimisticStart = parseISO(optimisticSession.starts_at).getTime();
                const serverEnd = parseISO(serverSession.ends_at).getTime();
                const optimisticEnd = parseISO(optimisticSession.ends_at).getTime();
                
                if (Math.abs(serverStart - optimisticStart) < 1000 && 
                    Math.abs(serverEnd - optimisticEnd) < 1000) {
                    clearOptimisticUpdate(sessionId);
                }
            }
        });
    }, [sessions, optimisticUpdates, clearOptimisticUpdate]);

    // ── View modes ──

    const viewModes: { value: ViewMode; label: string; icon: React.ReactNode }[] = [
        { value: "month", label: "Mês", icon: <LayoutGrid className="h-4 w-4" /> },
        { value: "week", label: "Semana", icon: <Columns3 className="h-4 w-4" /> },
        { value: "list", label: "Lista", icon: <List className="h-4 w-4" /> },
    ];

    return (
        <div className="flex flex-col h-full font-satoshi">
            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => navigate("prev")}
                            className="h-8 w-8"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => navigate("today")}
                            className="h-8 px-3 text-xs"
                        >
                            Hoje
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => navigate("next")}
                            className="h-8 w-8"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <h2 className="text-xl font-normal text-brand-primary capitalize font-instrument">
                        {headerTitle}
                    </h2>
                </div>

                <div className="flex items-center gap-2">
                    {/* Admin: teacher filter */}
                    {isAdmin && teacherFilter}

                    {/* View mode toggle */}
                    <div className="flex rounded-xl border border-brand-primary/10 p-0.5 bg-white">
                        {viewModes.map((vm) => (
                            <button
                                key={vm.value}
                                onClick={() => setViewMode(vm.value)}
                                className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                                    viewMode === vm.value
                                        ? "bg-brand-accent/10 text-brand-accent"
                                        : "text-brand-primary/50 hover:text-brand-primary/70"
                                )}
                                title={vm.label}
                            >
                                {vm.icon}
                                <span className="hidden sm:inline">{vm.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Create button */}
                    <Button onClick={() => handleOpenCreate()} className="h-8 gap-1.5 text-xs">
                        <Plus className="h-4 w-4" />
                        <span className="hidden sm:inline">Nova Sessão</span>
                    </Button>
                </div>
            </div>

            {/* ── Calendar Content ── */}
            <div className="flex-1 min-h-0 overflow-hidden rounded-2xl border border-brand-primary/15 bg-white shadow-sm">
                {viewMode === "month" && (
                    <MonthView
                        currentDate={currentDate}
                        sessionsByDate={sessionsByDate}
                        onDayClick={(date) => {
                            setCurrentDate(date);
                            setViewMode("week");
                        }}
                        onSessionClick={handleEditSession}
                        onCreateClick={(date) => handleOpenCreate(date)}
                    />
                )}
                {viewMode === "week" && (
                    <WeekView
                        currentDate={currentDate}
                        sessionsByDate={sessionsByDate}
                        onSessionClick={handleEditSession}
                        onSessionUpdate={onUpdateSession}
                        onOptimisticUpdate={handleOptimisticUpdate}
                        onClearOptimisticUpdate={clearOptimisticUpdate}
                        onSlotClick={(date, hour) =>
                            handleOpenCreate(date, `${String(hour).padStart(2, "0")}:00`)
                        }
                    />
                )}
                {viewMode === "list" && (
                    <ListView
                        currentDate={currentDate}
                        sessionsByDate={sessionsByDate}
                        onSessionClick={handleEditSession}
                    />
                )}
            </div>

            {/* ── Session Dialog ── */}
            <SessionFormDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                initialData={editingSession}
                onSubmit={handleSubmit}
                onDelete={onDeleteSession}
            />
        </div>
    );
}

// ── Month View ────────────────────────────────────────────────

function MonthView({
    currentDate,
    sessionsByDate,
    onDayClick,
    onSessionClick,
    onCreateClick,
}: {
    currentDate: Date;
    sessionsByDate: Record<string, CalendarSession[]>;
    onDayClick: (date: Date) => void;
    onSessionClick: (s: CalendarSession) => void;
    onCreateClick: (date: Date) => void;
}) {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: calStart, end: calEnd });
    const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

    return (
        <div className="flex flex-col h-full">
            {/* Day names header */}
            <div className="grid grid-cols-7 border-b border-brand-primary/10">
                {weekDays.map((d) => (
                    <div
                        key={d}
                        className="py-2 text-center text-xs font-medium text-brand-primary/40 uppercase tracking-wider"
                    >
                        {d}
                    </div>
                ))}
            </div>

            {/* Day cells */}
            <div
                className="grid grid-cols-7 flex-1 min-h-0"
                style={{ gridTemplateRows: `repeat(${days.length / 7}, 1fr)` }}
            >
                {days.map((day) => {
                    const key = format(day, "yyyy-MM-dd");
                    const daySessions = sessionsByDate[key] || [];
                    const isCurrentMonth = isSameMonth(day, currentDate);
                    const today = isToday(day);

                    return (
                        <div
                            key={key}
                            className={cn(
                                "border-r border-b border-brand-primary/10 p-1 min-h-[80px] cursor-pointer transition-colors group",
                                !isCurrentMonth && "bg-brand-primary/[0.02]",
                                "hover:bg-brand-accent/[0.02]"
                            )}
                            onClick={() => onDayClick(day)}
                        >
                            <div className="flex items-center justify-between mb-0.5">
                                <span
                                    className={cn(
                                        "text-xs font-medium h-6 w-6 flex items-center justify-center rounded-full",
                                        today && "bg-brand-accent text-white",
                                        !today && isCurrentMonth && "text-brand-primary",
                                        !isCurrentMonth && "text-brand-primary/25"
                                    )}
                                >
                                    {format(day, "d")}
                                </span>
                                <button
                                    className="h-5 w-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 text-brand-primary/30 hover:text-brand-accent hover:bg-brand-accent/10 transition-all"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCreateClick(day);
                                    }}
                                >
                                    <Plus className="h-3 w-3" />
                                </button>
                            </div>

                            {/* Session pills */}
                            <div className="space-y-0.5">
                                {daySessions.slice(0, 3).map((session) => {
                                    const color = getSessionColor(session);
                                    const subjectColor =
                                        session.subjects && session.subjects.length > 0 && session.subjects[0].color
                                            ? session.subjects[0].color
                                            : color;
                                    return (
                                        <button
                                            key={session.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSessionClick(session);
                                            }}
                                            className="w-full text-left rounded-md px-1.5 py-[3px] text-[10px] flex items-center gap-1 overflow-hidden transition-all hover:brightness-95 active:scale-[0.98]"
                                            style={{
                                                backgroundColor: `${color}18`,
                                                borderLeft: `2.5px solid ${color}`,
                                            }}
                                        >
                                            {/* Subject color dot */}
                                            <span
                                                className="h-1.5 w-1.5 rounded-full shrink-0"
                                                style={{ backgroundColor: subjectColor }}
                                            />
                                            {/* Time — bold */}
                                            <span className="font-semibold shrink-0" style={{ color }}>
                                                {format(parseISO(session.starts_at), "HH:mm")}
                                            </span>
                                            {/* Label — lighter */}
                                            <span className="truncate" style={{ color, opacity: 0.7 }}>
                                                {getSessionLabel(session)}
                                            </span>
                                        </button>
                                    );
                                })}
                                {daySessions.length > 3 && (
                                    <span className="text-[10px] text-brand-primary/40 px-1">
                                        +{daySessions.length - 3} mais
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Week View ──────────────────────────────────────────────────

function WeekView({
    currentDate,
    sessionsByDate,
    onSessionClick,
    onSessionUpdate,
    onOptimisticUpdate,
    onClearOptimisticUpdate,
    onSlotClick,
}: {
    currentDate: Date;
    sessionsByDate: Record<string, CalendarSession[]>;
    onSessionClick: (s: CalendarSession) => void;
    onSessionUpdate: (id: string, data: SessionFormData) => Promise<void>;
    onOptimisticUpdate: (sessionId: string, updatedSession: CalendarSession) => void;
    onClearOptimisticUpdate: (sessionId: string) => void;
    onSlotClick: (date: Date, hour: number) => void;
}) {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({
        start: weekStart,
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
    });
    const scrollRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const dayColumnsRef = useRef<(HTMLDivElement | null)[]>([]);

    // Drag state (for moving events)
    const [dragState, setDragState] = React.useState<{
        session: CalendarSession;
        sessionId: string;
        isDragging: boolean;
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
        startDate: Date;
        targetDate: Date;
        originalStartMinutes: number;
        durationMinutes: number;
    } | null>(null);

    // Resize state (for changing duration)
    const [resizeState, setResizeState] = React.useState<{
        session: CalendarSession;
        sessionId: string;
        isResizing: boolean;
        edge: 'top' | 'bottom';
        startY: number;
        currentY: number;
        originalStartMinutes: number;
        originalEndMinutes: number;
    } | null>(null);

    // Memoize layout calculations to prevent flash when switching views
    const layoutsByDay = useMemo(() => {
        const layouts: Record<string, SessionLayoutItem[]> = {};
        weekDays.forEach((day) => {
            const key = format(day, "yyyy-MM-dd");
            const daySessions = sessionsByDate[key] || [];
            layouts[key] = layoutSessionsForDay(daySessions, 20);
        });
        return layouts;
    }, [sessionsByDate, weekDays]);

    // Current time tracking for the indicator line
    const [currentTime, setCurrentTime] = React.useState(new Date());

    React.useEffect(() => {
        // Update current time every minute
        const interval = setInterval(() => {
            setCurrentTime(new Date());
        }, 60000); // 60 seconds

        return () => clearInterval(interval);
    }, []);

    React.useEffect(() => {
        // Scroll to ~8am on mount
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 8 * HOUR_HEIGHT;
        }
    }, []);

    const handlePointerDown = useCallback(
        (e: React.PointerEvent, session: CalendarSession, date: Date) => {
            e.stopPropagation();
            const start = parseISO(session.starts_at);
            const end = parseISO(session.ends_at);
            const startMinutes = start.getHours() * 60 + start.getMinutes();
            const durationMinutes = differenceInMinutes(end, start);

            setDragState({
                session,
                sessionId: session.id,
                isDragging: false,
                startX: e.clientX,
                startY: e.clientY,
                currentX: e.clientX,
                currentY: e.clientY,
                startDate: date,
                targetDate: date,
                originalStartMinutes: startMinutes,
                durationMinutes,
            });

            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        },
        []
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (resizeState) {
                // Handle resize
                const deltaY = e.clientY - resizeState.startY;
                if (!resizeState.isResizing && Math.abs(deltaY) < DRAG_THRESHOLD_PX) {
                    return;
                }
                setResizeState({ ...resizeState, isResizing: true, currentY: e.clientY });
                return;
            }

            if (!dragState) return;

            const deltaX = e.clientX - dragState.startX;
            const deltaY = e.clientY - dragState.startY;
            const totalDelta = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            if (!dragState.isDragging && totalDelta < DRAG_THRESHOLD_PX) {
                return;
            }

            // Calculate target day based on mouse position
            let targetDate = dragState.startDate;
            const mouseX = e.clientX;
            for (let i = 0; i < dayColumnsRef.current.length; i++) {
                const col = dayColumnsRef.current[i];
                if (col) {
                    const rect = col.getBoundingClientRect();
                    if (mouseX >= rect.left && mouseX < rect.right) {
                        targetDate = weekDays[i];
                        break;
                    }
                }
            }

            setDragState({ 
                ...dragState, 
                isDragging: true, 
                currentX: e.clientX, 
                currentY: e.clientY,
                targetDate
            });
        },
        [dragState, resizeState, weekDays]
    );

    const handlePointerUp = useCallback(
        async (e: React.PointerEvent, session: CalendarSession) => {
            if (!dragState || dragState.sessionId !== session.id) return;

            const wasDragging = dragState.isDragging;
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);

            if (!wasDragging) {
                // It was a click, not a drag
                setDragState(null);
                onSessionClick(session);
                return;
            }

            // Calculate new time based on vertical drag
            const deltaY = dragState.currentY - dragState.startY;
            const deltaMinutes = Math.round((deltaY / HOUR_HEIGHT) * 60);
            const newStartMinutes = snapToInterval(
                dragState.originalStartMinutes + deltaMinutes,
                SNAP_INTERVAL_MINUTES
            );
            const clampedStartMinutes = Math.max(
                0,
                Math.min(1440 - dragState.durationMinutes, newStartMinutes)
            );

            // Use the target date from drag state
            const newDate = dragState.targetDate;

            const newStartTime = minutesToTime(clampedStartMinutes);
            const newEndTime = minutesToTime(clampedStartMinutes + dragState.durationMinutes);

            setDragState(null);

            // Apply optimistic update
            const newStartDateTime = setMinutes(
                setHours(newDate, Math.floor(clampedStartMinutes / 60)),
                clampedStartMinutes % 60
            );
            const newEndDateTime = setMinutes(
                setHours(newDate, Math.floor((clampedStartMinutes + dragState.durationMinutes) / 60)),
                (clampedStartMinutes + dragState.durationMinutes) % 60
            );
            
            const optimisticSession: CalendarSession = {
                ...session,
                starts_at: newStartDateTime.toISOString(),
                ends_at: newEndDateTime.toISOString(),
            };
            onOptimisticUpdate(session.id, optimisticSession);

            // Save the updated session
            try {
                const formData = sessionToFormData(session);
                formData.date = newDate;
                formData.startTime = newStartTime;
                formData.endTime = newEndTime;
                await onSessionUpdate(session.id, formData);
                // Optimistic update will be auto-cleared when server data arrives
            } catch (error) {
                // Revert optimistic update on error
                onClearOptimisticUpdate(session.id);
                console.error("Failed to update session:", error);
            }
        },
        [dragState, onSessionClick, onSessionUpdate, onOptimisticUpdate, onClearOptimisticUpdate]
    );

    // Resize handlers
    const handleResizeStart = useCallback(
        (e: React.PointerEvent, session: CalendarSession, edge: 'top' | 'bottom') => {
            e.stopPropagation();
            const start = parseISO(session.starts_at);
            const end = parseISO(session.ends_at);
            const startMinutes = start.getHours() * 60 + start.getMinutes();
            const endMinutes = end.getHours() * 60 + end.getMinutes();

            setResizeState({
                session,
                sessionId: session.id,
                isResizing: false,
                edge,
                startY: e.clientY,
                currentY: e.clientY,
                originalStartMinutes: startMinutes,
                originalEndMinutes: endMinutes,
            });

            (e.target as HTMLElement).setPointerCapture(e.pointerId);
        },
        []
    );

    const handleResizeEnd = useCallback(
        async (e: React.PointerEvent) => {
            if (!resizeState) return;

            const wasResizing = resizeState.isResizing;
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);

            if (!wasResizing) {
                // It was a click, not a resize
                setResizeState(null);
                return;
            }

            // Calculate new time based on resize
            const deltaY = resizeState.currentY - resizeState.startY;
            const deltaMinutes = Math.round((deltaY / HOUR_HEIGHT) * 60);

            let newStartMinutes = resizeState.originalStartMinutes;
            let newEndMinutes = resizeState.originalEndMinutes;

            if (resizeState.edge === 'top') {
                newStartMinutes = snapToInterval(
                    resizeState.originalStartMinutes + deltaMinutes,
                    SNAP_INTERVAL_MINUTES
                );
                // Ensure minimum 15 minutes duration
                newStartMinutes = Math.min(newStartMinutes, newEndMinutes - SNAP_INTERVAL_MINUTES);
                newStartMinutes = Math.max(0, newStartMinutes);
            } else {
                newEndMinutes = snapToInterval(
                    resizeState.originalEndMinutes + deltaMinutes,
                    SNAP_INTERVAL_MINUTES
                );
                // Ensure minimum 15 minutes duration
                newEndMinutes = Math.max(newEndMinutes, newStartMinutes + SNAP_INTERVAL_MINUTES);
                newEndMinutes = Math.min(1440, newEndMinutes);
            }

            const newStartTime = minutesToTime(newStartMinutes);
            const newEndTime = minutesToTime(newEndMinutes);

            setResizeState(null);

            // Get the date from the session
            const sessionDate = parseISO(resizeState.session.starts_at);

            // Apply optimistic update
            const newStartDateTime = setMinutes(
                setHours(sessionDate, Math.floor(newStartMinutes / 60)),
                newStartMinutes % 60
            );
            const newEndDateTime = setMinutes(
                setHours(sessionDate, Math.floor(newEndMinutes / 60)),
                newEndMinutes % 60
            );

            const optimisticSession: CalendarSession = {
                ...resizeState.session,
                starts_at: newStartDateTime.toISOString(),
                ends_at: newEndDateTime.toISOString(),
            };
            onOptimisticUpdate(resizeState.session.id, optimisticSession);

            // Save the updated session
            try {
                const formData = sessionToFormData(resizeState.session);
                formData.startTime = newStartTime;
                formData.endTime = newEndTime;
                await onSessionUpdate(resizeState.session.id, formData);
                // Optimistic update will be auto-cleared when server data arrives
            } catch (error) {
                // Revert optimistic update on error
                onClearOptimisticUpdate(resizeState.session.id);
                console.error("Failed to resize session:", error);
            }
        },
        [resizeState, onSessionUpdate, onOptimisticUpdate, onClearOptimisticUpdate]
    );

    return (
        <div className="flex flex-col h-full">
            {/* Day headers */}
            <div className="flex border-b border-brand-primary/10 sticky top-0 bg-white z-10">
                <div className="w-14 shrink-0" /> {/* Time gutter spacer */}
                {weekDays.map((day) => (
                    <div
                        key={day.toISOString()}
                        className={cn(
                            "flex-1 text-center py-2 border-l border-brand-primary/10",
                            isToday(day) && "bg-brand-accent/5"
                        )}
                    >
                        <div className="text-[10px] uppercase tracking-wider text-brand-primary/40 font-medium">
                            {format(day, "EEE", { locale: pt })}
                        </div>
                        <div
                            className={cn(
                                "text-lg font-semibold mt-0.5",
                                isToday(day) ? "text-brand-accent" : "text-brand-primary"
                            )}
                        >
                            {format(day, "d")}
                        </div>
                    </div>
                ))}
            </div>

            {/* Time grid */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
                <div ref={gridRef} className="flex relative" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
                    {/* Time gutter */}
                    <div className="w-14 shrink-0">
                        {HOURS.map((h) => (
                            <div
                                key={h}
                                className="absolute left-0 w-14 text-right pr-2 text-[10px] text-brand-primary/30 font-medium"
                                style={{ top: `${h * HOUR_HEIGHT}px`, lineHeight: "1" }}
                            >
                                {`${String(h).padStart(2, "0")}:00`}
                            </div>
                        ))}
                    </div>

                    {/* Day columns */}
                    {weekDays.map((day, dayIndex) => {
                        const key = format(day, "yyyy-MM-dd");
                        const dayLayout = layoutsByDay[key] || [];

                        return (
                            <div
                                key={key}
                                ref={(el) => (dayColumnsRef.current[dayIndex] = el)}
                                className={cn(
                                    "flex-1 relative border-l border-brand-primary/10",
                                    isToday(day) && "bg-brand-accent/[0.02]"
                                )}
                            >
                                {/* Hour lines */}
                                {HOURS.map((h) => (
                                    <div
                                        key={h}
                                        className="absolute w-full border-t border-brand-primary/10 cursor-pointer hover:bg-brand-accent/[0.03] transition-colors"
                                        style={{
                                            top: `${h * HOUR_HEIGHT}px`,
                                            height: `${HOUR_HEIGHT}px`,
                                        }}
                                        onClick={() => onSlotClick(day, h)}
                                    />
                                ))}

                                {/* Current time indicator */}
                                {isToday(day) && (() => {
                                    const now = currentTime;
                                    const currentMinutes = now.getHours() * 60 + now.getMinutes();
                                    const topPosition = (currentMinutes / 60) * HOUR_HEIGHT;
                                    
                                    return (
                                        <>
                                            {/* Red line */}
                                            <div
                                                className="absolute w-full z-30 pointer-events-none"
                                                style={{
                                                    top: `${topPosition}px`,
                                                    height: '2px',
                                                    backgroundColor: '#ef4444',
                                                }}
                                            />
                                            {/* Red dot on the left */}
                                            <div
                                                className="absolute z-30 pointer-events-none rounded-full"
                                                style={{
                                                    top: `${topPosition - 4}px`,
                                                    left: '-4px',
                                                    width: '8px',
                                                    height: '8px',
                                                    backgroundColor: '#ef4444',
                                                }}
                                            />
                                        </>
                                    );
                                })()}

                                {/* Session blocks */}
                                {dayLayout.map(({ session, topPx, heightPx, col, cols }) => {
                                        const start = parseISO(session.starts_at);
                                        const end = parseISO(session.ends_at);
                                        const color = getSessionColor(session);
                                        const isPast = end < currentTime;

                                        const widthPct = 100 / Math.max(1, cols);
                                        const leftPct = col * widthPct;
                                        const horizontalPaddingClass = cols >= 3 ? "px-1" : "px-1.5";

                                        const isDragging =
                                            dragState?.isDragging && dragState.sessionId === session.id;
                                        const isResizing =
                                            resizeState?.isResizing && resizeState.sessionId === session.id;
                                        
                                        // When dragging to a different day, make invisible but keep in DOM for pointer capture
                                        const isDraggingToOtherDay = isDragging && dragState && 
                                            format(day, "yyyy-MM-dd") !== format(dragState.targetDate, "yyyy-MM-dd");

                                        // Calculate snapped position during drag or resize
                                        let displayTopPx = topPx;
                                        let displayHeightPx = heightPx;
                                        let displayStart = start;
                                        let displayEnd = end;
                                        
                                        if (isDragging && dragState) {
                                            const deltaY = dragState.currentY - dragState.startY;
                                            const deltaMinutes = Math.round((deltaY / HOUR_HEIGHT) * 60);
                                            const newStartMinutes = snapToInterval(
                                                dragState.originalStartMinutes + deltaMinutes,
                                                SNAP_INTERVAL_MINUTES
                                            );
                                            const clampedStartMinutes = Math.max(
                                                0,
                                                Math.min(1440 - dragState.durationMinutes, newStartMinutes)
                                            );
                                            displayTopPx = (clampedStartMinutes / 60) * HOUR_HEIGHT;
                                            displayStart = setMinutes(
                                                setHours(start, Math.floor(clampedStartMinutes / 60)),
                                                clampedStartMinutes % 60
                                            );
                                            displayEnd = setMinutes(
                                                setHours(
                                                    start,
                                                    Math.floor((clampedStartMinutes + dragState.durationMinutes) / 60)
                                                ),
                                                (clampedStartMinutes + dragState.durationMinutes) % 60
                                            );
                                        } else if (isResizing && resizeState) {
                                            const deltaY = resizeState.currentY - resizeState.startY;
                                            const deltaMinutes = Math.round((deltaY / HOUR_HEIGHT) * 60);
                                            
                                            let newStartMinutes = resizeState.originalStartMinutes;
                                            let newEndMinutes = resizeState.originalEndMinutes;
                                            
                                            if (resizeState.edge === 'top') {
                                                newStartMinutes = snapToInterval(
                                                    resizeState.originalStartMinutes + deltaMinutes,
                                                    SNAP_INTERVAL_MINUTES
                                                );
                                                newStartMinutes = Math.min(newStartMinutes, newEndMinutes - SNAP_INTERVAL_MINUTES);
                                                newStartMinutes = Math.max(0, newStartMinutes);
                                            } else {
                                                newEndMinutes = snapToInterval(
                                                    resizeState.originalEndMinutes + deltaMinutes,
                                                    SNAP_INTERVAL_MINUTES
                                                );
                                                newEndMinutes = Math.max(newEndMinutes, newStartMinutes + SNAP_INTERVAL_MINUTES);
                                                newEndMinutes = Math.min(1440, newEndMinutes);
                                            }
                                            
                                            displayTopPx = (newStartMinutes / 60) * HOUR_HEIGHT;
                                            displayHeightPx = Math.max(((newEndMinutes - newStartMinutes) / 60) * HOUR_HEIGHT, 20);
                                            displayStart = setMinutes(
                                                setHours(start, Math.floor(newStartMinutes / 60)),
                                                newStartMinutes % 60
                                            );
                                            displayEnd = setMinutes(
                                                setHours(start, Math.floor(newEndMinutes / 60)),
                                                newEndMinutes % 60
                                            );
                                        }

                                        return (
                                            <div
                                                key={session.id}
                                                className={cn(
                                                    "absolute rounded-xl text-left overflow-visible hover:z-10 group touch-none",
                                                    isDraggingToOtherDay && "opacity-0",
                                                    (isDragging || isResizing) && !isDraggingToOtherDay
                                                        ? "opacity-70 z-20 shadow-lg transition-none"
                                                        : !isDraggingToOtherDay && "transition-all"
                                                )}
                                                style={{
                                                    top: `${displayTopPx}px`,
                                                    height: `${displayHeightPx}px`,
                                                    left: `calc(${leftPct}% + ${SESSION_BLOCK_COLUMN_GUTTER_PX / 2}px)`,
                                                    width: `calc(${widthPct}% - ${SESSION_BLOCK_COLUMN_GUTTER_PX}px)`,
                                                }}
                                            >
                                                {/* Resize handle - Top */}
                                                <div
                                                    className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-10 bg-transparent"
                                                    onPointerDown={(e) => handleResizeStart(e, session, 'top')}
                                                    onPointerMove={handlePointerMove}
                                                    onPointerUp={handleResizeEnd}
                                                />
                                                
                                                {/* Event content */}
                                                <button
                                                    className={cn(
                                                        "w-full h-full rounded-xl text-left overflow-hidden relative transition-all duration-150",
                                                        isResizing ? "cursor-ns-resize" : "cursor-grab",
                                                        !isDragging && !isResizing && "hover:scale-[1.015] hover:shadow-md hover:z-10",
                                                        isPast && "opacity-60"
                                                    )}
                                                    style={{
                                                        backgroundColor: `${color}${SESSION_BLOCK_BG_ALPHA_HEX}`,
                                                        borderLeft: `3px solid ${color}`,
                                                    }}
                                                    onPointerDown={(e) => handlePointerDown(e, session, day)}
                                                    onPointerMove={handlePointerMove}
                                                    onPointerUp={(e) => handlePointerUp(e, session)}
                                                >
                                                    {/* Pencil-scratch diagonal stripe overlay for past sessions */}
                                                    {isPast && (
                                                        <div
                                                            className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl"
                                                            style={{
                                                                background: `repeating-linear-gradient(
                                                                    -52deg,
                                                                    transparent,
                                                                    transparent 6px,
                                                                    ${color}28 6px,
                                                                    ${color}28 7.5px
                                                                )`,
                                                            }}
                                                        />
                                                    )}

                                                    {/* Card content — stacked: time → name → subject → avatars */}
                                                    <div className="absolute inset-0 px-2 py-1.5 flex flex-col gap-0.5 overflow-hidden">
                                                        {/* Time range */}
                                                        <div
                                                            className="text-[10px] font-medium truncate shrink-0 leading-none"
                                                            style={{ color, opacity: isPast ? 0.55 : 0.75 }}
                                                        >
                                                            {format(displayStart, "HH:mm")} — {format(displayEnd, "HH:mm")}
                                                        </div>

                                                        {/* Session name — bold */}
                                                        {displayHeightPx > 30 && (
                                                            <div
                                                                className="text-[11px] font-semibold truncate shrink-0 leading-tight"
                                                                style={{ color, opacity: isPast ? 0.55 : 1 }}
                                                            >
                                                                {getSessionLabel(session)}
                                                            </div>
                                                        )}

                                                        {/* Subject — subtitle */}
                                                        {displayHeightPx > 52 && session.subjects && session.subjects.length > 0 && (
                                                            <div
                                                                className="flex items-center gap-1 text-[10px] truncate shrink-0"
                                                                style={{ color, opacity: isPast ? 0.4 : 0.65 }}
                                                            >
                                                                <span
                                                                    className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                                                                    style={{ backgroundColor: session.subjects[0].color || color }}
                                                                />
                                                                <span className="truncate">
                                                                    {session.subjects.length === 1
                                                                        ? session.subjects[0].name
                                                                        : `${session.subjects.length} disciplinas`}
                                                                </span>
                                                            </div>
                                                        )}

                                                        {/* Student avatars — bottom */}
                                                        {displayHeightPx > 72 && session.students && session.students.length > 0 && (
                                                            <div className="mt-auto flex items-center gap-1 pt-0.5">
                                                                <div className="flex -space-x-1">
                                                                    {session.students.slice(0, cols >= 2 ? 2 : 3).map((student) => {
                                                                        const initials = (student.display_name || student.full_name || "?")
                                                                            .split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                                                                        return (
                                                                            <div
                                                                                key={student.id}
                                                                                className="h-4 w-4 rounded-full bg-white/80 flex items-center justify-center overflow-hidden ring-1 ring-white/30"
                                                                            >
                                                                                {student.avatar_url ? (
                                                                                    <Image
                                                                                        src={student.avatar_url}
                                                                                        alt={student.full_name || ""}
                                                                                        width={16}
                                                                                        height={16}
                                                                                        className="object-cover h-full w-full"
                                                                                    />
                                                                                ) : (
                                                                                    <span className="text-[7px] font-semibold" style={{ color }}>
                                                                                        {initials}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                                {session.students.length > (cols >= 2 ? 2 : 3) && (
                                                                    <span
                                                                        className="text-[8px] font-medium"
                                                                        style={{ color, opacity: 0.6 }}
                                                                    >
                                                                        +{session.students.length - (cols >= 2 ? 2 : 3)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </button>

                                                {/* Resize handle - Bottom (visible on hover) */}
                                                <div
                                                    className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize z-10 flex items-center justify-center"
                                                    onPointerDown={(e) => handleResizeStart(e, session, 'bottom')}
                                                    onPointerMove={handlePointerMove}
                                                    onPointerUp={handleResizeEnd}
                                                >
                                                    <span
                                                        className="w-5 h-0.5 rounded-full opacity-0 group-hover:opacity-50 transition-opacity duration-150"
                                                        style={{ backgroundColor: color }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    }
                                )}

                                {/* Render dragged event ghost in target day */}
                                {dragState?.isDragging && 
                                 format(day, "yyyy-MM-dd") === format(dragState.targetDate, "yyyy-MM-dd") &&
                                 (() => {
                                    const draggedSession = dragState.session;

                                    const start = parseISO(draggedSession.starts_at);
                                    const end = parseISO(draggedSession.ends_at);
                                    const color = getSessionColor(draggedSession);

                                    // Calculate snapped position
                                    const deltaY = dragState.currentY - dragState.startY;
                                    const deltaMinutes = Math.round((deltaY / HOUR_HEIGHT) * 60);
                                    const newStartMinutes = snapToInterval(
                                        dragState.originalStartMinutes + deltaMinutes,
                                        SNAP_INTERVAL_MINUTES
                                    );
                                    const clampedStartMinutes = Math.max(
                                        0,
                                        Math.min(1440 - dragState.durationMinutes, newStartMinutes)
                                    );
                                    const displayTopPx = (clampedStartMinutes / 60) * HOUR_HEIGHT;
                                    const heightPx = Math.max((dragState.durationMinutes / 60) * HOUR_HEIGHT, 20);
                                    
                                    const displayStart = setMinutes(
                                        setHours(start, Math.floor(clampedStartMinutes / 60)),
                                        clampedStartMinutes % 60
                                    );
                                    const displayEnd = setMinutes(
                                        setHours(
                                            start,
                                            Math.floor((clampedStartMinutes + dragState.durationMinutes) / 60)
                                        ),
                                        (clampedStartMinutes + dragState.durationMinutes) % 60
                                    );

                                    return (
                                        <div
                                            key={`dragging-${draggedSession.id}`}
                                            className="absolute rounded-xl text-left touch-none cursor-grabbing opacity-70 z-20 shadow-lg transition-none overflow-hidden"
                                            style={{
                                                top: `${displayTopPx}px`,
                                                height: `${heightPx}px`,
                                                left: `2px`,
                                                right: `2px`,
                                                backgroundColor: `${color}${SESSION_BLOCK_BG_ALPHA_HEX}`,
                                                borderLeft: `3px solid ${color}`,
                                                pointerEvents: 'none',
                                            }}
                                        >
                                            <div className="absolute inset-0 px-2 py-1.5 flex flex-col gap-0.5 overflow-hidden">
                                                <div
                                                    className="text-[10px] font-medium truncate shrink-0 leading-none"
                                                    style={{ color, opacity: 0.75 }}
                                                >
                                                    {format(displayStart, "HH:mm")} — {format(displayEnd, "HH:mm")}
                                                </div>
                                                {heightPx > 30 && (
                                                    <div
                                                        className="text-[11px] font-semibold truncate shrink-0 leading-tight"
                                                        style={{ color }}
                                                    >
                                                        {getSessionLabel(draggedSession)}
                                                    </div>
                                                )}
                                                {heightPx > 52 && draggedSession.subjects && draggedSession.subjects.length > 0 && (
                                                    <div
                                                        className="flex items-center gap-1 text-[10px] truncate shrink-0"
                                                        style={{ color, opacity: 0.65 }}
                                                    >
                                                        <span
                                                            className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                                                            style={{ backgroundColor: draggedSession.subjects[0].color || color }}
                                                        />
                                                        <span className="truncate">
                                                            {draggedSession.subjects.length === 1
                                                                ? draggedSession.subjects[0].name
                                                                : `${draggedSession.subjects.length} disciplinas`}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ── List View ────────────────────────────────────────────────────

function ListSessionRow({
    session,
    onClick,
}: {
    session: CalendarSession;
    onClick: () => void;
}) {
    const start = parseISO(session.starts_at);
    const end = parseISO(session.ends_at);
    const color = getSessionColor(session);

    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-brand-primary/[0.02] transition-colors group"
        >
            <div className="w-1 h-12 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-brand-primary">
                        {format(start, "HH:mm")} — {format(end, "HH:mm")}
                    </span>
                    {session.title && (
                        <span className="text-sm text-brand-primary/70 truncate">{session.title}</span>
                    )}
                </div>
                {session.subjects && session.subjects.length > 0 && (
                    <div className="flex items-center gap-1 text-xs text-brand-primary/60">
                        {session.subjects.length === 1 ? (
                            <>
                                <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: session.subjects[0].color || color }}
                                />
                                <span>{session.subjects[0].name}</span>
                            </>
                        ) : (
                            <span>{session.subjects.length} disciplinas</span>
                        )}
                    </div>
                )}
                {session.students && session.students.length > 0 && (
                    <div className="flex items-center gap-1.5">
                        <div className="flex -space-x-1.5">
                            {session.students.slice(0, 4).map((student) => {
                                const initials = (student.display_name || student.full_name || "?")
                                    .split(" ")
                                    .map((w) => w[0])
                                    .join("")
                                    .slice(0, 2)
                                    .toUpperCase();
                                return (
                                    <div
                                        key={student.id}
                                        className="h-5 w-5 rounded-full bg-white flex items-center justify-center overflow-hidden ring-2 ring-white shadow-sm"
                                    >
                                        {student.avatar_url ? (
                                            <Image
                                                src={student.avatar_url}
                                                alt={student.full_name || ""}
                                                width={20}
                                                height={20}
                                                className="object-cover h-full w-full"
                                            />
                                        ) : (
                                            <span className="text-[8px] font-semibold text-brand-primary/70">
                                                {initials}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <span className="text-xs text-brand-primary/50">
                            {session.students.length > 4 && `+${session.students.length - 4} • `}
                            {getSessionLabel(session)}
                        </span>
                    </div>
                )}
            </div>
        </button>
    );
}

function ListView({
    currentDate,
    sessionsByDate,
    onSessionClick,
}: {
    currentDate: Date;
    sessionsByDate: Record<string, CalendarSession[]>;
    onSessionClick: (s: CalendarSession) => void;
}) {
    const [showPast, setShowPast] = useState(false);
    const todayKey = format(new Date(), "yyyy-MM-dd");

    const allDatesInMonth = Object.keys(sessionsByDate)
        .filter((key) => isSameMonth(parseISO(key), currentDate))
        .sort();

    const pastDates = allDatesInMonth.filter((key) => key < todayKey);
    const upcomingDates = allDatesInMonth.filter((key) => key >= todayKey);
    const visibleDates = showPast ? allDatesInMonth : upcomingDates;

    const totalPastSessions = pastDates.reduce(
        (acc, k) => acc + (sessionsByDate[k]?.length ?? 0),
        0
    );

    if (allDatesInMonth.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-brand-primary/30 text-sm py-16">
                <div className="text-center">
                    <CalendarIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p>Nenhuma sessão neste mês</p>
                </div>
            </div>
        );
    }

    return (
        <div className="overflow-y-auto h-full">
            {/* Past sessions toggle — only shown when there are past sessions and they're hidden */}
            {pastDates.length > 0 && !showPast && (
                <div className="px-4 pt-3 pb-1">
                    <button
                        onClick={() => setShowPast(true)}
                        className="flex items-center gap-1.5 text-xs text-brand-primary/40 hover:text-brand-primary/70 transition-colors font-medium"
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        {totalPastSessions} {totalPastSessions === 1 ? "sessão anterior" : "sessões anteriores"} neste mês
                    </button>
                </div>
            )}
            {pastDates.length > 0 && showPast && (
                <div className="px-4 pt-3 pb-1">
                    <button
                        onClick={() => setShowPast(false)}
                        className="flex items-center gap-1.5 text-xs text-brand-primary/40 hover:text-brand-primary/70 transition-colors font-medium"
                    >
                        <ChevronLeft className="h-3.5 w-3.5 rotate-90" />
                        Ocultar sessões anteriores
                    </button>
                </div>
            )}

            {visibleDates.length === 0 && !showPast && (
                <div className="flex flex-col items-center justify-center py-16 text-center text-brand-primary/30 text-sm">
                    <CalendarIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p>Sem sessões futuras neste mês</p>
                    {pastDates.length > 0 && (
                        <button
                            onClick={() => setShowPast(true)}
                            className="mt-3 text-xs text-brand-accent hover:underline font-medium"
                        >
                            Ver sessões anteriores
                        </button>
                    )}
                </div>
            )}

            <div className="divide-y divide-brand-primary/5">
                {visibleDates.map((dateKey) => {
                    const day = parseISO(dateKey);
                    const daySessions = sessionsByDate[dateKey];
                    const today = isToday(day);
                    const isPast = dateKey < todayKey;

                    return (
                        <div key={dateKey} className={cn("py-3 px-4", isPast && "opacity-60")}>
                            <div className="flex items-center gap-2 mb-2">
                                <div
                                    className={cn(
                                        "text-xs font-semibold uppercase tracking-wider",
                                        today ? "text-brand-accent" : "text-brand-primary/40"
                                    )}
                                >
                                    {format(day, "EEEE, d MMM", { locale: pt })}
                                </div>
                                {today && (
                                    <Badge className="text-[10px] h-4 bg-brand-accent/10 text-brand-accent border-0">
                                        Hoje
                                    </Badge>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                {daySessions.map((session) => (
                                    <ListSessionRow
                                        key={session.id}
                                        session={session}
                                        onClick={() => onSessionClick(session)}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
