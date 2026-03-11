"use client";

import type { CalendarSession } from "@/components/calendar/EventCalendar";
import { queryClient, useQuery } from "@/lib/query-client";

export const CALENDAR_SESSIONS_QUERY_PREFIX = "calendar:sessions:";
const CALENDAR_QUERY_STALE_TIME = 60_000;

interface CalendarSessionsQueryParams {
    startDate: string;
    endDate: string;
    teacherId?: string | null;
    initialData?: CalendarSession[];
}

const CALENDAR_SESSION_DETAIL_QUERY_PREFIX = "calendar:session:";

interface CalendarQueryMeta {
    startDate: string;
    endDate: string;
    teacherId: string | null;
}

export interface CalendarQuerySnapshot {
    key: string;
    data: CalendarSession[] | undefined;
}

export function buildCalendarSessionsQueryKey({
    startDate,
    endDate,
    teacherId,
}: Omit<CalendarSessionsQueryParams, "initialData">): string {
    return `${CALENDAR_SESSIONS_QUERY_PREFIX}${startDate}|${endDate}|${teacherId ?? "*"}`;
}

function parseCalendarSessionsQueryKey(key: string): CalendarQueryMeta | null {
    if (!key.startsWith(CALENDAR_SESSIONS_QUERY_PREFIX)) {
        return null;
    }

    const payload = key.slice(CALENDAR_SESSIONS_QUERY_PREFIX.length);
    const [startDate, endDate, teacherId] = payload.split("|");
    if (!startDate || !endDate) {
        return null;
    }

    return {
        startDate,
        endDate,
        teacherId: teacherId && teacherId !== "*" ? teacherId : null,
    };
}

function sortSessions(sessions: CalendarSession[]): CalendarSession[] {
    return [...sessions].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

function sessionBelongsToQuery(
    session: CalendarSession,
    meta: CalendarQueryMeta,
): boolean {
    if (meta.teacherId && session.teacher_id !== meta.teacherId) {
        return false;
    }

    return (
        session.starts_at >= meta.startDate &&
        session.starts_at <= meta.endDate
    );
}

async function fetchCalendarSessions(params: Omit<CalendarSessionsQueryParams, "initialData">) {
    const searchParams = new URLSearchParams({
        start_date: params.startDate,
        end_date: params.endDate,
    });

    if (params.teacherId) {
        searchParams.set("teacher_id", params.teacherId);
    }

    const res = await fetch(`/api/calendar/sessions?${searchParams.toString()}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch calendar sessions: ${res.status}`);
    }
    return res.json() as Promise<CalendarSession[]>;
}

export async function fetchCalendarSessionDetail(sessionId: string): Promise<CalendarSession> {
    const res = await fetch(`/api/calendar/sessions/${sessionId}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch calendar session detail: ${res.status}`);
    }

    const session = await res.json() as CalendarSession;
    queryClient.setQueryData<CalendarSession>(
        `${CALENDAR_SESSION_DETAIL_QUERY_PREFIX}${sessionId}`,
        session,
    );
    syncCalendarSessionsAcrossQueries([session]);
    return session;
}

export function useCalendarSessionsQuery({
    startDate,
    endDate,
    teacherId,
    initialData,
}: CalendarSessionsQueryParams) {
    const key = buildCalendarSessionsQueryKey({ startDate, endDate, teacherId });

    return useQuery<CalendarSession[]>({
        key,
        fetcher: () => fetchCalendarSessions({ startDate, endDate, teacherId }),
        staleTime: CALENDAR_QUERY_STALE_TIME,
        initialData,
    });
}

export function snapshotCalendarQueries(): CalendarQuerySnapshot[] {
    return queryClient
        .getMatchingQueries<CalendarSession[]>(CALENDAR_SESSIONS_QUERY_PREFIX)
        .map(({ key, snapshot }) => ({
            key,
            data: snapshot.data ? [...snapshot.data] : undefined,
        }));
}

export function restoreCalendarQueries(snapshots: CalendarQuerySnapshot[]) {
    snapshots.forEach(({ key, data }) => {
        queryClient.setQueryData<CalendarSession[]>(
            key,
            data ? [...data] : undefined,
        );
    });
}

export function syncCalendarSessionsAcrossQueries(
    sessions: CalendarSession[],
    options?: { removeIds?: Iterable<string> },
) {
    const syncedSessions = sortSessions(sessions);
    const syncedIds = new Set(syncedSessions.map((session) => session.id));
    const extraRemovedIds = new Set(options?.removeIds ?? []);

    queryClient.updateQueries<CalendarSession[]>(
        CALENDAR_SESSIONS_QUERY_PREFIX,
        (current, key) => {
            const meta = parseCalendarSessionsQueryKey(key);
            if (!meta) {
                return current;
            }

            const nextBase = (current ?? []).filter(
                (session) => !syncedIds.has(session.id) && !extraRemovedIds.has(session.id),
            );

            const nextSessions = syncedSessions.filter((session) =>
                sessionBelongsToQuery(session, meta),
            );

            return sortSessions([...nextBase, ...nextSessions]);
        },
    );
}

export function removeCalendarSessionsFromQueries(
    matcher: (session: CalendarSession) => boolean,
) {
    queryClient.updateQueries<CalendarSession[]>(
        CALENDAR_SESSIONS_QUERY_PREFIX,
        (current) => (current ?? []).filter((session) => !matcher(session)),
    );
}

export function updateCalendarSessionsInQueries(
    matcher: (session: CalendarSession) => boolean,
    updater: (session: CalendarSession) => CalendarSession,
) {
    queryClient.updateQueries<CalendarSession[]>(
        CALENDAR_SESSIONS_QUERY_PREFIX,
        (current) => sortSessions(
            (current ?? []).map((session) =>
                matcher(session) ? updater(session) : session,
            ),
        ),
    );
}

export function invalidateCalendarSessionsQueries() {
    queryClient.invalidateQueries(CALENDAR_SESSIONS_QUERY_PREFIX);
}

export function updateCalendarSessionsForSessionType(
    sessionTypeId: string,
    updater: (session: CalendarSession) => CalendarSession,
) {
    queryClient.updateQueries<CalendarSession[]>(
        CALENDAR_SESSIONS_QUERY_PREFIX,
        (current) =>
            (current ?? []).map((session) =>
                session.session_type_id === sessionTypeId ? updater(session) : session,
            ),
    );
}
