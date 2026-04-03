"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { StudentDiagramViewer } from "@/components/assignments/StudentDiagramViewer";
import { useArtifactDetailQuery } from "@/lib/queries/docs";

interface StudentDiagramFullPageProps {
    artifactId: string;
    onClose: () => void;
}

export function StudentDiagramFullPage({
    artifactId,
    onClose,
}: StudentDiagramFullPageProps) {
    const { data: artifact, isLoading } = useArtifactDetailQuery(artifactId, true);

    if (isLoading && !artifact) {
        return (
            <div className="fixed inset-0 z-[100] bg-brand-bg flex items-center justify-center">
                <div className="flex items-center gap-2 text-sm text-brand-primary/40">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A carregar diagrama...
                </div>
            </div>
        );
    }

    if (!artifact) {
        return (
            <div className="fixed inset-0 z-[100] bg-brand-bg flex flex-col items-center justify-center gap-4 px-6">
                <div className="flex items-center gap-2 text-brand-primary/50">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm">Diagrama não encontrado.</span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-brand-primary/10 px-4 py-2 text-sm text-brand-primary/70 hover:bg-brand-primary/5"
                >
                    Voltar
                </button>
            </div>
        );
    }

    if (artifact.artifact_type !== "diagram") {
        return (
            <div className="fixed inset-0 z-[100] bg-brand-bg flex flex-col items-center justify-center gap-4 px-6">
                <div className="flex items-center gap-2 text-brand-primary/50">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm">Este artefacto não é um diagrama.</span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-brand-primary/10 px-4 py-2 text-sm text-brand-primary/70 hover:bg-brand-primary/5"
                >
                    Voltar
                </button>
            </div>
        );
    }

    return <StudentDiagramViewer artifact={artifact} onBack={onClose} />;
}
