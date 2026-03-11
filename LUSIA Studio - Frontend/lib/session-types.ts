/**
 * Session Types (Tipos de Sessao) — TypeScript types & API client
 */

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export interface SessionType {
    id: string;
    organization_id: string;
    name: string;
    description: string | null;
    student_price_per_hour: number;
    teacher_cost_per_hour: number;
    color: string | null;
    icon: string | null;
    is_default: boolean;
    active: boolean;
    created_at: string | null;
    updated_at: string | null;
}

export interface SessionTypeCreatePayload {
    name: string;
    description?: string;
    student_price_per_hour: number;
    teacher_cost_per_hour: number;
    color?: string;
    icon?: string;
    is_default?: boolean;
}

export interface SessionTypeUpdatePayload {
    name?: string;
    description?: string | null;
    student_price_per_hour?: number;
    teacher_cost_per_hour?: number;
    color?: string | null;
    icon?: string | null;
    is_default?: boolean;
    active?: boolean;
}

/* ═══════════════════════════════════════════════════════════════
   API CLIENT
   ═══════════════════════════════════════════════════════════════ */

export async function fetchSessionTypes(activeOnly = true): Promise<SessionType[]> {
    const params = new URLSearchParams();
    if (!activeOnly) params.set("active_only", "false");
    const res = await fetch(`/api/session-types?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch session types: ${res.status}`);
    return res.json();
}

export async function fetchSessionType(id: string): Promise<SessionType> {
    const res = await fetch(`/api/session-types/${id}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch session type: ${res.status}`);
    return res.json();
}

export async function createSessionType(data: SessionTypeCreatePayload): Promise<SessionType> {
    const res = await fetch("/api/session-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Failed to create session type: ${res.status}`);
    return res.json();
}

export async function updateSessionType(
    id: string,
    data: SessionTypeUpdatePayload,
): Promise<SessionType> {
    const res = await fetch(`/api/session-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Failed to update session type: ${res.status}`);
    return res.json();
}

export async function deleteSessionType(id: string): Promise<SessionType> {
    const res = await fetch(`/api/session-types/${id}`, {
        method: "DELETE",
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Failed to delete session type: ${res.status}`);
    return res.json();
}
