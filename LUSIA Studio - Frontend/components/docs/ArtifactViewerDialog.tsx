"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, AlertCircle, FileQuestion } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { Artifact, fetchArtifact, updateArtifact } from "@/lib/artifacts";
import { convertMarkdownToTiptap } from "@/lib/tiptap/convert-markdown";
import { TipTapViewer } from "./TipTapViewer";

const PdfViewer = dynamic(() => import("./PdfViewer").then((m) => m.PdfViewer), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full gap-2 text-sm text-brand-primary/40">
            <Loader2 className="h-4 w-4 animate-spin" />
            A carregar visualizador...
        </div>
    ),
});

interface ArtifactViewerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    artifactId: string | null;
}

type ViewState =
    | { kind: "loading" }
    | { kind: "processing" }
    | { kind: "error"; message: string }
    | { kind: "tiptap"; json: Record<string, any>; artifactId: string }
    | { kind: "converting" }
    | { kind: "pdf"; artifactId: string }
    | { kind: "empty" };

export function ArtifactViewerDialog({
    open,
    onOpenChange,
    artifactId,
}: ArtifactViewerDialogProps) {
    const [artifact, setArtifact] = useState<Artifact | null>(null);
    const [viewState, setViewState] = useState<ViewState>({ kind: "loading" });

    const resolveView = useCallback(async (art: Artifact) => {
        // Still processing
        if (!art.is_processed && !art.processing_failed) {
            setViewState({ kind: "processing" });
            return;
        }

        // Processing failed
        if (art.processing_failed) {
            setViewState({
                kind: "error",
                message: art.processing_error || "O processamento falhou.",
            });
            return;
        }

        const isPdf = art.source_type === "pdf" || art.storage_path?.endsWith(".pdf");

        // PDFs always open in the native PDF viewer — regardless of whether
        // a markdown conversion exists. The converted content is for editing later.
        if (isPdf && art.storage_path) {
            setViewState({ kind: "pdf", artifactId: art.id });
            return;
        }

        // Has TipTap JSON already (non-PDF documents)
        if (art.tiptap_json) {
            setViewState({ kind: "tiptap", json: art.tiptap_json, artifactId: art.id });
            return;
        }

        // Has markdown content — convert to TipTap JSON (non-PDF documents like DOCX)
        if (art.markdown_content) {
            setViewState({ kind: "converting" });
            try {
                const json = convertMarkdownToTiptap(art.markdown_content, art.id);
                // Cache the conversion by PATCHing the artifact
                try {
                    await updateArtifact(art.id, { tiptap_json: json });
                } catch {
                    // Non-critical — viewer still works without caching
                }
                setViewState({ kind: "tiptap", json, artifactId: art.id });
            } catch {
                setViewState({ kind: "error", message: "Erro ao converter o documento." });
            }
            return;
        }

        // Nothing to show
        setViewState({ kind: "empty" });
    }, []);

    useEffect(() => {
        if (!open || !artifactId) return;

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
    }, [open, artifactId, resolveView]);

    const artifactName = artifact?.artifact_name ?? "Documento";
    const artifactIcon = artifact?.icon ?? "📄";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-brand-primary/8 shrink-0">
                    <span className="text-lg">{artifactIcon}</span>
                    <DialogTitle className="text-base font-medium text-brand-primary truncate">
                        {artifactName}
                    </DialogTitle>
                </div>

                {/* Content area */}
                <div className="flex-1 min-h-0 overflow-auto">
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
                            <p className="text-xs text-brand-primary/30">
                                Isto pode demorar alguns minutos.
                            </p>
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
                        <TipTapViewer
                            tiptapJson={viewState.json}
                            artifactId={viewState.artifactId}
                        />
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
            </DialogContent>
        </Dialog>
    );
}
