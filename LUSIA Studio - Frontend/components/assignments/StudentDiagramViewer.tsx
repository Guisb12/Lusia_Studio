"use client";

import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { ArtifactIcon } from "@/components/docs/ArtifactIcon";
import { DiagramCanvas } from "@/components/diagrams/DiagramCanvas";
import type { Artifact } from "@/lib/artifacts";
import type { DiagramContent } from "@/lib/diagrams/types";

interface StudentDiagramViewerProps {
    artifact: Artifact;
    onBack: () => void;
}

function parseJsonField<T>(value: T | string | null | undefined, fallback: T): T {
    if (value == null) return fallback;
    if (typeof value !== "string") return value;

    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

export function StudentDiagramViewer({ artifact, onBack }: StudentDiagramViewerProps) {
    const diagram = useMemo(
        () => parseJsonField<DiagramContent | null>(artifact.content as DiagramContent | string | null, null),
        [artifact.content],
    );

    return (
        <div className="fixed inset-0 z-[100] bg-brand-bg flex flex-col">
            <div className="sticky top-0 z-30 backdrop-blur-sm">
                <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
                    <button
                        type="button"
                        onClick={onBack}
                        className="shrink-0 p-2 -ml-2 rounded-xl text-brand-primary/50 hover:text-brand-primary hover:bg-brand-primary/5 transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>

                    <div className="min-w-0 flex-1 flex items-center gap-3">
                        <ArtifactIcon
                            artifact={{ artifact_type: "diagram", storage_path: null, icon: null }}
                            size={20}
                        />
                        <div className="min-w-0">
                            <div className="text-lg font-instrument text-brand-primary truncate">
                                {artifact.artifact_name}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 relative">
                <div className="h-full relative">
                    <DiagramCanvas diagram={diagram} className="h-full w-full" />

                    <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-[#f6f3ef] to-transparent z-10" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#f6f3ef] to-transparent z-10" />
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#f6f3ef] to-transparent z-10" />
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#f6f3ef] to-transparent z-10" />
                </div>
            </div>
        </div>
    );
}
