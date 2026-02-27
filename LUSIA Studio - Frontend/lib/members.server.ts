import { createClient } from "@/lib/supabase/server";
import { BACKEND_API_URL } from "@/lib/config";
import type { PaginatedMembers } from "@/lib/members";

/**
 * Fetch members directly from the backend (server-side only).
 * Avoids the loopback through the Next.js API route.
 */
export async function fetchMembersServer(
    role?: string,
    status?: string,
    perPage?: number,
): Promise<PaginatedMembers> {
    const empty: PaginatedMembers = { data: [], page: 1, per_page: 20, total: 0 };

    const supabase = await createClient();
    const {
        data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) return empty;

    try {
        const params = new URLSearchParams();
        if (role) params.set("role", role);
        if (status) params.set("status", status);
        if (perPage) params.set("per_page", String(perPage));

        const res = await fetch(
            `${BACKEND_API_URL}/api/v1/members?${params.toString()}`,
            {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
                cache: "no-store",
            },
        );

        if (!res.ok) return empty;
        return await res.json();
    } catch (e) {
        console.error("fetchMembersServer failed:", e);
        return empty;
    }
}
