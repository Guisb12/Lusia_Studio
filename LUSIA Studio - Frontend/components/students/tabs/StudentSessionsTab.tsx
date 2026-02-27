"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Calendar, Clock } from "lucide-react";
import { fetchMemberSessions, type MemberSession } from "@/lib/members";

interface StudentSessionsTabProps {
    studentId: string;
}

export function StudentSessionsTab({ studentId }: StudentSessionsTabProps) {
    const [sessions, setSessions] = useState<MemberSession[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchMemberSessions(studentId)
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
    }, [studentId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
            </div>
        );
    }

    // Compute summary
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sessionsThisMonth = sessions.filter(
        (s) => new Date(s.starts_at) >= monthStart,
    ).length;

    const upcomingSessions = sessions.filter(
        (s) => new Date(s.starts_at) > now,
    );
    const pastSessions = sessions.filter(
        (s) => new Date(s.starts_at) <= now,
    );

    return (
        <div>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-3 text-center">
                    <p className="text-2xl font-semibold text-brand-primary">
                        {sessionsThisMonth}
                    </p>
                    <p className="text-[10px] text-brand-primary/40 mt-0.5">Este mes</p>
                </div>
                <div className="rounded-xl bg-brand-primary/[0.03] border border-brand-primary/5 p-3 text-center">
                    <p className="text-2xl font-semibold text-brand-primary">
                        {sessions.length}
                    </p>
                    <p className="text-[10px] text-brand-primary/40 mt-0.5">Total</p>
                </div>
            </div>

            {sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Calendar className="h-8 w-8 text-brand-primary/20 mb-2" />
                    <p className="text-sm text-brand-primary/40">
                        Sem sessoes registadas.
                    </p>
                </div>
            ) : (
                <div className="space-y-1">
                    {/* Upcoming */}
                    {upcomingSessions.length > 0 && (
                        <>
                            <h4 className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider mb-2">
                                Proximas
                            </h4>
                            {upcomingSessions.map((session, i) => (
                                <SessionItem key={session.id} session={session} index={i} />
                            ))}
                        </>
                    )}

                    {/* Past */}
                    {pastSessions.length > 0 && (
                        <>
                            <h4 className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider mb-2 mt-4">
                                Anteriores
                            </h4>
                            {pastSessions.slice(0, 20).map((session, i) => (
                                <SessionItem key={session.id} session={session} index={i} />
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function SessionItem({ session, index }: { session: MemberSession; index: number }) {
    const date = new Date(session.starts_at);
    const endDate = new Date(session.ends_at);

    const dateStr = date.toLocaleDateString("pt-PT", {
        day: "numeric",
        month: "short",
    });
    const timeStr = `${date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })} - ${endDate.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`;

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.02 }}
            className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-brand-primary/[0.02] transition-colors"
        >
            <div className="h-8 w-8 rounded-lg bg-brand-primary/5 flex items-center justify-center shrink-0">
                <Calendar className="h-4 w-4 text-brand-primary/40" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm text-brand-primary truncate">
                    {session.title || dateStr}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-brand-primary/40 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeStr}
                    </span>
                    {session.subjects?.map((subj) => (
                        <span
                            key={subj.id}
                            className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                            style={{
                                backgroundColor: subj.color ? `${subj.color}15` : undefined,
                                color: subj.color || undefined,
                            }}
                        >
                            {subj.name}
                        </span>
                    ))}
                </div>
            </div>
            <span className="text-[10px] text-brand-primary/30 shrink-0">{dateStr}</span>
        </motion.div>
    );
}
