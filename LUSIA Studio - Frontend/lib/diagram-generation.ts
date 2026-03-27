import type { DiagramContent, DiagramStreamEvent } from "@/lib/diagrams/types";

export interface DiagramStartInput {
    prompt: string;
    subject_id?: string | null;
    year_level?: string | null;
    subject_component?: string | null;
    curriculum_codes: string[];
    upload_artifact_id?: string | null;
}

export interface DiagramStartResult {
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

export async function startDiagramGeneration(
    input: DiagramStartInput,
): Promise<DiagramStartResult> {
    const response = await fetch("/api/diagrams/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to start diagram generation");
    }

    const result = await response.json();
    const { cacheInvalidate } = await import("@/lib/cache");
    cacheInvalidate("artifacts:");
    return result;
}

export function streamDiagramGeneration(
    artifactId: string,
    onEvent: (event: DiagramStreamEvent) => void,
    onError: (error: Error) => void,
    onComplete: () => void,
): AbortController {
    const controller = new AbortController();

    (async () => {
        try {
            const response = await fetch(`/api/diagrams/${artifactId}/stream`, {
                method: "GET",
                headers: { Accept: "text/event-stream" },
                signal: controller.signal,
                cache: "no-store",
            });

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
                    if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data: ")) continue;
                    try {
                        const event = JSON.parse(trimmed.slice(6)) as DiagramStreamEvent;
                        onEvent(event);
                        if (event.type === "done" || event.type === "error") {
                            onComplete();
                            return;
                        }
                    } catch {
                        // Ignore malformed chunks.
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

export async function getDiagram(artifactId: string): Promise<DiagramContent> {
    const response = await fetch(`/api/artifacts/${artifactId}`, {
        cache: "no-store",
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "Failed to fetch diagram artifact");
    }

    const artifact = await response.json();
    return artifact.content as DiagramContent;
}
