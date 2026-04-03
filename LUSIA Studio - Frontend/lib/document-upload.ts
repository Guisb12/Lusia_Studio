/**
 * Document Upload Pipeline — TypeScript types & API client
 */

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export type DocumentCategory = "study" | "exercises" | "study_exercises";

export interface DocumentUploadMetadata {
    artifact_name: string;
    document_category: DocumentCategory;
    subject_id?: string;
    year_level?: string;
    year_levels?: string[];
    subject_component?: string;
    icon?: string;
    is_public?: boolean;
}

export interface DocumentUploadResult {
    id: string;
    artifact_name: string;
    artifact_type: string;
    source_type: string;
    storage_path: string | null;
    is_processed: boolean;
    processing_failed: boolean | null;
    created_at: string | null;
    job_id: string | null;
    job_status: string | null;
    error_message: string | null;
}

export interface DocumentJobStatus {
    id: string;
    artifact_id: string;
    status: string;
    current_step: string | null;
    error_message: string | null;
    retry_count: number | null;
    created_at: string | null;
    updated_at: string | null;
    completed_at: string | null;
}

export const DOCUMENT_CATEGORIES = [
    {
        value: "study" as const,
        label: "Documento de Estudo",
        description: "Material teórico, resumos, apontamentos — sem questões.",
        icon: "book-open",
    },
    {
        value: "exercises" as const,
        label: "Ficha de Exercícios",
        description: "Contém apenas exercícios e questões.",
        icon: "pencil-line",
    },
    {
        value: "study_exercises" as const,
        label: "Estudo + Exercícios",
        description: "Documento misto com teoria e exercícios.",
        icon: "file-text",
    },
] as const;

export const ALLOWED_FILE_TYPES: Record<string, string> = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/markdown": ".md",
    "text/plain": ".txt",
};

export const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".md", ".txt"];

export const MAX_FILE_SIZE_MB = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const PDF_MAX_PAGES = 25;

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

export function isAllowedFileType(file: File): boolean {
    if (file.type && file.type in ALLOWED_FILE_TYPES) return true;
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext);
}

export function getFileExtension(file: File): string {
    return "." + (file.name.split(".").pop()?.toLowerCase() || "txt");
}

export function isDocxFile(file: File): boolean {
    return (
        file.type ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.name.toLowerCase().endsWith(".docx")
    );
}

/* ═══════════════════════════════════════════════════════════════
   API CLIENT
   ═══════════════════════════════════════════════════════════════ */

export async function uploadDocument(
    file: File,
    metadata: DocumentUploadMetadata,
): Promise<DocumentUploadResult> {
    const res = await fetch("/api/documents/upload", {
        method: "POST",
        headers: {
            "Content-Type": file.type || "application/octet-stream",
            "x-file-name": encodeURIComponent(file.name),
            "x-upload-metadata": encodeURIComponent(JSON.stringify(metadata)),
        },
        body: file,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Upload falhou: ${res.status}`);
    }
    return res.json();
}

export async function getJobStatus(jobId: string): Promise<DocumentJobStatus> {
    const res = await fetch(`/api/documents/jobs/${jobId}`, {
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`Falha ao obter estado: ${res.status}`);
    return res.json();
}

export async function getProcessingDocuments(): Promise<DocumentUploadResult[]> {
    const res = await fetch("/api/documents/processing", { cache: "no-store" });
    if (!res.ok) throw new Error(`Falha ao obter documentos: ${res.status}`);
    return res.json();
}

export async function retryDocument(artifactId: string): Promise<DocumentJobStatus> {
    const res = await fetch(`/api/documents/${artifactId}/retry`, {
        method: "POST",
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Retry falhou: ${res.status}`);
    }
    return res.json();
}

/**
 * Upload multiple files with the same metadata.
 * Each file gets its own artifact_name (derived from filename).
 */
export async function uploadDocuments(
    files: File[],
    metadata: Omit<DocumentUploadMetadata, "artifact_name">,
): Promise<{ results: DocumentUploadResult[]; errors: { file: string; error: string }[] }> {
    const results: DocumentUploadResult[] = [];
    const errors: { file: string; error: string }[] = [];

    for (const file of files) {
        const name = file.name.replace(/\.[^/.]+$/, ""); // Strip extension
        try {
            const result = await uploadDocument(file, {
                ...metadata,
                artifact_name: name,
            });
            results.push(result);
        } catch (e) {
            errors.push({
                file: file.name,
                error: e instanceof Error ? e.message : "Erro desconhecido",
            });
        }
    }

    return { results, errors };
}

/* ═══════════════════════════════════════════════════════════════
   SSE — Document processing status stream
   ═══════════════════════════════════════════════════════════════ */

export interface DocumentStatusItem {
    artifact_id: string;
    job_id: string;
    step: string;
    step_label?: string;
}

export type DocumentStatusEvent =
    | { type: "hydrate"; items: DocumentStatusItem[] }
    | { type: "status"; artifact_id: string; job_id: string; step: string; step_label?: string }
    | { type: "completed"; artifact_id: string }
    | { type: "failed"; artifact_id: string; error_message: string };

/**
 * Open an SSE connection to receive real-time processing status updates.
 * Returns an AbortController to close the connection.
 */
export function streamDocumentStatus(
    onEvent: (event: DocumentStatusEvent) => void,
    onError: (error: Error) => void,
): AbortController {
    const controller = new AbortController();

    (async () => {
        try {
            const response = await fetch("/api/documents/status/stream", {
                method: "GET",
                headers: { Accept: "text/event-stream" },
                signal: controller.signal,
                cache: "no-store",
            });

            if (!response.ok) {
                throw new Error(`SSE stream failed: ${response.status}`);
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
                        const event = JSON.parse(trimmed.slice(6)) as DocumentStatusEvent;
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
