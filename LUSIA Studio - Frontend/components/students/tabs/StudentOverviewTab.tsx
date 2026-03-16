"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    Calendar,
    ChevronLeft,
    ChevronRight,
    Clock,
    ClipboardList,
    Euro,
} from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Pdf01Icon,
    Note01Icon,
    Quiz02Icon,
    LicenseDraftIcon,
} from "@hugeicons/core-free-icons";
import { useMemberSessionsQuery, useMemberAssignmentsQuery } from "@/lib/queries/members";
import { useStudentAnalyticsQuery } from "@/lib/queries/analytics";
import type { MemberSession, MemberAssignment } from "@/lib/members";

/* ─────────────────────── helpers ─────────────────────── */

function ArtifactTypeIcon({ type, size = 12 }: { type?: string | null; size?: number }) {
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

const STATUS_COLOR: Record<string, string> = {
    not_started: "text-brand-primary/25",
    in_progress: "text-amber-500",
    submitted: "text-blue-500",
    graded: "text-brand-success",
};

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

interface StudentOverviewTabProps {
    studentId: string;
}

export function StudentOverviewTab({ studentId }: StudentOverviewTabProps) {
    return (
        <div className="space-y-4">
            {/* ── Financial ── */}
            <FinancialWidget studentId={studentId} />

            {/* ── Two-column: Sessions + TPCs ── */}
            <div className="grid grid-cols-2 gap-2">
                <SessionsColumn studentId={studentId} />
                <AssignmentsColumn studentId={studentId} />
            </div>
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
   FINANCIAL WIDGET — 2×2 white cards in PillSwitch wrapper
   ═══════════════════════════════════════════════════════════ */

function FinancialWidget({ studentId }: { studentId: string }) {
    const now = useMemo(() => new Date(), []);
    const [finMonth, setFinMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
    const isCurrentMonth = isSameMonth(finMonth, now);

    const dateFrom = useMemo(() => finMonth.toISOString().slice(0, 10), [finMonth]);
    const dateTo = useMemo(() => {
        const end = new Date(finMonth.getFullYear(), finMonth.getMonth() + 1, 0);
        return end.toISOString().slice(0, 10);
    }, [finMonth]);

    const { data: financials, isLoading } = useStudentAnalyticsQuery(studentId, { date_from: dateFrom, date_to: dateTo });
    const { data: assignments = [] } = useMemberAssignmentsQuery(studentId);

    const goBack = () => setFinMonth((p) => new Date(p.getFullYear(), p.getMonth() - 1, 1));
    const goForward = () => { if (!isCurrentMonth) setFinMonth((p) => new Date(p.getFullYear(), p.getMonth() + 1, 1)); };

    const totalSessions = financials?.total_sessions ?? 0;
    const totalHours = financials?.total_hours ?? 0;
    const totalSpent = financials?.total_spent ?? 0;
    const totalTPCs = assignments.length;

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
                    <FinCard icon={Euro} value={`€${totalSpent.toFixed(2)}`} label="A pagar" accent="text-brand-primary" />
                    <FinCard icon={Calendar} value={String(totalSessions)} label="Sessões" accent="text-blue-600" />
                    <FinCard icon={Clock} value={`${totalHours.toFixed(1)}h`} label="Horas" accent="text-amber-600" />
                    <FinCard icon={ClipboardList} value={String(totalTPCs)} label="TPC's" accent="text-emerald-600" />
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
   SESSIONS COLUMN — with session type + duration
   ═══════════════════════════════════════════════════════════ */

function SessionsColumn({ studentId }: { studentId: string }) {
    const { data: sessions = [], isLoading } = useMemberSessionsQuery(studentId);
    const [showAll, setShowAll] = useState(false);
    const now = useMemo(() => new Date(), []);

    const { upcoming, recent } = useMemo(() => {
        const upcoming = sessions
            .filter((s) => new Date(s.starts_at) > now)
            .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
        const recent = sessions
            .filter((s) => new Date(s.starts_at) <= now)
            .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
        return { upcoming, recent };
    }, [sessions, now]);

    const displayList = upcoming.length > 0 ? upcoming : recent;
    const visibleItems = showAll ? displayList : displayList.slice(0, 4);

    return (
        <div className="min-w-0">
            <SectionLabel
                right={<span className="text-[9px] font-bold text-brand-primary/40 tabular-nums">{sessions.length}</span>}
            >
                Sessões
            </SectionLabel>

            {isLoading ? (
                <LoadingDot />
            ) : sessions.length === 0 ? (
                <EmptyState icon={Calendar} text="Sem sessões" />
            ) : (
                <div className="bg-brand-primary/[0.04] rounded-lg p-0.5">
                    <div className="bg-white rounded-md shadow-sm overflow-hidden">
                        {visibleItems.map((s, i) => (
                            <CompactSessionRow key={s.id} session={s} showBorder={i > 0} />
                        ))}
                    </div>
                    {displayList.length > 4 && (
                        <button
                            onClick={() => setShowAll(!showAll)}
                            className="w-full text-[8px] text-brand-primary/30 hover:text-brand-primary/50 transition-colors py-1"
                        >
                            {showAll ? "Menos" : `+${displayList.length - 4} mais`}
                        </button>
                    )}
                </div>
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

    return (
        <div className={`px-2 py-1.5 ${showBorder ? "border-t border-brand-primary/[0.04]" : ""}`}>
            {/* Row 1: title + duration */}
            <div className="flex items-center gap-1.5 min-w-0">
                {stColor ? (
                    <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: stColor }} />
                ) : (
                    <div className="h-1.5 w-1.5 rounded-full shrink-0 bg-brand-primary/15" />
                )}
                <p className="text-[10px] text-brand-primary truncate leading-tight flex-1">
                    {session.title || subject?.name || dayStr}
                </p>
                <span className="text-[8px] text-brand-primary/20 tabular-nums shrink-0">
                    {formatDuration(mins)}
                </span>
            </div>
            {/* Row 2: meta — date, time, type badge */}
            <div className="flex items-center gap-1 mt-0.5 ml-3">
                <span className="text-[8px] text-brand-primary/25">{dayStr}</span>
                <span className="text-brand-primary/10 text-[8px]">·</span>
                <span className="text-[8px] text-brand-primary/25">{timeStr}</span>
                {session.session_type && (
                    <>
                        <span className="text-brand-primary/10 text-[8px]">·</span>
                        <span
                            className="text-[7px] font-medium px-1 py-px rounded-sm truncate max-w-[60px]"
                            style={{
                                backgroundColor: session.session_type.color ? `${session.session_type.color}15` : "rgba(13,47,127,0.04)",
                                color: session.session_type.color || "rgba(13,47,127,0.4)",
                            }}
                        >
                            {session.session_type.name}
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   ASSIGNMENTS COLUMN — lazy-loaded
   ═══════════════════════════════════════════════════════════ */

const TPC_PAGE_SIZE = 4;

function AssignmentsColumn({ studentId }: { studentId: string }) {
    const router = useRouter();
    const { data: assignments = [], isLoading } = useMemberAssignmentsQuery(studentId);
    const [visibleCount, setVisibleCount] = useState(TPC_PAGE_SIZE);

    const { completed, pending, overdue } = useMemo(() => {
        const now = new Date();
        let completed = 0, pending = 0, overdue = 0;
        for (const a of assignments) {
            if (a.status === "submitted" || a.status === "graded") completed++;
            else if (a.due_date && new Date(a.due_date) < now) overdue++;
            else pending++;
        }
        return { completed, pending, overdue };
    }, [assignments]);

    const visibleItems = assignments.slice(0, visibleCount);
    const hasMore = visibleCount < assignments.length;

    const observerRef = useRef<IntersectionObserver | null>(null);
    const sentinelCallback = useCallback(
        (node: HTMLDivElement | null) => {
            if (observerRef.current) observerRef.current.disconnect();
            if (!node || !hasMore) return;
            observerRef.current = new IntersectionObserver(
                (entries) => {
                    if (entries[0]?.isIntersecting) {
                        setVisibleCount((prev) => Math.min(prev + TPC_PAGE_SIZE, assignments.length));
                    }
                },
                { threshold: 0.1 },
            );
            observerRef.current.observe(node);
        },
        [hasMore, assignments.length],
    );

    useEffect(() => () => { observerRef.current?.disconnect(); }, []);

    const handleClick = (a: MemberAssignment) => {
        router.push(`/dashboard/assignments?selected=${a.assignment_id}`);
    };

    return (
        <div className="min-w-0">
            <SectionLabel
                right={
                    assignments.length > 0 ? (
                        <div className="flex items-center gap-1">
                            <span className="text-[8px] font-bold text-brand-success tabular-nums">{completed}</span>
                            <span className="text-[8px] font-bold text-brand-primary/25 tabular-nums">{pending}</span>
                            {overdue > 0 && <span className="text-[8px] font-bold text-brand-error tabular-nums">{overdue}</span>}
                        </div>
                    ) : undefined
                }
            >
                TPC&apos;s
            </SectionLabel>

            {isLoading ? (
                <LoadingDot />
            ) : assignments.length === 0 ? (
                <EmptyState icon={ClipboardList} text="Sem TPC's" />
            ) : (
                <div className="bg-brand-primary/[0.04] rounded-lg p-0.5">
                    <div className="bg-white rounded-md shadow-sm overflow-hidden">
                        {visibleItems.map((a, i) => (
                            <CompactAssignmentRow key={a.id} assignment={a} onClick={() => handleClick(a)} showBorder={i > 0} />
                        ))}
                    </div>
                    {hasMore && (
                        <div ref={sentinelCallback} className="flex items-center justify-center py-1">
                            <div className="h-2.5 w-2.5 border-[1.5px] border-brand-primary/10 border-t-brand-primary/30 rounded-full animate-spin" />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function CompactAssignmentRow({ assignment, onClick, showBorder }: { assignment: MemberAssignment; onClick: () => void; showBorder: boolean }) {
    const statusColor = STATUS_COLOR[assignment.status] ?? STATUS_COLOR.not_started;

    const dueStr = useMemo(() => {
        if (!assignment.due_date) return null;
        const due = new Date(assignment.due_date);
        const now = new Date();
        const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (assignment.status === "submitted" || assignment.status === "graded") return null;
        if (diffDays < 0) return "atrasado";
        if (diffDays === 0) return "hoje";
        if (diffDays === 1) return "amanhã";
        return due.toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
    }, [assignment.due_date, assignment.status]);

    return (
        <div
            className={`px-2 py-1.5 cursor-pointer hover:bg-brand-primary/[0.02] transition-colors ${showBorder ? "border-t border-brand-primary/[0.04]" : ""}`}
            onClick={onClick}
        >
            <div className="flex items-center gap-1.5 min-w-0">
                <div className={`h-5 w-5 rounded flex items-center justify-center shrink-0 ${statusColor}`}>
                    <ArtifactTypeIcon type={assignment.artifact_type} />
                </div>
                <p className="text-[10px] text-brand-primary truncate leading-tight flex-1">
                    {assignment.assignment_title || "Sem título"}
                </p>
                <ChevronRight className="h-2.5 w-2.5 text-brand-primary/15 shrink-0" />
            </div>
            <div className="flex items-center gap-1 mt-0.5 ml-[26px]">
                {assignment.grade !== null && (
                    <span className="text-[8px] font-bold text-brand-primary tabular-nums">{assignment.grade}%</span>
                )}
                {dueStr && (
                    <span className={`text-[8px] ${dueStr === "atrasado" ? "text-brand-error" : "text-brand-primary/25"}`}>
                        {dueStr}
                    </span>
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
