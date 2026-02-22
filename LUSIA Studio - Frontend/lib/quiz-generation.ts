/**
 * Quiz Generation — TypeScript types & API client
 *
 * Handles the 3 quiz generation endpoints:
 * - POST /api/quiz-generation/start
 * - GET /api/quiz-generation/{artifactId}/stream (SSE)
 * - POST /api/quiz-generation/match-curriculum
 */

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export interface QuizGenerationStartInput {
    subject_id: string;
    year_level: string;
    subject_component?: string | null;
    curriculum_codes: string[];
    source_type: "dge" | "upload";
    upload_artifact_id?: string | null;
    num_questions: number;
    difficulty: "Fácil" | "Médio" | "Difícil";
    extra_instructions?: string | null;
    theme_query?: string | null;
}

export interface QuizGenerationStartResult {
    artifact_id: string;
    artifact_name: string;
}

export interface CurriculumMatchInput {
    query: string;
    subject_id: string;
    year_level: string;
    subject_component?: string | null;
}

export interface CurriculumMatchNode {
    id: string;
    code: string;
    title: string;
    full_path: string | null;
    level: number | null;
}

export interface CurriculumMatchResult {
    matched_nodes: CurriculumMatchNode[];
}

export interface CurriculumResolveInput {
    subject_id: string;
    year_level: string;
    codes: string[];
}

export interface QuizStreamQuestion {
    id: string;
    type: string;
    label: string;
    content: Record<string, any>;
    order: number;
}

export type QuizStreamEvent =
    | { type: "started"; num_questions: number }
    | { type: "quiz_name"; name: string }
    | { type: "question"; question: QuizStreamQuestion }
    | { type: "done"; artifact_id: string; total_questions: number }
    | { type: "error"; message: string };


/* ═══════════════════════════════════════════════════════════════
   API FUNCTIONS
   ═══════════════════════════════════════════════════════════════ */

/**
 * Create a quiz artifact and return its ID.
 */
export async function startQuizGeneration(
    input: QuizGenerationStartInput,
): Promise<QuizGenerationStartResult> {
    const response = await fetch("/api/quiz-generation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to start quiz generation");
    }

    return response.json();
}

/**
 * Match a free-text description to curriculum codes.
 */
export async function matchCurriculum(
    input: CurriculumMatchInput,
): Promise<CurriculumMatchNode[]> {
    const response = await fetch("/api/quiz-generation/match-curriculum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to match curriculum");
    }

    const data: CurriculumMatchResult = await response.json();
    return data.matched_nodes;
}

/**
 * Resolve curriculum codes to full node objects (id, code, title, etc.).
 */
export async function resolveCurriculumCodes(
    input: CurriculumResolveInput,
): Promise<CurriculumMatchNode[]> {
    const response = await fetch("/api/quiz-generation/resolve-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to resolve codes");
    }

    return response.json();
}

/**
 * Open an SSE stream for quiz question generation.
 *
 * Uses fetch + ReadableStream (not EventSource) to support auth headers
 * via the Next.js proxy.
 *
 * Returns an AbortController for cleanup on component unmount.
 */
export function streamQuizGeneration(
    artifactId: string,
    onEvent: (event: QuizStreamEvent) => void,
    onError: (error: Error) => void,
    onComplete: () => void,
): AbortController {
    const controller = new AbortController();

    (async () => {
        try {
            const response = await fetch(
                `/api/quiz-generation/${artifactId}/stream`,
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
                            const event = JSON.parse(jsonStr) as QuizStreamEvent;
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
