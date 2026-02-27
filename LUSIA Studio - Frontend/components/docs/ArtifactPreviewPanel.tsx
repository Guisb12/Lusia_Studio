"use client";

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Editor } from "@tiptap/core";
import {
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Cloud,
    FileQuestion,
    Loader2,
    Maximize2,
    Minus,
    Plus,
    RotateCw,
    Save,
    X,
} from "lucide-react";
import { Artifact, fetchArtifact, updateArtifact } from "@/lib/artifacts";
import { convertMarkdownToTiptap } from "@/lib/tiptap/convert-markdown";
import { stripPaginationNodes } from "@/lib/tiptap/strip-pagination-nodes";
import { TipTapEditor, TipTapEditorHandle } from "./editor/TipTapEditor";
import { EditorToolbar } from "./editor/EditorToolbar";
import type { PdfViewerHandle } from "./PdfViewer";
import { Button } from "@/components/ui/button";

import { toast } from "sonner";

const LazyPdfViewer = lazy(() => import("./PdfViewer").then((m) => ({ default: m.PdfViewer })));

interface ArtifactPreviewPanelProps {
    artifactId: string;
    onClose: () => void;
    onOpenFullPage: (id: string, kind: "note" | "pdf") => void;
    onArtifactUpdated?: (updated: Artifact) => void;
}

type PreviewViewState =
    | { kind: "loading" }
    | { kind: "processing" }
    | { kind: "error"; message: string }
    | { kind: "tiptap"; json: Record<string, any>; artifactId: string }
    | { kind: "converting" }
    | { kind: "pdf"; artifactId: string }
    | { kind: "empty" };

export function ArtifactPreviewPanel({
    artifactId,
    onClose,
    onOpenFullPage,
    onArtifactUpdated,
}: ArtifactPreviewPanelProps) {
    const [artifact, setArtifact] = useState<Artifact | null>(null);
    const [viewState, setViewState] = useState<PreviewViewState>({ kind: "loading" });
    const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
    const [editorInstance, setEditorInstance] = useState<Editor | null>(null);

    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const latestJsonRef = useRef<Record<string, any> | null>(null);
    const editorRef = useRef<TipTapEditorHandle>(null);
    const artifactRef = useRef<Artifact | null>(null);
    const pdfRef = useRef<PdfViewerHandle>(null);

    // PDF state (synced via onStateChange callback)
    const [pdfState, setPdfState] = useState({ currentPage: 1, numPages: 0, scale: 0.75 });

    // ── View resolution (same logic as ArtifactViewerDialog) ──

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
            setViewState({ kind: "tiptap", json: stripPaginationNodes(art.tiptap_json as any), artifactId: art.id });
            return;
        }

        if (art.markdown_content) {
            setViewState({ kind: "converting" });
            try {
                const json = convertMarkdownToTiptap(art.markdown_content, art.id);
                try {
                    await updateArtifact(art.id, { tiptap_json: json });
                } catch {
                    // Non-critical
                }
                setViewState({ kind: "tiptap", json, artifactId: art.id });
            } catch {
                setViewState({ kind: "error", message: "Erro ao converter o documento." });
            }
            return;
        }

        // Empty note — create blank editor
        if (art.artifact_type === "note") {
            const emptyJson = { type: "doc", content: [{ type: "paragraph" }] };
            setViewState({ kind: "tiptap", json: emptyJson, artifactId: art.id });
            return;
        }

        setViewState({ kind: "empty" });
    }, []);

    // ── Save function (reused from DocEditorFullPage pattern) ──

    const doSave = useCallback(async () => {
        const art = artifactRef.current;
        const json = latestJsonRef.current;
        if (!art || !json) return;

        setSaveStatus("saving");
        try {
            let markdownContent: string | undefined;
            try {
                const editor = editorRef.current?.getEditor();
                if (editor) {
                    const manager = (editor.storage.markdown as any)?.manager;
                    if (manager?.serialize) {
                        markdownContent = manager.serialize(editor.state.doc);
                    }
                }
            } catch {
                // Non-critical
            }

            const updateData: { tiptap_json: Record<string, any>; markdown_content?: string } = {
                tiptap_json: json,
            };
            if (markdownContent) {
                updateData.markdown_content = markdownContent;
            }

            const updated = await updateArtifact(art.id, updateData);
            setSaveStatus("saved");
            onArtifactUpdated?.(updated);
        } catch {
            setSaveStatus("unsaved");
            toast.error("Erro ao guardar automaticamente.");
        }
    }, [onArtifactUpdated]);

    // ── Flush unsaved on unmount ──

    useEffect(() => {
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
                const art = artifactRef.current;
                const json = latestJsonRef.current;
                if (art && json) {
                    updateArtifact(art.id, { tiptap_json: json }).catch(() => {});
                }
            }
        };
    }, []);

    // ── Load artifact (flush previous on switch) ──

    useEffect(() => {
        // Flush any unsaved changes from previous artifact
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
            const prevArt = artifactRef.current;
            const prevJson = latestJsonRef.current;
            if (prevArt && prevJson) {
                updateArtifact(prevArt.id, { tiptap_json: prevJson }).catch(() => {});
            }
        }

        // Reset state
        latestJsonRef.current = null;
        artifactRef.current = null;
        setArtifact(null);
        setEditorInstance(null);
        setSaveStatus("saved");
        setViewState({ kind: "loading" });

        let cancelled = false;

        fetchArtifact(artifactId)
            .then((art) => {
                if (cancelled) return;
                setArtifact(art);
                artifactRef.current = art;
                resolveView(art);
            })
            .catch(() => {
                if (!cancelled) {
                    setViewState({ kind: "error", message: "Não foi possível carregar o documento." });
                }
            });

        return () => { cancelled = true; };
    }, [artifactId, resolveView]);

    // ── Editor update handler (autosave with 2s debounce) ──

    const handleEditorUpdate = useCallback(
        (json: Record<string, any>) => {
            latestJsonRef.current = json;
            setSaveStatus("unsaved");
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => doSave(), 2000);
        },
        [doSave],
    );

    const handleManualSave = useCallback(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        doSave();
    }, [doSave]);

    // ── Open full page ──

    const handleOpenFullPage = useCallback(() => {
        if (!artifact) return;
        const isPdf = artifact.source_type === "pdf" || artifact.storage_path?.endsWith(".pdf");
        onOpenFullPage(artifact.id, isPdf ? "pdf" : "note");
    }, [artifact, onOpenFullPage]);

    // ── Render ──

    const isNote = viewState.kind === "tiptap";
    const isPdf = viewState.kind === "pdf";

    // ── Floating action bar (shared across all content types) ──

    const actionBar = (
        <div className="sticky top-0 z-20 flex flex-col items-center gap-1 px-3 pt-3 pb-1">
            {/* Editor toolbar (notes only) */}
            {isNote && editorInstance && (
                <div className="rounded-xl border border-brand-primary/8 bg-white/95 backdrop-blur-sm shadow-lg">
                    <EditorToolbar editor={editorInstance} artifactId={artifactId} />
                </div>
            )}

            {/* PDF toolbar bubble (PDFs only) */}
            {isPdf && (
                <div className="rounded-xl border border-brand-primary/8 bg-white/95 backdrop-blur-sm shadow-lg flex items-center gap-0.5 px-1.5 py-1">
                    {/* Page navigation */}
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={pdfState.currentPage <= 1} onClick={() => pdfRef.current?.prevPage()}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-brand-primary/60 tabular-nums select-none px-1">
                        {pdfState.currentPage} / {pdfState.numPages || "–"}
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={pdfState.currentPage >= pdfState.numPages} onClick={() => pdfRef.current?.nextPage()}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>

                    <div className="w-px h-4 bg-brand-primary/10 mx-0.5" />

                    {/* Zoom */}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => pdfRef.current?.zoomOut()}>
                        <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-[11px] text-brand-primary/50 tabular-nums select-none w-8 text-center">
                        {Math.round(pdfState.scale * 100)}%
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => pdfRef.current?.zoomIn()}>
                        <Plus className="h-3.5 w-3.5" />
                    </Button>

                    <div className="w-px h-4 bg-brand-primary/10 mx-0.5" />

                    {/* Rotate */}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => pdfRef.current?.rotate()} title="Rodar 90°">
                        <RotateCw className="h-3.5 w-3.5" />
                    </Button>
                </div>
            )}

            {/* Action pill: save status + Abrir + Fechar */}
            <div className="rounded-xl border border-brand-primary/8 bg-white/95 backdrop-blur-sm shadow-lg flex items-center gap-1 px-1.5 py-1 shrink-0">
                {/* Save status (notes only) */}
                {isNote && (
                    <>
                        {saveStatus === "saved" && (
                            <span className="flex items-center gap-1 px-1.5 text-[11px] text-emerald-600">
                                <Cloud className="h-3 w-3" />
                            </span>
                        )}
                        {saveStatus === "saving" && (
                            <span className="flex items-center gap-1 px-1.5 text-[11px] text-brand-primary/40">
                                <Loader2 className="h-3 w-3 animate-spin" />
                            </span>
                        )}
                        {saveStatus === "unsaved" && (
                            <button
                                type="button"
                                onClick={handleManualSave}
                                className="flex items-center gap-1 px-1.5 text-[11px] text-amber-600 hover:text-amber-700 transition-colors"
                            >
                                <Save className="h-3 w-3" />
                            </button>
                        )}
                        <div className="w-px h-4 bg-brand-primary/10" />
                    </>
                )}
                <button
                    type="button"
                    onClick={handleOpenFullPage}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-brand-primary/70 hover:text-brand-primary hover:bg-brand-primary/5 transition-colors"
                >
                    <Maximize2 className="h-3 w-3" />
                    Abrir
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-brand-primary/40 hover:text-brand-primary hover:bg-brand-primary/5 transition-colors"
                >
                    <X className="h-3 w-3" />
                    Fechar
                </button>
            </div>
        </div>
    );

    const showActionBar = viewState.kind === "tiptap" || viewState.kind === "pdf";

    return (
        <div className="h-full overflow-auto">
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
                <>
                    {showActionBar && actionBar}

                    {/* Editor — A4 page, zoomed proportionally to fit panel */}
                    <div className="pt-1 pb-4 flex justify-center">
                        <div
                            className="bg-white shadow-lg rounded-sm min-h-[297mm]"
                            style={{ zoom: 0.72, width: "210mm" }}
                        >
                            <TipTapEditor
                                key={viewState.artifactId}
                                ref={editorRef}
                                initialContent={viewState.json}
                                onUpdate={handleEditorUpdate}
                                onEditorReady={setEditorInstance}
                                artifactId={viewState.artifactId}
                            />
                        </div>
                    </div>
                </>
            )}

            {viewState.kind === "pdf" && (
                <>
                    {showActionBar && actionBar}
                    <Suspense fallback={
                        <div className="flex items-center justify-center h-full gap-2 text-sm text-brand-primary/40">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            A carregar visualizador...
                        </div>
                    }>
                        <LazyPdfViewer
                            ref={pdfRef}
                            artifactId={viewState.artifactId}
                            initialScale={0.75}
                            minimal
                            hideToolbar
                            onStateChange={setPdfState}
                        />
                    </Suspense>
                </>
            )}

            {viewState.kind === "empty" && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-brand-primary/50">
                    <FileQuestion className="h-8 w-8 text-brand-primary/20" />
                    <p>Ainda não há conteúdo.</p>
                </div>
            )}
        </div>
    );
}
