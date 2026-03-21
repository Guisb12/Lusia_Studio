import type { Presentation } from "@/lib/queries/presentations";
import { fetchBackendJsonServer } from "@/lib/backend.server";

/**
 * Fetch a presentation artifact directly from the backend (server-side only).
 * Skips the Next.js API route proxy — one fewer network hop.
 */
export async function fetchPresentationServer(
    artifactId: string,
): Promise<Presentation | null> {
    return fetchBackendJsonServer<Presentation | null>(
        `/api/v1/presentations/${artifactId}`,
        { fallback: null },
    );
}
