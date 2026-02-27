"use client";

import React, { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { EventCalendar, CalendarSession } from "@/components/calendar/EventCalendar";
import { SessionFormData } from "@/components/calendar/SessionFormDialog";
import { useUser } from "@/components/providers/UserProvider";
import { cachedFetch, cacheInvalidate } from "@/lib/cache";

const CACHE_PREFIX = "calendar:sessions";

interface CalendarShellProps {
    initialSessions: CalendarSession[];
    initialStart: string;
    initialEnd: string;
}

export function CalendarShell({ initialSessions, initialStart, initialEnd }: CalendarShellProps) {
    const { user } = useUser();
    const [sessions, setSessions] = useState<CalendarSession[]>(initialSessions);
    const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(null);
    // Track the server-fetched range so we skip the first redundant client fetch
    const initialRangeRef = useRef({ start: initialStart, end: initialEnd });

    const isAdmin = user?.role === "admin";

    // ── Fetch sessions (client-side, with cache) ──
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
            });
            setSessions(data);
        } catch (e) {
            console.error("Failed to fetch sessions:", e);
        }
    }, []);

    const handleDateRangeChange = useCallback(
        (start: Date, end: Date) => {
            setDateRange({ start, end });

            // Skip if this range matches what the server already pre-fetched
            const { start: iStart, end: iEnd } = initialRangeRef.current;
            if (start.toISOString() === iStart && end.toISOString() === iEnd) {
                return;
            }

            fetchSessions(start, end);
        },
        [fetchSessions]
    );

    // ── Helper: invalidate cache and refetch ──
    const invalidateAndRefetch = useCallback(() => {
        cacheInvalidate(CACHE_PREFIX);
        // Also clear the initial range guard so the next visit re-fetches
        initialRangeRef.current = { start: "", end: "" };
        if (dateRange) fetchSessions(dateRange.start, dateRange.end);
    }, [dateRange, fetchSessions]);

    // ── CRUD handlers ──
    const handleCreateSession = async (data: SessionFormData) => {
        const [sH, sM] = data.startTime.split(":").map(Number);
        const [eH, eM] = data.endTime.split(":").map(Number);

        const startsAt = new Date(data.date);
        startsAt.setHours(sH, sM, 0, 0);

        const endsAt = new Date(data.date);
        endsAt.setHours(eH, eM, 0, 0);

        const body = {
            student_ids: data.students.map((s) => s.id),
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            title: data.title || undefined,
            subject_ids: data.subjects.length > 0 ? data.subjects.map((s) => s.id) : undefined,
            teacher_notes: data.teacherNotes || undefined,
        };

        const res = await fetch("/api/calendar/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            toast.error("Não foi possível criar a sessão.", {
                description: "Verifica a ligação e tenta novamente.",
            });
            throw new Error("Failed to create session");
        }
        toast.success("Sessão criada com sucesso.");
        invalidateAndRefetch();
    };

    const handleUpdateSession = async (id: string, data: SessionFormData) => {
        const [sH, sM] = data.startTime.split(":").map(Number);
        const [eH, eM] = data.endTime.split(":").map(Number);

        const startsAt = new Date(data.date);
        startsAt.setHours(sH, sM, 0, 0);

        const endsAt = new Date(data.date);
        endsAt.setHours(eH, eM, 0, 0);

        const body = {
            student_ids: data.students.map((s) => s.id),
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            // Explicitly send null to allow clearing these fields
            title: data.title || null,
            subject_ids: data.subjects.length > 0 ? data.subjects.map((s) => s.id) : [],
            teacher_notes: data.teacherNotes || null,
        };

        const res = await fetch(`/api/calendar/sessions/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            toast.error("Não foi possível actualizar a sessão.", {
                description: "Verifica a ligação e tenta novamente.",
            });
            throw new Error("Failed to update session");
        }
        toast.success("Sessão actualizada.");
        invalidateAndRefetch();
    };

    const handleDeleteSession = async (id: string) => {
        const res = await fetch(`/api/calendar/sessions/${id}`, {
            method: "DELETE",
        });

        if (!res.ok) {
            toast.error("Não foi possível eliminar a sessão.", {
                description: "Verifica a ligação e tenta novamente.",
            });
            throw new Error("Failed to delete session");
        }
        toast.success("Sessão eliminada.");
        invalidateAndRefetch();
    };

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
                        sessions={sessions}
                        onCreateSession={handleCreateSession}
                        onUpdateSession={handleUpdateSession}
                        onDeleteSession={handleDeleteSession}
                        onDateRangeChange={handleDateRangeChange}
                        isAdmin={isAdmin}
                    />
                </div>
            </div>
        </div>
    );
}
