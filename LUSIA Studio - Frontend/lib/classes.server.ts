import { createClient } from "@/lib/supabase/server";
import { BACKEND_API_URL } from "@/lib/config";
import type { PaginatedClassrooms } from "@/lib/classes";

/**
 * Fetch classes directly from the backend (server-side only).
 * Avoids the loopback through the Next.js API route.
 */
export async function fetchClassesServer(
    active?: boolean,
    perPage?: number,
): Promise<PaginatedClassrooms> {
    const empty: PaginatedClassrooms = { data: [], page: 1, per_page: 50, total: 0 };

    const supabase = await createClient();
    const {
        data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) return empty;

    try {
        const params = new URLSearchParams();
        if (active !== undefined) params.set("active", String(active));
        if (perPage) params.set("per_page", String(perPage));

        const res = await fetch(
            `${BACKEND_API_URL}/api/v1/classrooms?${params.toString()}`,
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
        console.error("fetchClassesServer failed:", e);
        return empty;
    }
}
