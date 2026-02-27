"use client";

import React, { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { format, parseISO, isToday, startOfDay } from "date-fns";
import { pt } from "date-fns/locale";
import { CalendarDays, Clock, Users, StickyNote, History, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { cachedFetch, cacheInvalidate } from "@/lib/cache";

const CACHE_PREFIX = "student:sessions";

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

type SessionTab = "upcoming" | "past";

// ── Session card ──────────────────────────────────────────────

function SessionCard({ session }: { session: StudentSession }) {
    const start = parseISO(session.starts_at);
    const end = parseISO(session.ends_at);
    const color = session.subjects?.[0]?.color || "#0a1bb6";

    return (
        <div
            className="rounded-xl border border-brand-primary/10 bg-white p-4 hover:shadow-sm transition-shadow"
            style={{ borderLeftWidth: "4px", borderLeftColor: color }}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-brand-primary">
                        <Clock className="h-4 w-4 shrink-0 opacity-40" />
                        <span className="text-sm font-semibold">
                            {format(start, "HH:mm")} — {format(end, "HH:mm")}
                        </span>
                    </div>
                    {session.title && (
                        <p className="text-sm font-medium text-brand-primary mt-1">{session.title}</p>
                    )}
                    {session.teacher_name && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-brand-primary/50">
                            <Users className="h-3 w-3" />
                            <span>Prof. {session.teacher_name}</span>
                        </div>
                    )}
                    {session.teacher_notes && (
                        <div className="flex items-start gap-1.5 mt-2 text-xs text-brand-primary/60 bg-brand-primary/[0.03] rounded-lg p-2">
                            <StickyNote className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>{session.teacher_notes}</span>
                        </div>
                    )}
                </div>
                {session.subjects && session.subjects.length > 0 && (
                    <div className="flex flex-col gap-1">
                        {session.subjects.map((subj) => (
                            <Badge
                                key={subj.id}
                                variant="outline"
                                className="text-[10px] h-5 gap-1 whitespace-nowrap border-0"
                                style={{
                                    backgroundColor: subj.color ? `${subj.color}15` : undefined,
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
}

// ── Collapsible month group (for past tab) ────────────────────

function MonthGroup({
    monthLabel,
    sessions,
    defaultOpen = false,
}: {
    monthLabel: string;
    sessions: StudentSession[];
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);

    // Group sessions by date inside the month
    const grouped = sessions.reduce<Record<string, StudentSession[]>>((acc, s) => {
        const key = format(parseISO(s.starts_at), "yyyy-MM-dd");
        if (!acc[key]) acc[key] = [];
        acc[key].push(s);
        return acc;
    }, {});
    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    return (
        <div className="border border-brand-primary/8 rounded-2xl overflow-hidden bg-white">
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-brand-primary/[0.02] transition-colors"
            >
                <div className="flex items-center gap-3">
                    {open ? (
                        <ChevronDown className="h-4 w-4 text-brand-primary/30" />
                    ) : (
                        <ChevronRight className="h-4 w-4 text-brand-primary/30" />
                    )}
                    <span className="text-sm font-semibold text-brand-primary capitalize">
                        {monthLabel}
                    </span>
                </div>
                <span className="text-xs text-brand-primary/40 font-medium">
                    {sessions.length} {sessions.length === 1 ? "sessão" : "sessões"}
                </span>
            </button>

            {open && (
                <div className="px-4 pb-4 space-y-4 border-t border-brand-primary/5">
                    {sortedDates.map((dateKey) => {
                        const day = parseISO(dateKey);
                        const daySessions = grouped[dateKey];
                        const today = isToday(day);
                        return (
                            <div key={dateKey} className="pt-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <h3
                                        className={cn(
                                            "text-xs font-semibold uppercase tracking-wider",
                                            today ? "text-brand-accent" : "text-brand-primary/40"
                                        )}
                                    >
                                        {format(day, "EEEE, d 'de' MMMM", { locale: pt })}
                                    </h3>
                                    {today && (
                                        <Badge className="text-[10px] h-4 bg-brand-accent/10 text-brand-accent border-0">
                                            Hoje
                                        </Badge>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    {daySessions.map((s) => (
                                        <SessionCard key={s.id} session={s} />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────

export default function StudentSessionsPage() {
    const [sessions, setSessions] = useState<StudentSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [activeTab, setActiveTab] = useState<SessionTab>("upcoming");

    const fetchSessions = useCallback(async (tab: SessionTab) => {
        setLoading(true);
        setError(false);
        try {
            const now = new Date();
            let startDate: string;
            let endDate: string;

            if (tab === "upcoming") {
                const todayStart = startOfDay(now);
                const futureEnd = new Date(now);
                futureEnd.setMonth(now.getMonth() + 3);
                startDate = todayStart.toISOString();
                endDate = futureEnd.toISOString();
            } else {
                const pastStart = new Date(now);
                pastStart.setMonth(now.getMonth() - 6);
                startDate = pastStart.toISOString();
                endDate = startOfDay(now).toISOString();
            }

            const cacheKey = `${CACHE_PREFIX}:${tab}:${startOfDay(now).toDateString()}`;
            const data = await cachedFetch<StudentSession[]>(
                cacheKey,
                async () => {
                    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
                    const res = await fetch(`/api/calendar/sessions?${params.toString()}`);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                },
                120_000,
            );
            setSessions(data);
        } catch (e) {
            console.error("Failed to fetch sessions:", e);
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSessions(activeTab);
    }, [activeTab, fetchSessions]);

    const handleRetry = () => {
        cacheInvalidate(CACHE_PREFIX);
        fetchSessions(activeTab);
    };

    // ── Upcoming: group by date ───────────────────────────────
    const groupedByDate = sessions.reduce<Record<string, StudentSession[]>>((acc, s) => {
        const key = format(parseISO(s.starts_at), "yyyy-MM-dd");
        if (!acc[key]) acc[key] = [];
        acc[key].push(s);
        return acc;
    }, {});
    const sortedUpcomingDates = Object.keys(groupedByDate).sort();

    // ── Past: group by month ──────────────────────────────────
    const groupedByMonth = sessions.reduce<Record<string, StudentSession[]>>((acc, s) => {
        const key = format(parseISO(s.starts_at), "yyyy-MM");
        if (!acc[key]) acc[key] = [];
        acc[key].push(s);
        return acc;
    }, {});
    // Sort months descending (most recent first)
    const sortedMonths = Object.keys(groupedByMonth).sort((a, b) => b.localeCompare(a));

    const subtitleText =
        activeTab === "upcoming"
            ? "Consulta as tuas próximas sessões agendadas."
            : "Revê as tuas sessões anteriores.";

    return (
        <div className="max-w-4xl w-full">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="space-y-6"
            >
                <header className="mb-2">
                    <h1 className="text-3xl font-normal font-instrument text-brand-primary">
                        As Minhas Sessões
                    </h1>
                    <p className="text-brand-primary/70 mt-1">{subtitleText}</p>
                </header>

                {/* Tab Toggle */}
                <div className="flex gap-1 bg-brand-primary/[0.04] rounded-lg p-1 w-fit">
                    <button
                        onClick={() => activeTab !== "upcoming" && setActiveTab("upcoming")}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                            activeTab === "upcoming"
                                ? "bg-white text-brand-primary shadow-sm"
                                : "text-brand-primary/50 hover:text-brand-primary/70"
                        )}
                    >
                        <CalendarDays className="h-3.5 w-3.5" />
                        Próximas
                    </button>
                    <button
                        onClick={() => activeTab !== "past" && setActiveTab("past")}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                            activeTab === "past"
                                ? "bg-white text-brand-primary shadow-sm"
                                : "text-brand-primary/50 hover:text-brand-primary/70"
                        )}
                    >
                        <History className="h-3.5 w-3.5" />
                        Anteriores
                    </button>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="animate-spin h-6 w-6 border-2 border-brand-accent border-t-transparent rounded-full" />
                    </div>
                ) : error ? (
                    <div className="text-center py-16 text-brand-primary/40">
                        <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-40" />
                        <p className="text-lg font-medium text-brand-primary/60">
                            Não foi possível carregar as sessões
                        </p>
                        <p className="text-sm mt-1">Verifica a tua ligação e tenta novamente.</p>
                        <button
                            onClick={handleRetry}
                            className="mt-4 text-xs font-medium text-brand-accent underline underline-offset-2"
                        >
                            Tentar novamente
                        </button>
                    </div>
                ) : activeTab === "upcoming" ? (
                    sortedUpcomingDates.length === 0 ? (
                        <div className="text-center py-16 text-brand-primary/30">
                            <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-40" />
                            <p className="text-lg font-medium">Nenhuma sessão agendada</p>
                            <p className="text-sm mt-1">As tuas sessões futuras aparecerão aqui.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {sortedUpcomingDates.map((dateKey) => {
                                const day = parseISO(dateKey);
                                const daySessions = groupedByDate[dateKey];
                                const today = isToday(day);
                                return (
                                    <div key={dateKey}>
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
                                        <div className="space-y-2">
                                            {daySessions.map((s) => (
                                                <SessionCard key={s.id} session={s} />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : (
                    /* Past tab — stacked month groups */
                    sortedMonths.length === 0 ? (
                        <div className="text-center py-16 text-brand-primary/30">
                            <History className="h-12 w-12 mx-auto mb-3 opacity-40" />
                            <p className="text-lg font-medium">Sem sessões anteriores</p>
                            <p className="text-sm mt-1">As tuas sessões passadas aparecerão aqui.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {sortedMonths.map((monthKey, idx) => {
                                const monthLabel = format(parseISO(`${monthKey}-01`), "MMMM yyyy", { locale: pt });
                                return (
                                    <MonthGroup
                                        key={monthKey}
                                        monthLabel={monthLabel}
                                        sessions={groupedByMonth[monthKey]}
                                        defaultOpen={idx === 0} // most recent month open by default
                                    />
                                );
                            })}
                        </div>
                    )
                )}
            </motion.div>
        </div>
    );
}
