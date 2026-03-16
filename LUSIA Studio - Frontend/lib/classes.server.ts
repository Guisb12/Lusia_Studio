import type { PaginatedClassrooms } from "@/lib/classes";
import { fetchBackendJsonServer } from "@/lib/backend.server";

function sortClasses(data: PaginatedClassrooms): PaginatedClassrooms {
    return {
        ...data,
        data: [...data.data].sort((a, b) =>
            a.name.localeCompare(b.name, "pt", { sensitivity: "base" }),
        ),
    };
}

/**
 * Fetch classes directly from the backend (server-side only).
 * Avoids the loopback through the Next.js API route.
 */
export async function fetchClassesServer(
    active?: boolean,
    perPage?: number,
    own?: boolean,
): Promise<PaginatedClassrooms> {
    const empty: PaginatedClassrooms = { data: [], page: 1, per_page: 50, total: 0 };
    const params = new URLSearchParams();
    if (active !== undefined) params.set("active", String(active));
    if (perPage) params.set("per_page", String(perPage));
    if (own) params.set("own", "true");

    const response = await fetchBackendJsonServer<PaginatedClassrooms>(
        `/api/v1/classrooms?${params.toString()}`,
        { fallback: empty },
    );

    return sortClasses(response);
}
