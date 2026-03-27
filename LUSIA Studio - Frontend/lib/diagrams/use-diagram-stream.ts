"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { streamDiagramGeneration } from "@/lib/diagram-generation";
import { Artifact, fetchArtifact } from "@/lib/artifacts";
import type { DiagramContent, DiagramStreamEvent, DiagramStreamState } from "@/lib/diagrams/types";
import {
    createInitialDiagramStreamState,
    reduceDiagramStreamEvent,
} from "@/lib/diagrams/reducer";

export type DiagramGenerationStatus = "connecting" | "generating" | "done" | "error";

export interface UseDiagramStreamReturn {
    status: DiagramGenerationStatus;
    statusLabel: string | null;
    errorMessage: string;
    artifact: Artifact | null;
    diagram: DiagramContent | null;
    nodeCount: number;
}

export function useDiagramStream(artifactId: string): UseDiagramStreamReturn {
    const [status, setStatus] = useState<DiagramGenerationStatus>("connecting");
    const [statusLabel, setStatusLabel] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState("");
    const [artifact, setArtifact] = useState<Artifact | null>(null);
    const streamStateRef = useRef<DiagramStreamState>(createInitialDiagramStreamState());
    const [diagram, setDiagram] = useState<DiagramContent | null>(null);

    // Reset on artifactId change
    useEffect(() => {
        streamStateRef.current = createInitialDiagramStreamState();
        setDiagram(null);
        setStatus("connecting");
        setStatusLabel(null);
        setErrorMessage("");
    }, [artifactId]);

    // Fetch artifact metadata
    useEffect(() => {
        if (!artifactId) return;
        fetchArtifact(artifactId)
            .then(setArtifact)
            .catch(() => {});
    }, [artifactId]);

    // SSE streaming
    useEffect(() => {
        if (!artifactId) return;

        const controller = streamDiagramGeneration(
            artifactId,
            (event: DiagramStreamEvent) => {
                const next = reduceDiagramStreamEvent(streamStateRef.current, event);
                streamStateRef.current = next;

                if (event.type === "hydrate") {
                    if (next.done) {
                        setStatus("done");
                    } else if (next.error) {
                        setStatus("error");
                        setErrorMessage(next.error);
                    } else {
                        setStatus("generating");
                    }
                } else if (event.type === "status") {
                    setStatus("generating");
                    setStatusLabel(next.status_label);
                } else if (event.type === "done") {
                    setStatus("done");
                } else if (event.type === "error") {
                    setStatus("error");
                    setErrorMessage(next.error ?? "A geração falhou.");
                }

                startTransition(() => {
                    setDiagram(next.diagram ? { ...next.diagram } : null);
                });
            },
            (error) => {
                setStatus("error");
                setErrorMessage(error.message || "Erro de ligação.");
            },
            () => {},
        );

        return () => controller.abort();
    }, [artifactId]);

    return {
        status,
        statusLabel,
        errorMessage,
        artifact,
        diagram,
        nodeCount: diagram?.nodes?.length ?? 0,
    };
}
