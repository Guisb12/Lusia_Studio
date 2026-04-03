"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { StudentPresentationViewer } from "@/components/assignments/StudentPresentationViewer";
import { useArtifactDetailQuery } from "@/lib/queries/docs";

interface StudentPresentationFullPageProps {
    artifactId: string;
    onClose: () => void;
}

export function StudentPresentationFullPage({
    artifactId,
    onClose,
}: StudentPresentationFullPageProps) {
    const { data: presentation, isLoading } = useArtifactDetailQuery(artifactId, true);

    if (isLoading && !presentation) {
        return (
            <div className="fixed inset-0 z-[100] bg-brand-bg flex items-center justify-center">
                <div className="flex items-center gap-2 text-sm text-brand-primary/40">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A carregar apresentação...
                </div>
            </div>
        );
    }

    if (!presentation) {
        return (
            <div className="fixed inset-0 z-[100] bg-brand-bg flex flex-col items-center justify-center gap-4 px-6">
                <div className="flex items-center gap-2 text-brand-primary/50">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm">Apresentação não encontrada.</span>
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

    if (presentation.artifact_type !== "presentation") {
        return (
            <div className="fixed inset-0 z-[100] bg-brand-bg flex flex-col items-center justify-center gap-4 px-6">
                <div className="flex items-center gap-2 text-brand-primary/50">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm">Este artefacto não é uma apresentação.</span>
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

    return (
        <StudentPresentationViewer artifact={presentation} onBack={onClose} />
    );
}
