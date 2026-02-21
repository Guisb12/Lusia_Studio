"use client";

import React, { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { EventCalendar, CalendarSession } from "@/components/calendar/EventCalendar";
import { SessionFormData } from "@/components/calendar/SessionFormDialog";
import { useUser } from "@/components/providers/UserProvider";
import { format } from "date-fns";

export default function CalendarPage() {
    const { user } = useUser();
    const [sessions, setSessions] = useState<CalendarSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(null);

    const isAdmin = user?.role === "admin";

    // ── Fetch sessions ──
    const fetchSessions = useCallback(async (start: Date, end: Date) => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                start_date: start.toISOString(),
                end_date: end.toISOString(),
            });
            const res = await fetch(`/api/calendar/sessions?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setSessions(data);
            }
        } catch (e) {
            console.error("Failed to fetch sessions:", e);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleDateRangeChange = useCallback(
        (start: Date, end: Date) => {
            setDateRange({ start, end });
            fetchSessions(start, end);
        },
        [fetchSessions]
    );

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

        if (!res.ok) throw new Error("Failed to create session");

        // Refresh
        if (dateRange) fetchSessions(dateRange.start, dateRange.end);
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
            title: data.title || null,
            subject_ids: data.subjects.length > 0 ? data.subjects.map((s) => s.id) : [],
            teacher_notes: data.teacherNotes || null,
        };

        const res = await fetch(`/api/calendar/sessions/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error("Failed to update session");

        if (dateRange) fetchSessions(dateRange.start, dateRange.end);
    };

    const handleDeleteSession = async (id: string) => {
        const res = await fetch(`/api/calendar/sessions/${id}`, {
            method: "DELETE",
        });

        if (!res.ok) throw new Error("Failed to delete session");

        if (dateRange) fetchSessions(dateRange.start, dateRange.end);
    };

    return (
        <div className="max-w-full mx-auto w-full h-full flex flex-col">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col h-full"
            >
                <header className="mb-4">
                    <h1 className="text-3xl font-normal font-instrument text-brand-primary">Calendário</h1>
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
            </motion.div>
        </div>
    );
}
