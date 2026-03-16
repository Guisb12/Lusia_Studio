"use client";

import React, { useState, useMemo } from "react";
import {
    Calendar,
    ChevronLeft,
    ChevronRight,
    Clock,
    Euro,
    TrendingUp,
    Users,
} from "lucide-react";
import { useTeacherSessionsQuery, useTeacherAnalyticsQuery } from "@/lib/queries/teachers";
import type { MemberSession } from "@/lib/members";

/* ─────────────────────── helpers ─────────────────────── */

const MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatMonthLabel(d: Date): string {
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function isSameMonth(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function durationMinutes(startsAt: string, endsAt: string): number {
    return Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000);
}

function formatDuration(mins: number): string {
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h${m}` : `${h}h`;
}

/* ─────────────────────── main component ─────────────────────── */

interface TeacherOverviewTabProps {
    teacherId: string;
}

export function TeacherOverviewTab({ teacherId }: TeacherOverviewTabProps) {
    return (
        <div className="space-y-4">
            <FinancialWidget teacherId={teacherId} />
            <SessionsColumn teacherId={teacherId} />
        </div>
    );
}

/* ─────────────────── Section Header ─────────────────── */

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between mb-1.5">
            <p className="text-[9px] font-medium text-brand-primary/30 uppercase tracking-wider">
                {children}
            </p>
            {right}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   FINANCIAL WIDGET — 2×2 white cards with month nav
   ═══════════════════════════════════════════════════════════ */

function FinancialWidget({ teacherId }: { teacherId: string }) {
    const now = useMemo(() => new Date(), []);
    const [finMonth, setFinMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
    const isCurrentMonth = isSameMonth(finMonth, now);

    const dateFrom = useMemo(() => finMonth.toISOString().slice(0, 10), [finMonth]);
    const dateTo = useMemo(() => {
        const end = new Date(finMonth.getFullYear(), finMonth.getMonth() + 1, 0);
        return end.toISOString().slice(0, 10);
    }, [finMonth]);

    const { data: analytics, isLoading } = useTeacherAnalyticsQuery(teacherId, { date_from: dateFrom, date_to: dateTo });

    const goBack = () => setFinMonth((p) => new Date(p.getFullYear(), p.getMonth() - 1, 1));
    const goForward = () => { if (!isCurrentMonth) setFinMonth((p) => new Date(p.getFullYear(), p.getMonth() + 1, 1)); };

    const totalSessions = analytics?.total_sessions ?? 0;
    const totalHours = analytics?.total_hours ?? 0;
    const totalEarnings = analytics?.total_earnings ?? 0;
    const revenueGenerated = analytics?.revenue_generated ?? 0;

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <SectionLabel>Financeiro</SectionLabel>
                <div className="flex items-center gap-1">
                    <button onClick={goBack} className="h-5 w-5 rounded bg-brand-primary/5 flex items-center justify-center text-brand-primary/40 hover:text-brand-primary hover:bg-brand-primary/10 transition-colors">
                        <ChevronLeft className="h-3 w-3" />
                    </button>
                    <span className="text-[10px] font-medium text-brand-primary min-w-[85px] text-center">
                        {formatMonthLabel(finMonth)}
                    </span>
                    <button onClick={goForward} disabled={isCurrentMonth} className="h-5 w-5 rounded bg-brand-primary/5 flex items-center justify-center text-brand-primary/40 hover:text-brand-primary hover:bg-brand-primary/10 transition-colors disabled:opacity-25 disabled:cursor-not-allowed">
                        <ChevronRight className="h-3 w-3" />
                    </button>
                </div>
            </div>

            {isLoading ? (
                <LoadingDot />
            ) : (
                <div className="grid grid-cols-2 gap-2">
                    <FinCard icon={Euro} value={`€${totalEarnings.toFixed(2)}`} label="A receber" accent="text-brand-primary" />
                    <FinCard icon={TrendingUp} value={`€${revenueGenerated.toFixed(2)}`} label="Receita gerada" accent="text-emerald-600" />
                    <FinCard icon={Calendar} value={String(totalSessions)} label="Sessões" accent="text-blue-600" />
                    <FinCard icon={Clock} value={`${totalHours.toFixed(1)}h`} label="Horas" accent="text-amber-600" />
                </div>
            )}
        </div>
    );
}

function FinCard({ icon: Icon, value, label, accent }: { icon: React.ElementType; value: string; label: string; accent: string }) {
    return (
        <div className="bg-brand-primary/[0.04] rounded-lg p-0.5">
            <div className="bg-white rounded-md shadow-sm px-3 py-3 flex flex-col items-center text-center">
                <div className={`h-8 w-8 rounded-xl bg-brand-primary/[0.04] flex items-center justify-center mb-2 ${accent}`}>
                    <Icon className="h-4 w-4" />
                </div>
                <p className="text-[15px] font-bold text-brand-primary leading-none tabular-nums">
                    {value}
                </p>
                <p className="text-[9px] text-brand-primary/35 mt-1">{label}</p>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   SESSIONS — full width with session type + duration
   ═══════════════════════════════════════════════════════════ */

const INITIAL_SESSION_LIMIT = 7;

function SessionsColumn({ teacherId }: { teacherId: string }) {
    const [loadAll, setLoadAll] = useState(false);
    const { data: sessions = [], isLoading, isFetching } = useTeacherSessionsQuery(
        teacherId,
        { limit: loadAll ? undefined : INITIAL_SESSION_LIMIT },
    );
    const now = useMemo(() => new Date(), []);

    const { upcoming, recent } = useMemo(() => {
        const upcoming = sessions
            .filter((s) => new Date(s.starts_at) > now)
            .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
        const recent = sessions
            .filter((s) => new Date(s.starts_at) <= now)
            .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
            .slice(0, loadAll ? undefined : 3);
        return { upcoming, recent };
    }, [sessions, now, loadAll]);

    const hasMore = !loadAll && sessions.length >= INITIAL_SESSION_LIMIT;

    return (
        <div className="space-y-3">
            <SectionLabel
                right={<span className="text-[9px] font-bold text-brand-primary/40 tabular-nums">{sessions.length}{hasMore ? "+" : ""}</span>}
            >
                Sessões
            </SectionLabel>

            {isLoading ? (
                <LoadingDot />
            ) : sessions.length === 0 ? (
                <EmptyState icon={Calendar} text="Sem sessões" />
            ) : (
                <>
                    {/* Upcoming */}
                    {upcoming.length > 0 && (
                        <div>
                            <p className="text-[8px] font-medium text-brand-primary/25 uppercase tracking-wider mb-1">
                                Próximas
                            </p>
                            <div className="bg-brand-primary/[0.04] rounded-lg p-0.5">
                                <div className="bg-white rounded-md shadow-sm overflow-hidden">
                                    {upcoming.map((s, i) => (
                                        <CompactSessionRow key={s.id} session={s} showBorder={i > 0} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Recent */}
                    {recent.length > 0 && (
                        <div>
                            <p className="text-[8px] font-medium text-brand-primary/25 uppercase tracking-wider mb-1">
                                Recentes
                            </p>
                            <div className="bg-brand-primary/[0.04] rounded-lg p-0.5">
                                <div className="bg-white rounded-md shadow-sm overflow-hidden">
                                    {recent.map((s, i) => (
                                        <CompactSessionRow key={s.id} session={s} showBorder={i > 0} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Load all button */}
                    {hasMore && (
                        <button
                            onClick={() => setLoadAll(true)}
                            disabled={isFetching}
                            className="w-full text-[10px] text-brand-primary/35 hover:text-brand-primary/60 transition-colors py-1.5"
                        >
                            {isFetching ? "A carregar..." : "Carregar todas"}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

function CompactSessionRow({ session, showBorder }: { session: MemberSession; showBorder: boolean }) {
    const date = new Date(session.starts_at);
    const dayStr = date.toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
    const timeStr = date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
    const mins = durationMinutes(session.starts_at, session.ends_at);
    const subject = session.subjects?.[0];
    const stColor = session.session_type?.color ?? subject?.color ?? null;
    const studentCount = session.student_ids?.length ?? 0;

    return (
        <div className={`px-3 py-2 ${showBorder ? "border-t border-brand-primary/[0.04]" : ""}`}>
            {/* Row 1: title + duration */}
            <div className="flex items-center gap-1.5 min-w-0">
                {stColor ? (
                    <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: stColor }} />
                ) : (
                    <div className="h-1.5 w-1.5 rounded-full shrink-0 bg-brand-primary/15" />
                )}
                <p className="text-[11px] text-brand-primary truncate leading-tight flex-1">
                    {session.title || subject?.name || dayStr}
                </p>
                <span className="text-[9px] text-brand-primary/20 tabular-nums shrink-0">
                    {formatDuration(mins)}
                </span>
            </div>
            {/* Row 2: meta */}
            <div className="flex items-center gap-1 mt-0.5 ml-3">
                <span className="text-[9px] text-brand-primary/25">{dayStr}</span>
                <span className="text-brand-primary/10 text-[9px]">·</span>
                <span className="text-[9px] text-brand-primary/25">{timeStr}</span>
                {session.session_type && (
                    <>
                        <span className="text-brand-primary/10 text-[9px]">·</span>
                        <span
                            className="text-[8px] font-medium px-1.5 py-px rounded-full truncate max-w-[80px] leading-none select-none"
                            style={{
                                color: session.session_type.color || "var(--color-brand-accent)",
                                backgroundColor: (session.session_type.color || "var(--color-brand-accent)") + "12",
                                border: `1px solid ${session.session_type.color || "var(--color-brand-accent)"}`,
                                borderBottomWidth: "2px",
                            }}
                        >
                            {session.session_type.name}
                        </span>
                    </>
                )}
                {studentCount > 0 && (
                    <>
                        <span className="text-brand-primary/10 text-[9px]">·</span>
                        <span className="text-[9px] text-brand-primary/25 flex items-center gap-0.5">
                            <Users className="h-2.5 w-2.5" />
                            {studentCount}
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   SHARED MICRO COMPONENTS
   ═══════════════════════════════════════════════════════════ */

function LoadingDot() {
    return (
        <div className="flex items-center justify-center py-4">
            <div className="h-3.5 w-3.5 border-[1.5px] border-brand-primary/15 border-t-brand-primary/40 rounded-full animate-spin" />
        </div>
    );
}

function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-5 text-center">
            <Icon className="h-5 w-5 text-brand-primary/10 mb-1" />
            <p className="text-[9px] text-brand-primary/25">{text}</p>
        </div>
    );
}
