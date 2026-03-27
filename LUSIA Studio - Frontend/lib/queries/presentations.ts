"use client";

import type { ArtifactUpdate } from "@/lib/artifacts";
import { updateDocArtifact } from "@/lib/queries/docs";
import { queryClient, useQuery } from "@/lib/query-client";

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export interface PresentationPlanSlide {
    id: string;
    phase: string;
    type: string;
    subtype: string | null;
    title: string;
    intent: string;
    description: string;
    reinforcement_slide: string | null;
}

export interface PresentationPlan {
    title: string;
    description: string;
    target_audience: string;
    total_slides: number;
    size: string;
    slides: PresentationPlanSlide[];
}

export interface PresentationSlide {
    id: string;
    html: string;
}

export interface Presentation {
    id: string;
    artifact_name: string;
    artifact_type: string;
    content: {
        phase: string;
        plan: PresentationPlan | null;
        slides: PresentationSlide[] | null;
        edit_model_v1?: unknown;
        edit_model_v2?: unknown;
        generation_params: Record<string, any>;
        subject?: {
            color: string | null;
        } | null;
    };
    subject_id: string | null;
    year_level: string | null;
    is_processed: boolean;
}

/* ═══════════════════════════════════════════════════════════════
   QUERY MODULE
   ═══════════════════════════════════════════════════════════════ */

const PRESENTATION_DETAIL_PREFIX = "presentation:detail:";
const PRESENTATION_STALE_TIME = 5 * 60_000; // 5 min — presentations are read-only

export function buildPresentationDetailKey(artifactId: string): string {
    return `${PRESENTATION_DETAIL_PREFIX}${artifactId}`;
}

async function fetchPresentation(artifactId: string): Promise<Presentation> {
    const res = await fetch(`/api/presentations/${artifactId}`, {
        cache: "no-store",
    });
    if (!res.ok) {
        throw new Error(`Failed to fetch presentation: ${res.status}`);
    }
    return res.json() as Promise<Presentation>;
}

export function usePresentationDetailQuery(
    artifactId: string,
    initialData?: Presentation | null,
) {
    const key = buildPresentationDetailKey(artifactId);

    return useQuery<Presentation>({
        key,
        fetcher: () => fetchPresentation(artifactId),
        staleTime: PRESENTATION_STALE_TIME,
        initialData: initialData ?? undefined,
    });
}

export function invalidatePresentationDetail(artifactId: string): void {
    queryClient.invalidateQueries(buildPresentationDetailKey(artifactId));
}

export async function updatePresentationArtifact(
    artifactId: string,
    payload: ArtifactUpdate,
) {
    const updated = await updateDocArtifact(artifactId, payload);
    invalidatePresentationDetail(artifactId);
    return updated;
}
