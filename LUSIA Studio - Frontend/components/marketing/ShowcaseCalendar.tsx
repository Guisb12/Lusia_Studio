"use client";

import { useState, useMemo } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
} from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";

interface ShowcaseSession {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  teacher_name: string;
  student_count: number;
  subject_name: string;
  subject_color: string;
  session_type_name: string;
  session_type_color: string;
}

// Sample realistic data for the showcase
const sampleSessions: ShowcaseSession[] = [
  {
    id: "1",
    title: "Matemática A - Álgebra",
    starts_at: "2025-01-15T09:00:00",
    ends_at: "2025-01-15T10:30:00",
    teacher_name: "Prof. Ana Silva",
    student_count: 3,
    subject_name: "Matemática",
    subject_color: "#0a1bb6",
    session_type_name: "Grupo",
    session_type_color: "#10b981",
  },
  {
    id: "2",
    title: "Português - Gramática",
    starts_at: "2025-01-15T14:00:00",
    ends_at: "2025-01-15T15:30:00",
    teacher_name: "Prof. Miguel Costa",
    student_count: 2,
    subject_name: "Português",
    subject_color: "#dc2626",
    session_type_name: "Particular",
    session_type_color: "#f59e0b",
  },
  {
    id: "3",
    title: "Física - Mecânica",
    starts_at: "2025-01-16T10:00:00",
    ends_at: "2025-01-16T11:30:00",
    teacher_name: "Prof. Rita Ferreira",
    student_count: 4,
    subject_name: "Física",
    subject_color: "#7c3aed",
    session_type_name: "Grupo",
    session_type_color: "#10b981",
  },
  {
    id: "4",
    title: "Inglês - Conversation",
    starts_at: "2025-01-17T16:00:00",
    ends_at: "2025-01-17T17:00:00",
    teacher_name: "Prof. David Jones",
    student_count: 1,
    subject_name: "Inglês",
    subject_color: "#ea580c",
    session_type_name: "Particular",
    session_type_color: "#f59e0b",
  },
  {
    id: "5",
    title: "História - Idade Média",
    starts_at: "2025-01-20T11:00:00",
    ends_at: "2025-01-20T12:00:00",
    teacher_name: "Prof. Ana Silva",
    student_count: 5,
    subject_name: "História",
    subject_color: "#9333ea",
    session_type_name: "Grupo",
    session_type_color: "#10b981",
  },
  {
    id: "6",
    title: "Química - Ligações",
    starts_at: "2025-01-21T09:30:00",
    ends_at: "2025-01-21T11:00:00",
    teacher_name: "Prof. Ricardo Mendes",
    student_count: 2,
    subject_name: "Química",
    subject_color: "#059669",
    session_type_name: "Particular",
    session_type_color: "#f59e0b",
  },
  {
    id: "7",
    title: "Matemática A - Funções",
    starts_at: "2025-01-22T14:30:00",
    ends_at: "2025-01-22T16:00:00",
    teacher_name: "Prof. Ana Silva",
    student_count: 3,
    subject_name: "Matemática",
    subject_color: "#0a1bb6",
    session_type_name: "Grupo",
    session_type_color: "#10b981",
  },
];

export function ShowcaseCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date(2025, 0, 15)); // Jan 2025
  const [selectedSession, setSelectedSession] = useState<ShowcaseSession | null>(null);

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, ShowcaseSession[]>();
    sampleSessions.forEach((session) => {
      const dayKey = format(new Date(session.starts_at), "yyyy-MM-dd");
      if (!map.has(dayKey)) map.set(dayKey, []);
      map.get(dayKey)!.push(session);
    });
    return map;
  }, []);

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-brand-primary/10 px-6 py-4">
        <div className="flex items-center gap-4">
          <h3 className="font-instrument text-lg font-medium text-brand-primary">
            {format(currentDate, "MMMM yyyy", { locale: pt })}
          </h3>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={prevMonth}
              className="h-8 w-8 text-brand-primary/60 hover:bg-brand-primary/5 hover:text-brand-primary"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={nextMonth}
              className="h-8 w-8 text-brand-primary/60 hover:bg-brand-primary/5 hover:text-brand-primary"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="text-xs text-brand-primary/50">Visualização de demonstração</div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-brand-primary/10">
          {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => (
            <div
              key={day}
              className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-brand-primary/50"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid h-full grid-cols-7 auto-rows-fr">
          {days.map((day) => {
            const dayKey = format(day, "yyyy-MM-dd");
            const daySessions = sessionsByDay.get(dayKey) || [];
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isTodayDate = isToday(day);

            return (
              <div
                key={day.toString()}
                className={cn(
                  "relative border-b border-r border-brand-primary/5 p-2 transition-colors",
                  !isCurrentMonth && "bg-brand-bg/50",
                  daySessions.length > 0 && "hover:bg-brand-accent/5 cursor-pointer"
                )}
                onClick={() => daySessions.length > 0 && setSelectedSession(daySessions[0])}
              >
                {/* Day number */}
                <div
                  className={cn(
                    "mb-1 flex h-6 w-6 items-center justify-center text-sm font-medium",
                    isTodayDate
                      ? "rounded-full bg-brand-accent text-white"
                      : isCurrentMonth
                        ? "text-brand-primary"
                        : "text-brand-primary/30"
                  )}
                >
                  {format(day, "d")}
                </div>

                {/* Sessions */}
                <div className="space-y-1">
                  {daySessions.slice(0, 3).map((session) => (
                    <div
                      key={session.id}
                      className="rounded-md p-1.5 text-xs transition-all hover:shadow-sm"
                      style={{ backgroundColor: `${session.subject_color}15` }}
                    >
                      <div className="flex items-center gap-1">
                        <div
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: session.session_type_color }}
                        />
                        <span
                          className="truncate font-medium"
                          style={{ color: session.subject_color }}
                        >
                          {format(new Date(session.starts_at), "HH:mm")}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-brand-primary/70">
                        {session.subject_name}
                      </div>
                    </div>
                  ))}
                  {daySessions.length > 3 && (
                    <div className="text-center text-xs text-brand-primary/40">
                      +{daySessions.length - 3} mais
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Session Preview Panel */}
      {selectedSession && (
        <div className="border-t border-brand-primary/10 bg-brand-bg/50 px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: `${selectedSession.session_type_color}20`,
                    color: selectedSession.session_type_color,
                  }}
                >
                  <div
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: selectedSession.session_type_color }}
                  />
                  {selectedSession.session_type_name}
                </span>
                <span className="text-xs text-brand-primary/50">
                  {format(new Date(selectedSession.starts_at), "dd/MM/yyyy HH:mm")} -
                  {format(new Date(selectedSession.ends_at), "HH:mm")}
                </span>
              </div>
              <h4 className="mt-1 font-instrument text-lg font-medium text-brand-primary">
                {selectedSession.title}
              </h4>
              <div className="mt-1 flex items-center gap-3 text-sm text-brand-primary/60">
                <span>{selectedSession.teacher_name}</span>
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {selectedSession.student_count} alunos
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedSession(null)}
              className="h-8 text-brand-primary/50 hover:text-brand-primary"
            >
              Fechar
            </Button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 border-t border-brand-primary/10 px-6 py-3 text-xs text-brand-primary/50">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-[#10b981]" />
          <span>Grupo</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-[#f59e0b]" />
          <span>Particular</span>
        </div>
      </div>
    </div>
  );
}
