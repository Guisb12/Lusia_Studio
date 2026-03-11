"use client";

import React, { useMemo, useState } from "react";
import { CalendarDays, Clock, Users } from "lucide-react";
import type { MemberSession } from "@/lib/members";
import { cn } from "@/lib/utils";
import { useTeacherSessionsQuery } from "@/lib/queries/teachers";

interface TeacherSessionsTabProps {
    teacherId: string;
}

function getMonthOptions() {
    const now = new Date();
    const months: { label: string; value: string; from: string; to: string }[] = [];
    for (let i = 0; i < 6; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const from = date.toISOString();
        const to = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59).toISOString();
        months.push({
            label: date.toLocaleDateString("pt-PT", { month: "short" }).replace(".", ""),
            value: `${date.getFullYear()}-${date.getMonth()}`,
            from,
            to,
        });
    }
    return months;
}

function formatSessionDate(iso: string): string {
    return new Date(iso).toLocaleDateString("pt-PT", {
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
    const [filter, setFilter] = useState<string>("all");
    const monthOptions = useMemo(() => getMonthOptions(), []);
    const selected = monthOptions.find((month) => month.value === filter);
    const {
        data: sessions = [],
        isLoading,
        isFetching,
    } = useTeacherSessionsQuery(teacherId, {
        dateFrom: selected?.from,
        dateTo: selected?.to,
    });

    const now = new Date().toISOString();
    const upcoming = sessions.filter((session) => session.starts_at > now);
    const past = sessions.filter((session) => session.starts_at <= now);
    const thisMonthCount = sessions.filter((session) => {
        const sessionDate = new Date(session.starts_at);
        const currentDate = new Date();
        return sessionDate.getMonth() === currentDate.getMonth() && sessionDate.getFullYear() === currentDate.getFullYear();
    }).length;

    return (
        <div className="space-y-4">
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
                {monthOptions.map((month) => (
                    <button
                        key={month.value}
                        onClick={() => setFilter(month.value)}
                        className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium leading-none select-none capitalize transition-colors",
                            filter === month.value
                                ? "bg-brand-primary text-white"
                                : "bg-brand-primary/5 text-brand-primary/50 hover:bg-brand-primary/10",
                        )}
                    >
                        {month.label}
                    </button>
                ))}
            </div>

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
                    <p className="text-lg font-semibold text-brand-primary leading-tight">{sessions.length}</p>
                    <p className="text-[9px] text-brand-primary/40 mt-0.5">Total</p>
                </div>
            </div>

            {isLoading ? (
                <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="rounded-lg bg-brand-primary/[0.03] border border-brand-primary/5 p-3 animate-pulse">
                            <div className="h-3 w-32 rounded bg-brand-primary/8 mb-2" />
                            <div className="h-2 w-40 rounded bg-brand-primary/6" />
                        </div>
                    ))}
                </div>
            ) : sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                    <CalendarDays className="h-8 w-8 text-brand-primary/20 mb-2" />
                    <p className="text-sm text-brand-primary/40">Sem sessoes encontradas.</p>
                </div>
            ) : (
                <div className={cn("space-y-4", isFetching && "opacity-75 transition-opacity")}>
                    {upcoming.length > 0 && (
                        <div>
                            <h4 className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider mb-2">
                                Proximas ({upcoming.length})
                            </h4>
                            <div className="space-y-1">
                                {upcoming.map((session) => (
                                    <SessionItem key={session.id} session={session} />
                                ))}
                            </div>
                        </div>
                    )}

                    {past.length > 0 && (
                        <div>
                            <h4 className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider mb-2">
                                Anteriores ({past.length})
                            </h4>
                            <div className="space-y-1">
                                {past.map((session) => (
                                    <SessionItem key={session.id} session={session} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
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

            {session.subjects && session.subjects.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                    {session.subjects.slice(0, 2).map((subject) => (
                        <span
                            key={subject.id}
                            style={{
                                color: subject.color || "#0d2f7f",
                                backgroundColor: (subject.color || "#0d2f7f") + "18",
                                border: `1px solid ${(subject.color || "#0d2f7f")}40`,
                            }}
                            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none select-none"
                        >
                            {subject.name}
                        </span>
                    ))}
                </div>
            )}

            {studentCount > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-brand-primary/35 shrink-0">
                    <Users className="h-3 w-3" />
                    {studentCount}
                </span>
            )}
        </div>
    );
}
