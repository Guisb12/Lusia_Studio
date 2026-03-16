"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { pt } from "date-fns/locale";
import {
    CalendarDays,
    ClipboardList,
    GraduationCap,
    Clock,
    ChevronRight,
    Sparkles,
    Calendar,
    Euro,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useUser } from "@/components/providers/UserProvider";
import { useChatSessions } from "@/components/providers/ChatSessionsProvider";
import { ChatInput } from "@/components/chat/ChatInput";
import { useCalendarSessionsQuery } from "@/lib/queries/calendar";
import { seedUpcomingStudentSessions, buildStudentSessionsRanges, prefetchStudentSessionsTab } from "@/lib/student-sessions";
import { useDeferredQueryEnabled } from "@/lib/hooks/use-deferred-query-enabled";
import {
    type StudentAssignment,
    STUDENT_STATUS_LABELS,
    STUDENT_STATUS_COLORS,
} from "@/lib/assignments";
import { useMyAssignmentsQuery } from "@/lib/queries/assignments";
import { useMemberStatsQuery } from "@/lib/queries/members";
import { useStudentAnalyticsQuery } from "@/lib/queries/analytics";
import { prefetchStudentRouteData } from "@/lib/route-prefetch";
import type { CalendarSession } from "@/components/calendar/EventCalendar";
import type { MemberStats } from "@/lib/members";

/* ── Constants ──────────────────────────────────────────────── */

const MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/* ── Types ───────────────────────────────────────────────────── */

interface UpcomingSession {
    id: string;
    starts_at: string;
    ends_at: string;
    title?: string | null;
    teacher_name?: string | null;
    teacher_notes?: string | null;
    subjects?: Array<{ id: string; name: string; color?: string }>;
}

/* ── Helpers ─────────────────────────────────────────────────── */

function getGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 19) return "Boa tarde";
    return "Boa noite";
}

function formatMonthLabel(d: Date): string {
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDueDate(date: string | null | undefined) {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const dueStart = new Date(d); dueStart.setHours(0, 0, 0, 0);
    const days = Math.round((dueStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
    const time = d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
    if (d < now) return { text: "Expirado", color: "text-red-500", urgent: true };
    if (days === 0) return { text: `Hoje, ${time}`, color: "text-amber-600", urgent: true };
    if (days === 1) return { text: `Amanhã, ${time}`, color: "text-amber-600", urgent: true };
    if (days <= 3) return { text: `${days} dias, ${time}`, color: "text-amber-500", urgent: false };
    return {
        text: `${d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}, ${time}`,
        color: "text-brand-primary/50",
        urgent: false,
    };
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

/* ── Section Label ──────────────────────────────────────────── */

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-medium text-brand-primary/35 uppercase tracking-wider">
                {children}
            </p>
            {right}
        </div>
    );
}

/* ── PillSwitch Card Wrapper ────────────────────────────────── */

function PillCard({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn("bg-brand-primary/[0.04] rounded-lg p-0.5", className)}>
            <div className="bg-white rounded-md shadow-sm">
                {children}
            </div>
        </div>
    );
}

/* ── Quick Stat Card ─────────────────────────────────────────── */

function StatCard({
    icon: Icon,
    value,
    label,
    accent,
}: {
    icon: React.ElementType;
    value: string | number;
    label: string;
    accent?: string;
}) {
    return (
        <PillCard>
            <div className="p-3 text-center flex flex-col items-center gap-1.5">
                <div
                    className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center",
                        accent || "bg-brand-primary/5"
                    )}
                >
                    <Icon className="h-4 w-4" />
                </div>
                <span className="text-xl font-semibold text-brand-primary leading-none">
                    {value}
                </span>
                <span className="text-[10px] text-brand-primary/50 leading-tight">
                    {label}
                </span>
            </div>
        </PillCard>
    );
}

/* ── Financial Mini Widget (current month only) ────────────── */

function FinancialWidget({ userId }: { userId: string | undefined }) {
    const dateFrom = useMemo(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
    }, []);
    const dateTo = useMemo(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    }, []);

    const analyticsQuery = useStudentAnalyticsQuery(
        userId,
        { date_from: dateFrom, date_to: dateTo },
        Boolean(userId),
    );

    const data = analyticsQuery.data;
    const loading = analyticsQuery.isLoading && !analyticsQuery.data;

    const totalSpent = data?.total_spent ?? 0;
    const totalSessions = data?.total_sessions ?? 0;
    const totalHours = data?.total_hours ?? 0;

    return (
        <PillCard>
            <div className="px-3 py-2.5 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0 flex items-center gap-3">
                    {loading ? (
                        <div className="flex items-center gap-2 text-xs text-brand-primary/30">
                            <div className="animate-pulse h-3 w-20 bg-brand-primary/10 rounded" />
                        </div>
                    ) : (
                        <>
                            <span className="text-xs font-medium text-brand-primary flex items-center gap-1">
                                <Euro className="h-3 w-3 text-brand-primary/40" />
                                {totalSpent.toFixed(2)}
                            </span>
                            <span className="text-brand-primary/15">·</span>
                            <span className="text-xs text-brand-primary/60">
                                {totalSessions} {totalSessions === 1 ? "sessão" : "sessões"}
                            </span>
                            <span className="text-brand-primary/15">·</span>
                            <span className="text-xs text-brand-primary/60">
                                {totalHours.toFixed(0)}h
                            </span>
                        </>
                    )}
                </div>
                <span className="text-[10px] text-brand-primary/30 shrink-0">
                    {formatMonthLabel(new Date())}
                </span>
            </div>
        </PillCard>
    );
}

/* ── Compact Session Row ─────────────────────────────────────── */

function CompactSessionRow({ session }: { session: UpcomingSession }) {
    const start = parseISO(session.starts_at);
    const end = parseISO(session.ends_at);
    const dayStr = format(start, "d MMM", { locale: pt });
    const timeStr = format(start, "HH:mm");
    const mins = durationMinutes(session.starts_at, session.ends_at);
    const subject = session.subjects?.[0];
    const color = subject?.color ?? null;
    const today = isToday(start);
    const tomorrow = isTomorrow(start);

    return (
        <div className="px-3 py-2.5">
            {/* Row 1: color dot + title + duration */}
            <div className="flex items-center gap-2 min-w-0">
                {color ? (
                    <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                ) : (
                    <div className="h-2 w-2 rounded-full shrink-0 bg-brand-primary/15" />
                )}
                <p className="text-[13px] text-brand-primary truncate leading-tight flex-1 font-medium">
                    {session.title || subject?.name || dayStr}
                </p>
                <span className="text-[10px] text-brand-primary/25 tabular-nums shrink-0">
                    {formatDuration(mins)}
                </span>
            </div>
            {/* Row 2: meta */}
            <div className="flex items-center gap-1.5 mt-0.5 ml-4">
                <span className="text-[10px] text-brand-primary/30">{dayStr}</span>
                <span className="text-brand-primary/10 text-[10px]">·</span>
                <span className="text-[10px] text-brand-primary/30">{timeStr} — {format(end, "HH:mm")}</span>
                {today && (
                    <>
                        <span className="text-brand-primary/10 text-[10px]">·</span>
                        <span className="text-[9px] font-medium text-brand-accent bg-brand-accent/10 px-1.5 py-px rounded-full">Hoje</span>
                    </>
                )}
                {tomorrow && (
                    <>
                        <span className="text-brand-primary/10 text-[10px]">·</span>
                        <span className="text-[9px] font-medium text-amber-600 bg-amber-50 px-1.5 py-px rounded-full">Amanhã</span>
                    </>
                )}
                {session.teacher_name && (
                    <>
                        <span className="text-brand-primary/10 text-[10px]">·</span>
                        <span className="text-[10px] text-brand-primary/30 truncate max-w-[100px]">
                            Prof. {session.teacher_name}
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}

/* ── Compact Assignment Row ──────────────────────────────────── */

function CompactAssignmentRow({ studentAssignment }: { studentAssignment: StudentAssignment }) {
    const a = studentAssignment.assignment;
    const dueInfo = formatDueDate(a?.due_date);

    return (
        <div className="px-3 py-2.5">
            {/* Row 1: icon + title + chevron */}
            <div className="flex items-center gap-2 min-w-0">
                <ClipboardList className="h-3.5 w-3.5 text-brand-primary/25 shrink-0" />
                <p className="text-[13px] text-brand-primary truncate leading-tight flex-1 font-medium">
                    {a?.title || "TPC sem título"}
                </p>
                <ChevronRight className="h-3 w-3 text-brand-primary/15 shrink-0" />
            </div>
            {/* Row 2: meta */}
            <div className="flex items-center gap-1.5 mt-0.5 ml-[22px]">
                <Badge
                    className={cn(
                        "text-[9px] h-4 border-0 px-1.5",
                        STUDENT_STATUS_COLORS[studentAssignment.status]
                    )}
                >
                    {STUDENT_STATUS_LABELS[studentAssignment.status]}
                </Badge>
                {dueInfo && (
                    <>
                        <span className="text-brand-primary/10 text-[9px]">·</span>
                        <span className={cn("text-[10px] flex items-center gap-0.5", dueInfo.color)}>
                            <Calendar className="h-3 w-3" />
                            {dueInfo.text}
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}

/* ── Main Component ──────────────────────────────────────────── */

interface StudentHomePageProps {
    initialAssignments?: StudentAssignment[];
    initialSessions?: CalendarSession[];
    initialStats?: MemberStats | null;
}

export function StudentHomePage({
    initialAssignments,
    initialSessions,
    initialStats,
}: StudentHomePageProps) {
    const { user } = useUser();
    const router = useRouter();
    const { createConversation } = useChatSessions();
    const [referenceDate] = useState(() => new Date());
    const deferredStatsEnabled = useDeferredQueryEnabled(Boolean(user?.id));
    const { upcoming } = useMemo(() => buildStudentSessionsRanges(referenceDate), [referenceDate]);
    const sessionsQuery = useCalendarSessionsQuery({
        startDate: upcoming.startDate,
        endDate: upcoming.endDate,
        initialData: initialSessions,
    });
    const assignmentsQuery = useMyAssignmentsQuery(initialAssignments);
    const statsQuery = useMemberStatsQuery(
        user?.id,
        Boolean(user?.id) && deferredStatsEnabled,
        initialStats ?? undefined,
    );
    const sessions = (sessionsQuery.data ?? []) as UpcomingSession[];
    const assignments = assignmentsQuery.data ?? [];
    const stats = statsQuery.data ?? null;
    const loading =
        (sessionsQuery.isLoading && !sessionsQuery.data) ||
        (assignmentsQuery.isLoading && !assignmentsQuery.data);
    const statsLoading = !deferredStatsEnabled || (statsQuery.isLoading && !statsQuery.data);

    const handleChatSend = async (text: string) => {
        sessionStorage.setItem("lusia:pending-chat-message", text);
        const id = await createConversation();
        if (id) {
            router.push("/student/chat");
        }
    };

    useEffect(() => {
        if (!sessionsQuery.data) {
            return;
        }
        seedUpcomingStudentSessions(sessionsQuery.data, referenceDate);
    }, [referenceDate, sessionsQuery.data]);

    const pendingAssignments = assignments.filter(
        (a) => a.status === "not_started" || a.status === "in_progress"
    );

    const urgentAssignments = [...pendingAssignments]
        .sort((a, b) => {
            const da = a.assignment?.due_date;
            const db = b.assignment?.due_date;
            if (!da && !db) return 0;
            if (!da) return 1;
            if (!db) return -1;
            return new Date(da).getTime() - new Date(db).getTime();
        })
        .slice(0, 4);

    const todayFormatted = format(new Date(), "EEEE, d 'de' MMMM", { locale: pt });
    const displayName = user?.display_name || user?.full_name || "Aluno";
    const greeting = getGreeting();

    return (
        <div className="max-w-lg mx-auto w-full pb-28">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="space-y-4"
            >
                {/* ── Welcome Header — aligned with sidebar button like other pages ── */}
                <header>
                    <div className="-mt-12 lg:mt-0 pl-14 lg:pl-0">
                        <h1 className="text-3xl font-normal font-instrument text-brand-primary leading-10">
                            {greeting}, {displayName}!
                        </h1>
                    </div>
                    <p className="text-brand-primary/50 mt-0.5 text-sm capitalize">
                        {todayFormatted}
                    </p>
                </header>

                {/* ── Financial Mini-Widget ───────────────────────── */}
                <section>
                    <SectionLabel>Resumo financeiro</SectionLabel>
                    <FinancialWidget userId={user?.id} />
                </section>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="animate-spin h-6 w-6 border-2 border-brand-accent border-t-transparent rounded-full" />
                    </div>
                ) : (
                    <>
                        {/* ── Quick Stats Row ────────────────────────── */}
                        <section>
                            <SectionLabel>Visão geral</SectionLabel>
                            <div className="grid grid-cols-3 gap-2">
                                <StatCard
                                    icon={CalendarDays}
                                    value={sessions.length}
                                    label="Próximas sessões"
                                    accent="bg-blue-50 text-blue-600"
                                />
                                <StatCard
                                    icon={ClipboardList}
                                    value={pendingAssignments.length}
                                    label="TPC pendentes"
                                    accent="bg-amber-50 text-amber-600"
                                />
                                <StatCard
                                    icon={GraduationCap}
                                    value={
                                        statsLoading
                                            ? "..."
                                            : stats?.average_grade != null
                                            ? `${Math.round(stats.average_grade)}%`
                                            : "—"
                                    }
                                    label="Nota média"
                                    accent="bg-emerald-50 text-emerald-600"
                                />
                            </div>
                        </section>

                        {/* ── Próximas Sessões ────────────────────────── */}
                        <section>
                            <SectionLabel
                                right={
                                    <Link
                                        href="/student/sessions"
                                        onMouseEnter={() => void prefetchStudentSessionsTab("upcoming")}
                                        onFocus={() => void prefetchStudentSessionsTab("upcoming")}
                                        onTouchStart={() => void prefetchStudentSessionsTab("upcoming")}
                                        className="text-[10px] text-brand-accent hover:underline flex items-center gap-0.5 font-medium"
                                    >
                                        Ver todas
                                        <ChevronRight className="h-3 w-3" />
                                    </Link>
                                }
                            >
                                Próximas Sessões
                            </SectionLabel>

                            {sessions.length > 0 ? (
                                <PillCard>
                                    <div className="divide-y divide-brand-primary/[0.04]">
                                        {sessions.slice(0, 4).map((session) => (
                                            <Link
                                                key={session.id}
                                                href="/student/sessions"
                                                onMouseEnter={() => void prefetchStudentSessionsTab("upcoming")}
                                                className="block hover:bg-brand-primary/[0.02] transition-colors first:rounded-t-md last:rounded-b-md"
                                            >
                                                <CompactSessionRow session={session as UpcomingSession} />
                                            </Link>
                                        ))}
                                    </div>
                                </PillCard>
                            ) : (
                                <PillCard>
                                    <div className="p-6 text-center">
                                        <CalendarDays className="h-8 w-8 mx-auto mb-2 text-brand-primary/20" />
                                        <p className="text-sm text-brand-primary/40">
                                            Sem sessões agendadas
                                        </p>
                                    </div>
                                </PillCard>
                            )}
                        </section>

                        {/* ── TPC Pendentes ────────────────────────────── */}
                        <section>
                            <SectionLabel
                                right={
                                    <Link
                                        href="/student/assignments"
                                        onMouseEnter={() => void prefetchStudentRouteData("/student/assignments", user)}
                                        onFocus={() => void prefetchStudentRouteData("/student/assignments", user)}
                                        onTouchStart={() => void prefetchStudentRouteData("/student/assignments", user)}
                                        className="text-[10px] text-brand-accent hover:underline flex items-center gap-0.5 font-medium"
                                    >
                                        Ver todos
                                        <ChevronRight className="h-3 w-3" />
                                    </Link>
                                }
                            >
                                TPC Pendentes
                            </SectionLabel>

                            {urgentAssignments.length > 0 ? (
                                <PillCard>
                                    <div className="divide-y divide-brand-primary/[0.04]">
                                        {urgentAssignments.map((sa) => (
                                            <Link
                                                key={sa.id}
                                                href="/student/assignments"
                                                className="block hover:bg-brand-primary/[0.02] transition-colors first:rounded-t-md last:rounded-b-md"
                                            >
                                                <CompactAssignmentRow studentAssignment={sa} />
                                            </Link>
                                        ))}
                                    </div>
                                </PillCard>
                            ) : (
                                <PillCard>
                                    <div className="p-6 text-center">
                                        <Sparkles className="h-8 w-8 mx-auto mb-2 text-brand-primary/20" />
                                        <p className="text-sm text-brand-primary/40">
                                            Tudo em dia! Sem TPC pendentes.
                                        </p>
                                    </div>
                                </PillCard>
                            )}
                        </section>
                    </>
                )}
            </motion.div>

            {/* ── Floating Chat Input ────────────────────────────── */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 z-20 lg:pl-16">
                <ChatInput
                    onSend={handleChatSend}
                    placeholder="Pergunta algo à Lusia..."
                    className="px-0 py-0"
                />
            </div>
        </div>
    );
}
