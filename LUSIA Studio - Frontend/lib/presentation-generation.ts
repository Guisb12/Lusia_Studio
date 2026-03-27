/**
 * Presentation Generation — TypeScript types & API client
 *
 * Handles the presentation generation endpoints:
 * - POST /api/presentations/start
 * - GET /api/presentations/{artifactId}/stream (SSE)
 * - GET /api/presentations/{artifactId}
 */

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export interface PresentationStartInput {
    prompt: string;
    size: "short" | "long";
    template: "explicative" | "interactive_explanation" | "step_by_step_exercise";
    subject_id?: string | null;
    year_level?: string | null;
    subject_component?: string | null;
    curriculum_codes: string[];
    upload_artifact_id?: string | null;
}

export interface PresentationStartResult {
    artifact_id: string;
    artifact_name: string;
    artifact_type: string;
    icon: string | null;
    source_type: string;
    subject_id: string | null;
    subject_ids: string[] | null;
    year_level: string | null;
    curriculum_codes: string[] | null;
    is_processed: boolean;
    is_public: boolean;
    created_at: string | null;
}

export interface PresentationPlan {
    title?: string;
    description?: string;
    target_audience?: string;
    total_slides?: number;
    size?: string;
    slides?: Array<{
        id: string;
        phase?: string;
        type?: string;
        subtype?: string | null;
        title?: string;
        intent?: string;
        description?: string;
    }>;
}

export type PresentationStreamEvent =
    | { type: "planning"; message: string }
    | { type: "plan_partial"; plan: PresentationPlan }
    | { type: "plan_complete"; plan: PresentationPlan }
    | { type: "generating_slides"; message: string; total: number }
    | { type: "slide_progress"; current: number; total: number; message: string }
    | { type: "slide_html_snapshot"; slide_id: string; current: number; total: number; html: string }
    | { type: "slide_html_done"; slide_id: string; current: number; total: number; html: string }
    | { type: "done"; artifact_id: string; total_slides?: number }
    | { type: "error"; message: string };


/* ═══════════════════════════════════════════════════════════════
   API FUNCTIONS
   ═══════════════════════════════════════════════════════════════ */

/**
 * Create a presentation artifact and enqueue background generation.
 */
export async function startPresentationGeneration(
    input: PresentationStartInput,
): Promise<PresentationStartResult> {
    const response = await fetch("/api/presentations/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to start presentation generation");
    }

    const result = await response.json();
    const { cacheInvalidate } = await import("@/lib/cache");
    cacheInvalidate("artifacts:");
    return result;
}

/**
 * Open an SSE stream for presentation generation progress.
 *
 * Uses fetch + ReadableStream (not EventSource) to support auth headers
 * via the Next.js proxy.
 *
 * Returns an AbortController for cleanup on component unmount.
 */
export function streamPresentationGeneration(
    artifactId: string,
    onEvent: (event: PresentationStreamEvent) => void,
    onError: (error: Error) => void,
    onComplete: () => void,
): AbortController {
    const controller = new AbortController();

    (async () => {
        try {
            const response = await fetch(
                `/api/presentations/${artifactId}/stream`,
                {
                    method: "GET",
                    headers: { Accept: "text/event-stream" },
                    signal: controller.signal,
                    cache: "no-store",
                },
            );

            if (!response.ok) {
                throw new Error(`Stream request failed with status ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("No response body");
            }

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Parse SSE events from the buffer
                const lines = buffer.split("\n");
                buffer = lines.pop() || ""; // Keep incomplete line in buffer

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith(":")) continue; // Skip empty lines and comments

                    if (trimmed.startsWith("data: ")) {
                        const jsonStr = trimmed.slice(6);
                        try {
                            const event = JSON.parse(jsonStr) as PresentationStreamEvent;
                            onEvent(event);

                            if (event.type === "done" || event.type === "error") {
                                onComplete();
                                return;
                            }
                        } catch {
                            // Skip malformed JSON
                        }
                    }
                }
            }

            onComplete();
        } catch (err) {
            if (controller.signal.aborted) return; // Intentional abort
            onError(err instanceof Error ? err : new Error(String(err)));
        }
    })();

    return controller;
}

/**
 * Fetch a completed presentation artifact.
 */
export async function getPresentation(
    artifactId: string,
): Promise<Record<string, any>> {
    const response = await fetch(`/api/presentations/${artifactId}`, {
        cache: "no-store",
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to fetch presentation");
    }

    return response.json();
}
