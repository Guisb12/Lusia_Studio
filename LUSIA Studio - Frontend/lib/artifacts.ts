import { getApiErrorMessage } from "@/lib/api-error";

/**
 * Artifacts (Docs) — TypeScript types & API client
 */

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export interface Artifact {
    id: string;
    organization_id: string;
    user_id: string;
    artifact_type: string;
    artifact_name: string;
    icon: string | null;
    subject_ids: string[] | null;
    content: Record<string, any>;
    source_type: string;
    conversion_requested: boolean;
    storage_path: string | null;
    tiptap_json: Record<string, any> | null;
    markdown_content: string | null;
    is_processed: boolean;
    processing_failed: boolean;
    processing_error: string | null;
    subject_id: string | null;
    year_level: string | null;
    year_levels: string[] | null;
    subject_component: string | null;
    curriculum_codes: string[] | null;
    is_public: boolean;
    created_at: string | null;
    updated_at: string | null;
    subjects?: { id: string; name: string; color: string | null; icon: string | null }[];
}

export class ArtifactRequestError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "ArtifactRequestError";
        this.status = status;
    }
}

export function normalizeArtifact(raw: Artifact): Artifact {
    return {
        ...raw,
        content: raw.content ?? {},
        tiptap_json: raw.tiptap_json ?? null,
        markdown_content: raw.markdown_content ?? null,
        conversion_requested: raw.conversion_requested ?? false,
        subject_ids: raw.subject_ids ?? null,
        year_levels: raw.year_levels ?? null,
        curriculum_codes: raw.curriculum_codes ?? null,
        subjects: raw.subjects ?? [],
    };
}

export interface ArtifactCreate {
    artifact_type: string;
    artifact_name: string;
    icon?: string;
    subject_ids?: string[];
    content?: Record<string, any>;
    source_type?: string;
    conversion_requested?: boolean;
    storage_path?: string;
    subject_id?: string;
    year_level?: string;
    subject_component?: string;
    curriculum_codes?: string[];
    is_public?: boolean;
}

export interface ArtifactUpdate {
    artifact_name?: string;
    icon?: string;
    subject_ids?: string[];
    content?: Record<string, any>;
    tiptap_json?: Record<string, any>;
    markdown_content?: string;
    subject_id?: string | null;
    year_level?: string | null;
    year_levels?: string[];
    subject_component?: string;
    curriculum_codes?: string[];
    is_public?: boolean;
}

export const ARTIFACT_TYPES = [
    { value: "quiz", label: "Quiz", icon: "❓" },
    { value: "note", label: "Apontamento", icon: "📝" },
    { value: "exercise_sheet", label: "Ficha de Exercícios", icon: "✏️" },
    { value: "uploaded_file", label: "Ficheiro", icon: "📄" },
    { value: "presentation", label: "Apresentação", icon: "🎓" },
    { value: "diagram", label: "Mapa Mental", icon: "🧭" },
] as const;

export const DIFFICULTY_LEVELS = [
    { value: "easy", label: "Fácil" },
    { value: "medium", label: "Médio" },
    { value: "hard", label: "Difícil" },
] as const;

/* ═══════════════════════════════════════════════════════════════
   API CLIENT
   ═══════════════════════════════════════════════════════════════ */

export async function fetchArtifacts(artifactType?: string): Promise<Artifact[]> {
    const params = new URLSearchParams();
    if (artifactType) params.set("artifact_type", artifactType);
    const res = await fetch(`/api/artifacts?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[fetchArtifacts] ${res.status}: ${body}`);
        throw new Error(`Failed to fetch artifacts: ${res.status}`);
    }
    const data = (await res.json()) as Artifact[];
    return data.map(normalizeArtifact);
}

export async function fetchArtifact(id: string): Promise<Artifact> {
    const res = await fetch(`/api/artifacts/${id}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch artifact: ${res.status}`);
    return normalizeArtifact((await res.json()) as Artifact);
}

export async function createArtifact(data: ArtifactCreate): Promise<Artifact> {
    const res = await fetch("/api/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to create artifact: ${res.status}`);
    return normalizeArtifact((await res.json()) as Artifact);
}

export async function deleteArtifact(id: string): Promise<void> {
    const res = await fetch(`/api/artifacts/${id}`, { method: "DELETE" });
    if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new ArtifactRequestError(
            getApiErrorMessage(payload, `Failed to delete artifact: ${res.status}`),
            res.status,
        );
    }
}

/**
 * Rewrites artifact-image:// URLs in markdown content to API proxy URLs.
 * artifact-image://{org_id}/{artifact_id}/images/{filename}
 * → /api/artifacts/{artifact_id}/images/{filename}
 */
export function resolveArtifactImageUrls(markdown: string, artifactId: string): string {
    return markdown.replace(
        /artifact-image:\/\/[^/]+\/[^/]+\/images\/([^\s)]+)/g,
        `/api/artifacts/${artifactId}/images/$1`,
    );
}

export async function fetchArtifactFileUrl(id: string): Promise<string> {
    const res = await fetch(`/api/artifacts/${id}/file`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch file URL: ${res.status}`);
    const data = await res.json();
    return data.signed_url;
}

export async function updateArtifact(
    id: string,
    data: ArtifactUpdate,
): Promise<Artifact> {
    const res = await fetch(`/api/artifacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to update artifact: ${res.status}`);
    return normalizeArtifact((await res.json()) as Artifact);
}
