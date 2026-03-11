"use client";

import React, { useState, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import { EventCalendar, CalendarSession } from "@/components/calendar/EventCalendar";
import { SessionFormData } from "@/components/calendar/SessionFormDialog";
import {
    RecurrenceEditScopeDialog,
    EditScope,
    ScopeAction,
} from "@/components/calendar/RecurrenceEditScopeDialog";
import { useUser } from "@/components/providers/UserProvider";
import { cachedFetch, cacheInvalidate, cacheSet } from "@/lib/cache";
import { usePrimaryClass } from "@/lib/hooks/usePrimaryClass";
import { generateRecurrenceDates } from "@/lib/recurrence";

const CACHE_PREFIX = "calendar:sessions";
const SESSION_CACHE_TTL = 120_000; // 2 minutes — cleared on create/update/delete

interface CalendarShellProps {
    initialSessions: CalendarSession[];
    initialStart: string;
    initialEnd: string;
}

// Pending action waiting for scope selection
interface PendingRecurrenceAction {
    sessionId: string;
    data?: SessionFormData; // present for edits
    action: ScopeAction;
}

export function CalendarShell({ initialSessions, initialStart, initialEnd }: CalendarShellProps) {
    const { user } = useUser();
    const { primaryClassId } = usePrimaryClass();
    const [sessions, setSessions] = useState<CalendarSession[]>(initialSessions);
    const [adminViewAll, setAdminViewAll] = useState(true);

    // Scope dialog state
    const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState<PendingRecurrenceAction | null>(null);

    const dateRangeRef = useRef<{ start: Date; end: Date } | null>(null);

    const isAdmin = user?.role === "admin";

    // Seed the client cache with server-provided data
    const initialCacheKey = `${CACHE_PREFIX}:${initialStart}:${initialEnd}`;
    cacheSet(initialCacheKey, initialSessions, SESSION_CACHE_TTL);

    const visibleSessions = useMemo(() => {
        if (isAdmin && !adminViewAll && user?.id) {
            return sessions.filter((s) => s.teacher_id === user.id);
        }
        return sessions;
    }, [sessions, isAdmin, adminViewAll, user?.id]);

    const fetchSessions = useCallback(async (start: Date, end: Date) => {
        const cacheKey = `${CACHE_PREFIX}:${start.toISOString()}:${end.toISOString()}`;
        try {
            const data = await cachedFetch<CalendarSession[]>(cacheKey, async () => {
                const params = new URLSearchParams({
                    start_date: start.toISOString(),
                    end_date: end.toISOString(),
                });
                const res = await fetch(`/api/calendar/sessions?${params.toString()}`);
                if (!res.ok) return [];
                return res.json();
            }, SESSION_CACHE_TTL);
            setSessions(data);
        } catch (e) {
            console.error("Failed to fetch sessions:", e);
        }
    }, []);

    const handleDateRangeChange = useCallback(
        (start: Date, end: Date) => {
            dateRangeRef.current = { start, end };
            fetchSessions(start, end);
        },
        [fetchSessions]
    );

    const refetchFromServer = useCallback(() => {
        cacheInvalidate(CACHE_PREFIX);
        const dr = dateRangeRef.current;
        if (dr) fetchSessions(dr.start, dr.end);
    }, [fetchSessions]);

    const parseDates = (data: SessionFormData) => {
        const [sH, sM] = data.startTime.split(":").map(Number);
        const [eH, eM] = data.endTime.split(":").map(Number);
        const startsAt = new Date(data.date);
        startsAt.setHours(sH, sM, 0, 0);
        const endsAt = new Date(data.date);
        endsAt.setHours(eH, eM, 0, 0);
        return { startsAt, endsAt };
    };

    // ── Create ───────────────────────────────────────────────────

    const handleCreateSession = useCallback(
        async (data: SessionFormData) => {
            const { startsAt, endsAt } = parseDates(data);

            if (data.recurrence?.rule) {
                // ── Batch recurrence creation ──
                const dates = generateRecurrenceDates(data.recurrence.rule, data.date);
                const duration = endsAt.getTime() - startsAt.getTime();
                const tempGroupId = `temp-group-${Date.now()}`;

                const [sH, sM] = data.startTime.split(":").map(Number);
                const [eH, eM] = data.endTime.split(":").map(Number);

                const optimistics: CalendarSession[] = dates.map((d, idx) => {
                    const start = new Date(d);
                    start.setHours(sH, sM, 0, 0);
                    const end = new Date(d);
                    end.setHours(eH, eM, 0, 0);
                    return {
                        id: `temp-${Date.now()}-${idx}`,
                        organization_id: user?.organization_id || "",
                        teacher_id: data.teacherId || user?.id || "",
                        student_ids: data.students.map((s) => s.id),
                        starts_at: start.toISOString(),
                        ends_at: end.toISOString(),
                        title: data.title || null,
                        subject_ids: data.subjects.map((s) => s.id),
                        teacher_notes: data.teacherNotes || null,
                        teacher_name: user?.display_name || user?.full_name || null,
                        students: data.students.map((s) => ({
                            id: s.id,
                            full_name: s.full_name ?? undefined,
                            display_name: s.display_name ?? undefined,
                            avatar_url: s.avatar_url ?? undefined,
                            grade_level: s.grade_level ?? undefined,
                            course: s.course ?? undefined,
                        })),
                        subjects: data.subjects.map((s) => ({
                            id: s.id,
                            name: s.name,
                            color: s.color ?? undefined,
                        })),
                        session_type_id: data.sessionTypeId,
                        recurrence_group_id: tempGroupId,
                        recurrence_index: idx,
                    };
                });

                setSessions((prev) => [...prev, ...optimistics]);
                toast.success(`${dates.length} sessões criadas com sucesso.`);

                const body = {
                    student_ids: data.students.map((s) => s.id),
                    session_type_id: data.sessionTypeId,
                    starts_at: startsAt.toISOString(),
                    ends_at: endsAt.toISOString(),
                    title: data.title || undefined,
                    subject_ids: data.subjects.length > 0 ? data.subjects.map((s) => s.id) : undefined,
                    teacher_notes: data.teacherNotes || undefined,
                    teacher_id: isAdmin && data.teacherId ? data.teacherId : undefined,
                    recurrence: data.recurrence,
                };

                const tempIds = new Set(optimistics.map((o) => o.id));

                fetch("/api/calendar/sessions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                })
                    .then(async (res) => {
                        if (!res.ok) throw new Error("batch create failed");
                        const result = await res.json();
                        // result shape: { sessions: CalendarSession[], recurrence_group_id, count }
                        const realSessions: CalendarSession[] = result.sessions || [];
                        setSessions((prev) => [
                            ...prev.filter((s) => !tempIds.has(s.id)),
                            ...realSessions,
                        ]);
                        cacheInvalidate(CACHE_PREFIX);
                    })
                    .catch(() => {
                        setSessions((prev) => prev.filter((s) => !tempIds.has(s.id)));
                        toast.error("Não foi possível criar as sessões recorrentes.", {
                            description: "Verifica a ligação e tenta novamente.",
                        });
                    });

                return;
            }

            // ── Single session creation ──
            const tempId = `temp-${Date.now()}`;
            const optimistic: CalendarSession = {
                id: tempId,
                organization_id: user?.organization_id || "",
                teacher_id: data.teacherId || user?.id || "",
                student_ids: data.students.map((s) => s.id),
                starts_at: startsAt.toISOString(),
                ends_at: endsAt.toISOString(),
                title: data.title || null,
                subject_ids: data.subjects.map((s) => s.id),
                teacher_notes: data.teacherNotes || null,
                teacher_name: user?.display_name || user?.full_name || null,
                students: data.students.map((s) => ({
                    id: s.id,
                    full_name: s.full_name ?? undefined,
                    display_name: s.display_name ?? undefined,
                    avatar_url: s.avatar_url ?? undefined,
                    grade_level: s.grade_level ?? undefined,
                    course: s.course ?? undefined,
                })),
                subjects: data.subjects.map((s) => ({
                    id: s.id,
                    name: s.name,
                    color: s.color ?? undefined,
                })),
                session_type_id: data.sessionTypeId,
            };

            setSessions((prev) => [...prev, optimistic]);
            toast.success("Sessão criada com sucesso.");

            const body = {
                student_ids: data.students.map((s) => s.id),
                session_type_id: data.sessionTypeId,
                starts_at: startsAt.toISOString(),
                ends_at: endsAt.toISOString(),
                title: data.title || undefined,
                subject_ids: data.subjects.length > 0 ? data.subjects.map((s) => s.id) : undefined,
                teacher_notes: data.teacherNotes || undefined,
                teacher_id: isAdmin && data.teacherId ? data.teacherId : undefined,
            };

            fetch("/api/calendar/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            })
                .then(async (res) => {
                    if (!res.ok) throw new Error("create failed");
                    const created: CalendarSession = await res.json();
                    setSessions((prev) => prev.map((s) => (s.id === tempId ? created : s)));
                    cacheInvalidate(CACHE_PREFIX);
                })
                .catch(() => {
                    setSessions((prev) => prev.filter((s) => s.id !== tempId));
                    toast.error("Não foi possível criar a sessão.", {
                        description: "Verifica a ligação e tenta novamente.",
                    });
                });
        },
        [user, isAdmin]
    );

    // ── Update ───────────────────────────────────────────────────

    const _doUpdateSession = useCallback(
        async (id: string, data: SessionFormData, scope: EditScope) => {
            const { startsAt, endsAt } = parseDates(data);

            // Optimistic update
            setSessions((prev) =>
                prev.map((s): CalendarSession =>
                    s.id === id
                        ? {
                              ...s,
                              starts_at: startsAt.toISOString(),
                              ends_at: endsAt.toISOString(),
                              title: data.title || null,
                              student_ids: data.students.map((st) => st.id),
                              subject_ids: data.subjects.map((sub) => sub.id),
                              students: data.students.map((st) => ({
                                  id: st.id,
                                  full_name: st.full_name ?? undefined,
                                  display_name: st.display_name ?? undefined,
                                  avatar_url: st.avatar_url ?? undefined,
                                  grade_level: st.grade_level ?? undefined,
                                  course: st.course ?? undefined,
                              })),
                              subjects: data.subjects.map((sub) => ({
                                  id: sub.id,
                                  name: sub.name,
                                  color: sub.color ?? undefined,
                              })),
                              teacher_notes: data.teacherNotes || null,
                              session_type_id: data.sessionTypeId,
                          }
                        : s
                )
            );
            toast.success(scope === "this" ? "Sessão actualizada." : "Sessões actualizadas.");

            const body = {
                student_ids: data.students.map((s) => s.id),
                session_type_id: data.sessionTypeId,
                starts_at: startsAt.toISOString(),
                ends_at: endsAt.toISOString(),
                title: data.title || null,
                subject_ids: data.subjects.length > 0 ? data.subjects.map((s) => s.id) : [],
                teacher_notes: data.teacherNotes || null,
            };

            fetch(`/api/calendar/sessions/${id}?scope=${scope}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            })
                .then(async (res) => {
                    if (!res.ok) throw new Error("update failed");
                    const result = await res.json();
                    // Result may be a single session or an array (for scope=all/this_and_future)
                    const updated: CalendarSession[] = Array.isArray(result) ? result : [result];
                    const updatedIds = new Set(updated.map((s) => s.id));
                    setSessions((prev) => [
                        ...prev.filter((s) => !updatedIds.has(s.id)),
                        ...updated,
                    ]);
                    cacheInvalidate(CACHE_PREFIX);
                })
                .catch(() => {
                    refetchFromServer();
                    toast.error("Não foi possível actualizar a sessão.", {
                        description: "Verifica a ligação e tenta novamente.",
                    });
                });
        },
        [refetchFromServer]
    );

    // ── Delete ───────────────────────────────────────────────────

    const _doDeleteSession = useCallback(
        async (id: string, scope: EditScope) => {
            const session = sessions.find((s) => s.id === id);
            const groupId = session?.recurrence_group_id;

            // Optimistic removal
            if (scope === "all" && groupId) {
                setSessions((prev) => prev.filter((s) => s.recurrence_group_id !== groupId));
            } else if (scope === "this_and_future" && groupId && session?.recurrence_index != null) {
                const cutoff = session.recurrence_index;
                setSessions((prev) =>
                    prev.filter(
                        (s) =>
                            s.recurrence_group_id !== groupId ||
                            (s.recurrence_index != null && s.recurrence_index < cutoff)
                    )
                );
            } else {
                setSessions((prev) => prev.filter((s) => s.id !== id));
            }

            toast.success(scope === "this" ? "Sessão eliminada." : "Sessões eliminadas.");

            fetch(`/api/calendar/sessions/${id}?scope=${scope}`, { method: "DELETE" })
                .then(async (res) => {
                    if (!res.ok) throw new Error("delete failed");
                    cacheInvalidate(CACHE_PREFIX);
                })
                .catch(() => {
                    refetchFromServer();
                    toast.error("Não foi possível eliminar a sessão.", {
                        description: "Verifica a ligação e tenta novamente.",
                    });
                });
        },
        [sessions, refetchFromServer]
    );

    const handleUpdateSession = useCallback(
        async (id: string, data: SessionFormData) => {
            const session = sessions.find((s) => s.id === id);

            if (session?.recurrence_group_id) {
                // Existing recurring session → scope dialog
                setPendingAction({ sessionId: id, data, action: "edit" });
                setScopeDialogOpen(true);
            } else if (data.recurrence?.rule) {
                // Non-recurring session being converted to recurring:
                // Delete the original + create a new batch from its date
                await _doDeleteSession(id, "this");
                await handleCreateSession(data);
            } else {
                await _doUpdateSession(id, data, "this");
            }
        },
        [sessions, _doUpdateSession, _doDeleteSession, handleCreateSession]
    );

    const handleDeleteSession = useCallback(
        async (id: string) => {
            const session = sessions.find((s) => s.id === id);
            if (session?.recurrence_group_id) {
                setPendingAction({ sessionId: id, action: "delete" });
                setScopeDialogOpen(true);
            } else {
                await _doDeleteSession(id, "this");
            }
        },
        [sessions, _doDeleteSession]
    );

    // ── Scope dialog confirm ─────────────────────────────────────

    const handleScopeConfirm = useCallback(
        async (scope: EditScope) => {
            if (!pendingAction) return;
            setScopeDialogOpen(false);

            if (pendingAction.action === "edit" && pendingAction.data) {
                await _doUpdateSession(pendingAction.sessionId, pendingAction.data, scope);
            } else if (pendingAction.action === "delete") {
                await _doDeleteSession(pendingAction.sessionId, scope);
            }

            setPendingAction(null);
        },
        [pendingAction, _doUpdateSession, _doDeleteSession]
    );

    return (
        <div className="max-w-full mx-auto w-full h-full flex flex-col">
            <div className="flex flex-col h-full animate-fade-in-up">
                <header className="mb-4">
                    <h1 className="text-3xl font-normal font-instrument text-brand-primary">
                        Calendário
                    </h1>
                    <p className="text-brand-primary/70 mt-1">
                        Gere as tuas sessões e acompanha a agenda.
                    </p>
                </header>

                <div className="flex-1 min-h-0">
                    <EventCalendar
                        sessions={visibleSessions}
                        onCreateSession={handleCreateSession}
                        onUpdateSession={handleUpdateSession}
                        onDeleteSession={handleDeleteSession}
                        onDateRangeChange={handleDateRangeChange}
                        isAdmin={isAdmin}
                        adminViewAll={isAdmin ? adminViewAll : undefined}
                        onAdminViewAllChange={isAdmin ? setAdminViewAll : undefined}
                        primaryClassId={primaryClassId}
                        currentUserId={user?.id}
                        currentUserName={user?.display_name || user?.full_name || undefined}
                    />
                </div>
            </div>

            {/* Recurrence scope dialog */}
            <RecurrenceEditScopeDialog
                open={scopeDialogOpen}
                onOpenChange={(open) => {
                    setScopeDialogOpen(open);
                    if (!open) setPendingAction(null);
                }}
                action={pendingAction?.action ?? "edit"}
                onConfirm={handleScopeConfirm}
            />
        </div>
    );
}
