"use client";

import React, { useMemo, useRef, useState, useCallback } from "react";
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  parseISO,
  differenceInMinutes,
  isToday,
  addWeeks,
  startOfMonth,
  endOfMonth,
  isSameMonth,
  addMonths,
} from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { CalendarSession } from "@/components/calendar/EventCalendar";

// ── Types ─────────────────────────────────────────────────────

type ViewMode = "month" | "week";

interface SimpleFiveDayCalendarProps {
  sessions: CalendarSession[];
  currentDate: Date;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onDateChange: (date: Date) => void;
}

// ── Constants ───────────────────────────────────────────────────

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am to 8pm
const HOUR_HEIGHT = 52; // Slightly smaller for compactness
const SESSION_BLOCK_BG_ALPHA_HEX = "18";

// ── Helpers ─────────────────────────────────────────────────────

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

type SessionLayoutItem = {
  session: CalendarSession;
  topPx: number;
  heightPx: number;
  col: number;
  cols: number;
};

function layoutSessionsForDay(daySessions: CalendarSession[], minHeightPx: number): SessionLayoutItem[] {
  const items = daySessions
    .map((session) => {
      const start = parseISO(session.starts_at);
      const end = parseISO(session.ends_at);
      const startMin = minutesOfDay(start);
      const endMin = Math.max(minutesOfDay(end), startMin + 1);
      const topPx = ((startMin - 7 * 60) / 60) * HOUR_HEIGHT; // Offset by 7am
      const heightPx = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, minHeightPx);
      return { session, startMin, endMin, topPx, heightPx, col: 0, cols: 1 };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

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

function getSessionColor(session: CalendarSession): string {
  if (session.subjects && session.subjects.length > 0 && session.subjects[0].color) {
    return session.subjects[0].color;
  }
  return "#0a1bb6";
}

function getSessionLabel(session: CalendarSession): string {
  if (session.title) return session.title;
  if (session.students && session.students.length > 0) {
    const names = session.students
      .slice(0, 2)
      .map((s) => s.display_name || s.full_name || "Aluno");
    const totalStudents = session.student_ids.length;
    if (totalStudents > 2) {
      return `${names.join(", ")} +${totalStudents - 2}`;
    }
    return names.join(", ");
  }
  return "Sessão";
}

// ── Component ───────────────────────────────────────────────────

export function SimpleFiveDayCalendar({
  sessions,
  currentDate,
  viewMode,
  onViewModeChange,
  onDateChange,
}: SimpleFiveDayCalendarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentTime] = useState(new Date());

  // Scroll to 8am on mount
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 1 * HOUR_HEIGHT; // 8am = 1 hour after 7am start
    }
  }, []);

  // Get only Monday-Friday (5 days)
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({
      start: weekStart,
      end: new Date(weekStart.getTime() + 4 * 24 * 60 * 60 * 1000),
    });
  }, [currentDate]);

  // Group sessions by date
  const sessionsByDate = useMemo(() => {
    const map: Record<string, CalendarSession[]> = {};
    sessions.forEach((s) => {
      const key = format(parseISO(s.starts_at), "yyyy-MM-dd");
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    );
    return map;
  }, [sessions]);

  // Calculate layouts
  const layoutsByDay = useMemo(() => {
    const layouts: Record<string, SessionLayoutItem[]> = {};
    weekDays.forEach((day) => {
      const key = format(day, "yyyy-MM-dd");
      const daySessions = sessionsByDate[key] || [];
      layouts[key] = layoutSessionsForDay(daySessions, 20);
    });
    return layouts;
  }, [sessionsByDate, weekDays]);

  // Navigation handlers
  const navigate = useCallback((direction: "prev" | "next") => {
    const delta = direction === "next" ? 1 : -1;
    if (viewMode === "week") {
      onDateChange(addWeeks(currentDate, delta));
    } else {
      onDateChange(addMonths(currentDate, delta));
    }
  }, [currentDate, viewMode, onDateChange]);

  // Header title
  const headerTitle = useMemo(() => {
    if (viewMode === "week") {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = new Date(weekStart.getTime() + 4 * 24 * 60 * 60 * 1000);
      return `${format(weekStart, "d")} — ${format(weekEnd, "d MMM", { locale: pt })}`;
    }
    return format(currentDate, "MMMM yyyy", { locale: pt });
  }, [currentDate, viewMode]);

  // Month view days
  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentDate]);

  return (
    <div className="flex flex-col h-full font-satoshi bg-white">
      {/* Minimal header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <span className="text-xs font-medium text-gray-600 capitalize">
          {headerTitle}
        </span>
        
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center bg-gray-100 rounded-md p-0.5">
            <button
              onClick={() => onViewModeChange("week")}
              className={cn(
                "px-2 py-1 text-[11px] font-medium rounded transition-all",
                viewMode === "week"
                  ? "bg-white text-gray-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              Semana
            </button>
            <button
              onClick={() => onViewModeChange("month")}
              className={cn(
                "px-2 py-1 text-[11px] font-medium rounded transition-all",
                viewMode === "month"
                  ? "bg-white text-gray-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              Mês
            </button>
          </div>

          {/* Navigation */}
          <div className="flex items-center">
            <button
              onClick={() => navigate("prev")}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => navigate("next")}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Calendar content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {viewMode === "week" ? (
          <WeekView
            weekDays={weekDays}
            sessionsByDate={sessionsByDate}
            layoutsByDay={layoutsByDay}
            scrollRef={scrollRef}
            currentTime={currentTime}
          />
        ) : (
          <MonthView
            currentDate={currentDate}
            monthDays={monthDays}
            sessionsByDate={sessionsByDate}
            onDayClick={(date) => {
              onDateChange(date);
              onViewModeChange("week");
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── Week View (5 days only) ────────────────────────────────────

interface WeekViewProps {
  weekDays: Date[];
  sessionsByDate: Record<string, CalendarSession[]>;
  layoutsByDay: Record<string, SessionLayoutItem[]>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  currentTime: Date;
}

function WeekView({ weekDays, sessionsByDate, layoutsByDay, scrollRef, currentTime }: WeekViewProps) {
  const weekDayNames = ["Seg", "Ter", "Qua", "Qui", "Sex"];

  return (
    <div className="flex h-full flex-col">
      {/* Day headers */}
      <div className="flex border-b border-gray-100">
        <div className="w-11 shrink-0" /> {/* Time gutter */}
        {weekDays.map((day, index) => (
          <div
            key={day.toISOString()}
            className={cn(
              "flex-1 text-center py-2 border-l border-gray-100 first:border-l-0",
              isToday(day) && "bg-blue-50/30"
            )}
          >
            <div className="text-[10px] font-medium text-gray-400 uppercase">
              {weekDayNames[index]}
            </div>
            <div
              className={cn(
                "text-sm font-semibold mt-0.5",
                isToday(day) ? "text-blue-600" : "text-gray-700"
              )}
            >
              {format(day, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none]"
      >
        <div className="flex relative" style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}>
          {/* Time gutter */}
          <div className="w-11 shrink-0 bg-white sticky left-0 z-10">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute left-0 w-11 text-right pr-2 text-[10px] text-gray-300 font-medium"
                style={{ top: `${(h - 7) * HOUR_HEIGHT}px`, lineHeight: "1" }}
              >
                {`${String(h).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayLayout = layoutsByDay[key] || [];

            return (
              <div
                key={key}
                className={cn(
                  "flex-1 relative border-l border-gray-100 first:border-l-0",
                  isToday(day) && "bg-blue-50/20"
                )}
              >
                {/* Hour lines */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-gray-50"
                    style={{
                      top: `${(h - 7) * HOUR_HEIGHT}px`,
                      height: `${HOUR_HEIGHT}px`,
                    }}
                  />
                ))}

                {/* Current time indicator */}
                {isToday(day) && (() => {
                  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
                  if (currentMinutes < 7 * 60 || currentMinutes > 20 * 60) return null;
                  const topPosition = ((currentMinutes - 7 * 60) / 60) * HOUR_HEIGHT;
                  
                  return (
                    <>
                      <div
                        className="absolute w-full z-30 pointer-events-none"
                        style={{
                          top: `${topPosition}px`,
                          height: '1.5px',
                          backgroundColor: '#ef4444',
                        }}
                      />
                      <div
                        className="absolute z-30 pointer-events-none rounded-full"
                        style={{
                          top: `${topPosition - 2.5}px`,
                          left: '-3px',
                          width: '5px',
                          height: '5px',
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
                  const gap = 2;

                  return (
                    <div
                      key={session.id}
                      className="absolute rounded-md text-left overflow-hidden transition-all duration-200 hover:shadow-md hover:scale-[1.02] hover:z-10 cursor-pointer"
                      style={{
                        top: `${topPx}px`,
                        height: `${Math.max(heightPx - gap, 22)}px`,
                        left: `calc(${leftPct}% + ${gap/2}px)`,
                        width: `calc(${widthPct}% - ${gap}px)`,
                        backgroundColor: `${color}${SESSION_BLOCK_BG_ALPHA_HEX}`,
                        borderLeft: `2px solid ${color}`,
                        opacity: isPast ? 0.55 : 1,
                      }}
                    >
                      <div className="px-1.5 py-1 flex flex-col h-full overflow-hidden">
                        {/* Time */}
                        <div
                          className="text-[9px] font-medium leading-none"
                          style={{ color, opacity: 0.85 }}
                        >
                          {format(start, "HH:mm")}
                        </div>

                        {/* Session name */}
                        {heightPx > 28 && (
                          <div
                            className="text-[10px] font-semibold leading-tight truncate mt-0.5"
                            style={{ color }}
                          >
                            {getSessionLabel(session)}
                          </div>
                        )}

                        {/* Subject - only if tall enough */}
                        {heightPx > 42 && session.subjects && session.subjects.length > 0 && (
                          <div
                            className="flex items-center gap-1 text-[8px] truncate mt-auto"
                            style={{ color, opacity: 0.7 }}
                          >
                            <span
                              className="w-1 h-1 rounded-full flex-shrink-0"
                              style={{ backgroundColor: session.subjects[0].color || color }}
                            />
                            <span className="truncate">{session.subjects[0].name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Month View (5-day columns only) ─────────────────────────────

interface MonthViewProps {
  currentDate: Date;
  monthDays: Date[];
  sessionsByDate: Record<string, CalendarSession[]>;
  onDayClick: (date: Date) => void;
}

function MonthView({ currentDate, monthDays, sessionsByDate, onDayClick }: MonthViewProps) {
  const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex"];

  return (
    <div className="flex flex-col h-full">
      {/* Day names header */}
      <div className="grid grid-cols-5 border-b border-gray-100">
        {weekDays.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-[10px] font-medium text-gray-400 uppercase"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-5 flex-1">
        {monthDays.map((day) => {
          const dayOfWeek = day.getDay();
          // Skip Saturday (6) and Sunday (0)
          if (dayOfWeek === 0 || dayOfWeek === 6) return null;

          const key = format(day, "yyyy-MM-dd");
          const daySessions = sessionsByDate[key] || [];
          const isCurrentMonth = isSameMonth(day, currentDate);
          const today = isToday(day);

          return (
            <div
              key={key}
              className={cn(
                "border-r border-b border-gray-100 p-1.5 min-h-[56px] cursor-pointer hover:bg-gray-50",
                !isCurrentMonth && "bg-gray-50/50"
              )}
              onClick={() => onDayClick(day)}
            >
              <div className="flex items-center justify-center mb-1">
                <span
                  className={cn(
                    "text-xs font-medium h-5 w-5 flex items-center justify-center rounded-full",
                    today && "bg-blue-500 text-white",
                    !today && isCurrentMonth && "text-gray-600",
                    !isCurrentMonth && "text-gray-300"
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>

              {/* Session pills */}
              <div className="space-y-0.5">
                {daySessions.slice(0, 2).map((session) => {
                  const color = getSessionColor(session);
                  return (
                    <div
                      key={session.id}
                      className="w-full text-left rounded px-1 py-[2px] text-[8px] flex items-center gap-1 overflow-hidden"
                      style={{
                        backgroundColor: `${color}15`,
                        borderLeft: `1.5px solid ${color}`,
                      }}
                    >
                      <span className="font-semibold shrink-0" style={{ color }}>
                        {format(parseISO(session.starts_at), "HH:mm")}
                      </span>
                      <span className="truncate" style={{ color, opacity: 0.75 }}>
                        {getSessionLabel(session)}
                      </span>
                    </div>
                  );
                })}
                {daySessions.length > 2 && (
                  <span className="text-[8px] text-gray-400 px-1">
                    +{daySessions.length - 2}
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
