"use client";

import React, { useState, useEffect, useMemo } from "react";
import { CalendarDays, Clock, Users } from "lucide-react";
import { fetchTeacherSessions, type MemberSession } from "@/lib/members";
import { cn } from "@/lib/utils";

interface TeacherSessionsTabProps {
    teacherId: string;
}

function getMonthOptions() {
    const now = new Date();
    const months: { label: string; value: string; from: string; to: string }[] = [];
    for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const from = d.toISOString();
        const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
        months.push({
            label: d.toLocaleDateString("pt-PT", { month: "short" }).replace(".", ""),
            value: `${d.getFullYear()}-${d.getMonth()}`,
            from,
            to,
        });
    }
    return months;
}

function formatSessionDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-PT", {
        day: "numeric",
        month: "short",
        weekday: "short",
    });
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("pt-PT", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function TeacherSessionsTab({ teacherId }: TeacherSessionsTabProps) {
    const [sessions, setSessions] = useState<MemberSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>("all"); // "all" or month value

    const monthOptions = useMemo(() => getMonthOptions(), []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        const selected = monthOptions.find((m) => m.value === filter);
        const dateFrom = selected ? selected.from : undefined;
        const dateTo = selected ? selected.to : undefined;

        fetchTeacherSessions(teacherId, dateFrom, dateTo)
            .then((data) => {
                if (!cancelled) setSessions(data);
            })
            .catch(console.error)
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [teacherId, filter, monthOptions]);

    const now = new Date().toISOString();
    const upcoming = sessions.filter((s) => s.starts_at > now);
    const past = sessions.filter((s) => s.starts_at <= now);

    const thisMonthCount = sessions.filter((s) => {
        const d = new Date(s.starts_at);
        const n = new Date();
        return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
    }).length;

    return (
        <div className="space-y-4">
            {/* Month filter pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
                <button
                    onClick={() => setFilter("all")}
                    className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium leading-none select-none transition-colors",
                        filter === "all"
                            ? "bg-brand-primary text-white"
                            : "bg-brand-primary/5 text-brand-primary/50 hover:bg-brand-primary/10",
                    )}
                >
                    Todos
                </button>
                {monthOptions.map((m) => (
                    <button
                        key={m.value}
                        onClick={() => setFilter(m.value)}
                        className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium leading-none select-none capitalize transition-colors",
                            filter === m.value
                                ? "bg-brand-primary text-white"
                                : "bg-brand-primary/5 text-brand-primary/50 hover:bg-brand-primary/10",
                        )}
                    >
                        {m.label}
                    </button>
                ))}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-3 text-center">
                    <CalendarDays className="h-4 w-4 text-brand-primary/30 mx-auto mb-1" />
                    <p className="text-lg font-semibold text-brand-primary leading-tight">
                        {filter === "all" ? thisMonthCount : sessions.length}
                    </p>
                    <p className="text-[9px] text-brand-primary/40 mt-0.5">
                        {filter === "all" ? "Este Mes" : "Filtradas"}
                    </p>
                </div>
                <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-3 text-center">
                    <CalendarDays className="h-4 w-4 text-brand-primary/30 mx-auto mb-1" />
                    <p className="text-lg font-semibold text-brand-primary leading-tight">
                        {sessions.length}
                    </p>
                    <p className="text-[9px] text-brand-primary/40 mt-0.5">Total</p>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="h-5 w-5 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                </div>
            ) : sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                    <CalendarDays className="h-8 w-8 text-brand-primary/20 mb-2" />
                    <p className="text-sm text-brand-primary/40">Sem sessoes encontradas.</p>
                </div>
            ) : (
                <>
                    {/* Upcoming */}
                    {upcoming.length > 0 && (
                        <div>
                            <h4 className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider mb-2">
                                Proximas ({upcoming.length})
                            </h4>
                            <div className="space-y-1">
                                {upcoming.map((s) => (
                                    <SessionItem key={s.id} session={s} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Past */}
                    {past.length > 0 && (
                        <div>
                            <h4 className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider mb-2">
                                Anteriores ({past.length})
                            </h4>
                            <div className="space-y-1">
                                {past.map((s) => (
                                    <SessionItem key={s.id} session={s} />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function SessionItem({ session }: { session: MemberSession }) {
    const studentCount = session.student_ids?.length ?? 0;
    return (
        <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-brand-primary/[0.02] hover:bg-brand-primary/[0.04] transition-colors">
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-brand-primary truncate">
                    {session.title || "Sessao"}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-brand-primary/40">
                        {formatSessionDate(session.starts_at)}
                    </span>
                    <span className="text-[10px] text-brand-primary/25">•</span>
                    <span className="text-[10px] text-brand-primary/40 flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {formatTime(session.starts_at)} – {formatTime(session.ends_at)}
                    </span>
                </div>
            </div>

            {/* Subject pills */}
            {session.subjects && session.subjects.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                    {session.subjects.slice(0, 2).map((subj) => (
                        <span
                            key={subj.id}
                            style={{
                                color: subj.color || "#0d2f7f",
                                backgroundColor: (subj.color || "#0d2f7f") + "18",
                                border: `1px solid ${subj.color || "#0d2f7f"}40`,
                            }}
                            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none select-none"
                        >
                            {subj.name}
                        </span>
                    ))}
                </div>
            )}

            {/* Student count */}
            {studentCount > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-brand-primary/35 shrink-0">
                    <Users className="h-3 w-3" />
                    {studentCount}
                </span>
            )}
        </div>
    );
}
