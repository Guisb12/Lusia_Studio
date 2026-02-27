"use client";

import { useCallback, useEffect, useState } from "react";
import { Artifact, fetchArtifact, updateArtifact } from "@/lib/artifacts";
import { convertMarkdownToTiptap } from "@/lib/tiptap/convert-markdown";

export type ArtifactViewState =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "processing" }
    | { kind: "error"; message: string }
    | { kind: "pdf"; artifactId: string }
    | { kind: "tiptap"; json: Record<string, any>; artifactId: string }
    | { kind: "converting" }
    | { kind: "empty" };

/**
 * Resolves how an artifact should be viewed: PDF viewer, TipTap viewer,
 * or a status state (loading, processing, error, empty).
 *
 * Extracted from ArtifactViewerDialog so the same logic can be reused
 * in the student assignment dialog and any other embedding context.
 */
export function useArtifactViewState(
    artifactId: string | null,
    enabled: boolean,
): { viewState: ArtifactViewState; artifact: Artifact | null } {
    const [artifact, setArtifact] = useState<Artifact | null>(null);
    const [viewState, setViewState] = useState<ArtifactViewState>({ kind: "idle" });

    const resolveView = useCallback(async (art: Artifact) => {
        // Native artifacts (quiz, note, exercise_sheet) that aren't uploaded
        // files are always "processed" — skip the pipeline check for them.
        const isUploadedFile = art.source_type !== "native";

        if (isUploadedFile && !art.is_processed && !art.processing_failed) {
            setViewState({ kind: "processing" });
            return;
        }

        if (isUploadedFile && art.processing_failed) {
            setViewState({
                kind: "error",
                message: art.processing_error || "O processamento falhou.",
            });
            return;
        }

        const isPdf = art.source_type === "pdf" || art.storage_path?.endsWith(".pdf");

        if (isPdf && art.storage_path) {
            setViewState({ kind: "pdf", artifactId: art.id });
            return;
        }

        if (art.tiptap_json) {
            setViewState({ kind: "tiptap", json: art.tiptap_json, artifactId: art.id });
            return;
        }

        if (art.markdown_content) {
            setViewState({ kind: "converting" });
            try {
                const json = convertMarkdownToTiptap(art.markdown_content, art.id);
                // Cache the conversion
                updateArtifact(art.id, { tiptap_json: json }).catch(() => {});
                setViewState({ kind: "tiptap", json, artifactId: art.id });
            } catch {
                setViewState({ kind: "error", message: "Erro ao converter o documento." });
            }
            return;
        }

        setViewState({ kind: "empty" });
    }, []);

    useEffect(() => {
        if (!enabled || !artifactId) {
            setViewState({ kind: "idle" });
            setArtifact(null);
            return;
        }

        let cancelled = false;
        setViewState({ kind: "loading" });

        fetchArtifact(artifactId)
            .then((art) => {
                if (cancelled) return;
                setArtifact(art);
                resolveView(art);
            })
            .catch(() => {
                if (!cancelled) {
                    setViewState({ kind: "error", message: "Não foi possível carregar o documento." });
                }
            });

        return () => { cancelled = true; };
    }, [artifactId, enabled, resolveView]);

    return { viewState, artifact };
}
