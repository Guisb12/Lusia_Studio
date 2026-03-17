"use client";

import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { pt } from "date-fns/locale";
import {
    CalendarDays,
    ChevronRight,
    Clock,
    ClipboardList,
    Users,
    Sparkles,
    Calendar,
    Copy,
    Check,
    RefreshCw,
    Loader2,
    GraduationCap,
    Euro,
    TrendingUp,
    BarChart3,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import { cn } from "@/lib/utils";
import { useUser } from "@/components/providers/UserProvider";
import { OnboardingObjectives } from "@/components/dashboard/OnboardingObjectives";
import { fetchClasses } from "@/lib/classes";
import { fetchMembers } from "@/lib/members";
import {
    type Assignment,
    ASSIGNMENT_STATUS_LABELS,
} from "@/lib/assignments";
import { useAllClassesQuery, useOwnClassesQuery } from "@/lib/queries/classes";
import { useCalendarSessionsQuery } from "@/lib/queries/calendar";
import { useAssignmentsQuery } from "@/lib/queries/assignments";
import { useMembersQuery } from "@/lib/queries/members";
import {
    patchEnrollmentInfoQuery,
    useEnrollmentInfoQuery,
    type EnrollmentInfo,
} from "@/lib/queries/organizations";
import { useAdminAnalyticsQuery } from "@/lib/queries/analytics";
import { useTeacherAnalyticsQuery } from "@/lib/queries/teachers";
import { prefetchTeacherRouteData } from "@/lib/route-prefetch";
import { useDeferredQueryEnabled } from "@/lib/hooks/use-deferred-query-enabled";
import type { CalendarSession } from "@/components/calendar/EventCalendar";
import type { PaginatedClassrooms } from "@/lib/classes";
import type { PaginatedMembers } from "@/lib/members";

/* ── Constants ────────────────────────────────────────────── */

const MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/* ── Helpers ──────────────────────────────────────────────── */

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
    if (d < now) return { text: "Expirado", color: "text-red-500" };
    if (days === 0) return { text: `Hoje, ${time}`, color: "text-amber-600" };
    if (days === 1) return { text: `Amanhã, ${time}`, color: "text-amber-600" };
    if (days <= 3) return { text: `${days} dias, ${time}`, color: "text-amber-500" };
    return {
        text: `${d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}, ${time}`,
        color: "text-brand-primary/50",
    };
}

/* ── Shared Micro Components ─────────────────────────────── */

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

function FinCard({
    icon: Icon,
    value,
    label,
    accent,
}: {
    icon: React.ElementType;
    value: string;
    label: string;
    accent: string;
}) {
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

function QuickStatCell({
    icon: Icon,
    value,
    label,
    accent,
}: {
    icon: React.ElementType;
    value: string | number;
    label: string;
    accent: string;
}) {
    return (
        <div className="bg-brand-primary/[0.04] rounded-lg p-0.5">
            <div className="bg-white rounded-md shadow-sm p-3 flex flex-col items-center text-center">
                <div className={`h-8 w-8 rounded-xl bg-brand-primary/[0.04] flex items-center justify-center mb-1.5 ${accent}`}>
                    <Icon className="h-4 w-4" />
                </div>
                <p className="text-lg font-semibold text-brand-primary leading-none tabular-nums">
                    {value}
                </p>
                <p className="text-[9px] text-brand-primary/35 mt-1">{label}</p>
            </div>
        </div>
    );
}

function LoadingDot() {
    return (
        <div className="flex items-center justify-center py-6">
            <div className="h-4 w-4 border-2 border-brand-primary/15 border-t-brand-primary/40 rounded-full animate-spin" />
        </div>
    );
}

/* ── Main Component ──────────────────────────────────────── */

interface TeacherHomePageProps {
    initialAssignments?: Assignment[];
    initialClasses?: PaginatedClassrooms;
    initialEnrollmentInfo?: EnrollmentInfo | null;
    initialSessions?: CalendarSession[];
    initialStudentCount?: PaginatedMembers;
}

export function TeacherHomePage({
    initialAssignments,
    initialClasses,
    initialEnrollmentInfo,
    initialSessions,
    initialStudentCount,
}: TeacherHomePageProps) {
    const { user } = useUser();
    const isAdmin = user?.role === "admin";
    const [referenceDate] = useState(() => new Date());
    const deferredDataEnabled = useDeferredQueryEnabled(Boolean(user?.id));

    /* ── Upcoming sessions range ── */
    const upcomingRange = useMemo(() => {
        const endDate = new Date(referenceDate);
        endDate.setMonth(referenceDate.getMonth() + 3);
        return {
            startDate: referenceDate.toISOString(),
            endDate: endDate.toISOString(),
        };
    }, [referenceDate]);

    /* ── Queries ── */
    const sessionsQuery = useCalendarSessionsQuery({ ...upcomingRange, initialData: initialSessions });
    const assignmentsQuery = useAssignmentsQuery("published", initialAssignments);
    const ownClassesQuery = useOwnClassesQuery(
        Boolean(user?.id) && !isAdmin && deferredDataEnabled,
        !isAdmin ? initialClasses : undefined,
    );
    const allClassesQuery = useAllClassesQuery(
        Boolean(user?.id) && isAdmin && deferredDataEnabled,
        isAdmin ? initialClasses : undefined,
    );
    const classesQuery = isAdmin ? allClassesQuery : ownClassesQuery;
    const studentCountQuery = useMembersQuery({
        role: "student",
        status: "active",
        page: 1,
        perPage: 1,
        enabled: Boolean(user?.id) && deferredDataEnabled,
        initialData: initialStudentCount,
    });
    const enrollmentInfoQuery = useEnrollmentInfoQuery(
        user?.organization_id,
        Boolean(user?.organization_id) && deferredDataEnabled,
        initialEnrollmentInfo,
    );

    /* ── Current month date range for analytics ── */
    const dateFrom = useMemo(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
    }, []);
    const dateTo = useMemo(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    }, []);

    /* ── Analytics queries ── */
    const adminAnalytics = useAdminAnalyticsQuery(
        { date_from: dateFrom, date_to: dateTo },
        undefined,
        isAdmin && deferredDataEnabled,
    );
    const teacherAnalytics = useTeacherAnalyticsQuery(
        user?.id,
        { date_from: dateFrom, date_to: dateTo },
        !isAdmin && deferredDataEnabled,
    );

    /* ── Derived data ── */
    const sessions = sessionsQuery.data ?? [];
    const assignments = assignmentsQuery.data ?? [];
    const classCount = classesQuery.data?.total ?? classesQuery.data?.data.length ?? 0;
    const studentCount = studentCountQuery.data?.total ?? 0;
    const enrollmentInfo = enrollmentInfoQuery.data ?? null;

    const loading =
        (sessionsQuery.isLoading && !sessionsQuery.data) ||
        (assignmentsQuery.isLoading && !assignmentsQuery.data);
    const statsLoading =
        !deferredDataEnabled ||
        (classesQuery.isLoading && !classesQuery.data) ||
        (studentCountQuery.isLoading && !studentCountQuery.data);

    const finLoading = isAdmin
        ? adminAnalytics.isLoading && !adminAnalytics.data
        : teacherAnalytics.isLoading && !teacherAnalytics.data;

    const adminSummary = adminAnalytics.data?.summary ?? null;
    const teacherData = teacherAnalytics.data ?? null;

    /* ── Analytics-derived session/hour counts for quick stats ── */
    const analyticsSessions = isAdmin
        ? (adminSummary?.total_sessions ?? 0)
        : (teacherData?.total_sessions ?? 0);
    const analyticsHours = isAdmin
        ? (adminSummary?.total_hours ?? 0)
        : (teacherData?.total_hours ?? 0);

    /* ── Enrollment code UI state ── */
    const [copiedCode, setCopiedCode] = useState<"student" | "teacher" | null>(null);
    const [rotatingStudent, setRotatingStudent] = useState(false);
    const [rotatingTeacher, setRotatingTeacher] = useState(false);

    const handleCopy = (code: string, type: "student" | "teacher") => {
        navigator.clipboard.writeText(code).catch(() => {});
        setCopiedCode(type);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    const handleRotateCode = useCallback(
        async (type: "student" | "teacher") => {
            if (!user?.organization_id) return;
            type === "student" ? setRotatingStudent(true) : setRotatingTeacher(true);
            try {
                const res = await fetch(
                    `/api/organizations/${user.organization_id}/codes/rotate-${type}`,
                    { method: "POST" }
                );
                if (res.ok) {
                    const d = await res.json();
                    patchEnrollmentInfoQuery(user.organization_id, (current) => ({ ...(current ?? {}), ...d }));
                }
            } finally {
                type === "student" ? setRotatingStudent(false) : setRotatingTeacher(false);
            }
        },
        [user?.organization_id]
    );

    /* ── Sort assignments by due date, take top 4 ── */
    const upcomingAssignments = [...assignments]
        .sort((a, b) => {
            if (!a.due_date && !b.due_date) return 0;
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        })
        .slice(0, 4);

    const todayFormatted = format(new Date(), "EEEE, d 'de' MMMM", { locale: pt });
    const displayName = user?.display_name || user?.full_name || "Professor";
    const greeting = getGreeting();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex h-full min-h-0 flex-col"
        >
            {/* ── Welcome Header ── */}
            <header className="shrink-0 pb-4">
                <div className="px-0.5">
                    <h1 className="text-3xl font-normal font-instrument text-brand-primary">
                        {greeting}, {displayName}!
                    </h1>
                    <p className="text-brand-primary/50 mt-0.5 text-sm capitalize">
                        {todayFormatted}
                    </p>
                </div>
            </header>

            <AppScrollArea
                className="flex-1 min-h-0"
                viewportClassName="pb-12 pr-2"
                showFadeMasks
                interactiveScrollbar
            >
                <div className="space-y-5">
                    {/* Onboarding Objectives — trial admins only */}
                    <OnboardingObjectives />

                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="animate-spin h-6 w-6 border-2 border-brand-accent border-t-transparent rounded-full" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        {/* ═══════════ LEFT COLUMN (2/3) ═══════════ */}
                        <div className="lg:col-span-2 space-y-5">
                            {/* ── Financial Summary ── */}
                            <section>
                                <SectionLabel
                                    right={
                                        <span className="text-[10px] text-brand-primary/30">
                                            {formatMonthLabel(new Date())}
                                        </span>
                                    }
                                >
                                    Resumo Financeiro
                                </SectionLabel>

                                {finLoading ? (
                                    <LoadingDot />
                                ) : isAdmin ? (
                                    <div className="grid grid-cols-4 gap-2">
                                        <FinCard
                                            icon={Euro}
                                            value={`€${(adminSummary?.total_revenue ?? 0).toFixed(2)}`}
                                            label="Receita"
                                            accent="text-emerald-600"
                                        />
                                        <FinCard
                                            icon={TrendingUp}
                                            value={`€${(adminSummary?.total_cost ?? 0).toFixed(2)}`}
                                            label="Custo"
                                            accent="text-amber-600"
                                        />
                                        <FinCard
                                            icon={BarChart3}
                                            value={`€${(adminSummary?.total_profit ?? 0).toFixed(2)}`}
                                            label="Lucro"
                                            accent="text-blue-600"
                                        />
                                        <FinCard
                                            icon={CalendarDays}
                                            value={String(adminSummary?.total_sessions ?? 0)}
                                            label="Sessões"
                                            accent="text-violet-600"
                                        />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                        <FinCard
                                            icon={Euro}
                                            value={`€${(teacherData?.total_earnings ?? 0).toFixed(2)}`}
                                            label="A receber"
                                            accent="text-emerald-600"
                                        />
                                        <FinCard
                                            icon={CalendarDays}
                                            value={String(teacherData?.total_sessions ?? 0)}
                                            label="Sessões"
                                            accent="text-violet-600"
                                        />
                                    </div>
                                )}
                            </section>

                            {/* ── Próximas Sessões ── */}
                            <section>
                                <SectionLabel
                                    right={
                                        <Link
                                            href="/dashboard/calendar"
                                            onMouseEnter={() => void prefetchTeacherRouteData("/dashboard/calendar", user)}
                                            onFocus={() => void prefetchTeacherRouteData("/dashboard/calendar", user)}
                                            onTouchStart={() => void prefetchTeacherRouteData("/dashboard/calendar", user)}
                                            className="text-[10px] text-brand-accent hover:underline flex items-center gap-0.5"
                                        >
                                            Ver todas
                                            <ChevronRight className="h-3 w-3" />
                                        </Link>
                                    }
                                >
                                    Próximas Sessões
                                </SectionLabel>

                                {sessions.length > 0 ? (
                                    <div className="bg-brand-primary/[0.04] rounded-lg p-0.5">
                                        <div className="bg-white rounded-md shadow-sm overflow-hidden divide-y divide-brand-primary/[0.04]">
                                            {sessions.slice(0, 4).map((session) => (
                                                <Link
                                                    key={session.id}
                                                    href="/dashboard/calendar"
                                                    onMouseEnter={() => void prefetchTeacherRouteData("/dashboard/calendar", user)}
                                                    className="block hover:bg-brand-primary/[0.02] transition-colors"
                                                >
                                                    <CompactSessionRow session={session} />
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-brand-primary/[0.04] rounded-lg p-0.5">
                                        <div className="bg-white rounded-md shadow-sm p-6 text-center">
                                            <CalendarDays className="h-8 w-8 mx-auto mb-2 text-brand-primary/20" />
                                            <p className="text-sm text-brand-primary/40">
                                                Sem sessões agendadas
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </section>

                            {/* ── Active TPCs ── */}
                            <section>
                                <SectionLabel
                                    right={
                                        <Link
                                            href="/dashboard/assignments"
                                            onMouseEnter={() => void prefetchTeacherRouteData("/dashboard/assignments", user)}
                                            onFocus={() => void prefetchTeacherRouteData("/dashboard/assignments", user)}
                                            onTouchStart={() => void prefetchTeacherRouteData("/dashboard/assignments", user)}
                                            className="text-[10px] text-brand-accent hover:underline flex items-center gap-0.5"
                                        >
                                            Ver todos
                                            <ChevronRight className="h-3 w-3" />
                                        </Link>
                                    }
                                >
                                    TPCs Ativos
                                </SectionLabel>

                                {upcomingAssignments.length > 0 ? (
                                    <div className="bg-brand-primary/[0.04] rounded-lg p-0.5">
                                        <div className="bg-white rounded-md shadow-sm overflow-hidden divide-y divide-brand-primary/[0.04]">
                                            {upcomingAssignments.map((a) => (
                                                <Link
                                                    key={a.id}
                                                    href="/dashboard/assignments"
                                                    onMouseEnter={() => void prefetchTeacherRouteData("/dashboard/assignments", user)}
                                                    className="block hover:bg-brand-primary/[0.02] transition-colors"
                                                >
                                                    <CompactAssignmentRow assignment={a} />
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-brand-primary/[0.04] rounded-lg p-0.5">
                                        <div className="bg-white rounded-md shadow-sm p-6 text-center">
                                            <Sparkles className="h-8 w-8 mx-auto mb-2 text-brand-primary/20" />
                                            <p className="text-sm text-brand-primary/40">
                                                Sem TPCs ativos de momento.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </section>
                        </div>

                        {/* ═══════════ RIGHT COLUMN (1/3) ═══════════ */}
                        <div className="space-y-5">
                            {/* ── Quick Stats — top-aligned with financial cards ── */}
                            <section>
                                <SectionLabel>Estatísticas</SectionLabel>
                                {isAdmin ? (
                                    <div className="grid grid-cols-2 gap-2">
                                        <QuickStatCell
                                            icon={Users}
                                            value={statsLoading ? "..." : classCount}
                                            label="Turmas ativas"
                                            accent="text-blue-600"
                                        />
                                        <QuickStatCell
                                            icon={GraduationCap}
                                            value={statsLoading ? "..." : studentCount}
                                            label="Alunos"
                                            accent="text-emerald-600"
                                        />
                                        <QuickStatCell
                                            icon={CalendarDays}
                                            value={finLoading ? "..." : analyticsSessions}
                                            label="Sessões este mês"
                                            accent="text-violet-600"
                                        />
                                        <QuickStatCell
                                            icon={Clock}
                                            value={finLoading ? "..." : `${analyticsHours.toFixed(1)}h`}
                                            label="Horas este mês"
                                            accent="text-amber-600"
                                        />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                        <QuickStatCell
                                            icon={CalendarDays}
                                            value={finLoading ? "..." : analyticsSessions}
                                            label="Sessões este mês"
                                            accent="text-violet-600"
                                        />
                                        <QuickStatCell
                                            icon={Clock}
                                            value={finLoading ? "..." : `${analyticsHours.toFixed(1)}h`}
                                            label="Horas este mês"
                                            accent="text-amber-600"
                                        />
                                    </div>
                                )}
                            </section>

                            {/* ── Enrollment Codes ── */}
                            {enrollmentInfo && (
                                <section>
                                    <SectionLabel>
                                        {isAdmin ? "Códigos de Inscrição" : "Código de Inscrição"}
                                    </SectionLabel>
                                    <div className="space-y-2">
                                        <EnrollmentCodeCard
                                            label="Alunos"
                                            icon={GraduationCap}
                                            code={enrollmentInfo.student_enrollment_code}
                                            copied={copiedCode === "student"}
                                            rotating={rotatingStudent}
                                            canRotate={isAdmin}
                                            onCopy={(code) => handleCopy(code, "student")}
                                            onRotate={() => void handleRotateCode("student")}
                                        />
                                        {isAdmin && enrollmentInfo.teacher_enrollment_code && (
                                            <EnrollmentCodeCard
                                                label="Professores"
                                                icon={Users}
                                                code={enrollmentInfo.teacher_enrollment_code}
                                                copied={copiedCode === "teacher"}
                                                rotating={rotatingTeacher}
                                                canRotate={true}
                                                onCopy={(code) => handleCopy(code, "teacher")}
                                                onRotate={() => void handleRotateCode("teacher")}
                                            />
                                        )}
                                    </div>
                                </section>
                            )}
                        </div>
                        </div>
                    )}
                </div>
            </AppScrollArea>
        </motion.div>
    );
}

/* ── Enrollment Code Card ─────────────────────────────────── */

function EnrollmentCodeCard({
    label,
    icon: Icon,
    code,
    copied,
    rotating,
    canRotate,
    onCopy,
    onRotate,
}: {
    label: string;
    icon: React.ElementType;
    code?: string;
    copied: boolean;
    rotating: boolean;
    canRotate: boolean;
    onCopy: (code: string) => void;
    onRotate: () => void;
}) {
    return (
        <div className="bg-brand-primary/[0.04] rounded-lg p-0.5">
            <div className="bg-white rounded-md shadow-sm px-3 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                    <Icon className="h-3.5 w-3.5 text-brand-primary/35" />
                    <p className="text-[10px] font-medium text-brand-primary/35 uppercase tracking-wider">
                        {label}
                    </p>
                </div>
                <div className="flex items-center gap-1.5">
                    <code className="flex-1 bg-brand-primary/[0.03] border border-brand-primary/[0.06] px-2.5 py-1.5 rounded-lg text-xs font-mono text-brand-primary tracking-wider truncate">
                        {code || "\u2014"}
                    </code>
                    <button
                        onClick={() => code && onCopy(code)}
                        className="h-8 w-8 rounded-lg bg-brand-primary/[0.03] border border-brand-primary/[0.06] flex items-center justify-center text-brand-primary/30 hover:bg-brand-primary/[0.08] hover:text-brand-primary transition-all shrink-0"
                    >
                        {copied ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                            <Copy className="h-3 w-3" />
                        )}
                    </button>
                    {canRotate && (
                        <button
                            onClick={onRotate}
                            disabled={rotating}
                            className="h-8 w-8 rounded-lg bg-brand-primary/[0.03] border border-brand-primary/[0.06] flex items-center justify-center text-brand-primary/30 hover:bg-brand-primary/[0.08] hover:text-brand-primary transition-all shrink-0 disabled:opacity-40"
                        >
                            {rotating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <RefreshCw className="h-3 w-3" />
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ── Compact Session Row ─────────────────────────────────── */

function durationMinutes(startsAt: string, endsAt: string): number {
    return Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000);
}

function formatDuration(mins: number): string {
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h${m}` : `${h}h`;
}

function CompactSessionRow({ session }: { session: CalendarSession }) {
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
                {subject && (
                    <>
                        <span className="text-brand-primary/10 text-[10px]">·</span>
                        <span
                            className="text-[9px] font-medium px-1.5 py-px rounded-full truncate max-w-[90px]"
                            style={{
                                backgroundColor: subject.color ? `${subject.color}15` : "rgba(13,47,127,0.04)",
                                color: subject.color || "rgba(13,47,127,0.4)",
                            }}
                        >
                            {subject.name}
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}

/* ── Compact Assignment Row ─────────────────────────────── */

function CompactAssignmentRow({ assignment }: { assignment: Assignment }) {
    const dueInfo = formatDueDate(assignment.due_date);

    return (
        <div className="px-3 py-2.5">
            {/* Row 1: title + submission count */}
            <div className="flex items-center gap-2 min-w-0">
                <ClipboardList className="h-3.5 w-3.5 text-brand-primary/25 shrink-0" />
                <p className="text-[13px] text-brand-primary truncate leading-tight flex-1 font-medium">
                    {assignment.title || "TPC sem título"}
                </p>
                <ChevronRight className="h-3 w-3 text-brand-primary/15 shrink-0" />
            </div>
            {/* Row 2: meta */}
            <div className="flex items-center gap-1.5 mt-0.5 ml-[22px]">
                <Badge className="text-[9px] h-4 border-0 bg-blue-50 text-blue-700 px-1.5">
                    {ASSIGNMENT_STATUS_LABELS[assignment.status] || assignment.status}
                </Badge>
                {assignment.student_count != null && (
                    <>
                        <span className="text-brand-primary/10 text-[9px]">·</span>
                        <span className="text-[10px] text-brand-primary/30 flex items-center gap-0.5">
                            <GraduationCap className="h-3 w-3" />
                            {assignment.submitted_count ?? 0}/{assignment.student_count}
                        </span>
                    </>
                )}
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
