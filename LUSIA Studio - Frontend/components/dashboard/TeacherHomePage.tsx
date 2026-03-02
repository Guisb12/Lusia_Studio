"use client";

import React, { useState, useEffect, useCallback } from "react";
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
    Copy,
    Check,
    RefreshCw,
    Loader2,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useUser } from "@/components/providers/UserProvider";
import { fetchClasses } from "@/lib/classes";
import { fetchMembers } from "@/lib/members";
import {
    fetchAssignments,
    type Assignment,
    ASSIGNMENT_STATUS_LABELS,
} from "@/lib/assignments";

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

interface EnrollmentInfo {
    student_enrollment_code?: string;
    teacher_enrollment_code?: string;
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
    if (d < now) return { text: "Expirado", color: "text-red-500" };
    if (days === 0) return { text: `Hoje, ${time}`, color: "text-amber-600" };
    if (days === 1) return { text: `Amanhã, ${time}`, color: "text-amber-600" };
    if (days <= 3) return { text: `${days} dias, ${time}`, color: "text-amber-500" };
    return {
        text: `${d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}, ${time}`,
        color: "text-brand-primary/50",
    };
}

/* ── Main Component ──────────────────────────────────────────── */

export function TeacherHomePage() {
    const { user } = useUser();
    const isAdmin = user?.role === "admin";

    const [sessions, setSessions] = useState<UpcomingSession[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [classCount, setClassCount] = useState(0);
    const [studentCount, setStudentCount] = useState(0);
    const [enrollmentInfo, setEnrollmentInfo] = useState<EnrollmentInfo | null>(null);
    const [loading, setLoading] = useState(true);

    // Enrollment code UI state
    const [copiedCode, setCopiedCode] = useState<"student" | "teacher" | null>(null);
    const [rotatingStudent, setRotatingStudent] = useState(false);
    const [rotatingTeacher, setRotatingTeacher] = useState(false);

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

                const [sessionsRes, classesData, studentsData, assignmentsData, enrollRes] =
                    await Promise.all([
                        fetch(`/api/calendar/sessions?${params.toString()}`)
                            .then((r) => (r.ok ? r.json() : []))
                            .catch(() => []),
                        fetchClasses(true).catch(() => ({ data: [], total: 0 })),
                        fetchMembers("student", "active", 1, 1).catch(() => ({ total: 0 })),
                        fetchAssignments("published").catch(() => []),
                        user.organization_id
                            ? fetch(`/api/organizations/${user.organization_id}/enrollment-info`)
                                  .then((r) => (r.ok ? r.json() : null))
                                  .catch(() => null)
                            : Promise.resolve(null),
                    ]);

                setSessions(sessionsRes);
                setClassCount(classesData.total ?? classesData.data?.length ?? 0);
                setStudentCount(studentsData.total ?? 0);
                setAssignments(assignmentsData);
                setEnrollmentInfo(enrollRes);
            } catch (e) {
                console.error("Failed to load dashboard:", e);
            } finally {
                setLoading(false);
            }
        })();
    }, [user?.id, user?.organization_id]);

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
                    setEnrollmentInfo((p) => (p ? { ...p, ...d } : d));
                }
            } finally {
                type === "student" ? setRotatingStudent(false) : setRotatingTeacher(false);
            }
        },
        [user?.organization_id]
    );

    // Sort assignments by due date (soonest first), take top 3
    const upcomingAssignments = [...assignments]
        .sort((a, b) => {
            if (!a.due_date && !b.due_date) return 0;
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        })
        .slice(0, 3);

    const nextSession = sessions[0] || null;

    const todayFormatted = format(new Date(), "EEEE, d 'de' MMMM", { locale: pt });

    const displayName = user?.display_name || user?.full_name || "Professor";

    return (
        <div className="max-w-lg mx-auto w-full pb-12">
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
                                icon={Users}
                                value={classCount}
                                label="Turmas ativas"
                                accent="bg-blue-50 text-blue-600"
                            />
                            <StatCard
                                icon={GraduationCap}
                                value={studentCount}
                                label="Alunos"
                                accent="bg-emerald-50 text-emerald-600"
                            />
                            <StatCard
                                icon={CalendarDays}
                                value={sessions.length}
                                label="Próximas sessões"
                                accent="bg-amber-50 text-amber-600"
                            />
                        </div>

                        {/* Next Session */}
                        <section>
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-xs font-semibold text-brand-primary/40 uppercase tracking-wider">
                                    Próxima Sessão
                                </h2>
                                <Link
                                    href="/dashboard/calendar"
                                    className="text-xs text-brand-accent hover:underline flex items-center gap-0.5"
                                >
                                    Ver todas
                                    <ChevronRight className="h-3 w-3" />
                                </Link>
                            </div>

                            {nextSession ? (
                                <Link href="/dashboard/calendar" className="block">
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

                        {/* Enrollment Codes */}
                        {enrollmentInfo && (
                            <section>
                                <h2 className="text-xs font-semibold text-brand-primary/40 uppercase tracking-wider mb-2">
                                    Códigos de Inscrição
                                </h2>
                                <div className="rounded-xl border border-brand-primary/5 bg-white p-4 space-y-4">
                                    {/* Student code — always visible */}
                                    <EnrollmentCodeRow
                                        type="student"
                                        label="Alunos"
                                        icon={GraduationCap}
                                        code={enrollmentInfo.student_enrollment_code}
                                        copied={copiedCode === "student"}
                                        rotating={rotatingStudent}
                                        canRotate={isAdmin}
                                        onCopy={handleCopy}
                                        onRotate={handleRotateCode}
                                    />
                                    {/* Teacher code — admin only */}
                                    {isAdmin && enrollmentInfo.teacher_enrollment_code && (
                                        <EnrollmentCodeRow
                                            type="teacher"
                                            label="Professores"
                                            icon={Users}
                                            code={enrollmentInfo.teacher_enrollment_code}
                                            copied={copiedCode === "teacher"}
                                            rotating={rotatingTeacher}
                                            canRotate={true}
                                            onCopy={handleCopy}
                                            onRotate={handleRotateCode}
                                        />
                                    )}
                                    <p className="text-[10px] text-brand-primary/30 pt-1">
                                        Partilha {isAdmin ? "estes códigos" : "este código"} para
                                        que {isAdmin ? "alunos e professores se possam" : "os alunos se possam"} inscrever
                                        no teu centro.
                                    </p>
                                </div>
                            </section>
                        )}

                        {/* Recent Assignments */}
                        <section>
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-xs font-semibold text-brand-primary/40 uppercase tracking-wider">
                                    TPCs Ativos
                                </h2>
                                <Link
                                    href="/dashboard/assignments"
                                    className="text-xs text-brand-accent hover:underline flex items-center gap-0.5"
                                >
                                    Ver todos
                                    <ChevronRight className="h-3 w-3" />
                                </Link>
                            </div>

                            {upcomingAssignments.length > 0 ? (
                                <div className="space-y-2">
                                    {upcomingAssignments.map((a) => (
                                        <AssignmentCard key={a.id} assignment={a} />
                                    ))}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-brand-primary/5 bg-white p-6 text-center">
                                    <Sparkles className="h-8 w-8 mx-auto mb-2 text-brand-primary/20" />
                                    <p className="text-sm text-brand-primary/40">
                                        Sem TPCs ativos de momento.
                                    </p>
                                </div>
                            )}
                        </section>
                    </>
                )}
            </motion.div>
        </div>
    );
}

/* ── Enrollment Code Row ─────────────────────────────────────── */

function EnrollmentCodeRow({
    type,
    label,
    icon: Icon,
    code,
    copied,
    rotating,
    canRotate,
    onCopy,
    onRotate,
}: {
    type: "student" | "teacher";
    label: string;
    icon: React.ElementType;
    code?: string;
    copied: boolean;
    rotating: boolean;
    canRotate: boolean;
    onCopy: (code: string, type: "student" | "teacher") => void;
    onRotate: (type: "student" | "teacher") => void;
}) {
    return (
        <div>
            <div className="flex items-center gap-1.5 mb-2">
                <Icon className="h-3.5 w-3.5 text-brand-primary/35" />
                <p className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider">
                    Código de {label}
                </p>
            </div>
            <div className="flex items-center gap-2">
                <code className="flex-1 bg-brand-primary/[0.04] border border-brand-primary/10 px-3 py-2 rounded-xl text-xs font-mono text-brand-primary truncate">
                    {code || "—"}
                </code>
                <button
                    onClick={() => code && onCopy(code, type)}
                    className="h-9 w-9 rounded-xl bg-brand-primary/[0.04] border border-brand-primary/10 flex items-center justify-center text-brand-primary/35 hover:bg-brand-primary/[0.08] hover:text-brand-primary transition-all shrink-0"
                >
                    {copied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                        <Copy className="h-3.5 w-3.5" />
                    )}
                </button>
                {canRotate && (
                    <button
                        onClick={() => void onRotate(type)}
                        disabled={rotating}
                        className="h-9 w-9 rounded-xl bg-brand-primary/[0.04] border border-brand-primary/10 flex items-center justify-center text-brand-primary/35 hover:bg-brand-primary/[0.08] hover:text-brand-primary transition-all shrink-0 disabled:opacity-40"
                    >
                        {rotating ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                        )}
                    </button>
                )}
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

                    <div className="flex items-center gap-1.5 text-brand-primary">
                        <Clock className="h-4 w-4 shrink-0 opacity-40" />
                        <span className="text-sm font-semibold">
                            {format(start, "HH:mm")} — {format(end, "HH:mm")}
                        </span>
                    </div>

                    {session.title && (
                        <p className="text-sm font-medium text-brand-primary mt-1">
                            {session.title}
                        </p>
                    )}

                    {session.teacher_notes && (
                        <div className="flex items-start gap-1.5 mt-2 text-xs text-brand-primary/60 bg-brand-primary/[0.03] rounded-lg p-2">
                            <StickyNote className="h-3 w-3 mt-0.5 shrink-0" />
                            <span className="line-clamp-2">{session.teacher_notes}</span>
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

/* ── Assignment Card ─────────────────────────────────────────── */

function AssignmentCard({ assignment }: { assignment: Assignment }) {
    const dueInfo = formatDueDate(assignment.due_date);

    return (
        <Link href="/dashboard/assignments" className="block">
            <div className="rounded-xl border border-brand-primary/5 bg-white p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-brand-primary truncate">
                            {assignment.title || "TPC sem título"}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                            <Badge className="text-[10px] h-5 border-0 bg-blue-50 text-blue-700">
                                {ASSIGNMENT_STATUS_LABELS[assignment.status] || assignment.status}
                            </Badge>
                            {assignment.student_count != null && (
                                <span className="text-xs text-brand-primary/40 flex items-center gap-1">
                                    <GraduationCap className="h-3 w-3" />
                                    {assignment.submitted_count ?? 0}/{assignment.student_count}
                                </span>
                            )}
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
