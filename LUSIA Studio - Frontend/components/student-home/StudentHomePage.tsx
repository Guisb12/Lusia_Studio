"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { pt } from "date-fns/locale";
import {
    CalendarDays,
    ClipboardList,
    GraduationCap,
    Clock,
    Users,
    StickyNote,
    ChevronRight,
    Sparkles,
    Calendar,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useUser } from "@/components/providers/UserProvider";
import { useChatSessions } from "@/components/providers/ChatSessionsProvider";
import { ChatInput } from "@/components/chat/ChatInput";
import {
    fetchMyAssignments,
    type StudentAssignment,
    STUDENT_STATUS_LABELS,
    STUDENT_STATUS_COLORS,
} from "@/lib/assignments";
import { fetchMemberStats, type MemberStats } from "@/lib/members";

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
        <div className="rounded-xl bg-white border border-brand-primary/5 p-3 text-center flex flex-col items-center gap-1.5">
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
    );
}

/* ── Due Date Helper ─────────────────────────────────────────── */

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

/* ── Main Component ──────────────────────────────────────────── */

export function StudentHomePage() {
    const { user } = useUser();
    const router = useRouter();
    const { createConversation } = useChatSessions();

    const [sessions, setSessions] = useState<UpcomingSession[]>([]);
    const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
    const [stats, setStats] = useState<MemberStats | null>(null);
    const [loading, setLoading] = useState(true);

    const handleChatSend = async (text: string) => {
        // Store the message so ChatPage can pick it up after navigation
        sessionStorage.setItem("lusia:pending-chat-message", text);
        const id = await createConversation();
        if (id) {
            router.push("/student/chat");
        }
    };

    useEffect(() => {
        if (!user?.id) return;

        (async () => {
            try {
                const now = new Date();
                const futureEnd = new Date(now);
                futureEnd.setMonth(now.getMonth() + 3);

                const params = new URLSearchParams({
                    start_date: now.toISOString(),
                    end_date: futureEnd.toISOString(),
                });

                const [sessionsRes, assignmentsData, statsData] = await Promise.all([
                    fetch(`/api/calendar/sessions?${params.toString()}`)
                        .then((r) => (r.ok ? r.json() : []))
                        .catch(() => []),
                    fetchMyAssignments().catch(() => []),
                    fetchMemberStats(user.id).catch(() => null),
                ]);

                setSessions(sessionsRes);
                setAssignments(assignmentsData);
                setStats(statsData);
            } catch (e) {
                console.error("Failed to load dashboard:", e);
            } finally {
                setLoading(false);
            }
        })();
    }, [user?.id]);

    const pendingAssignments = assignments.filter(
        (a) => a.status === "not_started" || a.status === "in_progress"
    );

    // Sort by due date (soonest first), take top 3
    const urgentAssignments = [...pendingAssignments]
        .sort((a, b) => {
            const da = a.assignment?.due_date;
            const db = b.assignment?.due_date;
            if (!da && !db) return 0;
            if (!da) return 1;
            if (!db) return -1;
            return new Date(da).getTime() - new Date(db).getTime();
        })
        .slice(0, 3);

    const nextSession = sessions[0] || null;

    const todayFormatted = format(new Date(), "EEEE, d 'de' MMMM", { locale: pt });

    const displayName = user?.display_name || user?.full_name || "Aluno";

    return (
        <div className="max-w-lg mx-auto w-full pb-24">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="space-y-5"
            >
                {/* Welcome */}
                <header>
                    <h1 className="text-3xl font-normal font-instrument text-brand-primary">
                        Olá, {displayName}!
                    </h1>
                    <p className="text-brand-primary/50 mt-0.5 text-sm capitalize">
                        {todayFormatted}
                    </p>
                </header>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="animate-spin h-6 w-6 border-2 border-brand-accent border-t-transparent rounded-full" />
                    </div>
                ) : (
                    <>
                        {/* Quick Stats */}
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
                                    stats?.average_grade != null
                                        ? `${Math.round(stats.average_grade)}%`
                                        : "—"
                                }
                                label="Nota média"
                                accent="bg-emerald-50 text-emerald-600"
                            />
                        </div>

                        {/* Next Session */}
                        <section>
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-xs font-semibold text-brand-primary/40 uppercase tracking-wider">
                                    Próxima Sessão
                                </h2>
                                <Link
                                    href="/student/sessions"
                                    className="text-xs text-brand-accent hover:underline flex items-center gap-0.5"
                                >
                                    Ver todas
                                    <ChevronRight className="h-3 w-3" />
                                </Link>
                            </div>

                            {nextSession ? (
                                <Link href="/student/sessions" className="block">
                                    <NextSessionCard session={nextSession} />
                                </Link>
                            ) : (
                                <div className="rounded-xl border border-brand-primary/5 bg-white p-6 text-center">
                                    <CalendarDays className="h-8 w-8 mx-auto mb-2 text-brand-primary/20" />
                                    <p className="text-sm text-brand-primary/40">
                                        Sem sessões agendadas
                                    </p>
                                </div>
                            )}
                        </section>

                        {/* Urgent Assignments */}
                        <section>
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-xs font-semibold text-brand-primary/40 uppercase tracking-wider">
                                    TPC Pendentes
                                </h2>
                                <Link
                                    href="/student/assignments"
                                    className="text-xs text-brand-accent hover:underline flex items-center gap-0.5"
                                >
                                    Ver todos
                                    <ChevronRight className="h-3 w-3" />
                                </Link>
                            </div>

                            {urgentAssignments.length > 0 ? (
                                <div className="space-y-2">
                                    {urgentAssignments.map((sa) => (
                                        <AssignmentCard key={sa.id} studentAssignment={sa} />
                                    ))}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-brand-primary/5 bg-white p-6 text-center">
                                    <Sparkles className="h-8 w-8 mx-auto mb-2 text-brand-primary/20" />
                                    <p className="text-sm text-brand-primary/40">
                                        Tudo em dia! Sem TPC pendentes.
                                    </p>
                                </div>
                            )}
                        </section>
                    </>
                )}
            </motion.div>

            {/* Floating Chat Input */}
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

/* ── Next Session Card ───────────────────────────────────────── */

function NextSessionCard({ session }: { session: UpcomingSession }) {
    const start = parseISO(session.starts_at);
    const end = parseISO(session.ends_at);
    const color = session.subjects?.[0]?.color || "#0a1bb6";
    const today = isToday(start);
    const tomorrow = isTomorrow(start);

    return (
        <div
            className="rounded-xl border border-brand-primary/10 bg-white p-4 hover:shadow-sm transition-shadow"
            style={{ borderLeftWidth: "4px", borderLeftColor: color }}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    {/* Date + badge */}
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-brand-primary/40">
                            {format(start, "EEEE, d MMM", { locale: pt })}
                        </span>
                        {today && (
                            <Badge className="text-[10px] h-4 bg-brand-accent/10 text-brand-accent border-0">
                                Hoje
                            </Badge>
                        )}
                        {tomorrow && (
                            <Badge className="text-[10px] h-4 bg-amber-50 text-amber-600 border-0">
                                Amanhã
                            </Badge>
                        )}
                    </div>

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
                            <span>Prof. {session.teacher_name}</span>
                        </div>
                    )}

                    {/* Notes */}
                    {session.teacher_notes && (
                        <div className="flex items-start gap-1.5 mt-2 text-xs text-brand-primary/60 bg-brand-primary/[0.03] rounded-lg p-2">
                            <StickyNote className="h-3 w-3 mt-0.5 shrink-0" />
                            <span className="line-clamp-2">{session.teacher_notes}</span>
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

/* ── Assignment Card ─────────────────────────────────────────── */

function AssignmentCard({ studentAssignment }: { studentAssignment: StudentAssignment }) {
    const a = studentAssignment.assignment;
    const dueInfo = formatDueDate(a?.due_date);

    return (
        <Link href="/student/assignments" className="block">
            <div className="rounded-xl border border-brand-primary/5 bg-white p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-brand-primary truncate">
                            {a?.title || "TPC sem título"}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                            <Badge
                                className={cn(
                                    "text-[10px] h-5 border-0",
                                    STUDENT_STATUS_COLORS[studentAssignment.status]
                                )}
                            >
                                {STUDENT_STATUS_LABELS[studentAssignment.status]}
                            </Badge>
                            {dueInfo && (
                                <span className={cn("text-xs flex items-center gap-1", dueInfo.color)}>
                                    <Calendar className="h-3 w-3" />
                                    {dueInfo.text}
                                </span>
                            )}
                        </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-brand-primary/20 shrink-0 mt-1" />
                </div>
            </div>
        </Link>
    );
}
