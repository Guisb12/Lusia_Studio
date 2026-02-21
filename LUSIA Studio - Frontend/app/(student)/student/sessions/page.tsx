"use client";

import React, { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { format, parseISO, isToday, isFuture, isPast } from "date-fns";
import { pt } from "date-fns/locale";
import { CalendarDays, Clock, Users, BookOpen, StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StudentSession {
    id: string;
    starts_at: string;
    ends_at: string;
    title?: string | null;
    teacher_name?: string | null;
    teacher_notes?: string | null;
    subjects?: Array<{ id: string; name: string; color?: string }>;
    students?: Array<{ id: string; full_name?: string; display_name?: string }>;
}

export default function StudentSessionsPage() {
    const [sessions, setSessions] = useState<StudentSession[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const now = new Date();
                const futureEnd = new Date(now);
                futureEnd.setMonth(futureEnd.getMonth() + 3);

                const params = new URLSearchParams({
                    start_date: now.toISOString(),
                    end_date: futureEnd.toISOString(),
                });
                const res = await fetch(`/api/calendar/sessions?${params.toString()}`);
                if (res.ok) {
                    const data = await res.json();
                    setSessions(data);
                }
            } catch (e) {
                console.error("Failed to fetch sessions:", e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // Group sessions by date
    const groupedSessions = sessions.reduce<Record<string, StudentSession[]>>((acc, s) => {
        const key = format(parseISO(s.starts_at), "yyyy-MM-dd");
        if (!acc[key]) acc[key] = [];
        acc[key].push(s);
        return acc;
    }, {});

    const sortedDates = Object.keys(groupedSessions).sort();

    return (
        <div className="max-w-3xl mx-auto w-full">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="space-y-6"
            >
                <header className="mb-6">
                    <h1 className="text-3xl font-serif text-brand-primary">
                        As Minhas Sessões
                    </h1>
                    <p className="text-brand-primary/70 mt-1">
                        Consulta as tuas próximas sessões agendadas.
                    </p>
                </header>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="animate-spin h-6 w-6 border-2 border-brand-accent border-t-transparent rounded-full" />
                    </div>
                ) : sortedDates.length === 0 ? (
                    <div className="text-center py-16 text-brand-primary/30">
                        <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-40" />
                        <p className="text-lg font-medium">Nenhuma sessão agendada</p>
                        <p className="text-sm mt-1">As tuas sessões futuras aparecerão aqui.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {sortedDates.map((dateKey) => {
                            const day = parseISO(dateKey);
                            const daySessions = groupedSessions[dateKey];
                            const today = isToday(day);

                            return (
                                <div key={dateKey}>
                                    {/* Date header */}
                                    <div className="flex items-center gap-2 mb-3">
                                        <h2
                                            className={cn(
                                                "text-sm font-semibold uppercase tracking-wider",
                                                today ? "text-brand-accent" : "text-brand-primary/40"
                                            )}
                                        >
                                            {format(day, "EEEE, d 'de' MMMM", { locale: pt })}
                                        </h2>
                                        {today && (
                                            <Badge className="text-[10px] h-4 bg-brand-accent/10 text-brand-accent border-0">
                                                Hoje
                                            </Badge>
                                        )}
                                    </div>

                                    {/* Session cards */}
                                    <div className="space-y-2">
                                        {daySessions.map((session) => {
                                            const start = parseISO(session.starts_at);
                                            const end = parseISO(session.ends_at);
                                            const color =
                                                session.subjects?.[0]?.color || "#0a1bb6";

                                            return (
                                                <div
                                                    key={session.id}
                                                    className="rounded-xl border border-brand-primary/10 bg-white p-4 hover:shadow-sm transition-shadow"
                                                    style={{
                                                        borderLeftWidth: "4px",
                                                        borderLeftColor: color,
                                                    }}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            {/* Time */}
                                                            <div className="flex items-center gap-1.5 text-brand-primary">
                                                                <Clock className="h-4 w-4 shrink-0 opacity-40" />
                                                                <span className="text-sm font-semibold">
                                                                    {format(start, "HH:mm")} — {format(end, "HH:mm")}
                                                                </span>
                                                            </div>

                                                            {/* Title */}
                                                            {session.title && (
                                                                <p className="text-sm font-medium text-brand-primary mt-1">
                                                                    {session.title}
                                                                </p>
                                                            )}

                                                            {/* Teacher */}
                                                            {session.teacher_name && (
                                                                <div className="flex items-center gap-1.5 mt-1.5 text-xs text-brand-primary/50">
                                                                    <Users className="h-3 w-3" />
                                                                    <span>
                                                                        Prof. {session.teacher_name}
                                                                    </span>
                                                                </div>
                                                            )}

                                                            {/* Notes */}
                                                            {session.teacher_notes && (
                                                                <div className="flex items-start gap-1.5 mt-2 text-xs text-brand-primary/60 bg-brand-primary/[0.03] rounded-lg p-2">
                                                                    <StickyNote className="h-3 w-3 mt-0.5 shrink-0" />
                                                                    <span>{session.teacher_notes}</span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Subject badges */}
                                                        {session.subjects && session.subjects.length > 0 && (
                                                            <div className="flex flex-col gap-1">
                                                                {session.subjects.map((subj) => (
                                                                    <Badge
                                                                        key={subj.id}
                                                                        variant="outline"
                                                                        className="text-[10px] h-5 gap-1 whitespace-nowrap border-0"
                                                                        style={{
                                                                            backgroundColor: subj.color
                                                                                ? `${subj.color}15`
                                                                                : undefined,
                                                                            color: subj.color || undefined,
                                                                        }}
                                                                    >
                                                                        {subj.name}
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </motion.div>
        </div>
    );
}
