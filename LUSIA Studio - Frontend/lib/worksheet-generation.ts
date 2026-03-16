/**
 * Worksheet Generation — TypeScript types & API client
 *
 * Handles the worksheet generation endpoints:
 * - POST /api/worksheet-generation/start
 * - GET /api/worksheet-generation/{artifactId}/blueprint
 * - POST /api/worksheet-generation/{artifactId}/blueprint/chat
 * - PATCH /api/worksheet-generation/{artifactId}/blueprint
 * - GET /api/worksheet-generation/{artifactId}/resolve/stream (SSE)
 */

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export interface WorksheetStartInput {
    subject_id?: string | null;
    year_level?: string | null;
    subject_component?: string | null;
    curriculum_codes: string[];
    upload_artifact_id?: string | null;
    prompt: string;
    template_id: string;
    difficulty: "Fácil" | "Médio" | "Difícil";
    year_range?: [number, number] | null;
}

export interface TemplateInfo {
    id: string;
    name: string;
    tier: "quick" | "practice" | "exam";
    description: string;
    estimated_minutes: string;
    group_count: number;
    total_slots: number;
}

export interface WorksheetStartResult {
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

export interface BlueprintBlock {
    id: string;
    order: number;
    source: "bank" | "ai_generated";
    question_id?: string | null;
    curriculum_code: string;
    curriculum_path?: string | null;
    type: string;
    goal: string;
    difficulty?: string | null;
    group_label?: string | null;
    reference_question_ids: string[];
    children?: BlueprintBlock[] | null;
}

export interface Blueprint {
    blocks: BlueprintBlock[];
    version: number;
}

export interface ContextSummary {
    subject_name: string;
    subject_status: string;
    has_national_exam: boolean;
    bank_question_count: number;
    document_attached: boolean;
    curriculum_code_count: number;
}

export interface BlueprintState {
    blueprint: Blueprint;
    conversation: ChatMessage[];
    generation_params: Record<string, any>;
    context_summary: ContextSummary;
}

export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    block_id?: string | null;
    tool_calls?: ToolCallRecord[];
}

export interface ToolCallRecord {
    name: string;
    args: Record<string, any>;
    result?: {
        action: string;
        affected_block_ids: string[];
        message: string;
        parent_id?: string | null;
        block?: BlueprintBlock;
    };
}

export interface BlueprintChatResponse {
    message: string;
    blueprint: Blueprint;
    tool_calls: ToolCallRecord[];
}

export type BlueprintStreamEvent =
    | { type: "block"; block: BlueprintBlock }
    | { type: "child_block"; parent_id: string; block: BlueprintBlock }
    | { type: "done" }
    | { type: "error"; message: string };

export type BlueprintChatStreamEvent =
    | { type: "mutation"; mutation: { action: string; affected_block_ids: string[]; message: string; parent_id?: string | null; block?: BlueprintBlock } }
    | { type: "done"; blueprint: Blueprint; tool_calls: ToolCallRecord[] }
    | { type: "error"; message: string };

export type WorksheetStreamEvent =
    | { type: "started"; total_blocks: number }
    | { type: "bank_resolved"; block_id: string; question_id: string; question_type: string; order: number; top_level_order: number; child_order?: number | null; question_content?: Record<string, any>; parent_question_id?: string; parent_block_id?: string | null }
    | { type: "question"; block_id: string; question_id: string; question_type: string; label: string; order: number; top_level_order: number; child_order?: number | null; question_content?: Record<string, any>; parent_question_id?: string; parent_block_id?: string | null }
    | { type: "block_error"; block_id: string; message: string }
    | { type: "block_warning"; block_id: string; message: string }
    | { type: "done"; artifact_id: string; total_questions: number }
    | { type: "error"; message: string };


/* ═══════════════════════════════════════════════════════════════
   API FUNCTIONS
   ═══════════════════════════════════════════════════════════════ */

/**
 * Create a worksheet artifact and generate the initial blueprint.
 */
export async function startWorksheetGeneration(
    input: WorksheetStartInput,
): Promise<WorksheetStartResult> {
    const response = await fetch("/api/worksheet-generation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to start worksheet generation");
    }

    const result = await response.json();
    const { cacheInvalidate } = await import("@/lib/cache");
    cacheInvalidate("artifacts:");
    return result;
}

/**
 * Fetch the current blueprint state (for page load / session recovery).
 */
export async function getBlueprintState(
    artifactId: string,
): Promise<BlueprintState> {
    const response = await fetch(
        `/api/worksheet-generation/${artifactId}/blueprint`,
        { cache: "no-store" },
    );

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to fetch blueprint");
    }

    return response.json();
}

/**
 * Send a chat message during the blueprint review phase.
 */
export async function sendBlueprintChat(
    artifactId: string,
    message: string,
    blueprint: Blueprint,
    blockId?: string | null,
): Promise<BlueprintChatResponse> {
    const response = await fetch(
        `/api/worksheet-generation/${artifactId}/blueprint/chat`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message,
                block_id: blockId || null,
                blueprint,
            }),
            cache: "no-store",
        },
    );

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to process chat message");
    }

    return response.json();
}

/**
 * Open an SSE stream for a blueprint chat turn.
 *
 * Sends a POST with the message + current blueprint, then streams
 * upsert/delete events as the AI applies tool calls. Returns an
 * AbortController for cleanup.
 */
export function streamBlueprintChat(
    artifactId: string,
    message: string,
    blueprint: Blueprint,
    blockId: string | null,
    onEvent: (event: BlueprintChatStreamEvent) => void,
    onError: (error: Error) => void,
): AbortController {
    const controller = new AbortController();

    (async () => {
        try {
            const response = await fetch(
                `/api/worksheet-generation/${artifactId}/blueprint/chat`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "text/event-stream",
                    },
                    body: JSON.stringify({
                        message,
                        block_id: blockId || null,
                        blueprint,
                    }),
                    signal: controller.signal,
                    cache: "no-store",
                },
            );

            if (!response.ok) {
                throw new Error(`Chat stream failed with status ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response body");

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith(":")) continue;
                    if (!trimmed.startsWith("data: ")) continue;

                    try {
                        const event = JSON.parse(trimmed.slice(6)) as BlueprintChatStreamEvent;
                        onEvent(event);
                    } catch {
                        // Skip malformed JSON
                    }
                }
            }
        } catch (err) {
            if (controller.signal.aborted) return;
            onError(err instanceof Error ? err : new Error(String(err)));
        }
    })();

    return controller;
}

/**
 * Save direct UI edits to the blueprint (drag-reorder, etc.).
 * Call this on a debounce from the frontend.
 */
export async function updateBlueprint(
    artifactId: string,
    blueprint: Blueprint,
): Promise<void> {
    const response = await fetch(
        `/api/worksheet-generation/${artifactId}/blueprint`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blueprint }),
            cache: "no-store",
        },
    );

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to update blueprint");
    }
}

/**
 * Open an SSE stream for real-time blueprint generation.
 *
 * Emits BlueprintBlock objects one by one as instructor parses them from the
 * streaming LLM response. Call immediately after navigating to the blueprint page.
 */
export function streamBlueprintGeneration(
    artifactId: string,
    onEvent: (event: BlueprintStreamEvent) => void,
    onError: (error: Error) => void,
    onComplete: () => void,
): AbortController {
    const controller = new AbortController();

    (async () => {
        try {
            const response = await fetch(
                `/api/worksheet-generation/${artifactId}/blueprint/stream`,
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
            if (!reader) throw new Error("No response body");

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith(":")) continue;
                    if (!trimmed.startsWith("data: ")) continue;

                    try {
                        const event = JSON.parse(trimmed.slice(6)) as BlueprintStreamEvent;
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

            onComplete();
        } catch (err) {
            if (controller.signal.aborted) return;
            onError(err instanceof Error ? err : new Error(String(err)));
        }
    })();

    return controller;
}


/**
 * Fetch all available worksheet templates.
 */
export async function getWorksheetTemplates(): Promise<TemplateInfo[]> {
    const response = await fetch("/api/worksheet-generation/templates", {
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error("Failed to fetch templates");
    }

    const data = await response.json();
    return data.templates;
}

/**
 * Open an SSE stream for worksheet resolution.
 *
 * Returns an AbortController for cleanup on component unmount.
 */
export function streamWorksheetResolution(
    artifactId: string,
    onEvent: (event: WorksheetStreamEvent) => void,
    onError: (error: Error) => void,
    onComplete: () => void,
): AbortController {
    const controller = new AbortController();

    (async () => {
        try {
            const response = await fetch(
                `/api/worksheet-generation/${artifactId}/resolve/stream`,
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

                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith(":")) continue;

                    if (trimmed.startsWith("data: ")) {
                        const jsonStr = trimmed.slice(6);
                        try {
                            const event = JSON.parse(jsonStr) as WorksheetStreamEvent;
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
            if (controller.signal.aborted) return;
            onError(err instanceof Error ? err : new Error(String(err)));
        }
    })();

    return controller;
}
