"use client";

import type { SessionType, SessionTypeCreatePayload, SessionTypeUpdatePayload } from "@/lib/session-types";
import { queryClient, useQuery } from "@/lib/query-client";
import { updateCalendarSessionsForSessionType } from "@/lib/queries/calendar";

const SESSION_TYPES_QUERY_PREFIX = "session-types:";
const SESSION_TYPES_STALE_TIME = 5 * 60_000;

function buildSessionTypesQueryKey(activeOnly: boolean): string {
    return `${SESSION_TYPES_QUERY_PREFIX}${activeOnly ? "active" : "all"}`;
}

function sortSessionTypes(types: SessionType[]): SessionType[] {
    return [...types].sort((a, b) => {
        if (a.is_default !== b.is_default) {
            return a.is_default ? -1 : 1;
        }
        return a.name.localeCompare(b.name, "pt", { sensitivity: "base" });
    });
}

async function fetchSessionTypesQuery(activeOnly: boolean): Promise<SessionType[]> {
    const params = new URLSearchParams();
    if (!activeOnly) {
        params.set("active_only", "false");
    }

    const res = await fetch(`/api/session-types?${params.toString()}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch session types: ${res.status}`);
    }
    return res.json();
}

function updateSessionTypeCaches(updater: (current: SessionType[] | undefined, key: string) => SessionType[]) {
    queryClient.updateQueries<SessionType[]>(
        SESSION_TYPES_QUERY_PREFIX,
        (current, key) => sortSessionTypes(updater(current, key)),
    );
}

async function refreshSessionTypeQueries() {
    const [activeTypes, allTypes] = await Promise.all([
        fetchSessionTypesQuery(true),
        fetchSessionTypesQuery(false),
    ]);

    queryClient.setQueryData(buildSessionTypesQueryKey(true), sortSessionTypes(activeTypes));
    queryClient.setQueryData(buildSessionTypesQueryKey(false), sortSessionTypes(allTypes));
}

function syncSessionTypeIntoCaches(sessionType: SessionType) {
    updateSessionTypeCaches((current, key) => {
        const activeOnly = key.endsWith("active");
        const base = (current ?? [])
            .filter((item) => item.id !== sessionType.id)
            .map((item) =>
                sessionType.is_default ? { ...item, is_default: false } : item,
            );

        if (activeOnly && !sessionType.active) {
            return base;
        }

        return [...base, sessionType];
    });
}

function removeSessionTypeFromActiveCaches(sessionTypeId: string) {
    queryClient.updateQueries<SessionType[]>(
        buildSessionTypesQueryKey(true),
        (current) => (current ?? []).filter((item) => item.id !== sessionTypeId),
    );
}

export function useSessionTypes(activeOnly = true, enabled = true) {
    const key = buildSessionTypesQueryKey(activeOnly);

    return useQuery<SessionType[]>({
        key,
        enabled,
        staleTime: SESSION_TYPES_STALE_TIME,
        fetcher: () => fetchSessionTypesQuery(activeOnly),
    });
}

export function prefetchSessionTypes(activeOnly = true) {
    return queryClient.fetchQuery<SessionType[]>({
        key: buildSessionTypesQueryKey(activeOnly),
        staleTime: SESSION_TYPES_STALE_TIME,
        fetcher: () => fetchSessionTypesQuery(activeOnly),
    });
}

export async function createSessionTypeWithCache(
    payload: SessionTypeCreatePayload,
): Promise<SessionType> {
    const res = await fetch("/api/session-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        throw new Error(`Failed to create session type: ${res.status}`);
    }

    const created = (await res.json()) as SessionType;
    syncSessionTypeIntoCaches(created);
    void refreshSessionTypeQueries();
    return created;
}

export async function updateSessionTypeWithCache(
    id: string,
    payload: SessionTypeUpdatePayload,
): Promise<SessionType> {
    const res = await fetch(`/api/session-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        throw new Error(`Failed to update session type: ${res.status}`);
    }

    const updated = (await res.json()) as SessionType;
    syncSessionTypeIntoCaches(updated);
    updateCalendarSessionsForSessionType(updated.id, (session) => ({
        ...session,
        session_type: updated.active
            ? {
                  id: updated.id,
                  name: updated.name,
                  color: updated.color,
                  icon: updated.icon,
              }
            : session.session_type,
    }));
    void refreshSessionTypeQueries();
    return updated;
}

export async function deleteSessionTypeWithCache(id: string): Promise<SessionType> {
    const res = await fetch(`/api/session-types/${id}`, {
        method: "DELETE",
    });

    if (!res.ok) {
        throw new Error(`Failed to delete session type: ${res.status}`);
    }

    const deleted = (await res.json()) as SessionType;
    syncSessionTypeIntoCaches(deleted);
    removeSessionTypeFromActiveCaches(id);
    updateCalendarSessionsForSessionType(id, (session) => ({
        ...session,
        session_type: session.session_type
            ? {
                  ...session.session_type,
                  name: deleted.name,
                  color: deleted.color,
                  icon: deleted.icon,
              }
            : session.session_type,
    }));
    void refreshSessionTypeQueries();
    return deleted;
}
