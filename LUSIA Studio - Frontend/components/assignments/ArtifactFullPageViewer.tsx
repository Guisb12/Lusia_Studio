"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Loader2, AlertCircle, FileQuestion } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Quiz02Icon, Note01Icon, Pdf01Icon, LicenseDraftIcon } from "@hugeicons/core-free-icons";
import { Artifact } from "@/lib/artifacts";
import { convertMarkdownToTiptap } from "@/lib/tiptap/convert-markdown";
import { TipTapViewer } from "@/components/docs/TipTapViewer";
import { updateDocArtifact, useArtifactDetailQuery } from "@/lib/queries/docs";

const PdfViewer = dynamic(() => import("@/components/docs/PdfViewer").then((m) => m.PdfViewer), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full gap-2 text-sm text-brand-primary/40">
            <Loader2 className="h-4 w-4 animate-spin" />
            A carregar visualizador...
        </div>
    ),
});

interface ArtifactFullPageViewerProps {
    artifactId: string;
    onClose: () => void;
}

type ViewState =
    | { kind: "loading" }
    | { kind: "processing" }
    | { kind: "error"; message: string }
    | { kind: "tiptap"; json: Record<string, any>; artifactId: string }
    | { kind: "converting" }
    | { kind: "pdf"; artifactId: string }
    | { kind: "empty" };

export function ArtifactFullPageViewer({ artifactId, onClose }: ArtifactFullPageViewerProps) {
    const [artifact, setArtifact] = useState<Artifact | null>(null);
    const [viewState, setViewState] = useState<ViewState>({ kind: "loading" });
    const {
        data: artifactQuery,
        isLoading: artifactLoading,
    } = useArtifactDetailQuery(artifactId, true);

    const resolveView = useCallback(async (art: Artifact) => {
        if (!art.is_processed && !art.processing_failed) {
            setViewState({ kind: "processing" });
            return;
        }
        if (art.processing_failed) {
            setViewState({ kind: "error", message: art.processing_error || "O processamento falhou." });
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
                try { await updateDocArtifact(art.id, { tiptap_json: json }); } catch { /* non-critical */ }
                setViewState({ kind: "tiptap", json, artifactId: art.id });
            } catch {
                setViewState({ kind: "error", message: "Erro ao converter o documento." });
            }
            return;
        }
        setViewState({ kind: "empty" });
    }, []);

    useEffect(() => {
        if (!artifactLoading && artifactQuery) {
            setArtifact(artifactQuery);
            void resolveView(artifactQuery);
        } else if (!artifactLoading && !artifactQuery) {
            setViewState({ kind: "error", message: "Não foi possível carregar o documento." });
        }
    }, [artifactLoading, artifactQuery, resolveView]);

    const artifactName = artifact?.artifact_name ?? "Documento";
    const artifactType = artifact?.artifact_type;

    return (
        <div className="fixed inset-0 z-50 bg-brand-bg flex flex-col">
            {/* Header */}
            <div className="sticky top-0 z-30 border-b border-brand-primary/8">
                <div className="flex items-center gap-3 px-4 sm:px-6 h-14">
                    <button
                        onClick={onClose}
                        className="h-8 w-8 rounded-lg bg-brand-primary/5 flex items-center justify-center text-brand-primary/50 hover:text-brand-primary hover:bg-brand-primary/10 transition-colors shrink-0"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div className="h-8 w-8 rounded-lg bg-brand-primary/[0.04] flex items-center justify-center shrink-0 text-brand-primary/50">
                        {artifactType === "quiz" ? <HugeiconsIcon icon={Quiz02Icon} size={16} color="currentColor" strokeWidth={1.5} />
                            : artifactType === "note" ? <HugeiconsIcon icon={Note01Icon} size={16} color="currentColor" strokeWidth={1.5} />
                            : artifactType === "exercise_sheet" ? <HugeiconsIcon icon={LicenseDraftIcon} size={16} color="currentColor" strokeWidth={1.5} />
                            : <HugeiconsIcon icon={Pdf01Icon} size={16} color="currentColor" strokeWidth={1.5} />}
                    </div>
                    <h1 className="text-sm font-medium text-brand-primary truncate flex-1 min-w-0">
                        {artifactName}
                    </h1>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-hidden">
                {viewState.kind === "loading" && (
                    <div className="flex items-center justify-center h-full gap-2 text-sm text-brand-primary/40">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        A carregar...
                    </div>
                )}
                {viewState.kind === "processing" && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-brand-primary/50">
                        <Loader2 className="h-6 w-6 animate-spin text-brand-accent" />
                        <p>O documento está a ser processado...</p>
                        <p className="text-xs text-brand-primary/30">Isto pode demorar alguns minutos.</p>
                    </div>
                )}
                {viewState.kind === "error" && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-brand-primary/50">
                        <AlertCircle className="h-8 w-8 text-red-400" />
                        <p>{viewState.message}</p>
                    </div>
                )}
                {viewState.kind === "converting" && (
                    <div className="flex items-center justify-center h-full gap-2 text-sm text-brand-primary/40">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        A converter documento...
                    </div>
                )}
                {viewState.kind === "tiptap" && (
                    <TipTapViewer tiptapJson={viewState.json} artifactId={viewState.artifactId} />
                )}
                {viewState.kind === "pdf" && (
                    <PdfViewer artifactId={viewState.artifactId} />
                )}
                {viewState.kind === "empty" && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-brand-primary/50">
                        <FileQuestion className="h-8 w-8 text-brand-primary/20" />
                        <p>Ainda não há conteúdo.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
