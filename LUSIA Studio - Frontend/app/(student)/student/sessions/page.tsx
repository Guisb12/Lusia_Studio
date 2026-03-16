"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { format, parseISO, isToday, isTomorrow, differenceInCalendarDays } from "date-fns";
import { pt } from "date-fns/locale";
import {
    CalendarDays,
    Clock,
    FileText,
    History,
    AlertCircle,
    ChevronDown,
    ChevronRight,
    BookOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PillSwitch } from "@/components/ui/pill-switch";
import { cn } from "@/lib/utils";
import { useCalendarSessionsQuery } from "@/lib/queries/calendar";
import {
    buildStudentSessionsRanges,
    prefetchStudentSessionsTab,
    type StudentSessionsTab,
} from "@/lib/student-sessions";
import { getSubjectIcon } from "@/lib/icons";

interface StudentSession {
    id: string;
    starts_at: string;
    ends_at: string;
    title?: string | null;
    teacher_name?: string | null;
    teacher_notes?: string | null;
    teacher_summary?: string | null;
    subjects?: Array<{ id: string; name: string; color?: string; icon?: string }>;
    students?: Array<{ id: string; full_name?: string; display_name?: string }>;
}

const EMPTY_SESSIONS: StudentSession[] = [];

// ── Helpers ──────────────────────────────────────────────────

function getRelativeDayLabel(day: Date): string | null {
    if (isToday(day)) return "Hoje";
    if (isTomorrow(day)) return "Amanhã";
    const diff = differenceInCalendarDays(day, new Date());
    if (diff >= 2 && diff <= 6) return format(day, "EEEE", { locale: pt });
    return null;
}

// ── Subject icon helper ──────────────────────────────────────

function SubjectIcon({ icon, color }: { icon?: string | null; color?: string | null }) {
    const IconComponent = icon ? getSubjectIcon(icon) : BookOpen;
    return (
        <div
            className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: color ? `${color}15` : "rgba(10,27,182,0.08)" }}
        >
            <IconComponent
                className="h-4 w-4"
                style={{ color: color || "#0a1bb6" }}
            />
        </div>
    );
}

// ── Session card ──────────────────────────────────────────────

function SessionCard({ session }: { session: StudentSession }) {
    const start = parseISO(session.starts_at);
    const end = parseISO(session.ends_at);
    const color = session.subjects?.[0]?.color || "#0a1bb6";
    const primarySubject = session.subjects?.[0];

    return (
        <div className="group relative flex gap-3.5 py-3 px-4 rounded-xl hover:bg-brand-primary/[0.02] transition-colors">
            {/* Subject icon */}
            <SubjectIcon icon={primarySubject?.icon} color={primarySubject?.color} />

            {/* Color bar */}
            <div
                className="shrink-0 w-1 rounded-full self-stretch mt-1 mb-1"
                style={{ backgroundColor: color }}
            />

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-brand-primary leading-snug truncate">
                            {session.subjects && session.subjects.length > 0
                                ? session.subjects.map((s) => s.name).join(", ")
                                : session.title || "Sessão"}
                        </p>

                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-brand-primary/40 font-medium tabular-nums">
                                {format(start, "HH:mm")} — {format(end, "HH:mm")}
                            </span>
                            {session.teacher_name && (
                                <>
                                    <span className="text-brand-primary/15">·</span>
                                    <span className="text-xs text-brand-primary/40">
                                        {session.teacher_name}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Subject badges — only when title exists (otherwise subjects are the title) */}
                    {session.title && session.subjects && session.subjects.length > 0 && (
                        <div className="flex flex-wrap gap-1 shrink-0">
                            {session.subjects.map((subj) => (
                                <Badge
                                    key={subj.id}
                                    variant="outline"
                                    className="text-[10px] h-5 gap-1 whitespace-nowrap border-0 font-medium"
                                    style={{
                                        backgroundColor: subj.color ? `${subj.color}12` : undefined,
                                        color: subj.color || undefined,
                                    }}
                                >
                                    {subj.name}
                                </Badge>
                            ))}
                        </div>
                    )}
                </div>

                {/* Summary — blockquote style */}
                {session.teacher_summary && (
                    <div className="flex items-stretch gap-2.5 mt-2">
                        <div className="w-0.5 shrink-0 rounded-full bg-brand-accent/30" />
                        <p className="text-xs text-brand-primary/50 italic line-clamp-2 py-0.5">
                            {session.teacher_summary}
                        </p>
                    </div>
                )}

                {/* Notes */}
                {session.teacher_notes && (
                    <p className="mt-1.5 text-xs text-brand-primary/40 line-clamp-2">
                        {session.teacher_notes}
                    </p>
                )}
            </div>
        </div>
    );
}

// ── Day group ─────────────────────────────────────────────────

function DayGroup({ dateKey, sessions }: { dateKey: string; sessions: StudentSession[] }) {
    const day = parseISO(dateKey);
    const today = isToday(day);
    const relativeLabel = getRelativeDayLabel(day);

    return (
        <div>
            <div className="flex items-center gap-2 mb-1 px-4">
                <h3
                    className={cn(
                        "text-xs font-bold uppercase tracking-wider",
                        today ? "text-brand-accent" : "text-brand-primary/35"
                    )}
                >
                    {format(day, "EEEE, d MMM", { locale: pt })}
                </h3>
                {relativeLabel && (
                    <Badge
                        className={cn(
                            "text-[10px] h-4 border-0 font-semibold",
                            today
                                ? "bg-brand-accent/10 text-brand-accent"
                                : "bg-brand-primary/5 text-brand-primary/40"
                        )}
                    >
                        {relativeLabel}
                    </Badge>
                )}
            </div>
            <div className="divide-y divide-brand-primary/[0.04]">
                {sessions.map((s) => (
                    <SessionCard key={s.id} session={s} />
                ))}
            </div>
        </div>
    );
}

// ── Past session card (compact) ───────────────────────────────

function PastSessionCard({ session }: { session: StudentSession }) {
    const start = parseISO(session.starts_at);
    const end = parseISO(session.ends_at);
    const primarySubject = session.subjects?.[0];

    return (
        <div className="flex items-center gap-3 py-2.5 px-4 rounded-lg hover:bg-brand-primary/[0.02] transition-colors">
            {/* Subject icon */}
            <SubjectIcon icon={primarySubject?.icon} color={primarySubject?.color} />

            {/* Color bar */}
            <div
                className="shrink-0 w-1 rounded-full self-stretch my-0.5"
                style={{ backgroundColor: primarySubject?.color || "#0a1bb6" }}
            />

            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-brand-primary truncate">
                    {session.title || session.subjects?.map((s) => s.name).join(", ") || "Sessão"}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-brand-primary/35 font-medium tabular-nums">
                        {format(start, "HH:mm")} — {format(end, "HH:mm")}
                    </span>
                    {session.teacher_name && (
                        <>
                            <span className="text-brand-primary/15">·</span>
                            <span className="text-[11px] text-brand-primary/35">
                                {session.teacher_name}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Subject badges */}
            {session.title && session.subjects && session.subjects.length > 0 && (
                <div className="flex gap-1 shrink-0">
                    {session.subjects.slice(0, 2).map((subj) => (
                        <Badge
                            key={subj.id}
                            variant="outline"
                            className="text-[10px] h-5 gap-1 whitespace-nowrap border-0 font-medium"
                            style={{
                                backgroundColor: subj.color ? `${subj.color}12` : undefined,
                                color: subj.color || undefined,
                            }}
                        >
                            {subj.name}
                        </Badge>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Past day group (compact) ──────────────────────────────────

function PastDayGroup({ dateKey, sessions }: { dateKey: string; sessions: StudentSession[] }) {
    const day = parseISO(dateKey);

    return (
        <div>
            <div className="px-4 pt-3 pb-1">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-brand-primary/30">
                    {format(day, "EEEE, d MMM", { locale: pt })}
                </h3>
            </div>
            <div className="divide-y divide-brand-primary/[0.03]">
                {sessions.map((s) => (
                    <PastSessionCard key={s.id} session={s} />
                ))}
            </div>
        </div>
    );
}

// ── Collapsible month group (for past tab) ────────────────────

function MonthGroup({
    monthLabel,
    sessions,
    sessionCount,
    defaultOpen = false,
}: {
    monthLabel: string;
    sessions: StudentSession[];
    sessionCount: number;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);

    const grouped = sessions.reduce<Record<string, StudentSession[]>>((acc, s) => {
        const key = format(parseISO(s.starts_at), "yyyy-MM-dd");
        if (!acc[key]) acc[key] = [];
        acc[key].push(s);
        return acc;
    }, {});
    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    return (
        <div className="rounded-2xl border border-brand-primary/[0.06] bg-white overflow-hidden">
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-brand-primary/[0.02] transition-colors"
            >
                <div className="flex items-center gap-2.5">
                    <ChevronRight
                        className={cn(
                            "h-3.5 w-3.5 text-brand-primary/30 transition-transform duration-200",
                            open && "rotate-90"
                        )}
                    />
                    <span className="text-sm font-semibold text-brand-primary capitalize">
                        {monthLabel}
                    </span>
                </div>
                <span className="text-[11px] text-brand-primary/35 font-medium tabular-nums">
                    {sessionCount} {sessionCount === 1 ? "sessão" : "sessões"}
                </span>
            </button>

            {open && (
                <div className="border-t border-brand-primary/[0.04] pb-2">
                    {sortedDates.map((dateKey) => (
                        <PastDayGroup key={dateKey} dateKey={dateKey} sessions={grouped[dateKey]} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────

export default function StudentSessionsPage() {
    const [referenceDate] = useState(() => new Date());
    const [activeTab, setActiveTab] = useState<StudentSessionsTab>("upcoming");
    const ranges = useMemo(
        () => buildStudentSessionsRanges(referenceDate),
        [referenceDate],
    );

    const upcomingQuery = useCalendarSessionsQuery({
        ...ranges.upcoming,
        enabled: true,
    });
    const pastQuery = useCalendarSessionsQuery({
        ...ranges.past,
        enabled: activeTab === "past",
    });

    const activeQuery = activeTab === "upcoming" ? upcomingQuery : pastQuery;
    const sessions = (activeQuery.data as StudentSession[] | undefined) ?? EMPTY_SESSIONS;
    const loading = activeQuery.isLoading && !activeQuery.data;
    const error = Boolean(activeQuery.error) && !activeQuery.data;

    useEffect(() => {
        let cancelled = false;

        const scheduleWindow = window as Window & {
            requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
            cancelIdleCallback?: (handle: number) => void;
        };

        const warmPastTab = () => {
            if (cancelled) return;
            void prefetchStudentSessionsTab("past", referenceDate);
        };

        if (scheduleWindow.requestIdleCallback) {
            const idleHandle = scheduleWindow.requestIdleCallback(warmPastTab, { timeout: 2000 });
            return () => {
                cancelled = true;
                scheduleWindow.cancelIdleCallback?.(idleHandle);
            };
        }

        const timeoutId = window.setTimeout(warmPastTab, 1000);
        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [referenceDate]);

    const handleRetry = () => {
        void activeQuery.refetch();
    };

    // ── Upcoming: group by date ───────────────────────────────
    const groupedByDate = useMemo(
        () =>
            sessions.reduce<Record<string, StudentSession[]>>((acc, s) => {
                const key = format(parseISO(s.starts_at), "yyyy-MM-dd");
                if (!acc[key]) acc[key] = [];
                acc[key].push(s);
                return acc;
            }, {}),
        [sessions],
    );
    const sortedUpcomingDates = useMemo(() => Object.keys(groupedByDate).sort(), [groupedByDate]);

    // ── Past: group by month ──────────────────────────────────
    const groupedByMonth = useMemo(
        () =>
            sessions.reduce<Record<string, StudentSession[]>>((acc, s) => {
                const key = format(parseISO(s.starts_at), "yyyy-MM");
                if (!acc[key]) acc[key] = [];
                acc[key].push(s);
                return acc;
            }, {}),
        [sessions],
    );
    const sortedMonths = useMemo(
        () => Object.keys(groupedByMonth).sort((a, b) => b.localeCompare(a)),
        [groupedByMonth],
    );

    return (
        <div className="max-w-4xl w-full">
            {/* Header row — title + pill on same row, aligned with sidebar toggle */}
            <div className="-mt-12 lg:mt-0 pl-14 lg:pl-0 flex items-center justify-between gap-4">
                <h1 className="font-instrument text-3xl text-brand-primary leading-10">
                    Sessões
                </h1>

                {/* Tab toggle — top right, same row as h1 */}
                <PillSwitch
                    options={[
                        { value: "upcoming" as StudentSessionsTab, label: "Próximas", icon: <CalendarDays className="h-3.5 w-3.5" /> },
                        { value: "past" as StudentSessionsTab, label: "Anteriores", icon: <History className="h-3.5 w-3.5" /> },
                    ]}
                    value={activeTab}
                    onChange={(v) => startTransition(() => setActiveTab(v))}
                    buttonProps={(opt) => ({
                        onMouseEnter: () => void prefetchStudentSessionsTab(opt.value as StudentSessionsTab, referenceDate),
                        onFocus: () => void prefetchStudentSessionsTab(opt.value as StudentSessionsTab, referenceDate),
                    })}
                />
            </div>

            {/* Subtitle — below header row */}
            <p className="text-sm text-brand-primary/50 mt-2 mb-6">
                {activeTab === "upcoming"
                    ? "As tuas próximas sessões agendadas"
                    : "Histórico de sessões anteriores"}
            </p>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin h-6 w-6 border-2 border-brand-accent border-t-transparent rounded-full" />
                </div>
            ) : error ? (
                <div className="text-center py-20 text-brand-primary/40">
                    <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="text-base font-medium text-brand-primary/50">
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
                    <div className="text-center py-20 text-brand-primary/25">
                        <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-50" />
                        <p className="text-base font-medium">Nenhuma sessão agendada</p>
                        <p className="text-sm mt-1 text-brand-primary/35">
                            As tuas sessões futuras aparecerão aqui.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {sortedUpcomingDates.map((dateKey) => (
                            <DayGroup
                                key={dateKey}
                                dateKey={dateKey}
                                sessions={groupedByDate[dateKey]}
                            />
                        ))}
                    </div>
                )
            ) : (
                sortedMonths.length === 0 ? (
                    <div className="text-center py-20 text-brand-primary/25">
                        <History className="h-10 w-10 mx-auto mb-3 opacity-50" />
                        <p className="text-base font-medium">Sem sessões anteriores</p>
                        <p className="text-sm mt-1 text-brand-primary/35">
                            As tuas sessões passadas aparecerão aqui.
                        </p>
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
                                    sessionCount={groupedByMonth[monthKey].length}
                                    defaultOpen={idx === 0}
                                />
                            );
                        })}
                    </div>
                )
            )}
        </div>
    );
}
